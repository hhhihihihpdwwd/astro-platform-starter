import json
from pathlib import Path
from datetime import datetime, timezone
import sys
from urllib.error import URLError
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
import collect
NOW=datetime(2026,11,23,12,0,tzinfo=timezone.utc)
FEED=b'''<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
 <item><title>Elephants and wildlife trade protected</title><link>https://example.com/a?utm_source=foo&amp;id=4</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Conservation update from policy makers.</p><script>evil()</script>]]></description></item>
 <item><title>Old wildlife news</title><link>https://example.com/old</link><pubDate>Mon, 10 Nov 2025 10:00:00 GMT</pubDate><description>Wildlife historic</description></item>
 <item><title>Invalid link wildlife</title><link>javascript:alert(1)</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
 </channel></rss>'''
ATOM=b'''<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Marine conservation new rule</title><link href="https://example.org/b" rel="alternate"/><updated>2026-11-22T09:00:00Z</updated><summary>Marine wildlife habitat protected</summary></entry></feed>'''

def test_rss_safe_links_and_age():
    xs=collect.parse_feed(FEED,{'name':'Fixture','kind':'media'},NOW)
    assert len(xs)==1
    assert xs[0]['url']=='https://example.com/a?id=4'
    assert 'evil()' not in xs[0]['summary']
    assert xs[0]['date'].startswith('2026-11-23')

def test_atom():
    xs=collect.parse_feed(ATOM,{'name':'Atom fixture','kind':'policy'},NOW)
    assert len(xs)==1
    assert xs[0]['title']=='Marine conservation new rule'

def test_deduplicate_and_no_fabrication():
    one=collect.parse_feed(FEED,{'name':'Fixture','kind':'media'},NOW)
    assert len(collect.merge(one,one,NOW))==1
    assert not collect.merge([],[],NOW)

def test_no_update_on_total_failure(tmp_path,monkeypatch):
    path=tmp_path/'feed.json'
    path.write_text(json.dumps({'generated_at':'2026-11-22T10:00:00Z','articles':[]}),encoding='utf8')
    monkeypatch.setattr(collect,'RSS_SOURCES',[{'name':'Offline','kind':'media','url':'https://example.com/rss'}])
    monkeypatch.setattr(collect,'STUDY_TERMS',[])
    def fail(*args):raise URLError('offline')
    data=collect.run(path,request_fn=fail,now=NOW)
    assert data['generated_at']=='2026-11-22T10:00:00Z'
    assert data['failures'] and not data['articles']

def test_successful_collect(tmp_path,monkeypatch):
    path=tmp_path/'feed.json'
    monkeypatch.setattr(collect,'RSS_SOURCES',[{'name':'Fixture','kind':'media','url':'https://example.com/rss'}])
    monkeypatch.setattr(collect,'STUDY_TERMS',[])
    data=collect.run(path,request_fn=lambda _:FEED,now=NOW)
    assert len(data['articles'])==1
    assert data['generated_at']=='2026-11-23T12:00:00Z'
    assert data['articles'][0]['url'].startswith('https://')
    assert not data['failures']

def test_study_metadata_not_facts(tmp_path,monkeypatch):
    path=tmp_path/'feed.json'
    monkeypatch.setattr(collect,'RSS_SOURCES',[])
    monkeypatch.setattr(collect,'STUDY_TERMS',['elephant conservation'])
    blob=json.dumps({'message':{'items':[{'DOI':'10.1234/abc','title':['Wildlife and elephant conservation in Africa'],'published':{'date-parts':[[2026,11,22]]},'container-title':['Nature Conservation'],'type':'journal-article'}]}}).encode()
    data=collect.run(path,request_fn=lambda _:blob,now=NOW)
    assert len(data['articles'])==1
    assert data['articles'][0]['kind']=='study'
    assert 'nicht geprüft' in data['articles'][0]['summary']
