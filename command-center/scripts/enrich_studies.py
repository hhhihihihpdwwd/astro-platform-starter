#!/usr/bin/env python3
"""Fetch *source* abstracts for study-of-the-day via OpenAlex; no AI claims or invented findings."""
from __future__ import annotations
import json
import re
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request,urlopen

DATA=Path(__file__).resolve().parents[1]/'data'/'articles.json'
MAX_ABSTRACT=3500
def reconstruct_abstract(inverted):
    if not isinstance(inverted,dict) or not inverted:return ''
    words={}
    for token,indices in inverted.items():
        if not isinstance(token,str) or not isinstance(indices,list):continue
        for i in indices:
            if isinstance(i,int) and 0<=i<900:words[i]=token
    if not words:return ''
    seq=[words.get(i,'') for i in range(max(words)+1)]
    return re.sub(r'\s+',' ',' '.join(seq)).strip()[:MAX_ABSTRACT]

def retrieve(doi,fetch=None):
    if fetch is None:
        def fetch(u):
            request=Request(u,headers={'User-Agent':'WildlifeCommandCenter/0.6 (public-study-abstract-metadata)','Accept':'application/json'})
            with urlopen(request,timeout=12) as r:return r.read(1500000)
    endpoint='https://api.openalex.org/works/https://doi.org/'+quote(doi,safe='/')
    info=json.loads(fetch(endpoint))
    canonical=str(info.get('doi') or '').lower().rstrip('/')
    if canonical!='https://doi.org/'+doi.lower().rstrip('/'):return ''
    return reconstruct_abstract(info.get('abstract_inverted_index'))

def enrich(feed,fetch=None,limit=8):
    rows=feed.get('articles',[])
    chosen=feed.get('daily_study') or {}
    papers=[a for a in rows if a.get('kind')=='study' and a.get('url','').startswith('https://doi.org/')]
    papers.sort(key=lambda a:(a.get('id')!=chosen.get('id'),not bool(a.get('extended_summary')),a.get('date') or ''))
    attempted=added=0
    for a in papers:
        # Abstract excerpts already obtained from Europe PMC are source material,
        # but we prefer the full abstract when available.
        if len(a.get('abstract_source_text') or '')>=300:continue
        if a.get('abstract_unavailable'):continue
        if attempted>=limit:break
        attempted+=1
        doi=a['url'].removeprefix('https://doi.org/')
        try:
            abstract=retrieve(doi,fetch)
        except Exception as exc:
            print('OpenAlex could not enrich '+doi+': '+str(exc)[:110])
            continue
        if len(abstract)<200:
            abstract=(a.get('abstract_excerpt') or '').strip()
        if len(abstract)>=200:
            a['abstract_source_text']=abstract[:MAX_ABSTRACT]
            a['abstract_origin']='OpenAlex DOI abstract' if len(abstract)>(len(a.get('abstract_excerpt') or '')) else 'Europe PMC abstract excerpt'
            added+=1
        else:a['abstract_unavailable']=True
    return {'attempted':attempted,'abstracts_added':added}

def run(path=DATA,fetch=None,limit=8):
    path=Path(path)
    data=json.loads(path.read_text('utf8'))
    result=enrich(data,fetch,limit)
    if result['attempted']:path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Source abstracts:',result)
    return result

if __name__=='__main__':run()
