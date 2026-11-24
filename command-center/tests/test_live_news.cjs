const assert=require('node:assert/strict');
const Live=require('../lib/live-news.js');
const now=new Date('2026-11-24T09:30:00Z');
const d='20261124T091200Z';
assert(Live.endpoint().startsWith('https://api.gdeltproject.org/api/v2/doc/doc?'));
assert(Live.rssEndpoint().startsWith('https://api.rss2json.com/v1/api.json?'));
assert.equal(Live.isoDate(d),'2026-11-24T09:12:00Z');
assert.equal(Live.isoDate('bad-date'),null);
assert.equal(Live.safeUrl('javascript:alert(1)'),'');
assert.equal(Live.safeUrl('https://example.org/story'),'https://example.org/story');
const articles=Live.parse({articles:[
  {title:'Wildlife trafficking ring uncovered by investigators',url:'https://news.example.org/trade',seendate:d},
  {title:'Wildlife trafficking ring uncovered by investigators',url:'https://news.example.org/trade',seendate:d},
  {title:'Whale conservation effort reaches new coastline',url:'https://news.example.org/whale',seendate:'20261124T081100Z'},
  {title:'Football scores and celebrity wildlife stock market',url:'https://news.example.org/bad',seendate:d},
  {title:'Elephant rescue',url:'javascript:alert(1)',seendate:d},
  {title:'Wildlife information from long ago',url:'https://news.example.org/old',seendate:'20251001T101000Z'}
]},now);
assert.equal(articles.length,2);
assert.equal(articles[0].title,'Wildlife trafficking ring uncovered by investigators');
assert.equal(articles[0].kind,'media');
assert.equal(articles[0].source,'GDELT · news.example.org');
assert(!articles[0].summary);
assert.throws(()=>Live.parse({}),/Ungültige/);
const rss=Live.parseRss({status:'ok',items:[
  {title:'Mongabay helps conserve wildlife habitats',link:'https://news.mongabay.com/2026/11/wildlife/',pubDate:'2026-11-24 08:00:00'},
  {title:'This sports report has no conservation link',link:'https://news.mongabay.com/2026/11/sports/',pubDate:'2026-11-24 08:00:00'}
]},now);
assert.equal(rss.length,1);
assert.equal(rss[0].source,'Mongabay · RSS');
(async()=>{
  const gdelt={articles:[{title:'Elephant conservation story',url:'https://example.org/a',seendate:d}]};
  const rssPayload={status:'ok',items:[{title:'Whale conservation story',link:'https://news.mongabay.com/whale',pubDate:'2026-11-24 08:00:00'}]};
  const both=await Live.load({now,fetcher:async(url,opts)=>{
    assert.equal(opts.cache,'no-store');
    return url.includes('gdeltproject')?{ok:true,json:async()=>gdelt}:{ok:true,json:async()=>rssPayload};
  }});
  assert.equal(both.articles.length,1);
  assert.equal(both.checkedAt,'2026-11-24T09:30:00.000Z');
  const fallback=await Live.load({now,fetcher:async(url)=>
    url.includes('gdeltproject')?{ok:false,status:429}:{ok:true,json:async()=>rssPayload}
  });
  assert.equal(fallback.provider,'Mongabay RSS');
  assert.equal(fallback.articles[0].title,'Whale conservation story');
  await assert.rejects(Live.load({fetcher:async()=>({ok:false,status:429})}),/nicht erreichbar/);
  console.log('OK: live news search and free RSS fallback, de-duplication, timestamps, no invented excerpts');
})().catch(e=>{console.error(e);process.exit(1)});
