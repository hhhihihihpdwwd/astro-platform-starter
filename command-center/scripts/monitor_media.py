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
    {'name':'IFAW · internationale offizielle Pressemitteilungen','locale':'en','region':'US',
     'scope':'official','query':'site:ifaw.org ("International Fund for Animal Welfare" OR IFAW) when:30d'},
    {'name':'IFAW · deutscher Medienmarkt','locale':'de','region':'DE',
     'scope':'germany','query_hint':'brand','query':'("IFAW" OR "International Fund for Animal Welfare" OR "Internationaler Tierschutz-Fonds") when:30d'},
    {'name':'IFAW · Elfenbein/Artenschutz im deutschen Medienmarkt','locale':'de','region':'DE',
     'scope':'germany','query_hint':'brand','query':'IFAW (Elfenbein OR Artenschutz OR Wildtierhandel OR Tierschutz) when:30d'},
    {'name':'IFAW · deutsches Team in deutschen Medien','locale':'de','region':'DE',
     'scope':'germany','query':'("Andreas Dinkelmeyer" OR "Robert Kless") when:30d'},
    {'name':'IFAW · internationales Team in deutschen Medien','locale':'de','region':'DE',
     'scope':'germany','query':'("Azzedine Downes" OR "Matt Collis" OR "Ilaria Di Silvestre") when:30d'},
]
# Strict source restrictions: a German search locale alone does not prove
# that an outlet belongs to the German media market.
DE_PUBLISHER_HINTS=(
    'die zeit','zeit online','spiegel','süddeutsche','sueddeutsche','tagesschau','ard','zdf',
    'deutschlandfunk','ndr','wdr','rbb','swr','mdr','br24','bayerischer rundfunk',
    'faz','frankfurter allgemeine','frankfurter rundschau','welt','bild','focus online',
    'rtl','stern','t-online','n-tv','ntv','dpa','deutsche presse-agentur',
    'hamburger abendblatt','berliner morgenpost','tagesspiegel','petbook',
    'kölner stadt-anzeiger','koelner stadt-anzeiger','watson.de',
    'bunte','morgenpost','abendzeitung','redaktionsnetzwerk deutschland','rnd',
    'westdeutsche zeitung','lokale zeitung'
)
def official_ifaw(publisher:str,source_url:str='')->bool:
    from urllib.parse import urlsplit
    host=urlsplit(source_url).hostname or ''
    if host=='ifaw.org' or host.endswith('.ifaw.org'):return True
    p=normalized(publisher)
    return p=='ifaw' or p.startswith('international fund for animal welfare') or p.startswith('internationaler tierschutz-fonds')

def german_publisher(publisher:str,source_url:str='')->bool:
    from urllib.parse import urlsplit
    host=(urlsplit(source_url).hostname or '').lower()
    if host.endswith('.de'):return True
    if host.endswith(('.faz.net','.t-online.com','.spiegel.de','.welt.de','.tagesschau.de')):return True
    p=normalized(publisher)
    return any(hint in p for hint in DE_PUBLISHER_HINTS)

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

def parse_monitor_rss(payload:bytes,now:datetime,scope:str='germany',query_hint:str='')->list[dict]:
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
        # German Google News can index IFAW mentions in article bodies even when
        # the headline does not include IFAW. Keep these as *unverified search hits*.
        inferred=not matches and scope=='germany' and query_hint=='brand'
        if inferred:matches=['ifaw']
        if not matches:continue
        node=row.find('source')
        publisher=strip_html(node.text if node is not None else '',95)
        source_url=canonical_link(node.get('url','')) if node is not None else None
        if not publisher:
            publisher=title.rsplit(' - ',1)[-1] if ' - ' in title else 'Google News'
        owner=official_ifaw(publisher,source_url or '')
        german=not owner and german_publisher(publisher,source_url or '')
        if scope=='official' and not owner:continue
        if scope=='germany' and not (german or owner):continue
        record={
            'id':make_id(url,title),'title':title,'url':url,'date':date,
            'date_type':'aggregator','source':publisher,'kind':'monitor',
            'profiles':matches,
            'origin':'IFAW-eigene Meldung' if owner else 'Externe Berichterstattung',
            'market':'International · IFAW' if owner else 'Deutschland',
            'match_type':'Suchindex-Treffer' if inferred else 'Schlagzeilen-Nennung',
            'publisher_url':source_url or '',
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
        indexed=a.get('match_type')=='Suchindex-Treffer' and a.get('collected_via')=='Google News RSS'
        if not matches and indexed:matches=['ifaw']
        if not matches:continue
        owner=official_ifaw(a.get('source',''),a.get('publisher_url',''))
        if not owner and not german_publisher(a.get('source',''),a.get('publisher_url','')):continue
        a={**a,'profiles':matches,'date_type':'aggregator',
           'origin':'IFAW-eigene Meldung' if owner else 'Externe Berichterstattung',
           'market':'International · IFAW' if owner else 'Deutschland'}
        # Use original article address as primary key, not search query.
        # IFAW's same official press release may be returned by multiple Google News searches.
        # Collapse exact official headline duplicates; keep independent German outlets distinct.
        key=('ifaw-official:'+normalized(a['title'])) if owner else a['url'].lower().split('#')[0].rstrip('/')
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
            matches=parse_monitor_rss(get(google_url(item)),now,item['scope'],item.get('query_hint',''))
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
          'notice':'Deutsche Medienberichte zu IFAW und öffentlich zuordenbare internationale IFAW-Eigenmeldungen. Marktzuordnung über bekannte deutsche Medienhäuser / Publisher-URLs; Treffer können fehlen. Nur Google-News-Zeitstempel, kein Volltext, keine vollständige Medienabdeckung.'}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    LOG.info('Monitoring %s Artikel, %s Feed(s) erfolgreich, %s Fehler',len(rows),successes,len(errors))
    return data

if __name__=='__main__':
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(message)s')
    run()
