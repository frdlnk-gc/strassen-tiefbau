# Make-Szenario: Bestellung → 2 Mails (Freddy + Kunde)

**Ziel:** Sobald eine neue Zeile in `bestellungen` entsteht, gehen automatisch zwei Mails raus:
1. **Interne Info an dich** (neue Bestellung — bei Rechnung: „bitte Zahlung prüfen").
2. **Bestellbestätigung an den Kunden** — marken-richtig gebrandet (GreyCareers oder GreenCareers, je nach Spalte `brand`).

Du baust das **einmal** in Make zusammen. Unten steht jedes Modul + welches Feld wohin.

---

## Modul 1 — Trigger: Supabase „Watch Rows"

- App: **Supabase** → Trigger **Watch Rows**
- Connection: dein Supabase-Projekt (`tfoopogxaqvfwbonabpi`)
- Table: **`bestellungen`**
- Sort: `created_at` absteigend
- Limit: 2
- (Make merkt sich, welche Zeilen es schon gesehen hat → jede neue Bestellung löst genau 1× aus.)

> Alternativ (zuverlässiger, aber ein Schritt mehr): Supabase **Database Webhook** auf `INSERT` der Tabelle `bestellungen` → Make **Custom Webhook**. Für den Start reicht „Watch Rows".

## Modul 2 — Router (2 Wege)

Hänge hinter den Trigger einen **Router**. Er teilt in zwei Pfade:
- **Pfad A:** immer (interne Mail an dich)
- **Pfad B:** immer (Bestätigung an Kunden)

*(Optional ein Filter auf Pfad A: nur wenn `zahlungsart = rechnung` → dann ist es eine „bitte Zahlung prüfen"-Mail. Bei Sofortzahlung schreibt der Stripe-Webhook `status = freigegeben`, da musst du nichts mehr tun.)*

---

## Modul 3 (Pfad A) — Mail an dich

- App: **Email → Send an email** (oder Gmail)
- An: `frederik.linke@greenfield-digital.de`
- Betreff:
  ```
  Neue Bestellung ({{1.brand}}) – {{1.kunde_firma}} – {{1.status}}
  ```
- Inhalt (Text):
  ```
  Neue Bestellung eingegangen.

  Marke:        {{1.brand}}      (grey = GreyCareers, green = GreenCareers)
  Firma:        {{1.kunde_firma}}
  Ansprechpartner: {{1.kunde_name}}
  E-Mail:       {{1.kunde_email}}
  Telefon:      {{1.kunde_tel}}
  USt-ID:       {{1.kunde_ustid}}

  Paket:        {{1.paket}} ({{1.mode}}), Anzahl {{1.anzahl}}
  Laufzeit:     {{1.laufzeit}} / {{1.monate}} Monate
  Netto/Einheit: {{1.netto_pro_einheit}} €
  Gesamt netto: {{1.gesamt_netto}} €
  Zahlungsart:  {{1.zahlungsart}}
  Status:       {{1.status}}
  Referral:     {{1.ref}}

  Bestell-ID:   {{1.id}}
  ```
- **Wichtig bei Rechnung:** `status = wartet_zahlung` → das ist deine Erinnerung, im Backend nach Zahlungseingang „Freischalten" zu klicken (bzw. später automatisch via Qonto).

## Modul 4 (Pfad B) — Bestätigung an den Kunden

- App: **Email → Send an email**
- An: `{{1.kunde_email}}`
- **Absendername je Marke** (damit Grey-Kunde „GreyCareers" sieht, Green-Kunde „GreenCareers"):
  - Setze davor ein **Make-Modul „Tools → Set variable"** namens `markenname`:
    - Wert: `{{if(1.brand = "green"; "GreenCareers"; "GreyCareers")}}`
  - Optional zweite Variable `portalurl`:
    - `{{if(1.brand = "green"; "https://green-careers.de"; "https://strassen-tiefbau.green-careers.de")}}`
- Betreff:
  ```
  Ihre Bestellung bei {{markenname}} ist eingegangen
  ```
- Inhalt (Text), **bei Rechnung** (zahlungsart = rechnung):
  ```
  Hallo {{1.kunde_name}},

  vielen Dank für Ihre Bestellung bei {{markenname}}.

  Paket:    {{1.paket}} ({{1.anzahl}} Stelle/n)
  Betrag:   {{1.gesamt_netto}} € netto zzgl. 19 % USt.

  Sie erhalten in Kürze die Rechnung. Sobald Ihre Zahlung bei uns
  eingeht, schalten wir Ihr Kontingent frei und Sie können Ihre
  Stellen veröffentlichen.

  Ihr Zugang: {{markenname}} OS – Sie können Ihren Betrieb schon
  jetzt einrichten, während die Zahlung läuft.

  Beste Grüße
  Ihr {{markenname}}-Team
  GreenCareers GmbH
  ```
  **Bei Sofortzahlung** (status = freigegeben) statt des Zahlungs-Absatzes:
  ```
  Ihre Zahlung ist eingegangen – Ihr Kontingent ist sofort
  freigeschaltet. Sie können direkt Stellen veröffentlichen.
  ```
  *(Zwei Mail-Texte über einen Filter/Router auf `status` trennen, oder einen Text mit `{{if(...)}}`.)*

---

## Feld-Referenz (Spalten in `bestellungen`)

| Feld | Bedeutung |
|---|---|
| `brand` | `grey` = GreyCareers, `green` = GreenCareers ← **steuert das Branding** |
| `mode` | `einmal` / `abo` |
| `paket` | `smart` / `premium` / `exzellenz` |
| `anzahl` | Anzahl Stellen |
| `laufzeit` / `monate` | `6m`/`12m` bzw. 1/6/12 |
| `netto_pro_einheit` / `gesamt_netto` | Preise netto |
| `zahlungsart` | `card` / `paypal` / `sepa` / `rechnung` |
| `status` | `wartet_zahlung` (Rechnung offen) / `freigegeben` (sofort bezahlt) |
| `kunde_*` | Name / Firma / E-Mail / Tel / USt-ID |
| `ref` | Vertriebs-/Empfehlungskürzel |
| `id` | Bestell-ID |

> **Hinweis zu E-Mails & Marke:** Die Supabase **Auth-Mails** (Bestätigungslink, Passwort-Reset) sind projektweit und können NICHT je Marke umschalten. Marken-Branding läuft deshalb über DIESE Make-Mails. Auth-Mails neutral halten (Absender „GreenCareers GmbH").
