import sys,json
from pathlib import Path
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import study_daily as sd
NOW=datetime(2026,11,23,14,0,tzinfo=timezone.utc)
def test_source_based_summary_no_fabricated_findings():
    s=sd.summary('Elephant conservation in Africa','This study uses camera traps to investigate elephant movements.')
    assert 'Groß- und Wildtiere' in s
    assert 'Kamerafallen' in s
    assert 'prüfen' in s
def test_europe_pmc_abstract_and_doi():
    raw={'resultList':{'result':[
        {'title':'Wildlife conservation and elephant movements','doi':'10.1234/example',
         'abstractText':'A camera trap survey of elephants in protected areas.',
         'firstPublicationDate':'2026-11-20','journalTitle':'Journal of Wildlife Science'},
        {'title':'Elephant wildlife observations','doi':'10.1234/noabstract','firstPublicationDate':'2026-11-20'}
    ]}}
    items=sd.get_europe_pmc(NOW,lambda url:json.dumps(raw).encode())
    assert len(items)==1
    assert items[0]['kind']=='study' and items[0]['abstract_available']
    assert items[0]['url']=='https://doi.org/10.1234/example'
    assert 'Journal' in items[0]['source']
def test_daily_pick_stable():
    a={'id':'one','kind':'study','url':'https://doi.org/10.1/one','date':'2026-11-22T00:00:00Z','abstract_available':True}
    b={'id':'two','kind':'study','url':'https://doi.org/10.1/two','date':'2026-11-23T00:00:00Z','abstract_available':True}
    first=sd.choose([a,b],None,NOW)
    assert first['id']=='two'
    assert sd.choose([a,b],{'date':'2026-11-23','id':'one'},NOW)['id']=='one'
    assert sd.choose([],None,NOW) is None
