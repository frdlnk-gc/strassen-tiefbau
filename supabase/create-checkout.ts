// =============================================================================
// Supabase Edge Function: create-checkout
// Sichere Server-Logik für den Arbeitgeber-Checkout (kaufen-einmal.html / kaufen-abo.html)
//
// Aufgaben:
//  1. Preis SERVER-SEITIG neu berechnen (Client-Werte sind nur Anzeige – nie vertrauen).
//  2. Rabattcode validieren (Geheimwort-Prefix + Dezimal-Prozent, gedeckelt).
//  3. Sofortzahlung (Karte/PayPal/SEPA) -> Stripe-Checkout-Session -> checkoutUrl zurück.
//  4. Kauf auf Rechnung -> Bestellung mit status 'wartet_zahlung' speichern
//     -> { pending:true } zurück. Benachrichtigung an Freddy läuft über Make,
//        das die Tabelle `bestellungen` beobachtet (kein Resend/E-Mail-Dienst hier).
//  5. Referral (?ref=) wird in Bestellung + Stripe-Metadaten mitgeführt.
//
// DEPLOY:  supabase functions deploy create-checkout --no-verify-jwt
// SECRETS: supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sind automatisch gesetzt)
// =============================================================================

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- KONFIG (muss zu den Frontend-Seiten passen) ---------------------------
const RABATT_PREFIX = 'Sale';            // Geheimwort vor dem Rabatt-Prozentwert (case-insensitive)
const CODE_MAX_PCT  = 60;                // Maximal erlaubter Code-Rabatt
const VAT           = 0.19;              // 19 % USt. – auf Netto aufgeschlagen
const SITE          = 'https://strassen-tiefbau.green-careers.de';

// Einmal-Pakete: Netto-Einmalpreis
const PKG_EINMAL: Record<string, { name: string; price: number; days: number }> = {
  smart:     { name: 'Smart',     price: 2190, days: 60 },
  premium:   { name: 'Premium',   price: 3190, days: 60 },
  exzellenz: { name: 'Exzellenz', price: 5490, days: 90 },
};
// Abo-Pakete: Netto-Monatspreis (6-Monats-Basistarif). Identisch zu abo.green-careers.de.
const PKG_ABO: Record<string, { name: string; price: number }> = {
  smart:     { name: 'Smart',     price: 399 },
  premium:   { name: 'Premium',   price: 599 },
  exzellenz: { name: 'Exzellenz', price: 799 },
};
const QTY_DISCOUNT: Record<number, number>  = { 1: 0, 2: 10, 3: 20, 4: 30 };
const TERM_DISCOUNT: Record<string, number> = { '6m': 0, '12m': 20 };
const TERM_MONTHS: Record<string, number>   = { '6m': 6, '12m': 12 };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-06-20' });
const supa = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Rabattcode "Sale 40,7" -> 40.7 ; sonst 0 (Geheimwort case-insensitive)
function parseCodePct(raw: string): number {
  if (!raw) return 0;
  const re = new RegExp('^\\s*' + RABATT_PREFIX + '\\s+([0-9]{1,2}(?:[.,][0-9]{1,2})?)\\s*$', 'i');
  const m = raw.match(re);
  if (!m) return 0;
  const pct = parseFloat(m[1].replace(',', '.'));
  return pct > 0 && pct <= CODE_MAX_PCT ? pct : 0;
}

const STRIPE_METHOD: Record<string, string> = { card: 'card', paypal: 'paypal', sepa: 'sepa_debit' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const mode   = p.mode === 'abo' ? 'abo' : 'einmal';
  const pkgKey = String(p.pkg || '');
  const qty    = Math.min(Math.max(parseInt(p.qty, 10) || 1, 1), 4);
  const method = String(p.method || 'card');
  const ref    = String(p.ref || '').slice(0, 40);
  const c      = p.customer || {};
  if (!c.name || !c.firma || !c.email) return json({ error: 'Fehlende Pflichtfelder' }, 400);

  // ---- Preis server-seitig (autoritativ) berechnen -------------------------
  const codePct  = parseCodePct(String(p.codeRaw || ''));
  const qtyPct   = QTY_DISCOUNT[qty] || 0;

  let unitNet: number, months = 1, termPct = 0, pkgName: string, days = 0;
  if (mode === 'abo') {
    const pk = PKG_ABO[pkgKey]; if (!pk) return json({ error: 'Unbekanntes Paket' }, 400);
    pkgName = pk.name;
    const term = (p.term === '12m') ? '12m' : '6m';
    months  = TERM_MONTHS[term];
    termPct = TERM_DISCOUNT[term] || 0;
    unitNet = pk.price * (1 - termPct / 100);                 // Monatspreis nach Laufzeitrabatt
  } else {
    const pk = PKG_EINMAL[pkgKey]; if (!pk) return json({ error: 'Unbekanntes Paket' }, 400);
    pkgName = pk.name; days = pk.days;
    unitNet = pk.price;
  }
  const baseNet  = unitNet * qty;
  const afterQty = baseNet * (1 - qtyPct / 100);
  const finalNet = afterQty * (1 - codePct / 100);            // Monatlich (abo) bzw. Einmal (einmal)
  const grossUnitAmount = Math.round(finalNet * (1 + VAT) * 100); // Cent, brutto

  const label = `${pkgName} ${mode === 'abo' ? 'Recruiting-Abo' : 'Stellen-Kontingent'} · ${qty} Stelle(n)`;
  const meta = {
    mode, pkg: pkgKey, qty: String(qty), term: p.term || '', ref,
    qty_pct: String(qtyPct), code_pct: String(codePct),
    net_per_unit: finalNet.toFixed(2), firma: c.firma, name: c.name, email: c.email,
  };

  // ---- KAUF AUF RECHNUNG: Bestellung + Freigabe-Mail -----------------------
  if (method === 'rechnung') {
    const order = {
      mode, paket: pkgKey, anzahl: qty, laufzeit: p.term || null,
      netto_pro_einheit: finalNet, monate: months,
      gesamt_netto: mode === 'abo' ? finalNet * months : finalNet,
      qty_rabatt_pct: qtyPct, code_rabatt_pct: codePct, ref,
      zahlungsart: 'rechnung', status: 'wartet_zahlung',
      kunde_name: c.name, kunde_firma: c.firma, kunde_email: c.email,
      kunde_tel: c.tel || null, kunde_ustid: c.vat || null,
    };
    const { data: ins, error } = await supa.from('bestellungen').insert(order).select('id').single();
    if (error) return json({ error: 'DB: ' + error.message }, 500);

    // Benachrichtigung an Freddy: Make beobachtet die Tabelle `bestellungen`
    // (status='wartet_zahlung') und verschickt die Info-/Freigabe-Mail.
    // Kein E-Mail-Versand direkt aus der Edge Function.
    return json({ pending: true, orderId: ins?.id });
  }

  // ---- SOFORTZAHLUNG: Stripe-Checkout-Session ------------------------------
  const pmType = STRIPE_METHOD[method];
  if (!pmType) return json({ error: 'Unbekannte Zahlungsart' }, 400);

  try {
    const common = {
      customer_email: c.email,
      payment_method_types: [pmType] as any,
      client_reference_id: ref || undefined,
      metadata: meta,
      success_url: `${SITE}/danke-kauf.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/kaufen-${mode}.html`,
    };

    let session;
    if (mode === 'abo') {
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'subscription',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: grossUnitAmount,
            recurring: { interval: 'month' },
            product_data: { name: label, metadata: meta },
          } as any,
        }],
        subscription_data: { metadata: meta },
      });
    } else {
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: grossUnitAmount,
            product_data: { name: label + ` · ${days} Tage Laufzeit`, metadata: meta },
          } as any,
        }],
        payment_intent_data: { metadata: meta },
      });
    }
    return json({ checkoutUrl: session.url });
  } catch (e) {
    return json({ error: 'Stripe: ' + (e as Error).message }, 500);
  }
});
