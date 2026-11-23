import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import enrich_studies as E

def test_reconstruct_source_abstract():
    idx={'Whales':[0],'face':[1],'ship':[2],'strikes':[3],'.':[4]}
    assert E.reconstruct_abstract(idx)=='Whales face ship strikes .'
    assert E.reconstruct_abstract(None)==''
    assert E.reconstruct_abstract({'bad':[-2]})==''

def test_valid_doi_matching_and_no_fake_abstract():
    raw={'doi':'https://doi.org/10.1234/wildlife','abstract_inverted_index':{'Wildlife':[0],'habitats':[1],'are':[2],'threatened.':[3]}}
    result=E.retrieve('10.1234/wildlife',lambda url:json.dumps(raw).encode())
    assert result=='Wildlife habitats are threatened.'
    raw['doi']='https://doi.org/10.1234/different'
    assert E.retrieve('10.1234/wildlife',lambda url:json.dumps(raw).encode())==''

def test_clean_translations_and_enrich(tmp_path):
    p=tmp_path/'articles.json'
    paper={'id':'one','kind':'study','url':'https://doi.org/10.1234/paper',
           'title':'Wildlife habitat study','title_de':'Schlechte Übersetzung',
           'abstract_excerpt':'a brief extract','date':'2026-11-23T00:00:00Z'}
    p.write_text(json.dumps({'articles':[paper],'daily_study':{'id':'one','date':'2026-11-23'}}),encoding='utf8')
    abstract=' '.join(['wildlife']*100)
    idx={'wildlife':list(range(100))}
    payload={'doi':'https://doi.org/10.1234/paper','abstract_inverted_index':idx}
    result=E.run(p,lambda url:json.dumps(payload).encode(),limit=2)
    data=json.loads(p.read_text('utf8'))
    a=data['articles'][0]
    assert result['abstracts_added']==1
    assert 'title_de' not in a
    assert len(a['abstract_source_text'])>=200
    assert a['abstract_origin']=='OpenAlex DOI abstract'
