#!/usr/bin/env python3
"""Public, limited-scope IFAW press monitoring via free Google News RSS search feeds.
No article scraping, private personnel directories, paid sources or promises of completeness.
"""
from __future__ import annotations
import json
import logging
import re
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree as ET
from collect import canonical_link, make_id, request, parse_date, strip_html

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data/monitoring.json'
LOG=logging.getLogger('monitor_media')
MAX_DAYS=45
PUBLIC_PROFILES=[
    {'id':'ifaw','label':'IFAW','category':'organization',
     'terms':['IFAW']},
    {'id':'full','label':'International Fund for Animal Welfare','category':'organization',
     'terms':['International Fund for Animal Welfare']},
    {'id':'germany','label':'IFAW Deutschland / Internationaler Tierschutz-Fonds','category':'organization',
     'terms':['IFAW Deutschland','Internationaler Tierschutz-Fonds']},
    {'id':'andreas','label':'Andreas Dinkelmeyer','category':'public_team',
     'terms':['Andreas Dinkelmeyer']},
    {'id':'robert','label':'Robert Kless','category':'public_team',
     'terms':['Robert Kless']},
    {'id':'azzedine','label':'Azzedine Downes','category':'public_team',
     'terms':['Azzedine Downes']},
    {'id':'matt','label':'Matt Collis','category':'public_team',
     'terms':['Matt Collis']},
    {'id':'ilaria','label':'Ilaria Di Silvestre','category':'public_team',
     'terms':['Ilaria Di Silvestre']},
]
# Queries intentionally grouped to reduce free-provider pressure.
SEARCHES=[
    {'name':'IFAW · internationales Presseecho','locale':'en','region':'US',
     'query':'("International Fund for Animal Welfare" OR IFAW) when:14d'},
    {'name':'IFAW · Deutschland','locale':'de','region':'DE',
     'query':'("IFAW Deutschland" OR "Internationaler Tierschutz-Fonds" OR IFAW) when:14d'},
    {'name':'IFAW · deutsches Team','locale':'de','region':'DE',
     'query':'("Andreas Dinkelmeyer" OR "Robert Kless") when:30d'},
    {'name':'IFAW · internationales Team','locale':'en','region':'US',
     'query':'("Azzedine Downes" OR "Matt Collis" OR "Ilaria Di Silvestre") when:30d'},
]
def normalized(s:str)->str:
    return re.sub(r'\s+',' ',(s or '')).casefold().strip()

def matched_profiles(title:str)->list[str]:
    # Search query alone does not prove a hit. Only exact names / full acronyms in headline count.
    title=normalized(title)
    result=[]
    for profile in PUBLIC_PROFILES:
        for term in profile['terms']:
            token=normalized(term)
            if token=='ifaw':
                matched=bool(re.search(r'(?<![a-z0-9])ifaw(?![a-z0-9])',title))
            else:matched=token in title
            if matched:result.append(profile['id']);break
    return result

def google_url(profile:dict)->str:
    gl=profile['region'];hl=profile['locale']
    params=urlencode({'q':profile['query'],'hl':hl,'gl':gl,'ceid':gl+':'+hl})
    return 'https://news.google.com/rss/search?'+params

def parse_monitor_rss(payload:bytes,now:datetime)->list[dict]:
    root=ET.fromstring(payload)
    out=[]
    for row in root.findall('.//item')[:100]:
        title=strip_html(row.findtext('title') or '',230)
        url=canonical_link(row.findtext('link') or '')
        date=parse_date(row.findtext('pubDate'))
        if not title or not url or not date:continue
        pub=datetime.fromisoformat(date.replace('Z','+00:00'))
        if (now-pub).total_seconds()>MAX_DAYS*86400 or pub>now+timedelta(hours=2):continue
        matches=matched_profiles(title)
        if not matches:continue
        publisher=strip_html(row.findtext('source') or '',95)
        if not publisher:
            publisher=title.rsplit(' - ',1)[-1] if ' - ' in title else 'Google News'
        owner=bool(re.search(r'(?i)\bIFAW\b|ifaw\.org',publisher))
        record={
            'id':make_id(url,title),'title':title,'url':url,'date':date,
            'date_type':'aggregator','source':publisher,'kind':'monitor',
            'profiles':matches,'origin':'IFAW-eigene Meldung' if owner else 'Externe Berichterstattung',
            'summary':'','collected_via':'Google News RSS'
        }
        out.append(record)
    return out

def merge(current:list[dict],fresh:list[dict],now:datetime)->list[dict]:
    merged={}
    for a in list(current)+list(fresh):
        if not isinstance(a,dict) or not a.get('title') or not canonical_link(a.get('url','')):continue
        date=a.get('date')
        try:
            dt=datetime.fromisoformat(date.replace('Z','+00:00'))
            if dt>now+timedelta(hours=2) or (now-dt).days>MAX_DAYS:continue
        except (TypeError,AttributeError,ValueError):continue
        matches=matched_profiles(a['title'])
        if not matches:continue
        a={**a,'profiles':matches,'date_type':'aggregator'}
        # Use original article address as primary key, not search query.
        key=a['url'].lower().split('#')[0].rstrip('/')
        prev=merged.get(key)
        if not prev or dt>datetime.fromisoformat(prev['date'].replace('Z','+00:00')):merged[key]=a
    return sorted(merged.values(),key=lambda a:a.get('date') or '',reverse=True)[:480]

def run(output:Path=DEST,get=request,now:datetime|None=None)->dict:
    now=now or datetime.now(timezone.utc)
    try:old=json.loads(output.read_text('utf8'))
    except (FileNotFoundError,json.JSONDecodeError):old={}
    fresh=[];sources=[];errors=[];successes=0
    for item in SEARCHES:
        try:
            matches=parse_monitor_rss(get(google_url(item)),now)
            fresh.extend(matches)
            sources.append({'name':item['name'],'ok':True,'count':len(matches)})
            successes+=1
        except (Exception) as exc:
            errors.append({'source':item['name'],'error':str(exc)[:180]})
            sources.append({'name':item['name'],'ok':False,'count':0})
            LOG.warning('Media monitoring source %s: %s',item['name'],exc)
    rows=merge(old.get('articles',[]),fresh,now)
    data={'schema_version':1,'checked_at':now.isoformat().replace('+00:00','Z'),
          'last_successful_at':now.isoformat().replace('+00:00','Z') if successes else old.get('last_successful_at'),
          'articles':rows,'profiles':PUBLIC_PROFILES,'sources':sources,'failures':errors,
          'notice':'Ausschnitt aus öffentlich indexierten Treffern; keine vollständige Medienabdeckung, kein Volltextzugriff. Google-News-Zeitstempel können von der Originalveröffentlichung abweichen.'}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    LOG.info('Monitoring %s Artikel, %s Feed(s) erfolgreich, %s Fehler',len(rows),successes,len(errors))
    return data

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    run()
