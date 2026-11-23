const assert=require('node:assert/strict');
const AI=require('../lib/study-ai.js');
const sample={
 title:'Two decades of changes in the global network of illegal wildlife trade',
 source:'Conservation Biology',
 url:'https://doi.org/10.1111/cobi.70196',
 abstract_source_text:'Researchers analyzed legal and illegal wildlife trade networks. '.repeat(12)
};
assert(AI.evidence(sample).length>220);
assert(AI.input(sample).includes(sample.url));
assert(AI.chatGPTLink(sample).startsWith('https://chatgpt.com/?q='));
assert(AI.chatGPTLink(sample).includes('cobi.70196'));
assert(!AI.evidence({...sample,url:'javascript:evil'}));
assert(!AI.evidence({...sample,abstract_source_text:''}));
(async()=>{
 let calls=0,download=false;
 const impl={
   async create(opts){
     calls++;
     assert.equal(opts.outputLanguage,'de');
     assert.equal(opts.type,'key-points');
     opts.monitor({addEventListener:(name,listener)=>{
       assert.equal(name,'downloadprogress');
       listener({loaded:0.4});download=true;
     }});
     return {async summarize(source){assert(source.includes('wildlife trade'));return 'Die unabhängige KI-Ausgabe beschreibt die Auswertung internationaler Handelsnetzwerke und verweist auf Grenzen der vorliegenden Daten.'},destroy(){}};
   }
 };
 const summary=await AI.summarize(sample,{impl,onProgress:()=>{}});
 assert.equal(summary.status,'ok');
 assert(summary.text.includes('unabhängige KI-Ausgabe'));
 assert.equal(calls,1);
 assert(download);
 const unavailable=await AI.summarize(sample,{impl:null});
 assert.equal(unavailable.status,'unsupported');
 const insufficient=await AI.summarize({...sample,abstract_source_text:''},{impl});
 assert.equal(insufficient.status,'insufficient');
 console.log('OK: 10 study AI tests (source gating, model call, offline privacy, fallback)');
})().catch(error=>{console.error(error);process.exit(1)});
