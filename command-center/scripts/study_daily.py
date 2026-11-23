#!/usr/bin/env python3
"""One real scientific study per Hamburg calendar day. Europe PMC core abstracts; no invented findings."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
import json, re, hashlib

ROOT=Path(__file__).resolve().parents[1]
FEED=ROOT/'data/articles.json'
PICK=ROOT/'data/daily_study.json'
TERMS=('elephant','whale','wildlife','biodivers','conserv','habitat','poach','marine mammal','human-wildlife','rhino','species','pangolin','ecolog','animal')
def text_only(raw):
    class Parser(HTMLParser):
        def __init__(self):super().__init__();self.p=[]
        def handle_data(self,data):self.p.append(data)
    p=Parser();p.feed(str(raw or ''))
    return re.sub(r'\s+',' ',unescape(' '.join(p.p))).strip()
def focus(title,abstract):
    t=(title+' '+abstract).casefold()
    topics=[
        (('human-wildlife conflict','human wildlife conflict'),'Konflikte zwischen Menschen und Wildtieren'),
        (('wildlife trafficking','wildlife trade','poaching','poach'),'Wildtierhandel und Wilderei'),
        (('whale','cetacean','marine mammal','dolphin'),'Meeressäuger und ihren Schutz'),
        (('elephant','rhino','pangolin'),'bedrohte Groß- und Wildtiere'),
        (('biodiversity','habitat','conservation','ecosystem'),'Biodiversität und Lebensraumschutz'),
    ]
    return next((label for terms,label in topics if any(w in t for w in terms)),'Wildtier- und Naturschutz')
def summary(title,abstract):
    area=focus(title,abstract)
    a=abstract.casefold()
    methods=[
        (('systematic review','meta-analysis'),'Die Autorinnen und Autoren werten laut Abstract vorhandene Forschung aus.'),
        (('survey','questionnaire'),'Der Abstract nennt eine Befragung.'),
        (('interview',),'Der Abstract nennt Interviews.'),
        (('camera trap','camera-trap'),'Der Abstract nennt Kamerafallen.'),
        (('satellite tracking','satellite telemetry'),'Der Abstract nennt Satellitendaten.'),
        (('modelling','modeling','modelled','modeled'),'Der Abstract nennt eine Modellierung.')
    ]
    method=next((phrase for keys,phrase in methods if any(k in a for k in keys)),'')
    return ('Die Veröffentlichung behandelt '+area+'. '+(method+' ' if method else '')+
            ('Die Einordnung basiert auf dem wissenschaftlichen Abstract. Konkrete Ergebnisse bitte in der Originalstudie prüfen.' if abstract else 'Nur bibliografische Angaben vorhanden; die Ergebnisse wurden nicht geprüft.'))
def get_europe_pmc(now, fetch=None):
    if fetch is None:
        def fetch(u):
            request=Request(u,headers={'User-Agent':'WildlifeCommandCenter/0.4 (public metadata-only research monitor)','Accept':'application/json'})
            with urlopen(request,timeout=22) as r:return r.read(3_000_000)
    since=(now-timedelta(days=45)).date().isoformat()
    qry='(elephant OR whale OR wildlife OR biodiversity OR poaching OR conservation) AND FIRST_PDATE:['+since+' TO '+now.date().isoformat()+']'
    query=urlencode({'query':qry,'format':'json','resultType':'core','pageSize':70,'sort':'P_PDATE_D desc'})
    raw=json.loads(fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+query))
    items=[]
    for work in raw.get('resultList',{}).get('result',[]):
        title=text_only(work.get('title',''))[:230]
        abstract=text_only(work.get('abstractText',''))
        doi=str(work.get('doi') or '').strip()
        if not title or not doi or not abstract or not any(t in title.casefold() for t in TERMS):continue
        date=str(work.get('firstPublicationDate') or work.get('firstIndexDate') or '')[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date):continue
        try:
            published=datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
            if (now-published).days>92 or (published-now).days>2:continue
        except ValueError:continue
        journal=text_only(work.get('journalTitle') or 'Europe PMC')[:100]
        href='https://doi.org/'+quote(doi,safe='/')
        uid=hashlib.sha256((href+'|'+title.casefold()).encode()).hexdigest()[:20]
        items.append({'id':uid,'title':title,'date':date+'T00:00:00Z','url':href,'source':journal or 'Europe PMC',
                      'kind':'study','study_source':'Europe PMC','abstract_available':True,
                      'summary':summary(title,abstract)})
    return items[:30]
def merge_studies(articles, new_studies):
    items={a.get('url'):a for a in articles if a.get('url')}
    for a in new_studies:items[a['url']]=a
    return sorted(items.values(),key=lambda a:a.get('date') or '',reverse=True)[:650]
def choose(items, previous, now):
    today=now.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat()
    studies=[a for a in items if a.get('kind')=='study' and a.get('url','').startswith('https://doi.org/')]
    if not studies:return None
    if isinstance(previous,dict) and previous.get('date')==today and any(a['id']==previous.get('id') for a in studies):
        return previous
    studies.sort(key=lambda a:(not a.get('abstract_available',False),a.get('date') or ''),reverse=False)
    # Prefer studies with abstracts, then most recent; retain pick all day.
    studies.sort(key=lambda a:(bool(a.get('abstract_available')),a.get('date') or ''),reverse=True)
    return {'date':today,'id':studies[0]['id']}
def run(now=None, fetch=None):
    now=now or datetime.now(timezone.utc)
    feed=json.loads(FEED.read_text('utf8'))
    prior=json.loads(PICK.read_text('utf8')) if PICK.exists() else None
    try:
        found=get_europe_pmc(now,fetch)
        feed['articles']=merge_studies(feed.get('articles',[]),found)
        feed.setdefault('sources',[]).append({'name':'Europe PMC – Studien & Abstracts','kind':'study','count':len(found),'ok':True})
        print('Europe PMC studies:',len(found))
    except Exception as exc:
        feed.setdefault('failures',[]).append({'source':'Europe PMC','error':str(exc)[:140]})
        print('Europe PMC temporarily unavailable:',str(exc)[:140])
    selected=choose(feed.get('articles',[]),prior,now)
    feed['daily_study']=selected
    feed['schema_version']=2
    if selected:
        PICK.write_text(json.dumps(selected,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    FEED.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Daily study:',selected)
    return selected
if __name__=='__main__':run()
