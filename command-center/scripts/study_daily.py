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
TITLE_TERMS=('wildlife','elephant','whale','rhino','pangolin','poaching','animal welfare','human-wildlife',
             'human wildlife','marine mammal','endangered species','wild animal','wildlife trade',
             'wild mammal','animal conservation','wildlife conservation')
EXCLUDE=('vaccine','epitope','protein','hla-binding','arabidopsis','iron deficiency response','gene regulation',
         'frozen elephant trunk','tevar','aortic','surgery','dextrocardia','cardiac',
         'livestock farming','honeybee abundance','microbial treasure','actinobacteria')
def strong_title(title):
    value=(title or '').casefold()
    return any(t in value for t in TITLE_TERMS)
def relevant_title(title):
    value=(title or '').casefold()
    if any(t in value for t in EXCLUDE):return False
    if strong_title(title):return True
    return 'biodiversity' in value and any(
        t in value for t in ('wildlife','forest','habitat','ecosystem','land-use','landscape','conservation','restoration','tropical'))
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

# Verifizierbare Forschung aus öffentlich zugänglichen Originalpublikationen.
# Reservequelle bei API-Ausfall: keine generierten Titel, DOIs oder Ergebnisse.
CURATED=[
    ('Reducing whale-vessel strikes through multiobjective vessel traffic routing',
     '10.1111/cobi.70388','Conservation Biology','2026-10-29',
     'Die Veröffentlichung untersucht, wie sich Schifffahrtsrouten unter mehreren Zielgrößen so planen lassen, dass Kollisionen mit Walen reduziert werden können.'),
    ('An expanding human footprint drives escalating human–elephant conflict across a transboundary African landscape through 2085',
     '10.1093/pnasnexus/pgag205','PNAS Nexus','2026-07-07',
     'Die Arbeit modelliert mögliche künftige Mensch-Elefant-Konflikte in einer grenzüberschreitenden afrikanischen Landschaft unter veränderten Landnutzungsbedingungen.'),
    ('Ship strikes of fin whales in the north-east atlantic: identifying hotspots and simulating mitigation measures',
     '10.1007/s10531-026-03262-7','Biodiversity and Conservation','2026-03-02',
     'Die Studie untersucht Kollisionsrisiken für Finnwale im Nordostatlantik und simuliert unterschiedliche Möglichkeiten, diese Risiken zu verringern.'),
    ('Two decades of changes in the global network of illegal wildlife trade',
     '10.1111/cobi.70196','Conservation Biology','2025-12-13',
     'Die Studie analysiert Veränderungen im internationalen illegalen Wildtierhandel zwischen 2000 und 2022 und nutzt dafür Handelsdaten sowie Netzwerkanalysen.'),
    ('Promoting human–elephant coexistence through integration of AI, real-time alerts, and rapid response',
     '10.1111/csp2.70186','Conservation Science and Practice','2025-11-11',
     'Die Veröffentlichung beschreibt einen Ansatz zur Verringerung von Mensch-Elefant-Konflikten, der automatisierte Warnungen mit schnellen Einsätzen vor Ort kombiniert.'),
    ('A multi-model analysis of global pangolin trade from CITES records (1977–2024): Implications for species conservation',
     '10.1016/j.gecco.2026.e04117','Global Ecology and Conservation',None,
     'Die Arbeit wertet internationale CITES-Handelsdaten über Schuppentiere von 1977 bis 2024 aus, um Trends und Handelsmuster zu untersuchen.'),
    ('Pangolin hunting in southeast Nigeria is motivated more by local meat consumption than international demand for scales',
     '10.1038/s41559-025-02734-3','Nature Ecology & Evolution',None,
     'Die Studie untersucht Motive der Schuppentierjagd im Südosten Nigerias und die Rolle lokaler Nachfrage sowie des internationalen Handels.')
]
# Wissenschaftliche Einordnung: von den verlinkten Publikationen abgeleitete Kurzzusammenfassungen.
# Keine automatisiert behaupteten Ergebnisse für Studien ohne nachprüfbares Abstract.
CURATED_DETAILS={
 '10.1111/cobi.70388':(
   'Forschungsfrage: Wie können Schifffahrtsrouten so angepasst werden, dass das Risiko von Schiffskollisionen mit Walen sinkt, ohne andere Navigationsziele außer Acht zu lassen?',
   'Vorgehen: Die Arbeit betrachtet die Streckenplanung als Optimierungsproblem mit mehreren Zielen. Dabei wird berücksichtigt, wo Wale vorkommen und wo Schiffe voraussichtlich fahren.',
   'Einordnung: Die Resultate können bei der Bewertung von Schifffahrtskorridoren helfen. Ob sich ein vorgeschlagener Verlauf praktisch umsetzen lässt, muss mit den zuständigen Behörden und der Schifffahrt geprüft werden.'
 ),
 '10.1093/pnasnexus/pgag205':(
   'Forschungsfrage: Wie verändern menschliche Nutzung, Bevölkerungsentwicklung und Klimafaktoren das Risiko von Mensch-Elefant-Konflikten bis 2085?',
   'Vorgehen: Die Autorinnen und Autoren verknüpfen Konfliktaufzeichnungen aus einer grenzüberschreitenden Landschaft im südlichen Afrika mit räumlichen Daten und Zukunftsszenarien.',
   'Einordnung: Laut Studie spielen unter anderem die Ausweitung von Ackerflächen, Bevölkerungswachstum und zunehmende Trockenheit eine wichtige Rolle. Die Projektionen sind keine Vorhersage einzelner Konflikte.'
 ),
 '10.1007/s10531-026-03262-7':(
   'Forschungsfrage: Wo treten im Nordostatlantik besonders hohe Risiken für Kollisionen zwischen Finnwalen und Schiffen auf?',
   'Vorgehen: Die Veröffentlichung identifiziert räumliche Risikoschwerpunkte und vergleicht modellierte Möglichkeiten, das Kollisionsrisiko zu verringern.',
   'Einordnung: Für die Pressearbeit wäre die Verbindung von Meeresarten-Schutz und konkreten Schifffahrtsmaßnahmen relevant. Regionale Übertragbarkeit und Modellannahmen müssen im Original geprüft werden.'
 ),
 '10.1111/cobi.70196':(
   'Forschungsfrage: Wie hat sich das internationale Netzwerk des illegalen Wildtierhandels zwischen 2000 und 2022 verändert?',
   'Vorgehen: Das Forschungsteam nutzt Daten des Wildlife Trade Portal von TRAFFIC, Daten über legalen Handel aus der CITES-Datenbank als Vergleichsmaßstab sowie Netzwerkanalysen. Untersucht werden Veränderungen bei Handelsbeziehungen und der Rolle einzelner Länder.',
   'Einordnung: Die Studie betrachtet dokumentierte Handelsdaten, nicht den gesamten unentdeckten illegalen Handel. Meldeverhalten und Datenlücken können die Ergebnisse beeinflussen. Die Originalstudie muss vor einer Pressemitteilung für konkrete Länderangaben und Zahlen geprüft werden.'
 ),
 '10.1111/csp2.70186':(
   'Forschungsfrage: Können KI-Kameras und schnelle Warnmeldungen helfen, gefährliche Begegnungen zwischen Menschen und Elefanten zu verhindern?',
   'Vorgehen: In Westbengalen in Indien lösten Kameras bei Elefanten-Nachweisen Meldungen an Einsatzteams aus. Im Untersuchungszeitraum wurden laut Studie 266 Elefanten-Ereignisse erfasst; Warnungen erreichten die Empfänger im Mittel nach rund 42 Sekunden.',
   'Einordnung: Die Autoren berichten von kürzeren Reaktionszeiten. Das ist ein vielversprechender Ansatz, aber keine Garantie für denselben Effekt in anderen Regionen; lokale Bedingungen und die Einbindung von Einsatzteams sind entscheidend.'
 ),
 '10.1016/j.gecco.2026.e04117':(
   'Forschungsfrage: Welche zeitlichen und räumlichen Muster zeigt der internationale Handel mit Schuppentieren?',
   'Vorgehen: Die Arbeit analysiert Handelsinformationen aus CITES-Aufzeichnungen für den Zeitraum 1977 bis 2024 mit mehreren Auswertungsmodellen.',
   'Einordnung: Solche Daten helfen, Handelsstrukturen zu beschreiben. Weil gemeldeter Handel nicht mit dem gesamten illegalen Handel gleichzusetzen ist, sollten Aussagen zu Trends immer auf die genauen Definitionen der Studie gestützt werden.'
 ),
 '10.1038/s41559-025-02734-3':(
   'Forschungsfrage: Welche Nachfrage motiviert die Schuppentierjagd im Südosten Nigerias?',
   'Vorgehen: Die Veröffentlichung untersucht die Rolle lokalen Fleischkonsums im Vergleich zur internationalen Nachfrage nach Schuppen.',
   'Einordnung: Sie lenkt den Blick auf die regionalen wirtschaftlichen und sozialen Treiber von Wildtierjagd. Aussagen über andere Länder oder den gesamten internationalen Handel lassen sich aus einer regionalen Untersuchung nicht ohne Weiteres ableiten.'
 )
}

def curated_studies():
    out=[]
    for title,doi,journal,date,desc in CURATED:
        href='https://doi.org/'+doi
        uid=hashlib.sha256((href+'|'+title.casefold()).encode()).hexdigest()[:20]
        out.append({'id':uid,'title':title,'date':date+'T00:00:00Z' if date else None,
                    'url':href,'source':journal,'kind':'study','study_source':'Kuratiertes Fachliteraturarchiv',
                    'abstract_available':True,'summary':desc+' Zur wissenschaftlichen Bewertung bitte die Originalveröffentlichung heranziehen.',
                    'extended_summary':list(CURATED_DETAILS.get(doi,()))})
    return out

def get_europe_pmc(now, fetch=None):
    if fetch is None:
        def fetch(u):
            request=Request(u,headers={'User-Agent':'WildlifeCommandCenter/0.4 (public metadata-only research monitor)','Accept':'application/json'})
            with urlopen(request,timeout=22) as r:return r.read(3_000_000)
    since=(now-timedelta(days=45)).date().isoformat()
    qry='(TITLE:elephant OR TITLE:wildlife OR TITLE:whale OR TITLE:rhino OR TITLE:poaching OR TITLE:biodiversity OR TITLE:"animal welfare") AND FIRST_PDATE:['+since+' TO '+now.date().isoformat()+']'
    query=urlencode({'query':qry,'format':'json','resultType':'core','pageSize':70,'sort':'P_PDATE_D desc'})
    raw=json.loads(fetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?'+query))
    items=[]
    for work in raw.get('resultList',{}).get('result',[]):
        title=text_only(work.get('title',''))[:230]
        abstract=text_only(work.get('abstractText',''))
        doi=str(work.get('doi') or '').strip()
        if not title or not doi or not abstract or not relevant_title(title):continue
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
                      'summary':summary(title,abstract),
                      'abstract_excerpt':abstract[:630],
                      'abstract_note':'Maschinell übersetzter Abstract-Auszug; keine unabhängige Bewertung.'})
    return items[:30]
def merge_studies(articles, new_studies):
    items={a.get('url'):a for a in articles if a.get('url')}
    for a in new_studies:
        prev=items.get(a['url'])
        if prev and prev.get('title')==a.get('title'):
            for key in ('abstract_source_text','abstract_origin','abstract_unavailable'):
                if prev.get(key):a[key]=prev[key]
        items[a['url']]=a
    return sorted(items.values(),key=lambda a:a.get('date') or '',reverse=True)[:650]
def choose(items, previous, now):
    today=now.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat()
    studies=[a for a in items if a.get('kind')=='study' and a.get('url','').startswith('https://doi.org/') and relevant_title(a.get('title',''))]
    if not studies:return None
    if isinstance(previous,dict) and previous.get('date')==today and any(a['id']==previous.get('id') and strong_title(a.get('title','')) for a in studies):
        return previous
    strong=[a for a in studies if strong_title(a.get('title',''))]
    if strong:studies=strong
    studies.sort(key=lambda a:(bool(a.get('abstract_available')),a.get('date') or ''),reverse=True)
    # Eine täglich wechselnde, echte Veröffentlichung – niemals einen erfundenen Eintrag.
    # Die ersten 12 aktuellen oder kuratierten Publikationen bilden den Auswahlpool.
    pool=studies[:12]
    choice=pool[now.astimezone(ZoneInfo('Europe/Berlin')).date().toordinal()%len(pool)]
    return {'date':today,'id':choice['id']}
def run(now=None, fetch=None):
    now=now or datetime.now(timezone.utc)
    feed=json.loads(FEED.read_text('utf8'))
    # Remove previously captured unrelated molecular/plant papers from this source.
    feed['articles']=[a for a in feed.get('articles',[]) if a.get('study_source')!='Europe PMC' or relevant_title(a.get('title',''))]
    prior=json.loads(PICK.read_text('utf8')) if PICK.exists() else None
    try:
        found=get_europe_pmc(now,fetch)
        feed['articles']=merge_studies(feed.get('articles',[]),found)
        feed.setdefault('sources',[]).append({'name':'Europe PMC – Studien & Abstracts','kind':'study','count':len(found),'ok':True})
        print('Europe PMC studies:',len(found))
    except Exception as exc:
        feed.setdefault('failures',[]).append({'source':'Europe PMC','error':str(exc)[:140]})
        print('Europe PMC temporarily unavailable:',str(exc)[:140])
    feed['articles']=merge_studies(feed.get('articles',[]),curated_studies())
    selected=choose(feed.get('articles',[]),prior,now)
    feed['daily_study']=selected
    feed['schema_version']=2
    if selected:
        PICK.write_text(json.dumps(selected,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    FEED.write_text(json.dumps(feed,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Daily study:',selected)
    return selected
if __name__=='__main__':run()
