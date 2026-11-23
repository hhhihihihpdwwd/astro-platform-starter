/* Transparente, regelbasierte Auswertung. Keine Sprachmodell-Ausgabe und keine Faktenvalidierung. */
(function (root) {
  'use strict';
  const TOPICS = [
    {name:'Wildtierhandel', key:'wildtierhandel', terms:['wildlife trade','illegal wildlife','wild animal trade','wildtierhandel','poaching','poacher','wildlife trafficking','cites','ivory','elfenbein','exotic pet','exotische haustier','wildtierkriminal','illegal hunting','schmuggel','wildlife crime']},
    {name:'Meeresschutz',key:'meeresschutz',terms:['whale','wale','walen','walfang','waljagd','dolphin','delphin','seal','robbe','marine','ocean','meeresschutz','ship strike','schiffsverkehr','fishing gear','beifang','right whale','shark','hai','sea turtle','ozean','coral']},
    {name:'Wildtierrettung',key:'rettung',terms:['animal rescue','wildlife rescue','wildtierrettung','rescue operation','animal disaster','wildfire','waldbrand','überschwemmung','flood','drought','dürre','wildlife emergency','earthquake','rehabilitation','rehabilitierung']},
    {name:'Elefanten & Großwild',key:'elefanten',terms:['elephant','elefant','rhino','nashorn','lion','löwe','big cat','großkatze','tiger','pangolin','schuppentier','giraffe','giraff']},
    {name:'Biodiversität',key:'biodiversitaet',terms:['biodivers','species','artenschutz','naturschutz','wildlife','habitat','ecosystem','ökosystem','conservation','wildtier','endangered','bedrohte arten','rewilding','invasive alien']},
    {name:'Politik & Recht',key:'politik',terms:['cites','treaty','agreement','regulation','directive','parliament','commission','gesetz','verordnung','konvention','ratifikation','united nations','europäische union','environment council','policy','minister','recht','resolution','protection act']}
  ];
  const STRONG=['ifaw','wildlife trade','wildtierhandel','wildlife trafficking','cites','poaching','elephant','elefant','rhino','nashorn','whale','wale','walen','walfang','animal rescue','wildtierrettung','exotic pet'];
  const CRISIS=['wildfire','waldbrand','flood','überschwemmung','oil spill','ölpest','strandung','stranding','mass die-off','mass mortality','disease outbreak','seuche','poaching','wildlife trafficking','wilderei','drought','dürre','disaster','emergency','animal cruelty','tierquälerei'];
  const STOP=new Set(['und','oder','für','eine','einen','einem','einer','der','die','das','den','dem','von','mit','auf','bei','über','zur','zum','was','gibt','neues','aktuelle','aktuellen','aktuell','neue','neuen','sind','wie','hat','ist','sich','ich','the','and','for','from','with','what','about','recent','news','show','me','please','im','ifaw','mich','meine','welche','welcher','welches','today','heute','dieser','dieses']);
  const fold=(s)=>String(s||'').toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');
  function tagsFor(a){let t=fold(`${a.title||''} ${a.summary||''}`);return TOPICS.filter(x=>x.terms.some(p=>t.includes(fold(p)))).map(x=>x.name)}
  function score(a){const title=fold(a.title),text=fold(`${a.title} ${a.summary||''}`);let v=0;for(const s of STRONG) if(title.includes(fold(s)))v+=5;else if(text.includes(fold(s)))v+=2;const matched=tagsFor(a);v+=Math.min(matched.length*3,12);if(a.kind==='ifaw')v+=8;if(a.kind==='policy')v+=2;if(a.kind==='study')v+=1;const dt=Date.parse(a.date||'');if(Number.isFinite(dt)){const age=Math.max(0,(Date.now()-dt)/86400000);if(age<2)v+=4;else if(age<7)v+=2;else if(age>60)v-=5}return Math.max(0,v)}
  function isCrisis(a){if(a.kind==='study')return false;const t=fold(`${a.title} ${a.summary||''}`);return CRISIS.some(x=>t.includes(fold(x)))&&score(a)>=8}
  function isOpportunity(a){return a.kind!=='study'&&score(a)>=12}
  function opportunityIdea(a){const tags=tagsFor(a);if(tags.includes('Politik & Recht'))return 'Mögliche politische Einordnung für deutsche Medien prüfen.';if(tags.includes('Wildtierhandel'))return 'Möglichen Aufhänger für Wildtierhandel und Artenschutz prüfen.';if(tags.includes('Meeresschutz'))return 'Mögliche Einordnung für Meeres- und Wissenschaftsredaktionen prüfen.';if(tags.includes('Wildtierrettung'))return 'Mögliche Verbindung zur IFAW-Tierrettungsarbeit prüfen.';if(tags.includes('Elefanten & Großwild'))return 'Möglichen Artenschutz-Aufhänger prüfen.';return 'Mögliche Relevanz für die deutsche Pressearbeit prüfen.'}
  function tokens(q){return fold(q).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=3&&!STOP.has(w))}
  function matchScore(a,q){let tok=tokens(q);if(!tok.length)return 0;const title=fold(`${a.title||''} ${a.title_de||''}`),body=fold(`${a.summary||''} ${a.summary_de||''} ${a.source||''} ${(a.topics||[]).join(' ')}`);return tok.reduce((p,t)=>p+(title.includes(t)?5:0)+(body.includes(t)?2:0),0)}
  function search(items,q){if(!q||!q.trim())return items;return items.map(a=>({...a,_match:matchScore(a,q)})).filter(a=>a._match>0).sort((a,b)=>b._match-a._match||score(b)-score(a))}
  const api={TOPICS,tagsFor,score,isCrisis,isOpportunity,opportunityIdea,tokens,search,matchScore,fold};
  root.CenterAnalysis=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
