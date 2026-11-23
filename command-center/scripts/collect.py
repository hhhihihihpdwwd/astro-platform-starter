#!/usr/bin/env python3
"""Öffentliches Monitoring: RSS/Atom + Crossref. Standardbibliothek, keine API-Keys.

Nur Titel, knappe Teaser, Metadaten und Original-URLs werden gespeichert.
Die Analyse ist heuristisch, sie behauptet keine unabhängige Faktenprüfung.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import email.utils
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
import logging
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parent.parent
OUTPUT = BASE / "data" / "articles.json"
USER_AGENT = "IFAW-Command-Center/0.1 (public-RSS-metadata-monitor; no full articles)"
LOG = logging.getLogger("collect")
MAX_AGE = 92
RSS_SOURCES = [
    {"name": "Bundesumweltministerium – Naturschutz", "kind": "policy", "url": "https://www.bundesumweltministerium.de/natur.rss"},
    {"name": "EU-Kommission – Nachrichten", "kind": "policy", "url": "https://commission.europa.eu/news/feed_en"},
    {"name": "EU-Rat – Pressemitteilungen", "kind": "policy", "url": "https://www.consilium.europa.eu/en/rss/pressreleases.ashx"},
    {"name": "EU-Rat – Umweltrat", "kind": "policy", "url": "https://www.consilium.europa.eu/en/rss/meetings.ashx?cat=envi"},
    {"name": "BBC – Wissenschaft & Umwelt", "kind": "media", "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"},
    {"name": "The Guardian – Environment", "kind": "media", "url": "https://www.theguardian.com/environment/rss"},
    {"name": "Mongabay – Conservation News", "kind": "media", "url": "https://news.mongabay.com/feed/"},
    {"name": "IFAW – öffentliche Meldungen (News-Aggregation)", "kind": "ifaw", "url": "https://news.google.com/rss/search?"+urlencode({"q":"site:ifaw.org/international/news OR site:ifaw.org/de/aktuelles","hl":"en","gl":"US","ceid":"US:en"})},
    {"name": "IFAW – Berichterstattung (News-Aggregation)", "kind": "media", "url": "https://news.google.com/rss/search?"+urlencode({"q":"\"International Fund for Animal Welfare\" OR IFAW wildlife","hl":"en","gl":"US","ceid":"US:en"})},
    {"name": "Wildtierhandel – Medien (News-Aggregation)", "kind": "media", "url": "https://news.google.com/rss/search?"+urlencode({"q":"\"wildlife trafficking\" OR \"illegal wildlife trade\" OR Wildtierhandel","hl":"en","gl":"US","ceid":"US:en"})},
    {"name": "Deutschland – Wildtiere (News-Aggregation)", "kind": "media", "url": "https://news.google.com/rss/search?"+urlencode({"q":"Wildtierschutz OR Artenschutz OR Wildtierhandel","hl":"de","gl":"DE","ceid":"DE:de"})},
]
STUDY_TERMS = ["wildlife trafficking", "human wildlife conflict", "marine mammal conservation", "elephant conservation", "wildlife rescue", "illegal wildlife trade"]
RELEVANT = ["wildlife", "animal", "conserv", "biodivers", "specie", "elephant", "rhino", "whale", "marine", "wildtier", "artenschutz", "naturschutz", "habitat", "cites", "climate", "ocean", "fisher", "ecolog", "wilderness", "environment", "poach", "endangered", "wilderei", "wildtier", "tierschutz", "tierwohl", "tierhandel", "tiertransport", "tierart", "haustier", "wale", "walen", "walarten", "walfang", "waljagd", "nashorn", "elefant", "ozean", "meeres"]

def related_to_wildlife(text: str) -> bool:
    """Thematischer Vorfilter ohne unsichere Teilstrings (z. B. „wal“ in „withdrawal“)."""
    value = (text or '').lower()
    return any(term in value for term in RELEVANT) or bool(re.search(r'(?<![a-zäöüß])(?:wal|tier)(?![a-zäöüß])', value))

class PlainText(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.blocked=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.blocked+=1
        if tag in ('p','br','div','li'):self.parts.append(' ')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.blocked=max(0,self.blocked-1)
    def handle_data(self,data):
        if not self.blocked:self.parts.append(data)

def strip_html(s:str, length:int=270)->str:
    p=PlainText()
    try:p.feed(s or '')
    except Exception:pass
    clean=re.sub(r'\s+',' ',unescape(''.join(p.parts))).strip()
    return clean[:length].rsplit(' ',1)[0].strip() + ('…' if len(clean)>length else '') if len(clean)>length else clean

def parse_date(value:str|None)->str|None:
    if not value:return None
    try:
        d=email.utils.parsedate_to_datetime(value)
    except Exception:
        try:d=datetime.fromisoformat(value.replace('Z','+00:00'))
        except Exception:return None
    if d.tzinfo is None:d=d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace('+00:00','Z')

def childtext(node:ET.Element,*names:str)->str:
    for tag in names:
        child=node.find(tag)
        if child is not None:
            if child.text:return child.text.strip()
            if len(child):return ''.join(child.itertext()).strip()
    return ''

def canonical_link(raw:str)->str|None:
    try:
        p=urlsplit(raw.strip())
        if p.scheme not in ('https','http') or not p.netloc:return None
        # Tracking parameters nicht in der dauerhaften URL speichern.
        from urllib.parse import parse_qsl
        pairs=[(k,v) for k,v in parse_qsl(p.query,keep_blank_values=False) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid','gclid')]
        return urlunsplit((p.scheme,p.netloc,p.path,urlencode(pairs),''))
    except Exception:return None

def make_id(url,title):return hashlib.sha256((url+'|'+title.lower().strip()).encode('utf-8')).hexdigest()[:20]

def parse_feed(payload:bytes,source:dict,now:datetime|None=None)->list[dict]:
    now=now or datetime.now(timezone.utc)
    root=ET.fromstring(payload)
    entries=[]
    if root.tag.lower().endswith('rss') or root.tag.lower().endswith('rdf'):
        entries=root.findall('.//item')
    elif root.tag.lower().endswith('feed'):
        entries=root.findall('{http://www.w3.org/2005/Atom}entry')
    result=[]
    for entry in entries[:75]:
        title=strip_html(childtext(entry,'title','{http://www.w3.org/2005/Atom}title'),220)
        link=childtext(entry,'link')
        if not link:
            for l in entry.findall('{http://www.w3.org/2005/Atom}link'):
                if l.get('rel') in (None,'alternate') and l.get('href'):
                    link=l.get('href','');break
        link=canonical_link(link)
        if not title or not link:continue
        date=parse_date(childtext(entry,'pubDate','{http://www.w3.org/2005/Atom}updated','{http://www.w3.org/2005/Atom}published','{http://purl.org/dc/elements/1.1/}date'))
        if date:
            age=(now-datetime.fromisoformat(date.replace('Z','+00:00'))).total_seconds()/86400
            if age>MAX_AGE or age < -2:continue
        summary=strip_html(childtext(entry,'description','{http://www.w3.org/2005/Atom}summary','{http://www.w3.org/2005/Atom}content','{http://purl.org/rss/1.0/modules/content/}encoded'),250)
        # Weiche Filter für breite Feeds. IFAW, spezielle Such-Feeds und Fachmedien immer aufnehmen.
        searchable=(title+' '+summary).lower()
        if source['kind'] != 'ifaw' and not related_to_wildlife(searchable):continue
        result.append({'id':make_id(link,title),'title':title,'url':link,'date':date,'summary':summary,'source':source['name'],'kind':source['kind']})
    return result

def request(url:str,timeout:int=14)->bytes:
    rq=Request(url,headers={'User-Agent':USER_AGENT,'Accept':'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml;q=.9, */*;q=.5'})
    with urlopen(rq,timeout=timeout) as resp:
        data=resp.read(3_000_001)
        if len(data)>3_000_000:raise ValueError('Quellenantwort zu groß (>3 MB)')
        return data

def crossref_query(term:str,now:datetime)->list[dict]:
    lower=(now-timedelta(days=42)).date().isoformat()
    parameters={'query.title':term,'rows':'12','sort':'published','order':'desc','filter':f'from-pub-date:{lower},type:journal-article','select':'DOI,title,container-title,published,created,type,publisher'}
    raw=json.loads(request('https://api.crossref.org/works?'+urlencode(parameters)))
    out=[]
    for work in raw.get('message',{}).get('items',[]):
        ttl=(work.get('title') or [''])[0].strip();doi=work.get('DOI','')
        if not ttl or not doi:continue
        # Crossref-Suche ist unscharf; mindestens ein Bezug zu Tier-/Naturschutz nötig.
        if not any(s in (ttl+' '+term).lower() for s in RELEVANT):continue
        pub=work.get('published') or work.get('created') or {}
        parts=pub.get('date-parts') or []
        date=None
        if parts:
            y=parts[0];date=f"{y[0]:04d}-{(y[1] if len(y)>1 else 1):02d}-{(y[2] if len(y)>2 else 1):02d}T00:00:00Z"
        if date and (now-datetime.fromisoformat(date.replace('Z','+00:00'))).days>MAX_AGE:continue
        journal=(work.get('container-title') or [''])[0]
        out.append({'id':make_id('https://doi.org/'+doi,ttl),'title':strip_html(ttl,230),'url':'https://doi.org/'+quote(doi,safe='/'),'date':date,'summary':'Bibliografischer Eintrag (Crossref); Ergebnisse, Methodik und Peer-Review-Status wurden nicht geprüft.','source':strip_html(journal,110) or 'Crossref','kind':'study'})
    return out

def merge(current:list[dict],new:list[dict],now:datetime)->list[dict]:
    combined={}
    for a in current+new:
        if not isinstance(a,dict) or not a.get('title') or not canonical_link(a.get('url','')):continue
        if a.get('kind') != 'ifaw' and not related_to_wildlife(str(a.get('title', '')) + ' ' + str(a.get('summary', ''))):
            continue
        date=a.get('date')
        if date:
            try:
                age=(now-datetime.fromisoformat(date.replace('Z','+00:00'))).total_seconds()/86400
                if age>MAX_AGE or age < -2:continue
            except Exception:pass
        key=re.sub(r'[^\w]+','',a['title'].casefold())[:150]
        if not key:key=a['id']
        if key not in combined or (new and a in new):
            previous=combined.get(key)
            # Preserve costly offline translations only when source content is identical.
            if previous and previous.get('title')==a.get('title'):
                for field in ('abstract_source_text','abstract_origin','abstract_unavailable'):
                    if previous.get(field):a[field]=previous[field]
            combined[key]=a
    return sorted(combined.values(),key=lambda a:a.get('date') or '',reverse=True)[:650]

def run(out:Path=OUTPUT,request_fn=request,now:datetime|None=None)->dict:
    now=now or datetime.now(timezone.utc)
    try:old=json.loads(out.read_text('utf-8'))
    except (FileNotFoundError,json.JSONDecodeError):old={'articles':[],'generated_at':None}
    fresh=[];status=[];failures=[];ok_count=0
    for src in RSS_SOURCES:
        try:
            items=parse_feed(request_fn(src['url']),src,now)
            fresh+=items;status.append({'name':src['name'],'kind':src['kind'],'count':len(items),'ok':True});ok_count+=1
            LOG.info('%s: %s Einträge',src['name'],len(items))
        except (HTTPError,URLError,TimeoutError,ValueError,ET.ParseError,OSError) as ex:
            error=str(ex)[:180];status.append({'name':src['name'],'kind':src['kind'],'count':0,'ok':False});failures.append({'source':src['name'],'error':error});LOG.warning('Feed %s: %s',src['name'],error)
    for term in STUDY_TERMS:
        name='Crossref: '+term
        try:
            items=crossref_query_with(request_fn,term,now)
            fresh+=items;status.append({'name':name,'kind':'study','count':len(items),'ok':True});ok_count+=1
        except (HTTPError,URLError,TimeoutError,ValueError,KeyError,json.JSONDecodeError,OSError) as ex:
            error=str(ex)[:180];status.append({'name':name,'kind':'study','count':0,'ok':False});failures.append({'source':name,'error':error});LOG.warning('Crossref %s: %s',term,error)
    if ok_count>0:created=now.isoformat().replace('+00:00','Z')
    else:created=old.get('generated_at')
    data={'schema_version':1,'generated_at':created,'articles':merge(old.get('articles',[]),fresh,now),'sources':status,'failures':failures,'events':[],'notice':'Automatisierte Quellensammlung. Keine Vollständigkeits- oder unabhängige Faktenprüfungs-Garantie.'}
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    LOG.info('Gesamt %s Meldungen; %s Quellen ok, %s Fehler',len(data['articles']),ok_count,len(failures))
    return data

def crossref_query_with(get,term,now):
    lower=(now-timedelta(days=42)).date().isoformat()
    params={'query.title':term,'rows':'12','sort':'published','order':'desc','filter':f'from-pub-date:{lower},type:journal-article','select':'DOI,title,container-title,published,created,type,publisher'}
    raw=json.loads(get('https://api.crossref.org/works?'+urlencode(params)))
    out=[]
    for work in raw.get('message',{}).get('items',[]):
        title=(work.get('title') or [''])[0].strip();doi=work.get('DOI','')
        if not title or not doi:continue
        # Suchergebnis nicht automatisch als bestätigtes Studienergebnis verstehen.
        if not any(s in title.lower() for s in RELEVANT):continue
        pub=work.get('published') or work.get('created') or {}
        parts=pub.get('date-parts') or []
        date=None
        if parts:
            y=parts[0];date=f"{y[0]:04d}-{(y[1] if len(y)>1 else 1):02d}-{(y[2] if len(y)>2 else 1):02d}T00:00:00Z"
        if date and (now-datetime.fromisoformat(date.replace('Z','+00:00'))).days>MAX_AGE:continue
        journal=(work.get('container-title') or [''])[0]
        out.append({'id':make_id('https://doi.org/'+doi,title),'title':strip_html(title,230),'url':'https://doi.org/'+quote(doi,safe='/'),'date':date,'summary':'Bibliografischer Eintrag (Crossref); Ergebnisse, Methodik und Peer-Review-Status wurden nicht geprüft.','source':strip_html(journal,110) or 'Crossref','kind':'study'})
    return out

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=OUTPUT);parser.add_argument('--verbose',action='store_true');args=parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,format='%(levelname)s %(message)s')
    run(args.output)
