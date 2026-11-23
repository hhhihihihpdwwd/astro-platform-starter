#!/usr/bin/env python3
"""Offline English->German title and brief excerpt translation with Argos Translate.
Only source excerpts, no article full text and no external translation requests.
Original headlines/descriptions remain untouched. Translation is explicitly labelled.
"""
from __future__ import annotations
from pathlib import Path
import argparse,json,re,os
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'/'articles.json'
GERMAN_SOURCES=('Bundesumweltministerium','Deutschland – Wildtiere')
GERMAN_CUES=(' der ',' die ',' das ',' den ',' dem ',' des ',' und ',' für ',' über ',' in deutschland ',' gegen ',' schutz ',' neue ',' neuen ',' eu-')
MAX_PER_RUN=120

def likely_german(item):
    if any(str(item.get('source','')).startswith(s) for s in GERMAN_SOURCES):return True
    t=' '+str(item.get('title','')).casefold()+' '
    # German umlauts are a strong hint, avoiding 'Umlauts = translation' on uncommon English texts.
    if any(x in t for x in ('ä','ö','ü','ß')):return True
    return sum(t.count(w) for w in GERMAN_CUES)>=2

def needs_translation(a):
    if not a.get('title'):return False
    if likely_german(a):return not a.get('title_de')
    return not a.get('title_de') or (a.get('summary') and not a.get('summary_de'))

def translate_text(translator,text):
    value=str(text or '').strip()
    if not value:return ''
    try:
        output=translator.translate(value)
        # If a translation unexpectedly drops numerals, preserve the original field.
        before=re.findall(r'\b\d+(?:[.,]\d+)?\b',value)
        after=re.findall(r'\b\d+(?:[.,]\d+)?\b',output)
        if before and any(number not in after for number in before):return value
        return output if output and output.strip() else value
    except Exception:return value

def load_model():
    import argostranslate.package as package
    import argostranslate.translate as translate
    def lookup():
        ls=translate.get_installed_languages()
        e=next((l for l in ls if l.code=='en'),None)
        d=next((l for l in ls if l.code=='de'),None)
        if e and d:
            try:return e.get_translation(d)
            except Exception:return None
        return None
    engine=lookup()
    if engine:return engine
    package.update_package_index()
    matches=[p for p in package.get_available_packages() if p.from_code=='en' and p.to_code=='de']
    if not matches:raise RuntimeError('Argos en→de model missing')
    package.install_from_path(matches[-1].download())
    engine=lookup()
    if engine is None:raise RuntimeError('Argos en→de failed to install')
    return engine

def run(file=DATA,translator=None,max_items=MAX_PER_RUN):
    data=json.loads(Path(file).read_text('utf8'))
    articles=data.get('articles',[])
    pending=[a for a in articles if needs_translation(a)]
    if not pending:return {'translated':0,'pending':0,'changed':False}
    # Most relevant, recent titles first. Stable sorting among equal dates.
    pending.sort(key=lambda a:a.get('date') or '',reverse=True)
    if translator is None and any(not likely_german(a) for a in pending[:max_items]):
        translator=load_model()
    done=0
    for item in pending[:max_items]:
        source_german=likely_german(item)
        item['title_de']=str(item.get('title') or '') if source_german else translate_text(translator,item.get('title'))
        item['summary_de']=str(item.get('summary') or '') if source_german else translate_text(translator,item.get('summary'))
        item['translation_status']='original' if source_german else 'maschinell'
        item['translated_at']=datetime.now(timezone.utc).isoformat()
        done+=1
    data['translation_updated_at']=datetime.now(timezone.utc).isoformat()
    Path(file).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    return {'translated':done,'pending':len(pending)-done,'changed':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--limit',type=int,default=MAX_PER_RUN)
    args=parser.parse_args()
    if args.check:
        data=json.loads(DATA.read_text('utf8'))
        pending=sum(1 for a in data.get('articles',[]) if needs_translation(a))
        print('Translation pending:',pending)
        if os.getenv('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'],'a') as f:f.write(f'needed={"true" if pending else "false"}\n')
    else:
        print(run(max_items=args.limit))
