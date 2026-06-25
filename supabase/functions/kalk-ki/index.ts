// =========================================================
// Supabase Edge Function: kalk-ki
// KI-Kalkulator fuer das GreenCareers OS (Garten- & Landschaftsbau).
//
// WAS DIESE FUNCTION TUT:
//  Sie nimmt eine FREITEXT-Projektbeschreibung des Betriebs entgegen
//  ("Wir sollen eine 40 m2 Terrasse mit Naturstein pflastern, alten Belag
//   raus, neuer Schotter-Unterbau, Aushub ca. 12 m3 ...") und zerlegt sie
//  in ein vollstaendiges LEISTUNGSVERZEICHNIS (LV): einzelne Positionen mit
//  Menge + Einheit. Wo moeglich greift sie auf den vorhandenen Katalog des
//  Betriebs zurueck (eigene Artikel + Aufwandswert-Vorlagen), sonst legt sie
//  freie Positionen mit geschaetztem Netto-EP an.
//
//  Der Preis/Endpreis wird NICHT hier berechnet. Die Function liefert nur
//  Referenz (Artikel-/Vorlagen-ID) + Menge zurueck; den Endpreis rechnet das
//  OS clientseitig aus calcCfg (Stundensatz, Material-Aufschlag, W&G, MwSt).
//  So bleibt die Kalkulationslogik EINE Quelle (Frontend) und ist
//  nachvollziehbar.
//
// WARUM Server-Proxy (Architektur-Constraint):
//  Die OS-Seite liegt statisch (GitHub Pages). Der Anthropic-Key darf dort
//  NIEMALS eingebettet sein. Der Key liegt als Supabase-Secret; nur diese
//  Function spricht mit der Claude-API.
//
// DEPLOY (im Supabase-Projekt "GreenCareers OS"):
//   1) Secret setzen (falls noch nicht von maya-chat vorhanden):
//        supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   2) Function deployen (Verify-JWT bleibt AN, anon-Key reicht):
//        supabase functions deploy kalk-ki
//   3) Fertig. Das OS ruft sie unter /functions/v1/kalk-ki auf.
//
// MODELL: claude-sonnet-4-6 (gute Struktur-/Mengen-Logik). Fuer guenstiger
//   auf 'claude-haiku-4-5-20251001' wechseln (etwas schwaecher beim Zerlegen).
// =========================================================

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6";

// --- CORS (OS-Domains; eng halten) ---
const ALLOW_ORIGINS = [
  "https://os.green-careers.de",
  "http://localhost:4338", // lokale Vorschau
  "http://localhost:5173",
];
function corsHeaders(origin: string | null) {
  const allow = origin && ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SYSTEM_PROMPT = `Du bist ein erfahrener Kalkulator im Garten- und Landschaftsbau (GaLaBau) in Deutschland. Du zerlegst eine in eigenen Worten beschriebene Baustelle in ein sauberes, vollstaendiges Leistungsverzeichnis (LV) mit einzelnen Positionen.

DEINE AUFGABE
- Lies die Projektbeschreibung des Betriebs und erzeuge die noetigen LV-Positionen mit Menge + Einheit.
- Denke wie ein Praktiker: Eine "Terrasse pflastern" umfasst in der Regel mehrere Positionen (z. B. Aushub/Abtrag, Schotter-/Frostschutz-Unterbau, Pflasterarbeiten, ggf. Randeinfassung, Materialien, Abfuhr/Entsorgung). Mache aus einer Beschreibung das, was ein Profi tatsaechlich kalkulieren wuerde - nicht nur eine einzelne Zeile.
- Schaetze Mengen plausibel aus den genannten Massen (Flaeche, Laenge, Tiefe). Wenn eine Menge nicht ableitbar ist, setze 1 und schreibe einen kurzen Hinweis dazu.

KATALOG ZUERST
- Dir wird der vorhandene Katalog des Betriebs uebergeben: eigene Artikel (article) und Aufwandswert-Vorlagen (template). Nutze NACH MOEGLICHKEIT diese Katalog-Eintraege ueber ihre id - dann rechnet das System mit den hinterlegten Werten des Betriebs.
- Waehle pro Position den bestpassenden Katalog-Eintrag. Passt nichts wirklich, lege eine freie Position (free) an.

PREISE
- Fuer article/template gibst du KEINEN Preis an (das System rechnet selbst). Nur ref_type + ref_id + menge + unit.
- Fuer free-Positionen gibst du ep_netto (Netto-Einzelpreis je Einheit in Euro, realistische deutsche GaLaBau-Marktpreise 2026) und is_labor (true, wenn es reine Arbeitszeit/Lohn ist - relevant fuer den §35a-Lohnanteil).

EINHEITEN (nur diese verwenden)
Std, Tag, m2, m3, lfm, Stk, t, kg, Sack, Palette, km, pausch.

AUSGABEFORMAT - WICHTIG
- Antworte AUSSCHLIESSLICH mit GUELTIGEM JSON. Kein Markdown, keine Erklaerung davor oder danach.
- Schema:
{
  "positions": [
    { "ref_type": "template|article|free", "ref_id": "<katalog-id oder null>", "name": "<klare Bezeichnung>", "menge": <zahl>, "unit": "<Einheit>", "ep_netto": <zahl, nur bei free>, "is_labor": <bool, nur bei free>, "note": "<optional kurzer Hinweis>" }
  ],
  "hinweise": [ "<kurze Annahmen/Rueckfragen an den Betrieb, z. B. zu geschaetzten Mengen>" ]
}
- ref_id MUSS exakt eine id aus dem uebergebenen Katalog sein, wenn ref_type article oder template ist.
- Erfinde keine Leistungen, die der Text nicht hergibt. Lieber einen Hinweis als eine erfundene Position.`;

// Robust: erstes balanciertes JSON-Objekt aus dem Text ziehen.
function extractJson(s: string): any | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      } }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const text = String(body?.text || "").slice(0, 6000).trim();
    const catalog = body?.catalog || {};
    const satz = Number(body?.satz) || 79;
    if (!text) {
      return new Response(JSON.stringify({ error: "no text" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Katalog defensiv & kompakt (Kontext/Kosten begrenzen).
    const articles = Array.isArray(catalog.articles) ? catalog.articles.slice(0, 120).map((a: any) => ({
      id: String(a.id), name: String(a.name || "").slice(0, 80), type: String(a.type || ""),
      unit: String(a.unit || ""), syn: Array.isArray(a.syn) ? a.syn.slice(0, 8).map((s: any) => String(s).slice(0, 40)) : [],
    })) : [];
    const templates = Array.isArray(catalog.templates) ? catalog.templates.slice(0, 120).map((t: any) => ({
      id: String(t.id), name: String(t.name || "").slice(0, 80), grp: String(t.grp || ""),
      unit: String(t.unit || ""), lohn_std: Number(t.lohn) || 0,
    })) : [];

    const userMsg =
      `STUNDENVERRECHNUNGSSATZ des Betriebs: ${satz} EUR/Std (nur zur Orientierung; template-Preise rechnet das System selbst).\n\n` +
      `KATALOG - Aufwandswert-Vorlagen (template):\n${JSON.stringify(templates)}\n\n` +
      `KATALOG - eigene Artikel (article):\n${JSON.stringify(articles)}\n\n` +
      `PROJEKTBESCHREIBUNG des Betriebs:\n"""${text}"""\n\n` +
      `Erzeuge jetzt das Leistungsverzeichnis als JSON nach dem vorgegebenen Schema.`;

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMsg },
          { role: "assistant", content: "{" }, // Prefill erzwingt reines JSON
        ],
      }),
    });

    if (!ai.ok) {
      const t = await ai.text();
      console.error("anthropic error", ai.status, t);
      return new Response(JSON.stringify({ error: "upstream" }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const data = await ai.json();
    const raw = "{" + (data?.content?.[0]?.text || "");
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed.positions)) {
      console.error("kalk-ki: JSON-Parse fehlgeschlagen", raw.slice(0, 400));
      return new Response(JSON.stringify({ error: "parse", raw: raw.slice(0, 400) }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Server-seitig saeubern: nur erlaubte Felder, IDs gegen Katalog pruefen.
    const artIds = new Set(articles.map((a: any) => a.id));
    const tplIds = new Set(templates.map((t: any) => t.id));
    const UNITS = new Set(["Std","Tag","m2","m3","m²","m³","lfm","Stk","t","kg","Sack","Palette","km","pausch."]);
    const positions = (parsed.positions as any[]).slice(0, 60).map((p) => {
      let ref_type = String(p.ref_type || "free");
      const ref_id = p.ref_id != null ? String(p.ref_id) : null;
      // ID gegen Katalog validieren - sonst auf free zuruekfallen
      if (ref_type === "article" && !(ref_id && artIds.has(ref_id))) ref_type = "free";
      if (ref_type === "template" && !(ref_id && tplIds.has(ref_id))) ref_type = "free";
      let unit = String(p.unit || "Stk").replace("m2", "m²").replace("m3", "m³");
      if (!UNITS.has(unit)) unit = "Stk";
      const menge = Number(p.menge);
      return {
        ref_type,
        ref_id: ref_type === "free" ? null : ref_id,
        name: String(p.name || "Position").slice(0, 120),
        menge: Number.isFinite(menge) && menge > 0 ? menge : 1,
        unit,
        ep_netto: ref_type === "free" ? (Number(p.ep_netto) || 0) : undefined,
        is_labor: ref_type === "free" ? !!p.is_labor : undefined,
        note: p.note ? String(p.note).slice(0, 200) : undefined,
      };
    });
    const hinweise = Array.isArray(parsed.hinweise)
      ? parsed.hinweise.slice(0, 8).map((h: any) => String(h).slice(0, 240)) : [];

    return new Response(JSON.stringify({ positions, hinweise }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kalk-ki error", e);
    return new Response(JSON.stringify({ error: "server" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
