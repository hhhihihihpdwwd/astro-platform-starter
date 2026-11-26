/* IFAW public media monitoring. Source data: dated Google News RSS entries;
   optional direct rss2json live check. Only exact public names / brand mentions. */
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
  const normalizeUrl=value=>safeUrl(value).split('#')[0].replace(/\/$/,'').toLowerCase();
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
        const url=safeUrl(input?.url),profiles=matches(input?.title);
        if(!url||!profiles.length)continue;
        const a={...input,profiles,kind:'monitor'};
        const key=normalizeUrl(url);
        const existing=map.get(key);
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
      const profiles=matches(title);
      const url=safeUrl(entry?.link);
      const raw=String(entry?.pubDate||'');
      const date=/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw;
      const millis=Date.parse(date);
      if(!title||!profiles.length||!url||!Number.isFinite(millis))continue;
      if(millis>now.getTime()+7200000||now.getTime()-millis>45*86400000)continue;
      result.push({id:'rss-'+String(entry.guid||url).slice(-60),title,url,date:new Date(millis).toISOString(),
        date_type:'aggregator',source:entry.author||'Google News',kind:'monitor',profiles,
        origin:/\bifaw\b/i.test(String(entry.author||''))?'IFAW-eigene Meldung':'Externe Berichterstattung',
        summary:'',collected_via:'Google News RSS (Live-Suche)'});
    }
    return merge(result);
  }
  function liveUrl(){
    const search='"International Fund for Animal Welfare" OR IFAW when:7d';
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
      const articles=fromRss2Json(await response.json(),now);
      return {checked_at:now.toISOString(),articles};
    }finally{clearTimeout(timeout)}
  }
  const api={PROFILES,matches,merge,sorted,fromRss2Json,liveUrl,loadLive};
  root.CenterMonitoring=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
