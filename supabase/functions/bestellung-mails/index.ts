// =============================================================================
// Supabase Edge Function: bestellung-mails
// Ersetzt das Make-Szenario. Wird per Supabase DATABASE WEBHOOK aufgerufen,
// sobald eine neue Zeile in `bestellungen` entsteht (INSERT). Verschickt 2 Mails:
//   A) Interne Info an Freddy  (bei Rechnung: "bitte Zahlung prüfen")
//   B) Bestellbestätigung an den Kunden — marken-richtig (grey = GreyCareers,
//      green = GreenCareers), Text je nach `status` (wartet_zahlung | freigegeben).
//
// Versand über MailerSend (https://mailersend.com). Absender: hello@green-careers.de
// (Domain green-careers.de muss in MailerSend verifiziert sein).
//
// SICHERHEIT: Function läuft public (--no-verify-jwt). Schutz gegen Fremdaufrufe
// über einen gemeinsamen Header `x-webhook-secret`, der zum Secret WEBHOOK_SECRET
// passen muss. Der Supabase-DB-Webhook sendet genau diesen Header mit.
//
// DEPLOY:  supabase functions deploy bestellung-mails --use-api --no-verify-jwt
// SECRETS: supabase secrets set MAILERSEND_API_KEY=mlsn_...
//          supabase secrets set WEBHOOK_SECRET=<langer-zufallsstring>
//          supabase secrets set MAIL_FROM_EMAIL=hello@green-careers.de   (optional, default unten)
//          supabase secrets set MAIL_INTERN=frederik.linke@greenfield-digital.de (optional)
//
// SUPABASE DATABASE WEBHOOK (Dashboard -> Database -> Webhooks -> Create):
//   Table: bestellungen | Events: Insert | Type: HTTP Request | Method: POST
//   URL:   https://tfoopogxaqvfwbonabpi.supabase.co/functions/v1/bestellung-mails
//   HTTP Header:  x-webhook-secret = <derselbe Wert wie WEBHOOK_SECRET>
// =============================================================================

const MAILERSEND_API_KEY = Deno.env.get('MAILERSEND_API_KEY') ?? '';
const WEBHOOK_SECRET  = Deno.env.get('WEBHOOK_SECRET') ?? '';
const FROM_EMAIL      = Deno.env.get('MAIL_FROM_EMAIL') ?? 'hello@green-careers.de';
const MAIL_INTERN     = Deno.env.get('MAIL_INTERN') ?? 'frederik.linke@greenfield-digital.de';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Netto-Betrag deutsch formatieren ("1.234,50 €")
const eur = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
};

async function sendMail(opts: {
  fromEmail: string; fromName: string; to: string; subject: string; html: string;
  replyToEmail?: string; replyToName?: string;
}) {
  const res = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      from: { email: opts.fromEmail, name: opts.fromName },
      to: [{ email: opts.to }],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyToEmail ? { reply_to: { email: opts.replyToEmail, ...(opts.replyToName ? { name: opts.replyToName } : {}) } } : {}),
    }),
  });
  // MailerSend antwortet bei Erfolg mit 202 Accepted (meist ohne Body).
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`MailerSend ${res.status}: ${txt}`);
  }
  return { id: res.headers.get('x-message-id') || null };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // ---- Schutz: nur mit korrektem Webhook-Secret -----------------------------
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!MAILERSEND_API_KEY) return new Response('MAILERSEND_API_KEY fehlt', { status: 500 });

  // ---- Payload des DB-Webhooks lesen ----------------------------------------
  let body: any;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const r = (body?.record ?? body) as Record<string, any>;
  if (!r || !r.kunde_email) {
    return new Response(JSON.stringify({ ignored: true, reason: 'kein record/kunde_email' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- Marke + Status auswerten ---------------------------------------------
  const isGreen   = String(r.brand).toLowerCase() === 'green';
  const marke     = isGreen ? 'GreenCareers' : 'GreyCareers';
  const freigegeben = String(r.status) === 'freigegeben';
  // Grundfarben fix je Marke (identisch zu den OS-Theme-Variablen):
  // GreenCareers = Grundgrün #16A34A, GreyCareers = Orange #EA580C.
  const accent    = isGreen ? '#16A34A' : '#EA580C';

  const paketLabel = `${esc(r.paket)} (${esc(r.mode)})`;
  const anzahl     = esc(r.anzahl);

  // ====== Mail A: intern an Freddy ===========================================
  const internSubject =
    `Neue Bestellung (${marke}) – ${r.kunde_firma || r.kunde_name} – ${r.status}`;
  const internHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
      <h2 style="margin:0 0 12px">Neue Bestellung eingegangen</h2>
      ${freigegeben
        ? '<p style="margin:0 0 12px;color:#16A34A"><b>Sofortzahlung – Kontingent ist automatisch freigegeben.</b></p>'
        : '<p style="margin:0 0 12px;color:#C0392B"><b>Kauf auf Rechnung – bitte Zahlungseingang prüfen und freischalten.</b></p>'}
      <table style="border-collapse:collapse">
        <tr><td style="padding:2px 12px 2px 0;color:#666">Marke</td><td><b>${esc(marke)}</b> (${esc(r.brand)})</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Firma</td><td>${esc(r.kunde_firma)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Ansprechpartner</td><td>${esc(r.kunde_name)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">E-Mail</td><td>${esc(r.kunde_email)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Telefon</td><td>${esc(r.kunde_tel)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">USt-ID</td><td>${esc(r.kunde_ustid)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Paket</td><td>${paketLabel}, Anzahl ${anzahl}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Laufzeit</td><td>${esc(r.laufzeit)} / ${esc(r.monate)} Monate</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Netto/Einheit</td><td>${eur(r.netto_pro_einheit)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Gesamt netto</td><td><b>${eur(r.gesamt_netto)}</b></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Zahlungsart</td><td>${esc(r.zahlungsart)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Status</td><td>${esc(r.status)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Referral</td><td>${esc(r.ref)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666">Bestell-ID</td><td>${esc(r.id)}</td></tr>
      </table>
    </div>`;

  // ====== Mail B: Bestätigung an Kunden ======================================
  const kundeSubject = `Ihre Bestellung bei ${marke} ist eingegangen`;

  // Personalisierter CTA-Button -> Betrieb im OS einrichten.
  // brand wird mitgegeben, damit das OS direkt grey/green-gebrandet startet.
  const osUrl = `https://os.green-careers.de/?brand=${encodeURIComponent(String(r.brand || 'grey'))}`;
  const firmaLabel = r.kunde_firma ? ` für ${esc(r.kunde_firma)}` : '';
  const ctaBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 12px">
      <tr><td align="center" style="border-radius:10px;background:${accent}">
        <a href="${esc(osUrl)}" target="_blank"
           style="display:block;padding:16px 22px;font-family:Arial,Helvetica,sans-serif;
                  font-size:16px;line-height:1.35;font-weight:bold;color:#ffffff;
                  text-align:center;text-decoration:none;border-radius:10px">
          Jetzt ${esc(marke)} OS${firmaLabel} einrichten →
        </a>
      </td></tr>
    </table>
    <p style="margin:0 0 14px;color:#666;font-size:13px;text-align:center">
      Ein Klick genügt – Sie richten Ihren Betrieb in wenigen Minuten ein.
    </p>`;
  const zahlBlock = freigegeben
    ? `<p style="margin:0 0 14px">Ihre Zahlung ist eingegangen – Ihr Kontingent ist
        <b>sofort freigeschaltet</b>. Sie können direkt Stellen veröffentlichen.</p>`
    : `<p style="margin:0 0 14px">Sie erhalten in Kürze die Rechnung. Sobald Ihre Zahlung
        bei uns eingeht, schalten wir Ihr Kontingent frei und Sie können Ihre Stellen
        veröffentlichen.</p>
       <p style="margin:0 0 14px">Ihr Zugang: <b>${esc(marke)} OS</b> – Sie können Ihren Betrieb
        schon jetzt einrichten, während die Zahlung läuft.</p>`;
  const kundeHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.6">
      <div style="height:4px;background:${accent};border-radius:2px;margin:0 0 18px"></div>
      <p style="margin:0 0 14px">Hallo ${esc(r.kunde_name)},</p>
      <p style="margin:0 0 14px">vielen Dank für Ihre Bestellung bei <b>${esc(marke)}</b>.</p>
      <table style="border-collapse:collapse;margin:0 0 16px">
        <tr><td style="padding:2px 14px 2px 0;color:#666">Paket</td><td>${esc(r.paket)} (${anzahl} Stelle/n)</td></tr>
        <tr><td style="padding:2px 14px 2px 0;color:#666">Betrag</td><td><b>${eur(r.gesamt_netto)} netto</b> zzgl. 19 % USt.</td></tr>
      </table>
      ${zahlBlock}
      ${ctaBlock}
      <p style="margin:18px 0 2px">Beste Grüße</p>
      <p style="margin:0 0 2px">Ihr ${esc(marke)}-Team</p>
      <p style="margin:0;color:#666">${isGreen ? 'GreenCareers GmbH' : 'GreyCareers ist eine Marke der GreenCareers GmbH'}</p>
    </div>`;

  // ---- Versand --------------------------------------------------------------
  try {
    await sendMail({
      fromEmail: FROM_EMAIL, fromName: `${marke} System`,
      to: MAIL_INTERN, subject: internSubject, html: internHtml,
      replyToEmail: String(r.kunde_email), replyToName: String(r.kunde_name || ''),
    });
    await sendMail({
      fromEmail: FROM_EMAIL, fromName: marke,
      to: String(r.kunde_email), subject: kundeSubject, html: kundeHtml,
      replyToEmail: FROM_EMAIL, replyToName: marke,
    });
  } catch (e) {
    // 500 -> Supabase-Webhook kann später erneut zustellen.
    return new Response('Mailversand: ' + (e as Error).message, { status: 500 });
  }

  return new Response(JSON.stringify({ sent: true, brand: r.brand, status: r.status }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
