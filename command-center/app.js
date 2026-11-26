'use strict';
/* Public-source-only newsroom: no paid AI API, private accounts, geolocation or task/chat storage. */
const A=window.CenterAnalysis;
const Clock=window.CenterClock;
const StudyAI=window.CenterStudyAI;
const Live=window.CenterLiveNews;
const Monitor=window.CenterMonitoring;
const $=(q)=>document.querySelector(q);
const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=(value)=>{try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:'#'}catch{return '#'}};
const fmtDate=(value,options={})=>{if(!value)return 'Datum unbekannt';const date=new Date(value);return Number.isNaN(date.getTime())?'Datum unbekannt':new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'short',year:'numeric',...options}).format(date)};
const truncated=(value,length=180)=>{const v=String(value||'').replace(/\s+/g,' ').trim();return v.length<=length?v:v.slice(0,length).replace(/\s+\S*$/,'')+' …'};
const link=(item,label)=>'<a href="'+esc(safeUrl(item.url))+'" target="_blank" rel="noopener noreferrer" title="Original: '+esc(item.title)+'">'+esc(label||item.title)+'</a>';
const NAV=[['news','Global News Radar'],['pr','PR-Chancen'],['crisis','Crisis Watch'],['monitor','Medienbeobachtung']];
let saved=new Set();
try{saved=new Set(JSON.parse(localStorage.getItem('wc_saved_v4')||'[]'))}catch{}
const state={view:'news',search:'',feed:{articles:[],sources:[],failures:[],generated_at:null},mediaFeed:{articles:[],sources:[],failures:[],checked_at:null,last_successful_at:null},fetchError:'',fetching:false,lastFetchAt:0,archiveCheckedAt:null,mediaCheckedAt:null,mediaError:'',mediaLiveCheckedAt:null,mediaLive:[],mediaLiveError:'',liveArticles:[],liveCheckedAt:null,liveProvider:null,liveError:'',saved,onlySaved:false,monitorProfile:'all',monitorScope:'all',newsExpanded:false,mediaVisible:70,studyOpen:false,studyAI:null};
let toastTimer;
function toast(message){const node=$('#toast');if(!node)return;node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3300)}
function storeSaved(){try{localStorage.setItem('wc_saved_v4',JSON.stringify([...state.saved]))}catch{toast('Merkliste konnte nicht gespeichert werden.')}} 
function articles(){
  const byUrl=new Map();
  for(const a of [...(state.feed.articles||[]),...state.liveArticles]){
    if(!a?.title||safeUrl(a.url)==='#')continue;
    const normalized=a.url.replace(/^https?:\/\//,'').replace(/\/$/,'').toLowerCase();
    // Prefer already-indexed news with a sourced RSS excerpt over sparse live headlines.
    if(!byUrl.has(normalized))byUrl.set(normalized,a);
  }
  return [...byUrl.values()].map(x=>({...x,topics:A.tagsFor(x),displayTitle:x.title,displaySummary:x.summary}));
}
function byDate(list){return [...list].sort((x,y)=>(Number.isFinite(Date.parse(y.date))?Date.parse(y.date):0)-(Number.isFinite(Date.parse(x.date))?Date.parse(x.date):0)||String(x.title||'').localeCompare(String(y.title||''),'de'))}
function byRelevance(list){return [...list].sort((x,y)=>A.score(y)-A.score(x)||(Date.parse(y.date)||0)-(Date.parse(x.date)||0))}
function fresh(list,maxDays=40){const now=Date.now();return list.filter(x=>{const t=Date.parse(x.date);return Number.isFinite(t)&&t<now+86400000&&now-t<=maxDays*86400000})}
function mediaItems(){
  if(!Monitor)return [];
  const direct=[...(state.mediaFeed.articles||[]),...state.mediaLive];
  const other=articles().filter(a=>a.kind!=='study'&&Monitor.matches(a.title).length)
    .map(a=>({...a,origin:a.kind==='ifaw'?'IFAW-eigene Meldung':'Externe Berichterstattung',
      date_type:a.live?'seen':'published',profiles:Monitor.matches(a.title),
      collected_via:a.live?'GDELT / RSS Live':'Öffentlicher RSS-Feed'}));
  return Monitor.merge(direct,other).map(a=>({...a,topics:A.tagsFor(a),displayTitle:a.title,displaySummary:a.summary}));
}
function itemsFor(view){
  let list=view==='monitor'?mediaItems():articles();
  if(view==='news')list=list.filter(x=>x.kind!=='study');
  if(view==='pr')list=list.filter(x=>x.kind!=='study'&&A.isOpportunity(x));
  if(view==='crisis')list=list.filter(x=>A.isCrisis(x));
  if(view==='monitor'){
    if(state.monitorProfile!=='all')list=list.filter(a=>a.profiles.includes(state.monitorProfile));
    if(state.monitorScope==='external')list=list.filter(a=>a.origin!=='IFAW-eigene Meldung');
    if(state.monitorScope==='owned')list=list.filter(a=>a.origin==='IFAW-eigene Meldung');
  }
  if(state.onlySaved)list=list.filter(x=>state.saved.has(x.id));
  if(state.search)list=A.search(list,state.search);
  return byDate(list);
}
function renderClocksShell(){
  $('#worldClocks').innerHTML=Clock.CITIES.slice(1).map(c=>{
    const left=((c.lon+180)/360*100).toFixed(2),top=((85-c.lat)*.92/158*100).toFixed(2);
    return '<div class="world-clock"><span class="city">'+esc(c.name)+'</span>'+
      '<time class="clock-time" id="clock-'+c.id+'">--:--:--</time><span class="clock-date" id="date-'+c.id+'">–</span>'+
      '<div class="clock-map" role="img" aria-label="Weltkarte: '+esc(c.name)+' markiert">'+
        '<img src="assets/world-map.svg" width="360" height="158" alt="" decoding="async">'+
        '<span class="map-pin" style="left:'+left+'%;top:'+top+'%" aria-hidden="true"></span>'+
      '</div></div>';
  }).join('');
}
function updateClocks(now=new Date()){
  if(!Clock)return;
  const h=Clock.cityTime(now,'Europe/Berlin');
  $('#greeting').textContent=Clock.greeting(now)+', Luca.';
  $('#clock-hamburg').textContent=h.time;
  $('#clock-hamburg').dateTime=now.toISOString();
  const solar=Clock.solarDay(now);
  const t=x=>new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'}).format(x);
  $('#sunriseTime').textContent=t(solar.sunrise);
  $('#sunsetTime').textContent=t(solar.sunset);
  const progress=Math.max(0,Math.min(1,solar.progress));
  // Map real computed solar elevations to a daily-relative plot; 86 is the horizon.
  // The visual is schematic in scale, while the numerical height below is in degrees.
  const samples=Array.from({length:49},(_,i)=>{
    const moment=new Date(solar.sunrise.getTime()+(solar.sunset-solar.sunrise)*i/48);
    return Math.max(0,Clock.solarElevation(moment));
  });
  const maxElevation=Math.max(1,...samples);
  const solarPoint=(p,elevation)=>({x:20+280*p,y:86-64*Math.max(0,elevation)/maxElevation});
  const path=samples.map((e,i)=>{const point=solarPoint(i/48,e);return(i?'L':'M')+point.x.toFixed(1)+' '+point.y.toFixed(1)}).join(' ');
  $('#sunPath').setAttribute('d',path);
  $('#sunArea').setAttribute('d',path+' L300 86 L20 86 Z');
  const {x:px,y:py}=solarPoint(progress,Math.max(0,solar.altitude));
  for(const id of ['sunDot','sunHalo']){const el=$('#'+id);el.setAttribute('cx',px.toFixed(1));el.setAttribute('cy',py.toFixed(1))}
  $('#sunMarker').classList.toggle('below-horizon',!solar.daylight);
  $('#sunStatus').textContent=solar.daylight?'☀ Tag':'☾ Nacht';
  const absolute=Math.abs(solar.altitude).toFixed(1).replace('.',',');
  $('#sunLabel').textContent='Sonnenhöhe: '+(solar.altitude>=0?'+':'−')+absolute+'° · Verlauf relativ skaliert, astronomischer Näherungswert';
  for(const city of Clock.CITIES.slice(1)){
    const time=Clock.cityTime(now,city.zone);
    $('#clock-'+city.id).textContent=time.time;
    $('#clock-'+city.id).dateTime=now.toISOString();
    $('#date-'+city.id).textContent=new Intl.DateTimeFormat('de-DE',{timeZone:city.zone,weekday:'short',day:'2-digit',month:'short'}).format(now);
  }
}
function renderNav(){
  $('#nav').innerHTML=NAV.map(([key,title])=>'<button type="button" data-view="'+key+'" class="nav-link '+(state.view===key?'active':'')+'" '+(state.view===key?'aria-current="page"':'')+'>'+esc(title)+'</button>').join('');
}
function go(view){
  if(view!=='sources'&&!NAV.some(x=>x[0]===view))view='news';
  state.view=view;state.search='';state.onlySaved=false;$('#globalSearch').value='';
  render();document.querySelector('main').focus({preventScroll:true});
  history.replaceState(null,'',view==='news'?location.pathname:'#'+view);
}
function ageMinutes(value){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):Infinity}
function status(){
  const host=$('#topStatus');
  const archive=ageMinutes(state.feed.generated_at),live=ageMinutes(state.liveCheckedAt),
        media=ageMinutes(state.mediaFeed.last_successful_at);
  let label='Noch keine Quellen geprüft',level='warn';
  if(state.fetching){label='Meldungen und Medienbeobachtung werden geprüft …';level=''}
  else{
    const latest=[state.liveCheckedAt,state.mediaLiveCheckedAt,state.archiveCheckedAt,state.mediaCheckedAt].filter(Boolean)
      .sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    if(latest){
      label='Letzte Prüfung: '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date(latest));
      level=(archive>240&&live>90&&media>240)?'warn':'';
    }else if(Number.isFinite(archive))label='Archivstand: '+fmtTime(state.feed.generated_at);
    if(state.fetchError&&state.liveError&&state.mediaError&&state.mediaLiveError)level='error';
  }
  host.innerHTML='<span class="status-pulse '+level+'"></span><span>'+esc(label)+'</span>';
}
function empty(title,sub){return '<div class="empty"><strong>'+esc(title)+'</strong>'+esc(sub||'')+'</div>'}
function fmtTime(value){return fmtDate(value,{hour:'2-digit',minute:'2-digit'})}
function fullDate(value){return fmtDate(value,{hour:'2-digit',minute:'2-digit'})}
function dateLabel(a){
  const prefix=a.date_type==='aggregator'||String(a.source||'').includes('News-Aggregation')?'Google News-Zeit: ':a.date_type==='seen'||a.live?'Im Medienindex gesehen: ':'Datum laut Quelle: ';
  return prefix+fullDate(a.date);
}
function sectionAge(a){
  const stamp=Date.parse(a?.date||'');
  if(!Number.isFinite(stamp))return 'ohne';
  const day=Clock.cityTime(new Date(stamp),'Europe/Berlin').day;
  const current=Clock.cityTime(new Date(),'Europe/Berlin').day;
  const yesterday=Clock.cityTime(new Date(Date.now()-86400000),'Europe/Berlin').day;
  if(day===current)return 'heute';
  if(day===yesterday)return 'gestern';
  if(Date.now()-stamp<=7*86400000)return 'woche';
  return 'alt';
}
function heading(title,sub,monitor=false){
  const list=monitor?mediaItems():articles().filter(a=>a.kind!=='study');
  const latest=byDate(list)[0];
  const archived=monitor?state.mediaFeed.last_successful_at:state.feed.generated_at;
  const lastCheck=monitor?state.mediaLiveCheckedAt:state.liveCheckedAt;
  return '<div class="dashboard-header"><div><h2 class="page-heading">'+esc(title)+'</h2>'+
    '<p class="page-subtitle">'+esc(sub||'')+'</p></div>'+
    '<div class="update-note"><span>Neueste erfasste Meldung: '+esc(latest?fullDate(latest.date):'keine')+'</span>'+
    '<span>Archivstand: '+esc(fmtTime(archived))+'</span>'+
    (lastCheck?'<span>Live-Prüfung: '+esc(fmtTime(lastCheck))+'</span>':'')+'</div></div>';
}
function panelTop(icon,title,destination){
  return '<div class="panel-top"><h3 class="panel-title"><span class="picon" aria-hidden="true">'+icon+'</span>'+esc(title)+'</h3>'+(destination?'<button class="soft-link" data-view="'+destination+'">Alle ansehen ↗</button>':'')+'</div>';
}
function smallStory(a,desc=true){
  return '<div class="compact-story"><div>'+link(a,truncated(a.displayTitle,126))+'</div>'+
    (desc&&a.displaySummary?'<div class="desc">'+esc(truncated(a.displaySummary,178))+'</div>':'')+
    '<div class="meta">'+esc(a.source||'Quelle')+' · '+esc(fmtDate(a.date))+'</div></div>';
}
function imageFor(a,i){
  const text=(a.title+' '+a.summary).toLowerCase();
  if(/whale|wale|dolphin|marine|ocean|meer|orca|seal/.test(text))return 'assets/whale.jpg';
  if(/elephant|elefant|rhino|nashorn|giraffe|lion|tiger/.test(text))return 'assets/elephant.jpg';
  return ['assets/forest.jpg','assets/whale.jpg','assets/elephant.jpg'][i%3];
}
function feature(a,i){
  return '<article class="feature-story"><a href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener noreferrer">'+
    '<img loading="lazy" class="photo" src="'+imageFor(a,i)+'" alt="Symbolbild aus der Tier- und Naturwelt">'+
    '<h3>'+esc(truncated(a.displayTitle,91))+'</h3></a><div class="byline">'+esc(truncated(a.source,29))+' · '+esc(fmtDate(a.date))+'</div><div class="symbol-note">Symbolbild, nicht vom berichteten Ereignis</div></article>';
}
function worthyStudy(x){
  const title=String(x.title||'').toLowerCase();
  const strong=['wildlife','elephant','whale','rhino','pangolin','poaching','animal welfare','human-wildlife','human wildlife','marine mammal','endangered species','wild animal','wildlife trade','wild mammal','animal conservation','wildlife conservation'];
  const deny=['vaccine','epitope','protein','hla-binding','arabidopsis','iron deficiency response','gene regulation','frozen elephant trunk','tevar','aortic','surgery','dextrocardia','cardiac','livestock farming','honeybee abundance','microbial treasure','actinobacteria'];
  if(deny.some(s=>title.includes(s)))return false;
  return strong.some(s=>title.includes(s))||('biodiversity'===title.slice(0,12)||title.includes('biodiversity'))&&['wildlife','forest','habitat','ecosystem','land-use','landscape','conservation','restoration','tropical'].some(s=>title.includes(s));
}
function studyPick(){
  const studies=byDate(articles().filter(x=>x.kind==='study'&&x.url.startsWith('https://doi.org/')&&worthyStudy(x)));
  if(!studies.length)return null;
  const berlinDate=Clock.cityTime(new Date(),'Europe/Berlin').day;
  const declared=state.feed.daily_study;
  if(declared?.date===berlinDate){
    const item=studies.find(x=>x.id===declared.id);
    if(item)return item;
  }
  return studies.find(x=>x.abstract_available)||studies[0];
}
function studyAIView(study){
  const result=state.studyAI?.id===study.id?state.studyAI:null;
  if(!result)return '<p class="mini-note">Die KI erzeugt erst nach deinem Klick eine neue Zusammenfassung – soweit ein wissenschaftliches Abstract verfügbar ist. Keine vorausgefüllten Textbausteine.</p>';
  const message=result.message||'';
  const label=result.status==='ok'?'Neue KI-Zusammenfassung':result.status==='loading'?'KI arbeitet …':'Lokale KI nicht verfügbar';
  return '<div class="study-ai-response" id="studyAIResult" aria-live="polite">'+
    '<h4>'+esc(label)+'</h4>'+
    (result.status==='ok'?'<div class="ai-generated-text">'+esc(result.text||'')+'</div>':'<p>'+esc(message)+'</p>')+
    (result.status==='ok'?'<p class="mini-note">Quelle: '+esc(result.basis||'Original-Abstract')+'. Automatisch erzeugt, nicht unabhängig überprüft. Für Zahlen, Resultate und Zitate bitte die DOI-Originalstudie prüfen.</p>':'')+
    '</div>';
}
function dailyStudy(){
  const study=studyPick();
  if(!study)return '<section class="daily-study" id="dailyStudy"><div><p class="eyebrow">STUDIE DES TAGES</p><h3 class="study-title">Heute keine belegte Studie verfügbar</h3><p class="study-summary">Keine geeignete Studie mit DOI im aktuellen Quellenbestand. Es werden keine Forschungsdaten erfunden.</p></div></section>';
  const hasEvidence=StudyAI.evidence(study).length>=220;
  const aiBusy=state.studyAI?.id===study.id&&state.studyAI?.status==='loading';
  const method=hasEvidence?'Wissenschaftliches Abstract als KI-Quelle':study.extended_summary?.length?'Kuratiertes Fachliteraturarchiv':'Nur Metadaten verfügbar';
  return '<section class="daily-study" id="dailyStudy"><div><p class="eyebrow">STUDIE DES TAGES · '+esc(fmtDate(new Date()))+'</p>'+
    '<h3 class="study-title">'+esc(study.title)+'</h3>'+
    '<p class="study-summary">'+esc(study.summary||'Nur bibliografische Angaben verfügbar; Ergebnisse nicht geprüft.')+'</p>'+
    '<div class="study-actions"><button id="summarizeStudy" type="button" class="small-button study-toggle" '+(aiBusy?'disabled':'')+'>'+
    (aiBusy?'KI wird ausgeführt …':'✦ Mit KI zusammenfassen')+'</button>'+
    '<a class="small-button" href="'+esc(StudyAI.chatGPTLink(study))+'" target="_blank" rel="noopener noreferrer">In ChatGPT analysieren ↗</a>'+
    '<a class="small-button secondary" href="'+esc(safeUrl(study.url))+'" target="_blank" rel="noopener noreferrer">Originalstudie ↗</a></div>'+
    '<p class="mini-note">Lokale KI: kostenlos im unterstützten Chrome/Edge, möglicherweise erst nach einem Modelldownload. ChatGPT öffnet eine separate Seite und kann eine Anmeldung erfordern.</p>'+
    '</div>'+
    '<aside class="study-aside"><span class="meta-label">Journal / Quelle</span><span class="meta-value">'+esc(study.source||'Fachpublikation')+'</span>'+
    '<span class="meta-label">Veröffentlicht</span><span class="meta-value">'+esc(fmtDate(study.date))+'</span>'+
    '<span class="badge">'+esc(method)+'</span><span class="mini-note">Die Einordnung ist von der eigentlichen, auf Knopfdruck generierten KI-Ausgabe getrennt.</span></aside>'+
    studyAIView(study)+'</section>';
}
function newsListMini(items,limit=5){
  return items.length?items.slice(0,limit).map(a=>
    '<article class="news-row"><div class="news-row-top"><span class="news-row-date">'+esc(dateLabel(a))+'</span>'+
    (sectionAge(a)==='heute'?'<span class="badge news-new">HEUTE</span>':'')+'</div>'+
    '<div class="news-row-title">'+link(a,truncated(a.title,145))+'</div>'+
    '<div class="news-row-origin">'+esc(a.source||'Originalquelle')+'</div></article>'
  ).join(''):empty('Keine passenden Meldungen','Der Abruf kann derzeit unvollständig sein.');
}
function dashboard(){
  const all=itemsFor('news');
  const pr=itemsFor('pr'),crisis=itemsFor('crisis');
  const latest=all.slice(0,state.newsExpanded?70:9);
  const alert=ageMinutes(state.feed.generated_at)>240&&ageMinutes(state.liveCheckedAt)>120;
  return heading('Global News Radar','Alle Meldungen chronologisch. Das Erscheinungsdatum ist wichtiger als der Relevanzwert.')+
    (alert?'<div class="notice warn">Das GitHub-Archiv wurde seit mehreren Stunden nicht aktualisiert. Vorhandene Meldungen bleiben sichtbar; die Live-Suche wird unabhängig geprüft. Die Datumsangaben sind maßgeblich.</div>':'')+
    '<div class="dashboard-grid newsroom-grid"><div class="column">'+
    '<section class="panel"><div class="panel-inner">'+
    '<div class="panel-top"><h3 class="panel-title">◎ Neueste Meldungen</h3><span class="result-count">'+all.length+' im Radar</span></div>'+
    '<div class="chronology-hint">Sortiert: neuestes Quellen-Datum zuerst · ältere Beiträge bleiben weiter unten</div>'+
    (latest.length?latest.map(a=>articleCard(a,true)).join(''):empty('Noch keine Meldungen','Die Originalquellen werden beim Laden geprüft.'))+
    (all.length>9?'<button class="more-button" id="toggleAllNews">'+(state.newsExpanded?'Weniger anzeigen':'Weitere Meldungen anzeigen ('+(all.length-9)+')')+'</button>':'')+
    '</div></section></div><div class="column">'+
    '<section class="panel"><div class="panel-inner">'+panelTop('↗','PR-Chancen','pr')+
    '<p class="panel-note">Automatisch gefilterte, noch nicht redaktionell geprüfte Themen.</p>'+
    newsListMini(pr,3)+'</div></section>'+
    '<section class="panel alert-border"><div class="panel-inner">'+panelTop('△','Crisis Watch','crisis')+
    '<p class="panel-note">Hinweise aus Meldungen, keine amtlichen Alarmmeldungen.</p>'+
    newsListMini(crisis,3)+'</div></section>'+
    '<section class="panel"><div class="panel-inner">'+panelTop('◈','IFAW in den Medien','monitor')+
    '<p class="panel-note">Öffentliche Artikel und Erwähnungen im Monitoring.</p>'+
    newsListMini(mediaItems(),3)+'</div></section></div></div>'+
    '<details class="research-drawer" '+(state.studyOpen?'open':'')+'><summary>◈ Wissenschaftliche Studie des Tages <span>mit KI-Analyse öffnen ⌄</span></summary>'+dailyStudy()+'</details>'+
    '<p class="mini-note section-spacer">Politische Entwicklungen, Naturschutzstudien und Medienhinweise sind in den vier Kernbereichen integriert. Auswahl automatisch; Quellenangaben und Datumsstempel vor externer Nutzung prüfen.</p>';
}
function articleCard(a,compact=false){
  const bookmarked=state.saved.has(a.id);
  const type=a.kind==='study'?'Studie':a.kind==='policy'?'Politik':a.kind==='ifaw'?'IFAW':a.kind==='monitor'?'Medienbeobachtung':'News';
  const description=compact?truncated(a.summary||'',165):truncated(a.summary||'',320);
  return '<article class="article-card '+(compact?'article-compact':'')+'">'+
    '<div class="article-main"><div class="article-date-line"><span>'+esc(dateLabel(a))+'</span>'+
    (sectionAge(a)==='heute'?'<span class="badge news-new">HEUTE</span>':'')+
    '<span class="badge">'+esc(type)+'</span></div>'+
    '<h3>'+link(a)+'</h3>'+
    (description?'<p>'+esc(description)+'</p>':'')+
    '<div class="article-meta"><span>'+esc(a.source||'Originalquelle')+'</span>'+
    (a.topics?.length?'<span>'+esc(a.topics.slice(0,2).join(' · '))+'</span>':'')+'</div></div>'+
    '<div class="article-actions"><button type="button" data-bookmark="'+esc(a.id)+'" class="bookmark '+(bookmarked?'saved':'')+'">'+(bookmarked?'✓ Gespeichert':'☆ Merken')+'</button>'+
    '<a class="small-button" href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener noreferrer">Artikel ↗</a></div></article>';
}
function dateGroup(items){
  const keys=[
    ['heute','Heute'],['gestern','Gestern'],['woche','Letzte sieben Tage'],['alt','Ältere Meldungen'],['ohne','Ohne verlässliches Datum']
  ];
  return keys.map(([key,title])=>{
    const group=items.filter(a=>sectionAge(a)===key);
    return group.length?'<section class="date-group"><h3>'+title+' <span>'+group.length+'</span></h3>'+
      '<div class="list-view">'+group.map(a=>articleCard(a)).join('')+'</div></section>':'';
  }).join('');
}
function archiveView(view){
  const description=view==='pr'
    ?['PR-Chancen','Potenzielle Anknüpfungspunkte für deutsche Medien. Automatisch ausgewählt, keine bestätigten PR-Möglichkeiten.']
    :['Crisis Watch','Mögliche Risiken und kritische Entwicklungen aus öffentlichen Meldungen. Kein behördlicher Warndienst.'];
  const items=itemsFor(view).slice(0,150);
  return heading(...description)+
    '<div class="notice">Neue Meldungen zuerst · Quelle und Datum direkt an jedem Artikel. Die Einstufung erfolgt automatisch und kann Fehlalarme enthalten.</div>'+
    '<div class="filterbar"><button type="button" id="filterSaved" class="'+(state.onlySaved?'active':'')+'">'+(state.onlySaved?'✓ Gemerkte':'☆ Nur Gemerkte')+'</button>'+
    '<span class="muted">'+items.length+' Ergebnisse · chronologisch sortiert</span></div>'+
    (items.length?dateGroup(items):empty('Keine passenden Meldungen','Die Quellenlage kann unvollständig sein.'));
}
function profileList(){
  const items=mediaItems();
  const groups=[['organization','Organisation'],['public_team','Öffentlich genannte Teammitglieder']];
  return '<aside class="monitor-filters"><h3>Suchprofile</h3>'+
    '<button type="button" data-monitor-profile="all" class="profile-option '+(state.monitorProfile==='all'?'selected':'')+'"><span>• Alle Treffer</span><span>'+items.length+'</span></button>'+
    groups.map(([category,title])=>'<p class="profile-group-label">'+title+'</p>'+
      Monitor.PROFILES.filter(p=>p.category===category).map(p=>
        '<button type="button" data-monitor-profile="'+esc(p.id)+'" class="profile-option '+(state.monitorProfile===p.id?'selected':'')+'">'+
        '<span>• '+esc(p.label)+'</span><span>'+items.filter(a=>a.profiles.includes(p.id)).length+'</span></button>'
      ).join('')).join('')+
    '<p class="mini-note">Öffentliche IFAW-Teamprofile als Ausgangspunkt; keine privaten Mitarbeiterdaten.</p></aside>';
}
function monitorView(){
  const all=itemsFor('monitor');
  const show=all.slice(0,state.mediaVisible||70);
  const recorded=state.mediaFeed.last_successful_at;
  const published=mediaItems()[0]?.date;
  return heading('Medienbeobachtung','IFAW und öffentlich genannte Mitarbeitende – veröffentlichte Treffer aus kostenlosen Nachrichtenquellen.',true)+
    '<div class="monitor-facts"><span>Neuester Treffer: <strong>'+esc(fullDate(published))+'</strong></span>'+
    '<span>Medienarchiv geprüft: <strong>'+esc(fmtTime(recorded))+'</strong></span>'+
    '<span>Gefundene Artikel: <strong>'+mediaItems().length+'</strong></span></div>'+
    '<div class="notice">Erfasst werden öffentlich auffindbare Treffer, nicht sämtliche Veröffentlichungen. Bei Google News ist das angezeigte Datum der Zeitstempel des Nachrichtenindex und kann vom Verlagsdatum abweichen. Eigene IFAW-Meldungen sind gekennzeichnet.</div>'+
    '<div class="monitor-layout">'+profileList()+'<section class="monitor-results">'+
    '<div class="monitor-toolbar"><div class="seg-tabs">'+
    [['all','Alle'],['external','Medienberichte'],['owned','IFAW-eigene Meldungen']].map(([key,label])=>
      '<button type="button" data-monitor-scope="'+key+'" class="'+(state.monitorScope===key?'selected':'')+'">'+label+'</button>'
    ).join('')+'</div><span class="muted">'+all.length+' Treffer · neueste zuerst</span></div>'+
    (show.length?dateGroup(show):empty('Keine Treffer für diese Auswahl','Wenn eine Suche keine Treffer liefert, heißt das nicht, dass es keine Berichterstattung gab.'))+
    (all.length>show.length?'<button type="button" id="moreMonitor" class="more-button">Weitere '+Math.min(70,all.length-show.length)+' Meldungen anzeigen</button>':'')+
    '</section></div>';
}
function sourcesView(){
  const sources=state.feed.sources||[],fails=state.feed.failures||[];
  return heading('Quellen & Transparenz','Datenherkunft, Aktualität und Hinweise zur Nutzung des öffentlichen Prototyps.')+
    '<div class="notice">Die Seite ist öffentlich zugänglich und <strong>kein offizielles IFAW-Angebot</strong>. Keine vertraulichen IFAW-Daten eingeben. Es gibt keine Anmeldung, keine Aufgaben- oder Chatfunktion und keine kostenpflichtige KI-API.</div>'+
    '<div class="dashboard-grid"><div class="column"><section class="panel"><div class="panel-inner">'+panelTop('◎','Aktualität der Quellen')+
    '<p class="muted">Öffentliches Archiv (GitHub): <strong>'+esc(fmtTime(state.feed.generated_at))+'</strong>. Zuletzt auf eine neue Archivdatei geprüft: <strong>'+esc(fmtTime(state.archiveCheckedAt))+'</strong>.</p>'+
    '<p class="muted">Direkte Live-Suche ('+esc(state.liveProvider||'GDELT / Mongabay RSS')+'): <strong>'+esc(state.liveCheckedAt?fmtTime(state.liveCheckedAt):'noch kein erfolgreicher Abruf')+'</strong>. Aktuell '+state.liveArticles.length+' gefilterte Meldungen in dieser Sitzung. '+esc(state.liveError?'Letzter Fehler: '+state.liveError:'Die Live-Suche hat geantwortet oder wird noch geprüft.')+'</p>'+
    '<p class="muted">Der Browser fragt beim Öffnen, auf Knopfdruck und spätestens stündlich beide Quellen erneut ab. Der automatische GitHub-Lauf kann sich verzögern. Ein erneuter Abruf ist nicht automatisch eine neue Veröffentlichung.</p>'+
    '<p class="muted">GDELT ist ein öffentlicher Medienindex; als Ausfallsicherung nutzen wir öffentliche Mongabay-RSS-Titel über rss2json.com (kostenloses, begrenztes Kontingent). Live-Meldungen enthalten nur Originaltitel, Metadaten und Links, keine unabhängig bestätigten Artikelinhalte. Quelle: <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">The GDELT Project</a> · <a href="https://news.mongabay.com/" target="_blank" rel="noopener noreferrer">Mongabay</a> · <a href="https://rss2json.com/" target="_blank" rel="noopener noreferrer">rss2json</a>.</p>'+
    (fails.length?'<div class="notice warn">'+fails.length+' Quellen lieferten zuletzt Fehler. Der Bestand kann unvollständig sein.</div>':'')+
    sources.map(s=>'<div class="source-row"><strong>'+esc(s.name)+'</strong><span>'+esc(s.ok?String(s.count)+' Treffer':'Abruf fehlgeschlagen')+'</span></div>').join('')+
    '</div></section></div><div class="column"><section class="panel"><div class="panel-inner">'+panelTop('ⓘ','Datenschutz & Einordnung')+
    '<p class="muted">Die App speichert eine freiwillige Merkliste nur im lokalen Browser. Externe Netzwerkzugriffe erfolgen zum Webhost, zu GitHub sowie bei direkter Live-Suche zu GDELT und rss2json.com. Diese Anbieter können technische Zugriffsdaten verarbeiten.</p>'+
    '<p class="muted">Vor einem offiziellen oder produktiven Einsatz: Freigabe durch eure IT, Marken- und Bildrechte, Quellen-Nutzungsbedingungen, Impressum und Datenschutzhinweise klären.</p>'+
    '<p class="muted">Bildnachweise (Symbolbilder, keine Ereignisfotos): <a href="https://unsplash.com/photos/an-elephant-walks-through-dry-grass-in-savanna-giucwGEgRsE" target="_blank" rel="noopener noreferrer">Elefant – Eric Dekker</a>, <a href="https://unsplash.com/photos/whale-tail-in-the-middle-of-ocean-larQY4lhbT4" target="_blank" rel="noopener noreferrer">Wal – Mike Doherty</a>, <a href="https://unsplash.com/photos/a-lush-green-forest-filled-with-lots-of-trees-GlNSjGRugTE" target="_blank" rel="noopener noreferrer">Wald – Maximus Beaumont</a> (<a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">Lizenz</a>).</p>'+
    '<button type="button" class="small-button" id="clearSaved">Gespeicherte Artikel löschen</button></div></section></div></div>';
}
function render(){
  renderNav();status();
  const view=state.view;
  $('#main').innerHTML=view==='sources'?sourcesView():view==='monitor'?monitorView():
    view==='news'&&!state.search?dashboard():
    view==='news'?heading('Global News Radar','Suchergebnisse nach Datum, neueste zuerst')+dateGroup(itemsFor('news').slice(0,80)):
    archiveView(view);
}
async function createStudySummary(){
  const study=studyPick();
  if(!study||state.studyAI?.status==='loading')return;
  if(typeof window.Summarizer?.create!=='function'||!StudyAI.evidence(study)){
    // Keep a true single-click path when the free local AI or a sufficient abstract is missing.
    window.open(StudyAI.chatGPTLink(study),'_blank','noopener,noreferrer');
    state.studyAI={id:study.id,status:'unsupported',message:'Die lokale KI oder ein ausreichend langer DOI-Abstract ist nicht verfügbar. ChatGPT wurde mit dem Studienauftrag in einem neuen Tab geöffnet. Du musst die Anfrage dort gegebenenfalls noch absenden.'};
    render();return;
  }
  state.studyAI={id:study.id,status:'loading',message:'Die lokale KI wird vorbereitet …'};
  render();
  const outcome=await StudyAI.summarize(study,{onProgress(message){
    if(state.studyAI?.id!==study.id)return;
    state.studyAI.message=message;
    const el=$('#studyAIResult p');if(el)el.textContent=message;
  }});
  state.studyAI={id:study.id,...outcome};
  render();
}
function bindEvents(){
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view]');
    if(nav){event.preventDefault();go(nav.dataset.view);return}
    const mark=event.target.closest('[data-bookmark]');
    if(mark){const id=mark.dataset.bookmark;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);storeSaved();render();return}
    if(event.target.closest('#summarizeStudy')){createStudySummary();return}
    if(event.target.closest('#toggleAllNews')){state.newsExpanded=!state.newsExpanded;render();return}
    if(event.target.closest('#moreMonitor')){state.mediaVisible+=70;render();return}
    const profile=event.target.closest('[data-monitor-profile]');
    if(profile){state.monitorProfile=profile.dataset.monitorProfile;state.mediaVisible=70;render();return}
    const scope=event.target.closest('[data-monitor-scope]');
    if(scope){state.monitorScope=scope.dataset.monitorScope;state.mediaVisible=70;render();return}
    if(event.target.closest('#filterSaved')){state.onlySaved=!state.onlySaved;render();return}
    if(event.target.closest('#clearSaved')){if(confirm('Gesamte Merkliste löschen?')){state.saved.clear();storeSaved();render()}return}
  });
  document.addEventListener('toggle',event=>{
    if(event.target?.classList?.contains('research-drawer'))state.studyOpen=event.target.open;
  },true);
  $('#globalSearch').addEventListener('input',event=>{state.search=event.target.value.trim();render()});
  $('#refreshBtn').addEventListener('click',()=>loadFeed(true));
}
async function fetchArchive(){
  let lastError='';
  const urls=[
    'https://raw.githubusercontent.com/hhhihihihpdwwd/astro-platform-starter/main/command-center/data/articles.json?refresh='+Date.now(),
    'data/articles.json?refresh='+Date.now()
  ];
  for(const u of urls){
    try{
      const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),14000);
      let response;
      try{response=await fetch(u,{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timeout)}
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||!Array.isArray(data.articles)||!Array.isArray(data.sources))throw Error('Ungültiges JSON-Datenformat');
      const oldTime=Date.parse(state.feed.generated_at||''),newTime=Date.parse(data.generated_at||'');
      if(!Number.isFinite(newTime))throw Error('Archiv hat keinen gültigen Aktualisierungszeitpunkt');
      state.archiveCheckedAt=new Date().toISOString();
      // A stale static snapshot must never overwrite a newer GitHub copy.
      if(!Number.isFinite(oldTime)||newTime>=oldTime){
        const changed=state.feed.generated_at!==data.generated_at;
        state.feed=data;state.fetchError='';return {ok:true,changed};
      }
      state.fetchError='';return {ok:true,changed:false,olderSnapshot:true};
    }catch(err){lastError=String(err?.message||err)}
  }
  state.fetchError=lastError||'Abruf fehlgeschlagen';
  return {ok:false,changed:false};
}
async function fetchLive(){
  try{
    if(!Live)throw Error('Live-Suchmodul nicht geladen');
    const data=await Live.load();
    state.liveArticles=data.articles;state.liveCheckedAt=data.checkedAt;
    state.liveProvider=data.provider;state.liveError='';
    return {ok:true,count:data.articles.length};
  }catch(err){
    state.liveError=String(err?.message||err);
    return {ok:false,count:0};
  }
}
async function fetchMediaArchive(){
  let error='';
  const urls=[
    'https://raw.githubusercontent.com/hhhihihpdwwd/astro-platform-starter/main/command-center/data/monitoring.json?t='+Date.now(),
    'data/monitoring.json?t='+Date.now()
  ];
  for(const url of urls){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);
    try{
      let response;
      try{response=await fetch(url,{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timer)}
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||!Array.isArray(data.articles)||!Array.isArray(data.sources))throw Error('Medien-Daten ungültig');
      const old=Date.parse(state.mediaFeed.checked_at||''),next=Date.parse(data.checked_at||'');
      state.mediaCheckedAt=new Date().toISOString();
      if(!Number.isFinite(old)||Number.isFinite(next)&&next>=old){
        const changed=state.mediaFeed.checked_at!==data.checked_at;
        state.mediaFeed=data;state.mediaError='';return {ok:true,changed};
      }
      state.mediaError='';return {ok:true,changed:false};
    }catch(ex){clearTimeout(timer);error=String(ex.message||ex)}
  }
  state.mediaError=error;return {ok:false,changed:false};
}
async function fetchMediaLive(){
  try{
    if(!Monitor)throw Error('Medienmonitor fehlt');
    const result=await Monitor.loadLive();
    state.mediaLive=result.articles;
    state.mediaLiveCheckedAt=result.checked_at;
    state.mediaLiveError='';
    return {ok:true,count:result.articles.length};
  }catch(err){state.mediaLiveError=String(err?.message||err);return {ok:false,count:0}}
}
async function loadFeed(manual=false){
  if(state.fetching)return;
  const knownNews=new Set(articles().map(a=>a.url));
  const knownMedia=new Set(mediaItems().map(a=>a.url));
  state.fetching=true;state.lastFetchAt=Date.now();status();
  // Each feed is independent; failure in one does not block the others.
  const [archive,live,mediaArchive,mediaLive]=await Promise.all([
    fetchArchive(),fetchLive(),fetchMediaArchive(),fetchMediaLive()
  ]);
  state.fetching=false;
  if(!archive.ok&&!live.ok&&!mediaArchive.ok&&!mediaLive.ok)state.lastFetchAt=Date.now()-55*60000;
  const newerNews=articles().filter(a=>!knownNews.has(a.url)).length;
  const newerMedia=mediaItems().filter(a=>!knownMedia.has(a.url)).length;
  render();
  if(manual){
    if(newerNews||newerMedia)toast(newerNews+' neue Radar-Meldungen · '+newerMedia+' neue Medientreffer geladen.');
    else if(live.ok||mediaLive.ok||archive.ok||mediaArchive.ok)toast('Alle verfügbaren Quellen geprüft. Keine zusätzlichen Meldungen gefunden.');
    else toast('Alle Abrufe fehlgeschlagen. Der bisherige Datenbestand bleibt sichtbar.');
  }
}
function maybeRefresh(){
  updateClocks();
  if(!document.hidden&&Date.now()-state.lastFetchAt>=60*60*1000)loadFeed();
  const today=Clock.cityTime(new Date(),'Europe/Berlin').day;
  if(today!==startDate){startDate=today;render()}
}
let startDate='';
function start(){
  renderClocksShell();updateClocks();
  startDate=Clock.cityTime(new Date(),'Europe/Berlin').day;
  bindEvents();
  const hash=location.hash.replace('#','');
  if(NAV.some(x=>x[0]===hash))state.view=hash;
  render();loadFeed();
  setInterval(updateClocks,1000);
  setInterval(maybeRefresh,60*1000);
  document.addEventListener('visibilitychange',maybeRefresh);
  window.addEventListener('focus',maybeRefresh);
}
start();
