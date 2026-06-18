# GreyCareers OS – E-Mail-Templates für Supabase Auth

Diese Templates ersetzen die unbrandeten „Supabase Auth"-Standardmails durch
GreyCareers-gebrandete Mails (Orange `#EA580C`, Wordmark, deutscher Text,
Rechts-Footer „Marke der Green Careers GmbH").

> **Wichtig – Multi-Brand-Hinweis:** Ein Supabase-Projekt hat **nur EINEN**
> globalen Satz E-Mail-Templates. Solange nur GreyCareers / Tiefbau über dieses
> Projekt läuft, ist das ok. Sobald das **grüne** Portal (Green/GaLaBau) denselben
> Supabase-Auth nutzt, bekommen dessen Nutzer ebenfalls die orange Grey-Mail.
> Sauberer Multi-Brand-Versand geht nur über **eigenes SMTP + Custom-Logik**
> (z. B. Auth-Hook / Edge Function pro Marke) – das ist ein späterer Ausbau.

---

## 0) Voraussetzung: Custom SMTP einrichten (PFLICHT)

Der eigentliche Grund, warum aktuell **keine** Registrierungs-Mails ankommen,
ist **nicht** das Template, sondern das **Rate-Limit des eingebauten Supabase-SMTP**
(„email rate limit exceeded" nach wenigen Sends). Der eingebaute Mailer ist nur
zum Testen gedacht.

**Supabase Dashboard → Project `tfoopogxaqvfwbonabpi` → Authentication → Emails → SMTP Settings:**
- *Enable Custom SMTP* einschalten
- Sender name: **GreyCareers OS**
- Sender email: z. B. `noreply@green-careers.de` (Domain muss verifiziert sein)
- Host / Port / User / Passwort: vom Mailprovider (z. B. Resend SMTP, Brevo,
  Postmark, Mailgun, AWS SES). Empfehlung: ein Provider, dessen Domain bereits
  per SPF/DKIM verifiziert ist → Mails landen nicht im Spam.

**Außerdem Authentication → URL Configuration:**
- *Site URL:* `https://os.green-careers.de`
- *Redirect URLs* (Allowlist) ergänzen:
  - `https://os.green-careers.de`
  - `https://os.green-careers.de/*`

Ohne diese Allowlist verwirft Supabase den `emailRedirectTo`/`redirectTo` und
der Bestätigungs-/Reset-Link führt ins Leere.

---

## 1) Confirm signup (Bestätige deine E-Mail)

**Authentication → Emails → Templates → „Confirm signup"**

- **Subject:** `Bestätige deine E-Mail – GreyCareers OS`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Nur noch ein Klick</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Willkommen bei GreyCareers OS. Bitte bestätige deine E-Mail-Adresse,
            damit wir dein Konto freischalten und du dein Cockpit einrichten kannst.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:11px;background:#EA580C;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px;">E-Mail bestätigen</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#C2410C;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du hast dich nicht registriert? Dann ignoriere diese E-Mail einfach.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 2) Reset password (Passwort zurücksetzen)

**Authentication → Emails → Templates → „Reset password"**

- **Subject:** `Passwort zurücksetzen – GreyCareers OS`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Passwort zurücksetzen</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Du hast ein neues Passwort für dein GreyCareers OS angefordert.
            Klick auf den Button, um ein neues Passwort zu vergeben – danach bist
            du direkt eingeloggt.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:11px;background:#EA580C;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px;">Neues Passwort vergeben</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#C2410C;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du hast das nicht angefordert? Dann ignoriere diese E-Mail – dein
            Passwort bleibt unverändert.
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 3) Magic Link (Anmelde-Link)

**Authentication → Emails → Templates → „Magic Link"**

- **Subject:** `Dein Anmelde-Link – GreyCareers OS`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Dein Anmelde-Link</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Klick auf den Button, um dich ohne Passwort bei GreyCareers OS
            anzumelden. Der Link ist nur kurze Zeit gültig.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:11px;background:#EA580C;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px;">Jetzt anmelden</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#C2410C;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du hast keine Anmeldung angefordert? Dann ignoriere diese E-Mail einfach.
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 4) Invite user (Einladung ins Team)

**Authentication → Emails → Templates → „Invite user"**

- **Subject:** `Du wurdest zu GreyCareers OS eingeladen`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Du bist eingeladen</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Dein Betrieb arbeitet mit GreyCareers OS – dem Tool für Bewerber,
            Team und Baustellen. Richte jetzt deinen Zugang ein und leg los.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:11px;background:#EA580C;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px;">Zugang einrichten</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#C2410C;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du kennst den Absender nicht? Dann ignoriere diese E-Mail einfach.
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 5) Change Email Address (E-Mail-Adresse ändern)

**Authentication → Emails → Templates → „Change Email Address"**

- **Subject:** `Bestätige deine neue E-Mail – GreyCareers OS`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Neue E-Mail bestätigen</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Du möchtest die E-Mail-Adresse deines Grey-Careers-OS-Kontos auf
            <strong style="color:#18181b;">{{ .Email }}</strong> ändern.
            Bitte bestätige das mit einem Klick.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:11px;background:#EA580C;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px;">E-Mail-Änderung bestätigen</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#71717a;">
            Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
          </p>
          <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="{{ .ConfirmationURL }}" style="color:#C2410C;">{{ .ConfirmationURL }}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du hast das nicht angefordert? Dann ignoriere diese E-Mail – deine
            Adresse bleibt unverändert.
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## 6) Reauthentication (Identität bestätigen, OTP-Code)

**Authentication → Emails → Templates → „Reauthentication"**

> Diese Mail nutzt **keinen** Link, sondern den 6-stelligen Code `{{ .Token }}`.

- **Subject:** `Dein Bestätigungscode – GreyCareers OS`
- **Message body (HTML):**

```html
<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:linear-gradient(135deg,#EA580C,#C2410C);padding:26px 32px;">
          <span style="font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.01em;">GreyCareers<span style="color:#FFD9C2;"> OS</span></span>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#18181b;letter-spacing:-.01em;">Dein Bestätigungscode</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Bitte gib diesen Code ein, um deine Identität zu bestätigen:
          </p>
          <div style="margin:0 0 24px;padding:18px 0;text-align:center;background:#FFF4ED;border:1px solid #FFD9C2;border-radius:12px;">
            <span style="font-size:32px;font-weight:700;letter-spacing:.18em;color:#C2410C;">{{ .Token }}</span>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            Du hast das nicht angefordert? Dann ignoriere diese E-Mail.
          </p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            GreyCareers ist eine Marke der <strong style="color:#71717a;">Green Careers GmbH</strong>.<br>
            Diese Nachricht wurde automatisch versendet.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

---

## Verfügbare Template-Variablen (Supabase, Go-Syntax)

| Variable               | Bedeutung                                    |
|------------------------|----------------------------------------------|
| `{{ .ConfirmationURL }}` | Vollständiger Bestätigungs-/Reset-Link (inkl. Token + RedirectTo) |
| `{{ .Token }}`          | 6-stelliger OTP-Code (falls Code-Login)      |
| `{{ .TokenHash }}`      | Gehashter Token (für eigene Verify-URLs)     |
| `{{ .SiteURL }}`        | Konfigurierte Site-URL                        |
| `{{ .Email }}`          | E-Mail-Adresse des Empfängers                 |
| `{{ .RedirectTo }}`     | Ziel-URL nach Bestätigung                     |

> Innerhalb von `<a href="…">` immer `{{ .ConfirmationURL }}` nutzen – der enthält
> bereits den korrekten `redirect_to`, den das OS (`gcAuthBoot`) per URL-Fragment
> (`#access_token…&type=signup|recovery`) auswertet.
