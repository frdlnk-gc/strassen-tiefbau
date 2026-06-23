// =============================================================================
// Supabase Edge Function: stripe-webhook
// Auto-Freigabe bei SOFORTZAHLUNG (Karte / PayPal / SEPA).
//
// Stripe ruft diese Funktion automatisch auf, sobald ein Checkout bezahlt ist
// (Event `checkout.session.completed`). Wir schreiben dann eine Bestellung mit
// status='freigegeben' in die Tabelle `bestellungen` -> Kontingent ist sofort frei.
//
// Rechnungs-Käufe laufen NICHT hier durch (die legt create-checkout.ts direkt mit
// status='wartet_zahlung' an = manuelles Gate, erst nach Zahlungseingang frei).
//
// IDEMPOTENT: Stripe kann dasselbe Event mehrfach senden. Wir prüfen vorher, ob
// zur stripe_session_id schon eine Bestellung existiert, und legen sie nur einmal an.
//
// DEPLOY:  supabase functions deploy stripe-webhook --no-verify-jwt
// SECRETS: supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//          supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   (aus dem Stripe-Webhook)
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sind automatisch gesetzt)
//
// STRIPE-DASHBOARD: Developers -> Webhooks -> Add endpoint
//   URL:   https://<PROJEKT-REF>.supabase.co/functions/v1/stripe-webhook
//   Event: checkout.session.completed
//   -> "Signing secret" (whsec_...) kopieren und als STRIPE_WEBHOOK_SECRET setzen.
// =============================================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supa = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);
const WH_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

// Paket-Stammdaten zur Anzeige/Laufzeit (für die Bestell-Felder).
const TERM_MONTHS: Record<string, number> = { '6m': 6, '12m': 12 };
const EINMAL_DAYS: Record<string, number> = { smart: 60, premium: 60, exzellenz: 90 };

const num = (v: unknown, d = 0) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : d; };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // ---- Signatur prüfen (verhindert gefälschte Aufrufe) ---------------------
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    if (!WH_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET fehlt');
    // Deno: async-Variante nutzen (SubtleCrypto ist asynchron)
    event = await stripe.webhooks.constructEventAsync(raw, sig ?? '', WH_SECRET);
  } catch (e) {
    return new Response('Signaturprüfung fehlgeschlagen: ' + (e as Error).message, { status: 400 });
  }

  // Wir reagieren nur auf abgeschlossene Checkouts.
  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  // Nur wirklich bezahlte Sessions freigeben.
  if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return new Response(JSON.stringify({ received: true, unpaid: session.payment_status }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const m = (session.metadata || {}) as Record<string, string>;
  const sessionId = session.id;

  // ---- Idempotenz: existiert die Bestellung schon? -------------------------
  try {
    const { data: exists } = await supa
      .from('bestellungen').select('id').eq('stripe_session_id', sessionId).maybeSingle();
    if (exists) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (_) { /* weiter – im Zweifel anlegen */ }

  // ---- Bestellung mit status='freigegeben' anlegen -------------------------
  const mode    = m.mode === 'abo' ? 'abo' : 'einmal';
  const pkg     = m.pkg || '';
  const qty     = Math.max(parseInt(m.qty || '1', 10) || 1, 1);
  const term    = m.term || null;
  const months  = mode === 'abo' ? (TERM_MONTHS[m.term || '6m'] || 6) : 1;
  const unitNet = num(m.net_per_unit);
  const order = {
    mode, paket: pkg, anzahl: qty, laufzeit: term, monate: months,
    netto_pro_einheit: unitNet,
    gesamt_netto: mode === 'abo' ? unitNet * months : unitNet,
    qty_rabatt_pct: num(m.qty_pct), code_rabatt_pct: num(m.code_pct),
    ref: m.ref || null, brand: (m.brand === 'green' ? 'green' : 'grey'),
    zahlungsart: m.method || 'card',
    status: 'freigegeben',                                  // Sofortzahlung -> sofort frei
    kunde_name: m.name || '', kunde_firma: m.firma || '',
    kunde_email: m.email || session.customer_details?.email || '',
    customer_id: m.customer_id || null,
    auth_user_id: m.auth_user_id || null,
    stripe_session_id: sessionId,
  };

  const { error } = await supa.from('bestellungen').insert(order);
  if (error) {
    // 500 -> Stripe wiederholt den Aufruf später automatisch.
    return new Response('DB: ' + error.message, { status: 500 });
  }

  // ---- Kontingent in `customers` sofort freischalten (v13-RPC) --------------
  // Setzt produkt/kauftyp/zahlungsart/betrag/laufzeit/stellen_kontingent/
  // kontingent_frei/kontingent_bis. Ein Fehler hier blockt die Bestellung NICHT.
  if (order.customer_id) {
    const laufzeit = mode === 'abo' ? (m.term === '12m' ? '12' : '6') : null;
    const { error: rpcErr } = await supa.rpc('apply_purchase_contingent', {
      p_customer_id: order.customer_id,
      p_produkt:     pkg,                                   // smart | premium | exzellenz
      p_kauftyp:     mode === 'abo' ? 'abo' : 'einmalzahlung',
      p_zahlungsart: order.zahlungsart,                    // hier nie 'rechnung' -> frei=true
      p_betrag:      Number(session.amount_total ?? 0) / 100,
      p_laufzeit:    laufzeit,                              // '6' | '12' (nur Abo)
      p_stellen:     qty,
    });
    if (rpcErr) console.error('apply_purchase_contingent:', rpcErr.message);
  }

  return new Response(JSON.stringify({ received: true, created: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
