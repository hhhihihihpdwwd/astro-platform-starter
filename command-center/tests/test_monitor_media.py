import sys,json
from pathlib import Path
from datetime import datetime,timezone
from email.utils import format_datetime
from urllib.parse import parse_qs,urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import monitor_media as M

NOW=datetime(2026,11,26,10,0,tzinfo=timezone.utc)
def xml(*titles):
    items=[]
    for i,(title,publisher) in enumerate(titles):
        items.append('<item><title>'+title+'</title><link>https://news.google.com/rss/articles/test'+str(i)+'</link><pubDate>'+format_datetime(NOW)+'</pubDate><source>'+publisher+'</source></item>')
    return ('<rss><channel>'+''.join(items)+'</channel></rss>').encode('utf8')

def test_profiles_use_exact_public_names_and_acronym():
    assert 'ifaw' in M.matched_profiles('IFAW launches a new wildlife campaign - Example News')
    assert 'full' in M.matched_profiles('International Fund for Animal Welfare calls for action')
    assert 'andreas' in M.matched_profiles('Andreas Dinkelmeyer spricht über Wildtierhandel')
    assert 'robert' in M.matched_profiles('Robert Kless speaks at congress')
    assert 'matt' in M.matched_profiles('Matt Collis comments on policy')
    assert M.matched_profiles('Ifawful sports coverage is not a profile')==[]
    assert M.matched_profiles('International Federation of Astronomy Workers')==[]

def test_parse_dates_publisher_and_false_hits():
    rows=M.parse_monitor_rss(xml(
      ('IFAW und Artenschutz in Deutschland - Die Zeit','Die Zeit'),
      ('Unrelated zebra sanctuary news','Animal Magazine'),
      ('Andreas Dinkelmeyer speaks on animals - IFAW','IFAW')
    ),NOW)
    assert len(rows)==2
    assert rows[0]['date_type']=='aggregator'
    assert rows[0]['source']=='Die Zeit'
    assert rows[1]['origin']=='IFAW-eigene Meldung'
    assert 'andreas' in rows[1]['profiles'] and 'ifaw' in rows[1]['profiles']

def test_query_format_and_retention(tmp_path):
    q=parse_qs(urlparse(M.google_url(M.SEARCHES[0])).query)
    assert 'when:14d' in q['q'][0]
    assert q['ceid'][0]=='US:en'
    path=tmp_path/'media.json'
    def get(url):
        if 'ceid=DE' in url:return xml(('Andreas Dinkelmeyer im Interview - Lokale Zeitung','Lokale Zeitung')).replace(b'/test0',b'/team0')
        return xml(('IFAW launches coastal protection - World News','World News'))
    data=M.run(path,get,NOW)
    assert len(data['articles'])==2
    assert len(data['profiles'])>=7
    assert data['last_successful_at']==data['checked_at']
    data2=M.run(path,lambda u: (_ for _ in ()).throw(TimeoutError('offline')),NOW)
    assert len(data2['articles'])==2
    assert data2['last_successful_at']==data['last_successful_at']
    assert len(data2['failures'])==len(M.SEARCHES)

def test_merge_by_url_not_keyword():
    a={'title':'IFAW rescues whale','url':'https://news.google.com/rss/articles/one',
       'date':'2026-11-26T08:00:00Z','profiles':['ifaw']}
    b=dict(a);b['profiles']=['germany']
    assert len(M.merge([a],[b],NOW))==1
