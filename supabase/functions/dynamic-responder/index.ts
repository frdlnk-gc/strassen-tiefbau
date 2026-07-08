// =============================================================================
// Supabase Edge Function: create-checkout (dynamic-responder)
// Sichere Server-Logik für den Arbeitgeber-Checkout (kaufen-einmal.html / kaufen-abo.html)
//
// Aufgaben:
//  1. Preis SERVER-SEITIG neu berechnen (Client-Werte sind nur Anzeige – nie vertrauen).
//  2. Rabattcode validieren (Geheimwort-Prefix + Prozent in 10er-Stufen, gedeckelt).
//  3. Sofortzahlung (Karte/PayPal) -> Stripe-Checkout-Session -> checkoutUrl zurück.
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
const CODE_MAX_PCT  = 50;                // Maximal erlaubter Code-Rabatt (Vertriebs-Nachlässe)
const CODE_STEP_PCT = 10;                // Nur 10er-Stufen gültig: Sale 10, 20, 30, 40, 50 (Vorgabe Freddy 2026-07-04)
const VAT           = 0.19;              // 19 % USt. – auf Netto aufgeschlagen
const SITE          = 'https://strassen-tiefbau.green-careers.de';
const OS            = 'https://os.green-careers.de';   // Rückkehr-Ziel nach Zahlung (Option B: Kauf läuft im OS)

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
  exzellenz: { name: 'Exzellenz', price: 899 },
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

// Rabattcode "Sale 30" -> 30 ; sonst 0. Regeln (Vertrieb Julian/Liam):
//  - Geheimwort case-insensitive, Leerzeichen optional ("sale30", "SALE 30", "Sale 30")
//  - NUR ganze 10er-Stufen: 10, 20, 30, 40, 50. "Sale 15" oder "Sale 60" sind ungültig.
function parseCodePct(raw: string): number {
  if (!raw) return 0;
  const re = new RegExp('^\\s*' + RABATT_PREFIX + '\\s*([0-9]{1,2})\\s*$', 'i');
  const m = raw.match(re);
  if (!m) return 0;
  const pct = parseInt(m[1], 10);
  return pct >= CODE_STEP_PCT && pct <= CODE_MAX_PCT && pct % CODE_STEP_PCT === 0 ? pct : 0;
}

// SEPA-Lastschrift bewusst NICHT anbieten: Stripe verbucht sie verzögert (payment_status
// beim Redirect noch 'unpaid'), unser confirm-checkout schaltet aber nur bei bezahlter Session
// frei. Ohne Webhook für 'checkout.session.async_payment_succeeded' bliebe die Zahlung ewig
// unverbucht (Geld kassiert, kein Kontingent). Erst wieder aufnehmen, wenn der Webhook steht.
const STRIPE_METHOD: Record<string, string> = { card: 'card', paypal: 'paypal' };

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
  // Eintritts-Marke: 'grey' (GreyCareers/Tiefbau) | 'green' (GreenCareers/GaLaBau).
  // Wird in Bestellung + Stripe-Metadaten mitgeführt, damit Make/Webhook
  // marken-richtig branden können (Grey-Mails vs. Green-Mails).
  const brand  = String(p.brand || '').toLowerCase() === 'green' ? 'green' : 'grey';
  const c      = p.customer || {};
  // Option B: Account existiert bereits -> Bestellung mit Account verknüpfen
  const customerId = p.customerId ? String(p.customerId) : null;   // customers.id (aus create_my_company)
  const authUserId = p.authUserId ? String(p.authUserId) : null;   // auth.users.id (eingeloggter Nutzer)
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
    mode, pkg: pkgKey, qty: String(qty), term: p.term || '', ref, brand, method,
    qty_pct: String(qtyPct), code_pct: String(codePct),
    net_per_unit: finalNet.toFixed(2), firma: c.firma, name: c.name, email: c.email,
    customer_id: customerId || '', auth_user_id: authUserId || '',   // Account-Verknüpfung (für Webhook-Auto-Freigabe)
  };

  // ---- KAUF AUF RECHNUNG: Bestellung + Freigabe-Mail -----------------------
  if (method === 'rechnung') {
    const order = {
      mode, paket: pkgKey, anzahl: qty, laufzeit: p.term || null,
      netto_pro_einheit: finalNet, monate: months,
      gesamt_netto: mode === 'abo' ? finalNet * months : finalNet,
      qty_rabatt_pct: qtyPct, code_rabatt_pct: codePct, ref, brand,
      zahlungsart: 'rechnung', status: 'wartet_zahlung',
      kunde_name: c.name, kunde_firma: c.firma, kunde_email: c.email,
      kunde_tel: c.tel || null, kunde_ustid: c.vat || null,
      customer_id: customerId, auth_user_id: authUserId,
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
    // §312j Abs. 3 BGB (Button-Lösung): Zahlungspflicht direkt über dem Bezahl-Button klarstellen.
    const submitMsg = mode === 'abo'
      ? 'Mit Abschluss startest du ein kostenpflichtiges Abo (monatliche Zahlung).'
      : 'Mit Abschluss dieser Bestellung gehst du eine Zahlungsverpflichtung ein.';
    const common = {
      customer_email: c.email,
      payment_method_types: [pmType] as any,
      client_reference_id: ref || undefined,
      metadata: meta,
      custom_text: { submit: { message: submitMsg } },
      success_url: `${OS}/?paid=1&session_id={CHECKOUT_SESSION_ID}`,   // zurück ins OS -> Erfolgs-View + Einrichtung
      cancel_url: `${OS}/?flow=buy`,                                   // Abbruch -> OS zeigt Checkout erneut
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
