/* Public IFAW media monitoring: German-market external press mentions +
   internationally published official IFAW releases. Conservative publisher checks. */
(function(root){
  'use strict';
  const PROFILES=[
    {id:'ifaw',label:'IFAW',category:'organization',terms:['IFAW']},
    {id:'full',label:'International Fund for Animal Welfare',category:'organization',terms:['International Fund for Animal Welfare']},
    {id:'germany',label:'IFAW Deutschland / Internationaler Tierschutz-Fonds',category:'organization',terms:['IFAW Deutschland','Internationaler Tierschutz-Fonds']},
    {id:'andreas',label:'Andreas Dinkelmeyer',category:'public_team',terms:['Andreas Dinkelmeyer']},
    {id:'robert',label:'Robert Kless',category:'public_team',terms:['Robert Kless']},
    {id:'azzedine',label:'Azzedine Downes',category:'public_team',terms:['Azzedine Downes']},
    {id:'matt',label:'Matt Collis',category:'public_team',terms:['Matt Collis']},
    {id:'ilaria',label:'Ilaria Di Silvestre',category:'public_team',terms:['Ilaria Di Silvestre']}
  ];
  const germanPublishers=['die zeit','zeit online','spiegel','süddeutsche','sueddeutsche','tagesschau',
    'deutschlandfunk','ndr','wdr','rbb','swr','mdr','br24','bayerischer rundfunk','frankfurter allgemeine',
    'frankfurter rundschau','faz','die welt','welt','bild','focus online','rtl','stern','t-online',
    'n-tv','deutsche presse-agentur','dpa','hamburger abendblatt','berliner morgenpost','tagesspiegel',
    'petbook','kölner stadt-anzeiger','koelner stadt-anzeiger','watson.de','bunte',
    'morgenpost','abendzeitung','redaktionsnetzwerk deutschland','lokale zeitung'];
  const simplified=text=>String(text||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('de-DE');
  function matches(title){
    const value=simplified(title);
    return PROFILES.filter(p=>p.terms.some(term=>term==='IFAW'?
      /(^|[^a-z0-9])ifaw(?=$|[^a-z0-9])/.test(value):value.includes(simplified(term))
    )).map(p=>p.id);
  }
  function safeUrl(value){
    try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&u.hostname&&!u.username&&!u.password?u.href:''}catch{return ''}
  }
  function hostname(value){try{return new URL(value).hostname.toLowerCase()}catch{return ''}}
  const normalizeUrl=value=>safeUrl(value).split('#')[0].replace(/\/$/,'').toLowerCase();
  function isOfficial(a){
    const host=hostname(a.publisher_url||a.url||'');
    if(host==='ifaw.org'||host.endsWith('.ifaw.org'))return true;
    if(a.kind==='ifaw'&&String(a.source||'').includes('öffentliche Meldungen'))return true;
    const s=simplified(a.source);
    return s==='ifaw'||s.startsWith('international fund for animal welfare')||s.startsWith('internationaler tierschutz-fonds');
  }
  function isGermanMarket(a){
    if(isOfficial(a))return false;
    const host=hostname(a.publisher_url||'');
    if(host.endsWith('.de')||host.endsWith('.faz.net')||host.endsWith('.t-online.com'))return true;
    const name=simplified(a.source||'');
    if(/\.de(?:\b|\/)/.test(name))return true;
    return germanPublishers.some(hint=>name.includes(hint));
  }
  function sorted(items){
    return [...items].sort((a,b)=>{
      const aDate=Date.parse(a?.date||'')||0,bDate=Date.parse(b?.date||'')||0;
      return bDate-aDate||String(a?.title||'').localeCompare(String(b?.title||''),'de');
    });
  }
  function merge(...lists){
    const map=new Map();
    for(const source of lists){
      for(const input of Array.isArray(source)?source:[]){
        const url=safeUrl(input?.url);
        const indexed=input?.match_type==='Suchindex-Treffer'&&String(input?.collected_via||'').startsWith('Google News RSS');
        const profiles=matches(input?.title);
        if(!profiles.length&&indexed&&isGermanMarket(input))profiles.push('ifaw');
        if(!url||!profiles.length)continue;
        const owner=isOfficial(input);
        if(!owner&&!isGermanMarket(input))continue;
        const a={...input,profiles,kind:'monitor',
          origin:owner?'IFAW-eigene Meldung':'Externe Berichterstattung',
          market:owner?'International · IFAW':'Deutschland'};
        const key=owner?'ifaw-official:'+simplified(a.title):normalizeUrl(url),existing=map.get(key);
        if(!existing||Date.parse(a.date||'')>Date.parse(existing.date||'')||a.collected_via==='Google News RSS')map.set(key,a);
      }
    }
    return sorted([...map.values()]);
  }
  function fromRss2Json(data,now=new Date()){
    if(!data||data.status!=='ok'||!Array.isArray(data.items))throw Error('Medien-Suchfeed nicht verfügbar');
    const result=[];
    for(const entry of data.items.slice(0,60)){
      const title=String(entry?.title||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').slice(0,230).trim();
      const profiles=matches(title),url=safeUrl(entry?.link);
      const raw=String(entry?.pubDate||'');
      const date=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw;
      const millis=Date.parse(date);
      if(!title||!url||!Number.isFinite(millis))continue;
      if(millis>now.getTime()+7200000||now.getTime()-millis>45*86400000)continue;
      const publisher=String(entry?.author||'').trim()||title.split(' - ').slice(-1)[0];
      const searchHit=profiles.length===0;
      if(searchHit)profiles.push('ifaw');
      result.push({id:'rss-'+String(entry.guid||url).slice(-60),title,url,date:new Date(millis).toISOString(),
        date_type:'aggregator',source:publisher,publisher_url:entry.publisher_url||'',
        kind:'monitor',profiles,match_type:searchHit?'Suchindex-Treffer':'Schlagzeilen-Nennung',
        summary:'',collected_via:'Google News RSS (Live-Suche)'});
    }
    return merge(result);
  }
  function liveUrl(){
    const search='("IFAW" OR "Internationaler Tierschutz-Fonds" OR "International Fund for Animal Welfare") when:14d';
    const g=new URL('https://news.google.com/rss/search');
    g.searchParams.set('q',search);g.searchParams.set('hl','de');g.searchParams.set('gl','DE');g.searchParams.set('ceid','DE:de');
    const service=new URL('https://api.rss2json.com/v1/api.json');
    service.searchParams.set('rss_url',g.href);
    return service.href;
  }
  async function loadLive(opts={}){
    const fetcher=opts.fetcher||root.fetch?.bind(root);
    if(typeof fetcher!=='function')throw Error('Keine Fetch-Schnittstelle');
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    const timeout=setTimeout(()=>controller?.abort(),14000);
    try{
      const response=await fetcher(liveUrl(),{cache:'no-store',signal:controller?.signal});
      if(!response?.ok)throw Error('Medien-Live-Suche HTTP '+(response?.status||'?'));
      const now=opts.now||new Date();
      return {checked_at:now.toISOString(),articles:fromRss2Json(await response.json(),now)};
    }finally{clearTimeout(timeout)}
  }
  const api={PROFILES,matches,isOfficial,isGermanMarket,merge,sorted,fromRss2Json,liveUrl,loadLive};
  root.CenterMonitoring=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
