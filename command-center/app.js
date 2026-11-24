'use strict';
/* Public-source-only newsroom: no paid AI API, private accounts, geolocation or task/chat storage. */
const A=window.CenterAnalysis;
const Clock=window.CenterClock;
const StudyAI=window.CenterStudyAI;
const Live=window.CenterLiveNews;
const $=(q)=>document.querySelector(q);
const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=(value)=>{try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:'#'}catch{return '#'}};
const fmtDate=(value,options={})=>{if(!value)return 'Datum unbekannt';const date=new Date(value);return Number.isNaN(date.getTime())?'Datum unbekannt':new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'short',year:'numeric',...options}).format(date)};
const truncated=(value,length=180)=>{const v=String(value||'').replace(/\s+/g,' ').trim();return v.length<=length?v:v.slice(0,length).replace(/\s+\S*$/,'')+' …'};
const link=(item,label)=>'<a href="'+esc(safeUrl(item.url))+'" target="_blank" rel="noopener noreferrer" title="Original: '+esc(item.title)+'">'+esc(label||item.title)+'</a>';
const NAV=[['dashboard','Übersicht'],['news','Global News'],['pr','PR-Chancen'],['crisis','Crisis Watch'],['studies','Studien'],['policy','Politik'],['ifaw','IFAW-News'],['sources','Quellen']];
let saved=new Set();
try{saved=new Set(JSON.parse(localStorage.getItem('wc_saved_v4')||'[]'))}catch{}
const state={view:'dashboard',search:'',feed:{articles:[],sources:[],failures:[],generated_at:null},fetchError:'',fetching:false,lastFetchAt:0,archiveCheckedAt:null,liveArticles:[],liveCheckedAt:null,liveError:'',saved,onlySaved:false,studyAI:null};
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
function byDate(list){return [...list].sort((x,y)=>(Date.parse(y.date)||0)-(Date.parse(x.date)||0))}
function byRelevance(list){return [...list].sort((x,y)=>A.score(y)-A.score(x)||(Date.parse(y.date)||0)-(Date.parse(x.date)||0))}
function fresh(list,maxDays=40){const now=Date.now();return list.filter(x=>{const t=Date.parse(x.date);return Number.isFinite(t)&&t<now+86400000&&now-t<=maxDays*86400000})}
function itemsFor(view){
  let list=articles();
  if(view==='news')list=list.filter(x=>x.kind!=='study');
  if(view==='pr')list=list.filter(x=>A.isOpportunity(x));
  if(view==='crisis')list=list.filter(x=>A.isCrisis(x));
  if(view==='studies')list=list.filter(x=>x.kind==='study'&&worthyStudy(x));
  if(view==='policy')list=list.filter(x=>x.kind==='policy'||x.topics.includes('Politik & Recht'));
  if(view==='ifaw')list=list.filter(x=>x.kind==='ifaw');
  if(state.onlySaved)list=list.filter(x=>state.saved.has(x.id));
  if(state.search)list=A.search(list,state.search);
  return view==='pr'?byRelevance(list):byDate(list);
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
  if(!NAV.some(x=>x[0]===view))view='dashboard';
  state.view=view;state.search='';state.onlySaved=false;$('#globalSearch').value='';
  render();document.querySelector('main').focus({preventScroll:true});
  history.replaceState(null,'',view==='dashboard'?location.pathname:'#'+view);
}
function ageMinutes(value){const t=Date.parse(value||'');return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):Infinity}
function status(){
  const host=$('#topStatus');
  const archiveAge=ageMinutes(state.feed.generated_at);
  const liveAge=ageMinutes(state.liveCheckedAt);
  let label='Noch keine Quellen geladen',level='warn';
  if(state.fetching){label='Prüfe Archiv und Live-Meldungen …';level=''}
  else if(Number.isFinite(liveAge)&&liveAge<=75){
    label='Live-Suche geprüft · '+state.liveArticles.length+' Treffer · '+fmtTime(state.liveCheckedAt);
    level='';
  }else if(Number.isFinite(archiveAge)){
    label='Archiv: '+(archiveAge<60?archiveAge+' Min.':Math.round(archiveAge/60)+' Std.')+' alt';
    if(state.liveError)label+=' · Live-Suche fehlgeschlagen';
    level=archiveAge>150?'warn':'';
  }else if(state.liveError||state.fetchError){label='Datenabruf derzeit nicht erreichbar';level='error'}
  host.innerHTML='<span class="status-pulse '+level+'"></span><span>'+esc(label)+'</span>';
}
function empty(title,sub){return '<div class="empty"><strong>'+esc(title)+'</strong>'+esc(sub||'')+'</div>'}
function fmtTime(value){return fmtDate(value,{hour:'2-digit',minute:'2-digit'})}
function heading(title,sub){const recentlyChecked=ageMinutes(state.liveCheckedAt)<75;return '<div class="dashboard-header"><div><h2 class="page-heading">'+esc(title)+'</h2><p class="page-subtitle">'+esc(sub||'')+'</p></div><div class="update-note">'+(recentlyChecked?'Live geprüft: '+esc(fmtTime(state.liveCheckedAt))+' · ':'')+'Archiv: '+esc(fmtTime(state.feed.generated_at))+'</div></div>'}
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
function dashboard(){
  const all=articles();
  const top=byRelevance(fresh(all.filter(x=>x.kind!=='study'),20)).slice(0,5);
  const pictures=top.length?top.slice(0,3):byRelevance(all.filter(x=>x.kind!=='study')).slice(0,3);
  const crisis=byDate(all.filter(x=>A.isCrisis(x))).slice(0,2);
  const pr=byRelevance(all.filter(x=>A.isOpportunity(x))).slice(0,2);
  const policy=byDate(all.filter(x=>x.kind==='policy'||x.topics.includes('Politik & Recht'))).slice(0,2);
  const brief=top.slice(0,4);
  const hasWarn=ageMinutes(state.feed.generated_at)>150&&ageMinutes(state.liveCheckedAt)>75;
  return heading('Dein Überblick','Wichtige Meldungen, Beobachtungen und Forschung – automatisch aus öffentlichen Quellen zusammengestellt.')+
    (hasWarn?'<div class="notice warn">Der Archivbestand ist älter als geplant und die direkte Live-Suche war nicht erfolgreich. Die stündliche GitHub-Aktualisierung kann verzögert sein. Bitte prüfe die Originalquellen.</div>':'')+
    '<div class="dashboard-grid"><div class="column">'+
    '<section class="panel"><div class="panel-inner">'+panelTop('☀','Morning Briefing','news')+
    (brief.length?'<ul class="brief-lines">'+brief.map(a=>'<li><span class="dot"></span><div>'+link(a,truncated(a.displayTitle,115))+'<div class="muted">'+esc(truncated(a.displaySummary||'',135))+'</div></div></li>').join('')+'</ul>':empty('Noch kein Briefing verfügbar','Neue Nachrichten erscheinen nach einem erfolgreichen Quellenabruf.'))+
    '</div></section>'+
    '<section class="panel"><div class="panel-inner">'+panelTop('◎','Global News Radar','news')+
    (pictures.length?'<div class="feature-grid">'+pictures.map(feature).join('')+'</div>':empty('Keine Nachrichten vorhanden','Die App zeigt ausschließlich echte Quellen.'))+
    '</div></section></div><div class="column">'+
    '<section class="panel"><div class="panel-inner">'+panelTop('↗','PR-Chancen','pr')+
    (pr.length?pr.map(a=>smallStory(a,false)).join('')+'<p class="mini-note">Regelbasierte Themenideen, keine bestätigten Pressechancen.</p>':empty('Keine neuen PR-Chancen erkannt','Keine geeigneten Quellen im aktuellen Bestand.'))+
    '</div></section>'+
    '<section class="panel alert-border"><div class="panel-inner">'+panelTop('△','Crisis Watch','crisis')+
    (crisis.length?crisis.map(a=>smallStory(a,false)).join('')+'<p class="mini-note">Automatische Schlagwortsuche, keine behördliche Gefahrenwarnung.</p>':empty('Keine neuen Hinweise','Das ist keine Garantie, dass keine Krisen bestehen.'))+
    '</div></section>'+
    '<section class="panel"><div class="panel-inner">'+panelTop('⚖','Politik im Blick','policy')+
    (policy.length?policy.map(a=>smallStory(a,false)).join(''):empty('Keine aktuellen Policy-Meldungen','Die verfügbaren Quellen sind möglicherweise unvollständig.'))+
    '</div></section></div></div>'+
    dailyStudy()+'<p class="mini-note section-spacer">Alle Meldungen sind automatisch gesammelt. Themengewichtung, Krisen- und PR-Kennzeichnungen sind regelbasierte Hinweise; keine unabhängige Faktenprüfung. Symbolbilder zeigen nicht die konkreten Ereignisse.</p>';
}
function articleCard(a){
  const saved=state.saved.has(a.id);
  return '<article class="article-card"><div><span class="badge">'+esc(a.kind==='study'?'Studie':a.kind==='policy'?'Politik':a.kind==='ifaw'?'IFAW-News':'Meldung')+'</span>'+
    '<h3>'+link(a)+'</h3><p>'+esc(truncated(a.displaySummary||'Kein Teaser verfügbar. Bitte die Originalquelle aufrufen.',360))+'</p>'+
    '<div class="article-meta"><span>'+esc('Originalmeldung')+'</span><span>'+esc(a.source||'Quelle unbekannt')+'</span><span>'+esc(fmtDate(a.date))+'</span><span>'+esc(a.topics.slice(0,2).join(' · '))+'</span></div></div>'+
    '<div class="article-actions"><button type="button" data-bookmark="'+esc(a.id)+'" class="bookmark '+(saved?'saved':'')+'">'+(saved?'✓ Gemerkt':'☆ Merken')+'</button>'+
    '<a class="small-button" href="'+esc(safeUrl(a.url))+'" target="_blank" rel="noopener noreferrer">Quelle ↗</a></div></article>';
}
function archiveView(view){
  const descriptions={
    news:['Global News Radar','Neue Meldungen aus internationalen Medien und öffentlichen Organisationen.'],
    pr:['PR-Chancen','Nachrichtenthemen mit möglicher Relevanz für die deutsche Pressearbeit. Keine fertigen Pitches.'],
    crisis:['Crisis Watch','Automatisch erkannte Meldungen mit möglichen Krisenbegriffen. Keine Echtzeit-Gefahrenwarnung.'],
    studies:['Studien-Scout','Wissenschaftliche Quellen mit DOI, Metadaten und – soweit verfügbar – zurückhaltender Abstract-Einordnung.'],
    policy:['Politik & Policy','Öffentliche Politik- und Regulierungsmeldungen mit Originalquellen.'],
    ifaw:['IFAW weltweit','Öffentliche IFAW-Meldungen aus dem Nachrichtenbestand.']
  };
  const [title,description]=descriptions[view]||descriptions.news;
  const list=itemsFor(view).slice(0,90);
  const notice=view==='studies'?'<div class="notice">Ein bibliografischer Eintrag belegt nicht die Ergebnisse oder den Peer-Review-Status. Nur verlinkte DOI-Originalquellen verwenden.</div>':'';
  return heading(title,description)+notice+
    '<div class="filterbar"><button type="button" id="filterSaved" class="'+(state.onlySaved?'active':'')+'">'+(state.onlySaved?'✓ Merkliste':'☆ Nur Gemerkte')+'</button><span class="muted">'+list.length+' angezeigte Quellen · Neueste zuerst</span></div>'+
    '<div class="list-view">'+(list.length?list.map(articleCard).join(''):empty('Keine passenden Quellen','Bitte später erneut prüfen oder nach anderen Begriffen suchen.'))+'</div>';
}
function sourcesView(){
  const sources=state.feed.sources||[],fails=state.feed.failures||[];
  return heading('Quellen & Transparenz','Datenherkunft, Aktualität und Hinweise zur Nutzung des öffentlichen Prototyps.')+
    '<div class="notice">Die Seite ist öffentlich zugänglich und <strong>kein offizielles IFAW-Angebot</strong>. Keine vertraulichen IFAW-Daten eingeben. Es gibt keine Anmeldung, keine Aufgaben- oder Chatfunktion und keine kostenpflichtige KI-API.</div>'+
    '<div class="dashboard-grid"><div class="column"><section class="panel"><div class="panel-inner">'+panelTop('◎','Aktualität der Quellen')+
    '<p class="muted">Öffentliches Archiv (GitHub): <strong>'+esc(fmtTime(state.feed.generated_at))+'</strong>. Zuletzt auf eine neue Archivdatei geprüft: <strong>'+esc(fmtTime(state.archiveCheckedAt))+'</strong>.</p>'+
    '<p class="muted">Direkte Live-Suche (GDELT): <strong>'+esc(state.liveCheckedAt?fmtTime(state.liveCheckedAt):'noch kein erfolgreicher Abruf')+'</strong>. Aktuell '+state.liveArticles.length+' gefilterte Meldungen in dieser Sitzung. '+esc(state.liveError?'Letzter Fehler: '+state.liveError:'Die Live-Suche hat geantwortet oder wird noch geprüft.')+'</p>'+
    '<p class="muted">Der Browser fragt beim Öffnen, auf Knopfdruck und spätestens stündlich beide Quellen erneut ab. Der automatische GitHub-Lauf kann sich verzögern. Ein erneuter Abruf ist nicht automatisch eine neue Veröffentlichung.</p>'+
    '<p class="muted">GDELT ist ein kostenloser, öffentlicher Medienindex. Live-Meldungen enthalten nur Originaltitel, Metadaten und Links, keine unabhängig bestätigten Artikelinhalte. Quelle: <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">The GDELT Project</a>.</p>'+
    (fails.length?'<div class="notice warn">'+fails.length+' Quellen lieferten zuletzt Fehler. Der Bestand kann unvollständig sein.</div>':'')+
    sources.map(s=>'<div class="source-row"><strong>'+esc(s.name)+'</strong><span>'+esc(s.ok?String(s.count)+' Treffer':'Abruf fehlgeschlagen')+'</span></div>').join('')+
    '</div></section></div><div class="column"><section class="panel"><div class="panel-inner">'+panelTop('ⓘ','Datenschutz & Einordnung')+
    '<p class="muted">Die App speichert eine freiwillige Merkliste nur im lokalen Browser. Externe Netzwerkzugriffe erfolgen zum Webhost, zu den öffentlichen JSON-Daten auf GitHub und direkt zum GDELT-Medienindex. Diese Anbieter können technische Zugriffsdaten verarbeiten.</p>'+
    '<p class="muted">Vor einem offiziellen oder produktiven Einsatz: Freigabe durch eure IT, Marken- und Bildrechte, Quellen-Nutzungsbedingungen, Impressum und Datenschutzhinweise klären.</p>'+
    '<p class="muted">Bildnachweise (Symbolbilder, keine Ereignisfotos): <a href="https://unsplash.com/photos/an-elephant-walks-through-dry-grass-in-savanna-giucwGEgRsE" target="_blank" rel="noopener noreferrer">Elefant – Eric Dekker</a>, <a href="https://unsplash.com/photos/whale-tail-in-the-middle-of-ocean-larQY4lhbT4" target="_blank" rel="noopener noreferrer">Wal – Mike Doherty</a>, <a href="https://unsplash.com/photos/a-lush-green-forest-filled-with-lots-of-trees-GlNSjGRugTE" target="_blank" rel="noopener noreferrer">Wald – Maximus Beaumont</a> (<a href="https://unsplash.com/license" target="_blank" rel="noopener noreferrer">Lizenz</a>).</p>'+
    '<button type="button" class="small-button" id="clearSaved">Gespeicherte Artikel löschen</button></div></section></div></div>';
}
function render(){
  renderNav();status();
  const view=state.search?'search':state.view;
  $('#main').innerHTML=view==='dashboard'?dashboard():view==='sources'?sourcesView():view==='search'?heading('Suchergebnisse','Passende Artikel aus dem vorhandenen Nachrichtenbestand.')+'<div class="list-view">'+(A.search(articles(),state.search).slice(0,90).map(articleCard).join('')||empty('Keine passenden Quellen','Bitte Suchbegriff ändern.'))+'</div>':archiveView(view);
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
    if(event.target.closest('#filterSaved')){state.onlySaved=!state.onlySaved;render();return}
    if(event.target.closest('#clearSaved')){if(confirm('Gesamte Merkliste löschen?')){state.saved.clear();storeSaved();render()}return}
  });
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
    state.liveArticles=data.articles;
    state.liveCheckedAt=data.checkedAt;
    state.liveError='';
    return {ok:true,count:data.articles.length};
  }catch(err){
    state.liveError=String(err?.message||err);
    return {ok:false,count:0};
  }
}
async function loadFeed(manual=false){
  if(state.fetching)return;
  const previousUrls=new Set(articles().map(a=>a.url));
  state.fetching=true;state.lastFetchAt=Date.now();status();
  // Both sources run independently: a delayed GitHub schedule cannot block live search.
  const [arch,live]=await Promise.all([fetchArchive(),fetchLive()]);
  state.fetching=false;
  if(!arch.ok&&!live.ok)state.lastFetchAt=Date.now()-55*60000; // retry on return in ~5 minutes
  const newCount=articles().filter(a=>!previousUrls.has(a.url)).length;
  render();
  if(manual){
    if(newCount>0)toast(newCount+' zusätzliche Meldungen geladen · Live-Quellen geprüft.');
    else if(live.ok)toast('Live-Suche geprüft: '+live.count+' Treffer. Keine neueren Meldungen gefunden.');
    else if(arch.changed)toast('Archiv aktualisiert. Live-Suche ist derzeit nicht erreichbar.');
    else toast('Keine neuen Daten: Live-Suche nicht erreichbar. Das Archiv bleibt unverändert.');
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
