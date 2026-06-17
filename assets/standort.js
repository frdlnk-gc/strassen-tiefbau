/* Gemeinsames Skript für Standort-Landingpages.
   Erwartet window.CITY = {name, plz, lat, lon}. Lädt Stellen aus dem
   GC-OS-Supabase (public_jobs), sortiert nach Nähe zur Stadt und verlinkt
   in das Hauptportal (index.html?job=slug). Reines Frontend – Verwaltung
   läuft ausschließlich im GreenCareers OS. */
(function(){
  const SUPABASE_URL='https://tfoopogxaqvfwbonabpi.supabase.co';
  const SUPABASE_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmb29wb2d4YXF2Zndib25hYnBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTQzMjQsImV4cCI6MjA5NjgzMDMyNH0.udWRPszXVOj7EG4bspmsU9HXbZYFRDn8QO9kZi2tw8M';
  const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON);
  const CITY=window.CITY||{};
  const $=id=>document.getElementById(id);
  const esc=s=>(s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials=n=>(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();

  const GEO={};
  async function geo(plz){
    if(!/^\d{5}$/.test(plz)) return null;
    if(plz in GEO) return GEO[plz];
    try{ const r=await fetch('https://api.zippopotam.us/de/'+plz);
      if(!r.ok){GEO[plz]=null;return null;}
      const d=await r.json(); const p=d.places&&d.places[0];
      GEO[plz]= p?{lat:+p.latitude,lon:+p.longitude}:null;
    }catch(e){GEO[plz]=null;}
    return GEO[plz];
  }
  function haversine(a,b){
    if(!a||!b) return null;
    const R=6371,toR=x=>x*Math.PI/180;
    const dLat=toR(b.lat-a.lat),dLon=toR(b.lon-a.lon);
    const s=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2;
    return Math.round(2*R*Math.asin(Math.sqrt(s)));
  }
  function coverUrl(j){
    const arr=Array.isArray(j.stellen_bilder)?j.stellen_bilder.filter(Boolean):[];
    return arr[0]||j.firma_titelbild||'';
  }
  function tierLevel(j){
    const p=(j.firma_produkt||'').toLowerCase();
    if(p==='excellence') return 'exc'; if(p==='premium') return 'prem'; return '';
  }
  const jobLink=slug=>'index.html?job='+encodeURIComponent(slug);

  function card(j){
    const cov=coverUrl(j), lv=tierLevel(j);
    const badge= lv==='exc'?'<span class="jbadge exc">★ Exzellenz</span>': lv==='prem'?'<span class="jbadge">★ Premium</span>':'';
    const ort=j.ort||j.firma_ort;
    const dist=(j._dist!=null)?`<span class="jtag dist">📍 ${j._dist} km</span>`:(ort?`<span class="jtag">📍 ${esc(ort)}</span>`:'');
    return `<a class="jcard ${lv}" href="${jobLink(j.slug)}">
      <div class="jcover ${cov?'':'noimg'}">${cov?`<img src="${esc(cov)}" alt="${esc(j.titel)} – ${esc(j.firma)}" loading="lazy">`:esc(initials(j.firma))}${badge}</div>
      <div class="jbody">
        <h3>${esc(j.titel)}</h3>
        <div class="firma">${esc(j.firma)}</div>
        <div class="jtags">${dist}${j.beschaeftigungsart?`<span class="jtag">🕒 ${esc(j.beschaeftigungsart)}</span>`:''}</div>
      </div>
    </a>`;
  }

  function injectJobList(jobs){
    const items=jobs.slice(0,10).map((j,i)=>({
      "@type":"ListItem","position":i+1,"url":CITY.site? CITY.site+'/'+jobLink(j.slug):jobLink(j.slug),"name":j.titel
    }));
    const ld={"@context":"https://schema.org","@type":"ItemList","itemListElement":items};
    const sc=document.createElement('script'); sc.type='application/ld+json';
    sc.textContent=JSON.stringify(ld); document.head.appendChild(sc);
  }

  async function load(){
    const wrap=$('jobsWrap'); if(!wrap) return;
    const {data,error}=await sb.from('public_jobs').select('*').order('published_at',{ascending:false});
    if(error){ wrap.innerHTML='<div class="jempty">Stellen konnten gerade nicht geladen werden.</div>'; return; }
    let jobs=data||[];
    const center=(CITY.lat&&CITY.lon)?{lat:CITY.lat,lon:CITY.lon}:await geo(CITY.plz);
    if(center){
      await Promise.all([...new Set(jobs.map(j=>j.firma_plz).filter(Boolean))].map(geo));
      jobs.forEach(j=>{ j._dist=j.firma_plz?haversine(center,GEO[j.firma_plz]||null):null; });
      jobs.sort((a,b)=>{ const da=a._dist==null?1e9:a._dist, db=b._dist==null?1e9:b._dist; return da-db; });
    }
    const cnt=$('jobCount'); if(cnt) cnt.textContent=jobs.length;
    if(!jobs.length){ wrap.innerHTML='<div class="jempty">Aktuell sind keine Stellen ausgeschrieben. Schau bald wieder vorbei – es kommen laufend neue dazu.</div>'; return; }
    wrap.innerHTML='<div class="jobs-grid">'+jobs.slice(0,12).map(card).join('')+'</div>';
    injectJobList(jobs);
  }

  // FAQ
  window.toggleFaq=function(i){
    const item=$('faq'+i); if(!item) return;
    const a=item.querySelector('.faq-a');
    const open=item.classList.toggle('open');
    a.style.maxHeight=open?a.scrollHeight+'px':'0';
  };

  const y=$('y'); if(y) y.textContent=new Date().getFullYear();
  load();
})();
