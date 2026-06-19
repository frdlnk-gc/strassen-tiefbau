/* =====================================================================
   GreenCareers GmbH – Cookie-Consent-Banner (TTDSG / DSGVO)
   Selbst gebrandet, ohne externe Abhängigkeit. Eine Marke der GreenCareers GmbH.

   Eigenschaften:
   - Erscheint nur beim ersten Besuch (bzw. solange keine gültige Einwilligung
     der aktuellen Version gespeichert ist).
   - Drei gleichwertige Wege: „Alle akzeptieren", „Nur essenzielle", „Einstellungen".
     (TTDSG: Ablehnen muss so einfach sein wie Akzeptieren.)
   - Marketing/Statistik standardmäßig AUS. Erst bei aktiver Einwilligung
     werden Meta Pixel + Google geladen.
   - „Alle akzeptieren" aktiviert Statistik + Marketing und feuert die Pixel sofort.
   - Google Consent Mode v2: Default „denied", Update bei Einwilligung.
   - Re-Open über window.gcCookieSettings() (z. B. Footer-Link „Cookie-Einstellungen").

   IDs konfigurieren (sobald vorhanden) als data-Attribute am <script>-Tag:
     data-accent="#EA580C"   Markenfarbe (Default Orange = GreyCareers)
     data-ga="G-XXXXXXX"     Google Analytics 4 Measurement-ID
     data-ads="AW-XXXXXXX"   Google Ads Conversion-ID
     data-metapixel="123..."  Meta-Pixel-ID
   Sind die IDs leer, speichert das Banner nur die Einwilligung (kein Pixel-Load) –
   so kann es gefahrlos jetzt schon live gehen.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'gc_cc_v1';            // localStorage-Schlüssel
  var VERSION = 1;                  // bei Änderung der Kategorien hochzählen -> Banner erscheint erneut

  // --- Konfiguration aus dem <script>-Tag lesen -----------------------
  var self = document.currentScript || (function () {
    var s = document.getElementsByTagName('script'); return s[s.length - 1];
  })();
  var cfg = {
    accent: (self && self.getAttribute('data-accent')) || '#EA580C',
    ga:     (self && self.getAttribute('data-ga')) || '',
    ads:    (self && self.getAttribute('data-ads')) || '',
    pixel:  (self && self.getAttribute('data-metapixel')) || ''
  };

  // --- Google Consent Mode v2: VOR allem auf „denied" setzen ----------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  // --- Persistenz -----------------------------------------------------
  function load() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); return (o && o.v === VERSION) ? o : null; }
    catch (e) { return null; }
  }
  function store(stats, mark) {
    var o = { v: VERSION, ts: new Date().toISOString(), essential: true, statistics: !!stats, marketing: !!mark };
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    return o;
  }

  // --- Tag-Loader (erst nach Einwilligung) ----------------------------
  var _gaLoaded = false, _pixelLoaded = false;
  function loadGoogle() {
    if (_gaLoaded || (!cfg.ga && !cfg.ads)) return; _gaLoaded = true;
    var id = cfg.ga || cfg.ads;
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
    gtag('js', new Date());
    if (cfg.ga) gtag('config', cfg.ga);
    if (cfg.ads) gtag('config', cfg.ads);
  }
  function loadMetaPixel() {
    if (_pixelLoaded || !cfg.pixel) return; _pixelLoaded = true;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', cfg.pixel);
    window.fbq('track', 'PageView');
  }

  // --- Einwilligung anwenden -----------------------------------------
  function apply(o) {
    window.gcConsent = o;
    if (o.statistics) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      loadGoogle();
    }
    if (o.marketing) {
      gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
      loadGoogle();      // Google Ads
      loadMetaPixel();   // Meta Pixel
    }
    try { document.dispatchEvent(new CustomEvent('gc-consent', { detail: o })); } catch (e) {}
  }

  // --- UI -------------------------------------------------------------
  var accent = cfg.accent;
  function injectCss() {
    if (document.getElementById('gc-cc-style')) return;
    var css =
      '.gc-cc{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:14px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;animation:gcccup .28s ease}' +
      '@keyframes gcccup{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '.gc-cc__card{width:100%;max-width:640px;background:#fff;border:1px solid #E6E3DD;border-radius:16px;box-shadow:0 18px 50px rgba(16,25,29,.18);padding:20px 22px}' +
      '.gc-cc__h{margin:0 0 6px;font-size:16px;font-weight:800;color:#16191D}' +
      '.gc-cc__p{margin:0 0 14px;font-size:13px;line-height:1.55;color:#4A5159}' +
      '.gc-cc__p a{color:' + accent + ';text-decoration:underline}' +
      '.gc-cc__btns{display:flex;flex-wrap:wrap;gap:9px}' +
      '.gc-cc__btn{flex:1 1 auto;min-width:140px;border:0;border-radius:10px;padding:12px 16px;font-size:13.5px;font-weight:700;cursor:pointer;text-align:center}' +
      '.gc-cc__btn--primary{background:' + accent + ';color:#fff}' +
      '.gc-cc__btn--ghost{background:#F1EFEA;color:#2B3138}' +
      '.gc-cc__btn--link{flex:0 0 100%;background:transparent;color:#6B7480;font-weight:600;text-decoration:underline;padding:6px}' +
      '.gc-cc__opts{margin:4px 0 14px;display:none}' +
      '.gc-cc__opts.is-open{display:block}' +
      '.gc-cc__row{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-top:1px solid #EEEBE4}' +
      '.gc-cc__row:first-child{border-top:0}' +
      '.gc-cc__rowtx{flex:1}' +
      '.gc-cc__rowtx b{display:block;font-size:13.5px;color:#16191D}' +
      '.gc-cc__rowtx span{display:block;font-size:12px;color:#6B7480;line-height:1.45;margin-top:2px}' +
      '.gc-cc__sw{position:relative;width:42px;height:24px;flex:0 0 auto;margin-top:2px}' +
      '.gc-cc__sw input{opacity:0;width:0;height:0;position:absolute}' +
      '.gc-cc__track{position:absolute;inset:0;background:#CFCBC2;border-radius:24px;transition:.2s}' +
      '.gc-cc__track:before{content:"";position:absolute;height:18px;width:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}' +
      '.gc-cc__sw input:checked+.gc-cc__track{background:' + accent + '}' +
      '.gc-cc__sw input:checked+.gc-cc__track:before{transform:translateX(18px)}' +
      '.gc-cc__sw input:disabled+.gc-cc__track{background:' + accent + ';opacity:.55}' +
      '@media(max-width:520px){.gc-cc__btn{flex:1 1 100%}}';
    var st = document.createElement('style'); st.id = 'gc-cc-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  function render(openOpts) {
    injectCss();
    var ex = document.getElementById('gc-cc'); if (ex) ex.remove();
    var saved = load() || { statistics: false, marketing: false };
    var wrap = document.createElement('div');
    wrap.className = 'gc-cc'; wrap.id = 'gc-cc'; wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Cookie-Einstellungen');
    wrap.innerHTML =
      '<div class="gc-cc__card">' +
        '<div class="gc-cc__h">Wir respektieren deine Privatsphäre</div>' +
        '<div class="gc-cc__p">Wir nutzen Cookies, damit die Seite funktioniert (essenziell) und – mit deiner Einwilligung – um unser Angebot zu messen und dir relevante Werbung zu zeigen (Statistik &amp; Marketing, z.&nbsp;B. Meta&nbsp;Pixel und Google). Du entscheidest. Mehr in der <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</div>' +
        '<div class="gc-cc__opts' + (openOpts ? ' is-open' : '') + '" id="gc-cc-opts">' +
          row('Essenziell', 'Für den Betrieb der Seite notwendig (z.\u00a0B. Sicherheit, Formular, deine Auswahl). Immer aktiv.', 'essential', true, true) +
          row('Statistik', 'Anonyme Reichweiten-Messung, um die Seite zu verbessern (z.\u00a0B. Google Analytics).', 'statistics', saved.statistics, false) +
          row('Marketing', 'Pixel zur Erfolgsmessung und für passende Werbung (Meta\u00a0Pixel, Google\u00a0Ads).', 'marketing', saved.marketing, false) +
        '</div>' +
        '<div class="gc-cc__btns">' +
          '<button class="gc-cc__btn gc-cc__btn--ghost" id="gc-cc-ess">Nur essenzielle</button>' +
          (openOpts
            ? '<button class="gc-cc__btn gc-cc__btn--ghost" id="gc-cc-save">Auswahl speichern</button>'
            : '<button class="gc-cc__btn gc-cc__btn--ghost" id="gc-cc-cfg">Einstellungen</button>') +
          '<button class="gc-cc__btn gc-cc__btn--primary" id="gc-cc-all">Alle akzeptieren</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById('gc-cc-all').onclick = function () { finish(true, true); };
    document.getElementById('gc-cc-ess').onclick = function () { finish(false, false); };
    var cfgBtn = document.getElementById('gc-cc-cfg');
    if (cfgBtn) cfgBtn.onclick = function () { render(true); };
    var saveBtn = document.getElementById('gc-cc-save');
    if (saveBtn) saveBtn.onclick = function () {
      finish(document.getElementById('gc-cc-statistics').checked,
             document.getElementById('gc-cc-marketing').checked);
    };
  }

  function row(title, desc, key, checked, locked) {
    return '<label class="gc-cc__row">' +
      '<span class="gc-cc__rowtx"><b>' + title + '</b><span>' + desc + '</span></span>' +
      '<span class="gc-cc__sw"><input type="checkbox" id="gc-cc-' + key + '"' +
        (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '>' +
      '<span class="gc-cc__track"></span></span></label>';
  }

  function finish(stats, mark) {
    var o = store(stats, mark);
    apply(o);
    var el = document.getElementById('gc-cc'); if (el) el.remove();
  }

  // --- Öffentliche API: Banner erneut öffnen (Footer-Link) ------------
  window.gcCookieSettings = function () { render(true); };

  // --- Start ----------------------------------------------------------
  function init() {
    var saved = load();
    if (saved) { apply(saved); }      // bereits entschieden -> Tags ggf. laden, kein Banner
    else { render(false); }           // erster Besuch -> Banner zeigen
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
