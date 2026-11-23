import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import translate_articles as T

class Fake:
    def translate(self,s):
        return {'Elephant protection':'Schutz der Elefanten',
                'Wildlife populations at risk':'Wildtierbestände sind gefährdet',
                'Study of wildlife':'Studie über Wildtiere',
                'A survey of wildlife communities':'Eine Befragung von Wildtiergemeinschaften'}.get(s,s)

def test_offline_translate_preserves_original(tmp_path):
    path=tmp_path/'articles.json'
    items=[
        {'id':'a','title':'Elephant protection','summary':'Wildlife populations at risk','source':'BBC','kind':'media'},
        {'id':'b','title':'Studie über Wale und Meeresschutz','summary':'Offizieller Text','source':'Bundesumweltministerium – Naturschutz','kind':'policy'},
        {'id':'c','title':'Study of wildlife','summary':'A survey of wildlife communities','abstract_excerpt':'A survey of wildlife communities','source':'Journal','kind':'study'}
    ]
    path.write_text(json.dumps({'articles':items}),encoding='utf8')
    result=T.run(path,translator=Fake(),max_items=10)
    obj=json.loads(path.read_text('utf8'))
    assert result['translated']==3
    assert obj['articles'][0]['title']=='Elephant protection'
    assert obj['articles'][0]['title_de']=='Schutz der Elefanten'
    assert obj['articles'][0]['translation_status']=='maschinell'
    assert obj['articles'][1]['title_de']==obj['articles'][1]['title']
    assert obj['articles'][1]['translation_status']=='original'
    assert obj['articles'][2]['abstract_excerpt_de']=='Eine Befragung von Wildtiergemeinschaften'
    assert T.run(path,translator=Fake())['pending']==0

def test_numbers_are_preserved_on_bad_translation():
    class Bad:
        def translate(self,text):return 'ohne Zahl'
    assert T.translate_text(Bad(),'12 elephants protected')=='12 elephants protected'
