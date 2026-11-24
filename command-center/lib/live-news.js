/* Direct client-side wildlife news discovery through two free, public read APIs.
   GDELT Project (https://www.gdeltproject.org/) and Mongabay RSS via rss2json.com.
   Never sends credentials or invents article text. Rate limits/outages are expected. */
(function(root){
  'use strict';
  const ENDPOINT='https://api.gdeltproject.org/api/v2/doc/doc';
  const QUERY='("wildlife conservation" OR "wildlife trafficking" OR "wildlife trade" OR poaching OR "whale conservation" OR "elephant conservation" OR "human wildlife conflict" OR "endangered species" OR biodiversity OR "animal rescue")';
  const TERMS=/wildlife|poach|whale|dolphin|elephant|rhino|pangolin|biodivers|conserv|endangered|wild.?animal|tier.?schutz|arten.?schutz|wildtier|wal(?:e|en)?\b|elefant/i;
  const BAD=/\b(?:stock market|cryptocurrency|vaccine|gaming|sports|football|soccer|hollywood)\b/i;
  const RSS_ENDPOINT='https://api.rss2json.com/v1/api.json?'+new URLSearchParams({rss_url:'https://news.mongabay.com/feed/'});

  function endpoint(){
    const params=new URLSearchParams({query:QUERY,mode:'artlist',format:'json',maxrecords:'75',timespan:'2d',sort:'datedesc'});
    return ENDPOINT+'?'+params;
  }
  function safeUrl(raw){
    try{
      const u=new URL(String(raw||''));
      if(!['https:','http:'].includes(u.protocol)||!u.hostname||u.username||u.password)return '';
      u.hash='';
      return u.href;
    }catch{return ''}
  }
  function isoDate(v){
    const value=String(v||'').trim();
    // GDELT returns seendate in UTC as YYYYMMDDTHHMMSSZ.
    if(/^\d{8}T\d{6}Z$/.test(value)){
      const y=value.slice(0,4),mo=value.slice(4,6),d=value.slice(6,8),h=value.slice(9,11),mi=value.slice(11,13),s=value.slice(13,15);
      const date=y+'-'+mo+'-'+d+'T'+h+':'+mi+':'+s+'Z';
      return Number.isNaN(Date.parse(date))?null:date;
    }
    if(/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)&&Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
    return null;
  }
  function stableId(str){
    let x=2166136261;
    for(const ch of str){x^=ch.charCodeAt(0);x=Math.imul(x,16777619)}
    return 'gdelt-'+(x>>>0).toString(16);
  }
  function parse(payload,now=new Date()){
    if(!payload||typeof payload!=='object'||!Array.isArray(payload.articles))throw Error('Ungültige GDELT-Antwort');
    const seen=new Set(),articles=[];
    for(const row of payload.articles.slice(0,125)){
      if(!row||typeof row!=='object')continue;
      const title=String(row.title||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,230);
      const url=safeUrl(row.url),date=isoDate(row.seendate||row.date);
      if(!title||!url||!date||!TERMS.test(title)||BAD.test(title))continue;
      const age=now.getTime()-Date.parse(date);
      if(age>3*86400000||age< -2*3600000)continue;
      const key=url.replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
      if(seen.has(key))continue;seen.add(key);
      const domain=new URL(url).hostname.replace(/^www\./,'');
      articles.push({
        id:stableId(key),title,url,date,source:'GDELT · '+domain,kind:'media',
        summary:'',live:true
      });
    }
    return articles.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,60);
  }
  function parseRss(payload,now=new Date()){
    if(!payload||payload.status!=='ok'||!Array.isArray(payload.items))throw Error('RSS-Dienst nicht verfügbar');
    const seen=new Set(),items=[];
    for(const row of payload.items.slice(0,20)){
      const title=String(row.title||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,230);
      const url=safeUrl(row.link);
      const stamp=String(row.pubDate||'').replace(' ','T')+(String(row.pubDate||'').includes('Z')?'':'Z');
      const date=isoDate(stamp);
      if(!title||!url||!date||!TERMS.test(title)||BAD.test(title))continue;
      const age=now.getTime()-Date.parse(date);
      if(age>4*86400000||age< -2*3600000)continue;
      const key=url.replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
      if(seen.has(key))continue;seen.add(key);
      items.push({id:stableId(key),title,url,date,source:'Mongabay · RSS',kind:'media',summary:'',live:true});
    }
    return items.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  }
  async function fetchJson(url,fetcher,timeoutMs=13000){
    const ctrl=typeof AbortController!=='undefined'?new AbortController():null;
    const timeout=setTimeout(()=>ctrl?.abort(),timeoutMs);
    try{
      const r=await fetcher(url,{cache:'no-store',signal:ctrl?.signal,headers:{Accept:'application/json'}});
      if(!r?.ok)throw Error('Live-Dienst HTTP '+(r?.status||'unbekannt'));
      return await r.json();
    }finally{clearTimeout(timeout)}
  }
  async function load(options={}){
    const fetcher=options.fetcher||root.fetch?.bind(root);
    if(typeof fetcher!=='function')throw Error('Live-Suche ist in diesem Browser nicht verfügbar.');
    const now=options.now||new Date();
    const searches=[
      (async()=>{
        const payload=await fetchJson(endpoint(),fetcher);
        const articles=parse(payload,now);
        if(!articles.length)throw Error('GDELT: keine aktuellen Treffer');
        return {articles,checkedAt:now.toISOString(),provider:'GDELT'};
      })(),
      (async()=>{
        const payload=await fetchJson(RSS_ENDPOINT,fetcher);
        const articles=parseRss(payload,now);
        if(!articles.length)throw Error('Mongabay RSS: keine passenden frischen Treffer');
        return {articles,checkedAt:now.toISOString(),provider:'Mongabay RSS'};
      })()
    ];
    // Use the first responsive provider. A blocked or throttled service must not block the other.
    try{return await Promise.any(searches)}
    catch{throw Error('Beide kostenlosen Live-Nachrichtendienste sind derzeit nicht erreichbar oder liefern keine passenden Treffer.')}
  }
  const api={endpoint,rssEndpoint:()=>RSS_ENDPOINT,safeUrl,isoDate,parse,parseRss,load};
  root.CenterLiveNews=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
