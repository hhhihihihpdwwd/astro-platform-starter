const assert=require('node:assert/strict');
const M=require('../lib/monitoring.js');
const now=new Date('2026-11-26T10:30:00Z');
assert.equal(M.PROFILES.length,8);
assert(M.matches('IFAW calls for wildlife protection').includes('ifaw'));
assert(M.matches('International Fund for Animal Welfare welcomes decision').includes('full'));
assert(M.matches('Robert Kless im Interview - Tageszeitung').includes('robert'));
assert(M.matches('Andreas Dinkelmeyer in Berlin').includes('andreas'));
assert(M.matches('Azzedine Downes outlines global protection programme').includes('azzedine'));
assert(M.matches('Ilaria Di Silvestre statement').includes('ilaria'));
assert.deepEqual(M.matches('Ifawful sports team loses'),[]);
const a={id:'a',title:'IFAW helps ocean wildlife',url:'https://news.example.org/a',date:'2026-11-24T10:00:00Z'};
const b={id:'b',title:'IFAW campaigns on wildlife trade',url:'https://news.example.org/b',date:'2026-11-26T09:00:00Z'};
const c={...a,id:'new',date:'2026-11-25T10:00:00Z'};
const sorted=M.merge([a,b,c]);
assert.equal(sorted.length,2);
assert.deepEqual(sorted.map(x=>x.id),['b','new']);
assert.equal(M.merge([a,{title:'Unrelated scientific discovery',url:'https://news.example.org/c'}]).length,1);
assert(M.liveUrl().includes('rss2json.com'));
const p={status:'ok',items:[
  {title:'IFAW launches new campaign',link:'https://news.example.org/new',pubDate:'2026-11-26 09:15:00',author:'Daily Press'},
  {title:'Company finance report',link:'https://news.example.org/other',pubDate:'2026-11-26 09:15:00',author:'Daily Press'}
]};
const parsed=M.fromRss2Json(p,now);
assert.equal(parsed.length,1);
assert.equal(parsed[0].date,'2026-11-26T09:15:00.000Z');
assert.equal(parsed[0].date_type,'aggregator');
(async()=>{
  const live=await M.loadLive({now,fetcher:async(uri,opts)=>{
    assert(uri.includes('rss2json.com'));
    assert.equal(opts.cache,'no-store');
    return {ok:true,json:async()=>p};
  }});
  assert.equal(live.articles[0].source,'Daily Press');
  assert.equal(live.checked_at,now.toISOString());
  await assert.rejects(M.loadLive({fetcher:async()=>({ok:false,status:429})}),/HTTP 429/);
  console.log('OK: 17 monitored IFAW brand/public-team filters, strict publication sorting and live-query guards');
})().catch(err=>{console.error(err);process.exit(1)});
