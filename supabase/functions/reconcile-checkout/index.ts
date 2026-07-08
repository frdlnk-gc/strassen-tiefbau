// =============================================================================
// Supabase Edge Function: reconcile-checkout
// SICHERHEITSNETZ gegen "Geld kassiert, kein Kontingent": läuft periodisch per
// pg_cron und spielt ALLE kürzlich BEZAHLTEN Stripe-Checkout-Sessions durch das
// (idempotente) confirm-checkout. Heilt Fälle, in denen der Kunde nach der Zahlung
// den Tab zu früh geschlossen hat / nie zurückkam / das Gerät gewechselt hat –
// unabhängig von einem Stripe-Webhook.
//
// SCHUTZ: verify_jwt=false (der Cron sendet keinen Supabase-JWT), stattdessen ein
// geheimer x-reconcile-token, der in public.app_config liegt und nur per service_role
// lesbar ist. Ohne gültigen Token -> 401.
//
// Nutzt ausschließlich Projekt-Secrets aus der Umgebung (STRIPE_SECRET_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) – identisch zu confirm-checkout.
// =============================================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supa = createClient(SB_URL, SERVICE_KEY);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

const WINDOW_SECONDS = 72 * 60 * 60;   // nur Sessions der letzten 72h prüfen

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'method' }, 405);

  // --- Token-Schutz (nur der Cron mit dem geheimen Token darf auslösen) ---
  const token = req.headers.get('x-reconcile-token') || '';
  const { data: cfg } = await supa.from('app_config').select('value').eq('key', 'reconcile_token').maybeSingle();
  if (!cfg || !token || token !== cfg.value) return json({ error: 'unauthorized' }, 401);

  try {
    const since = Math.floor(Date.now() / 1000) - WINDOW_SECONDS;
    // Bezahlte Checkout-Sessions der letzten 72h einsammeln (max. 100 – reicht fürs Launch-Volumen).
    const list = await stripe.checkout.sessions.list({ limit: 100, created: { gte: since } });
    const paid = list.data.filter(s =>
      s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
    const ids = paid.map(s => s.id);
    if (!ids.length) return json({ ok: true, listed: 0, reconciled: 0, alreadyDone: 0 });

    // Bereits VERBUCHTE Sessions (applied_at gesetzt) überspringen -> keine redundanten Aufrufe.
    const { data: done } = await supa
      .from('bestellungen').select('stripe_session_id')
      .in('stripe_session_id', ids).not('applied_at', 'is', null);
    const doneSet = new Set((done || []).map((r: any) => r.stripe_session_id));
    const todo = ids.filter(id => !doneSet.has(id));

    // Offene Sessions durch das idempotente confirm-checkout schicken (service_role als Bearer,
    // confirm-checkout läuft mit verify_jwt=true und akzeptiert den service_role-JWT).
    let applied = 0; const errors: string[] = [];
    for (const id of todo) {
      try {
        const r = await fetch(`${SB_URL}/functions/v1/confirm-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY },
          body: JSON.stringify({ session_id: id }),
        });
        const out = await r.json().catch(() => ({}));
        if (r.ok && out && out.ok && out.applied) applied++;
        else if (!r.ok) errors.push(`${id}:${r.status}`);
      } catch (e) { errors.push(`${id}:${(e as Error).message}`); }
    }

    return json({ ok: true, listed: ids.length, alreadyDone: doneSet.size, reconciled: todo.length, applied, errors });
  } catch (e) {
    return json({ error: 'reconcile', message: (e as Error).message }, 500);
  }
});
