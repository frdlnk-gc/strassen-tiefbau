// =============================================================================
// Supabase Edge Function: confirm-checkout (v4)
// SELF-HEALING Freischaltung OHNE Webhook-Abhaengigkeit.
// v3: Kontingent-Freischaltung wird ueber bestellungen.applied_at abgesichert:
//   - apply laeuft nur, solange applied_at NULL ist (kein Doppel-Apply bei Wiederholung).
//   - schlaegt apply fehl, wird die Bestellung als 'fehler_apply' markiert und ok:false
//     zurueckgegeben -> das OS kann per 'Zahlung pruefen' idempotent erneut aufrufen,
//     bis apply erfolgreich ist (Kunde bleibt nicht ohne Kontingent haengen).
// v4 (31.08.2026): FREMD-SESSION-GUARD — im gemeinsamen GC-Stripe-Account laufen auch
//   die Abo-/Upsell-Checkouts von abo.green-careers.de. Deren Sessions tragen KEINE
//   Portal-Metadata (kein metadata.pkg) und duerfen hier NIEMALS eine Bestellung
//   anlegen (Vorfall: Phantom-0€-Bestellungen 10.07.–28.08. loesten Bestell-Mails
//   an Bestandskunden aus). Der pg_cron 'reconcile-checkout' wurde am 31.08.
//   deaktiviert (cron.unschedule) — Wiederanlage siehe supabase/MAKE-bestellung-mails.md.
// =============================================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supa = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TERM_MONTHS: Record<string, number> = { '6m': 6, '12m': 12 };
const num = (v: unknown, d = 0) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : d; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let sessionId = '';
  try { const b = await req.json(); sessionId = String(b?.session_id || ''); } catch { /* noop */ }
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) return json({ error: 'bad_session_id' }, 400);

  let session: Stripe.Checkout.Session;
  try { session = await stripe.checkout.sessions.retrieve(sessionId); }
  catch (e) { return json({ error: 'stripe', message: (e as Error).message }, 502); }

  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return json({ ok: false, unpaid: session.payment_status });
  }

  const m = (session.metadata || {}) as Record<string, string>;

  // FREMD-SESSION-GUARD: ohne metadata.pkg stammt die Session nicht aus dem
  // Portal-/OS-Checkout (create-checkout setzt pkg immer) -> nichts anlegen.
  if (!m.pkg) return json({ ok: false, foreign: true });

  const { data: exists } = await supa
    .from('bestellungen').select('id, customer_id, applied_at').eq('stripe_session_id', sessionId).maybeSingle();

  let customerId: string | null = m.customer_id || null;
  if (customerId) {
    const { data: c } = await supa.from('customers').select('id').eq('id', customerId).maybeSingle();
    if (!c) customerId = null;
  }
  if (!customerId && m.auth_user_id) {
    const { data: p } = await supa.from('profiles').select('customer_id').eq('id', m.auth_user_id).maybeSingle();
    if (p && p.customer_id) customerId = p.customer_id as string;
  }

  const mode    = m.mode === 'abo' ? 'abo' : 'einmal';
  const pkg     = m.pkg || '';
  const qty     = Math.max(parseInt(m.qty || '1', 10) || 1, 1);
  const months  = mode === 'abo' ? (TERM_MONTHS[m.term || '6m'] || 6) : 1;
  const unitNet = num(m.net_per_unit);

  // apply erfolgt genau solange, wie die Bestellung noch nicht verbucht ist (applied_at NULL).
  // Deckt ab: (a) neue Bestellung, (b) erstmalige Betriebs-Zuordnung, (c) Retry nach apply-Fehler.
  let needApply = false;

  if (!exists) {
    const { error } = await supa.from('bestellungen').insert({
      mode, paket: pkg, anzahl: qty, laufzeit: m.term || null, monate: months,
      netto_pro_einheit: unitNet,
      gesamt_netto: mode === 'abo' ? unitNet * months : unitNet,
      qty_rabatt_pct: num(m.qty_pct), code_rabatt_pct: num(m.code_pct),
      ref: m.ref || null, brand: (m.brand === 'green' ? 'green' : 'grey'),
      zahlungsart: m.method || 'card', status: 'freigegeben',
      kunde_name: m.name || '', kunde_firma: m.firma || '',
      kunde_email: m.email || session.customer_details?.email || '',
      customer_id: customerId, auth_user_id: m.auth_user_id || null,
      stripe_session_id: sessionId, applied_at: null,
    });
    if (error) return json({ error: 'db', message: error.message }, 500);
    needApply = !!customerId;
  } else if (!exists.customer_id && customerId) {
    // Zuordnung nur, wenn wirklich noch keine gesetzt ist (Race-Schutz).
    await supa.from('bestellungen').update({ customer_id: customerId }).eq('id', exists.id).is('customer_id', null);
    needApply = !exists.applied_at;
  } else if (exists.customer_id && customerId && !exists.applied_at) {
    needApply = true;   // vorheriger apply-Fehler -> erneut versuchen (idempotent via applied_at)
  }

  if (needApply && customerId) {
    const laufzeit = mode === 'abo' ? (m.term === '12m' ? '12' : '6') : null;
    const { error: rpcErr } = await supa.rpc('apply_purchase_contingent', {
      p_customer_id: customerId, p_produkt: pkg,
      p_kauftyp: mode === 'abo' ? 'abo' : 'einmalzahlung',
      p_zahlungsart: m.method || 'card',
      p_betrag: Number(session.amount_total ?? 0) / 100,
      p_laufzeit: laufzeit, p_stellen: qty,
    });
    if (rpcErr) {
      // NICHT verschlucken: Bestellung markieren + ok:false -> OS ruft erneut auf, bis es klappt.
      console.error('apply_purchase_contingent:', rpcErr.message);
      await supa.from('bestellungen').update({ status: 'fehler_apply' }).eq('stripe_session_id', sessionId);
      return json({ ok: false, apply_error: rpcErr.message }, 500);
    }
    await supa.from('bestellungen').update({ applied_at: new Date().toISOString(), status: 'freigegeben' })
      .eq('stripe_session_id', sessionId);
  }

  return json({ ok: true, freigeschaltet: !!customerId, duplicate: !!exists, applied: needApply });
});
