const assert=require('node:assert/strict');
const Live=require('../lib/live-news.js');
const now=new Date('2026-11-24T09:30:00Z');
const d='20261124T091200Z';
assert(Live.endpoint().startsWith('https://api.gdeltproject.org/api/v2/doc/doc?'));
assert(Live.endpoint().includes('format=json'));
assert.equal(Live.isoDate(d),'2026-11-24T09:12:00Z');
assert.equal(Live.isoDate('bad-date'),null);
assert.equal(Live.safeUrl('javascript:alert(1)'),'');
assert.equal(Live.safeUrl('https://example.org/story'),'https://example.org/story');
const list=Live.parse({articles:[
  {title:'Wildlife trafficking ring uncovered by investigators',url:'https://news.example.org/trade',seendate:d},
  {title:'Wildlife trafficking ring uncovered by investigators',url:'https://news.example.org/trade',seendate:d},
  {title:'Whale conservation effort reaches new coastline',url:'https://news.example.org/whale',seendate:'20261124T081100Z'},
  {title:'Football scores and celebrity wildlife stock market',url:'https://news.example.org/bad',seendate:d},
  {title:'Elephant rescue',url:'javascript:alert(1)',seendate:d},
  {title:'Wildlife information from long ago',url:'https://news.example.org/old',seendate:'20251001T101000Z'}
]},now);
assert.equal(list.length,2);
assert.equal(list[0].title,'Wildlife trafficking ring uncovered by investigators');
assert.equal(list[0].kind,'media');
assert.equal(list[0].live,true);
assert.equal(list[0].source,'GDELT · news.example.org');
assert(!list[0].summary);
assert.throws(()=>Live.parse({}),/Ungültige/);
(async()=>{
 let network=0;
 const res=await Live.load({now,fetcher:async(url,options)=>{
  network++;
  assert(url.includes('timespan=2d'));
  assert.equal(options.cache,'no-store');
  return {ok:true,json:async()=>({articles:[{title:'Elephant conservation story',url:'https://example.org/a',seendate:d}]})};
 }});
 assert.equal(res.articles.length,1);
 assert.equal(res.checkedAt,'2026-11-24T09:30:00.000Z');
 assert.equal(network,1);
 await assert.rejects(Live.load({fetcher:async()=>({ok:false,status:429})}),/HTTP 429/);
 console.log('OK: direct live-news API, timestamps, deduplication, relevance, errors and no fake summaries');
})().catch(e=>{console.error(e);process.exit(1)});
