"""Actual Chromium smoke of the public newsroom, with fabricated media sources only."""
import re,shutil
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
NOW=datetime.now(timezone.utc)
TS=NOW.isoformat()
YESTERDAY=(NOW-timedelta(days=1)).isoformat()
WEEK_AGO=(NOW-timedelta(days=8)).isoformat()
TODAY=datetime.now(ZoneInfo('Europe/Berlin')).date().isoformat()
FEED={
  'schema_version':2,'generated_at':TS,
  'articles':[
    {'id':'old','title':'Whale conservation report from last week','summary':'Whales in conservation policy.',
     'url':'https://example.org/old','date':WEEK_AGO,'source':'Old Outlet','kind':'media'},
    {'id':'today','title':'New protections for whales','title_de':'BAD GERMAN TRANSLATION',
     'summary':'Protection programme for whales and dolphins.','summary_de':'BAD MACHINE TEASER',
     'url':'https://example.org/wale','date':TS,'source':'Current Outlet','kind':'media'},
    {'id':'policy','title':'Wildlife trade regulations in Germany',
     'summary':'Governments consider new policy.',
     'url':'https://example.org/policy','date':YESTERDAY,'source':'Public EU','kind':'policy'},
    {'id':'test-studie','title':'Elephant conservation and community conflict',
     'summary':'Die Veröffentlichung untersucht Konflikte von Menschen und Elefanten.',
     'url':'https://doi.org/10.1234/abc','date':TS,'source':'Journal Fixture','kind':'study',
     'abstract_available':True,
     'abstract_source_text':'This is an original scientific abstract with observations of elephant movement, habitat use and human elephant conflict across multiple villages. '*4},
    {'id':'xss','title':'XSS <img src=x onerror="window.XSS=1"> Wildlife','summary':'Wildlife text',
     'url':'javascript:alert(1)','date':TS,'source':'Malicious','kind':'media'}
  ],
  'sources':[{'name':'Testquelle','kind':'media','count':2,'ok':True}],
  'failures':[],'events':[],'daily_study':{'date':TODAY,'id':'test-studie'}
}
MONITOR={
  'schema_version':1,'checked_at':TS,'last_successful_at':TS,
  'articles':[
    {'id':'ifaw-old','title':'IFAW helps whales around the world - News Desk',
     'url':'https://example.org/ifaw-old','date':WEEK_AGO,'source':'News Desk',
     'kind':'monitor','profiles':['ifaw'],'origin':'Externe Berichterstattung',
     'collected_via':'Google News RSS','date_type':'aggregator'},
    {'id':'andreas','title':'Andreas Dinkelmeyer on illegal wildlife trade - Die Zeitung',
     'url':'https://example.org/andreas','date':TS,'source':'Die Zeitung',
     'kind':'monitor','profiles':['andreas'],'origin':'Externe Berichterstattung',
     'collected_via':'Google News RSS','date_type':'aggregator'},
    {'id':'robert','title':'Robert Kless discusses conservation - IFAW',
     'url':'https://example.org/robert','date':YESTERDAY,'source':'IFAW',
     'kind':'monitor','profiles':['robert'],'origin':'IFAW-eigene Meldung',
     'collected_via':'Google News RSS','date_type':'aggregator'}
  ],
  'profiles':[],'sources':[{'name':'Google News','ok':True,'count':3}],'failures':[]
}

def test_newsroom_desktop():
    with sync_playwright() as p:
        executable=shutil.which('chromium') or shutil.which('google-chrome')
        browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':900})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        html=(ROOT/'index.html').read_text('utf8')
        html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.I|re.S)
        html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
        page.set_content(html)
        page.add_style_tag(path=str(ROOT/'styles.css'))
        page.evaluate("""() => {
          let values={};
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v)}
          }});
          window.history.replaceState=()=>{};
          window.Summarizer={create:async()=>({
            async summarize(text){
              if(!text.includes('original scientific abstract'))throw Error('Abstract not used');
              return 'NEUE KI-ANALYSE: Das Abstract betrachtet Mensch-Elefant-Konflikte.';
            },destroy(){}
          })};
        }""")
        page.evaluate("""(input)=>{
          window._calls={archive:0,mediaArchive:0,live:0,mediaLive:0};
          window._liveResponse={articles:[
            {title:'Whale wildlife protection new research',
             url:'https://example.org/live-whale',
             seendate:new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'}
          ]};
          window._mediaResponse={status:'ok',items:[{
            title:'IFAW conservation news update - Report',
            link:'https://example.org/live-ifaw',
            pubDate:new Date().toISOString().slice(0,19).replace('T',' ')
          }]};
          window.fetch=async(url)=>{
            const u=String(url);
            if(u.includes('api.gdeltproject.org')){window._calls.live++;return {ok:true,json:async()=>window._liveResponse}}
            if(u.includes('api.rss2json.com')){window._calls.mediaLive++;return {ok:true,json:async()=>window._mediaResponse}}
            if(u.includes('monitoring.json')){window._calls.mediaArchive++;return {ok:true,json:async()=>input.media}}
            window._calls.archive++;return {ok:true,json:async()=>input.feed};
          };
        }""",{'feed':FEED,'media':MONITOR})
        for script in ['analysis','clock','study-ai','live-news','monitoring']:
            page.add_script_tag(path=str(ROOT/'lib'/(script+'.js')))
        page.add_script_tag(path=str(ROOT/'app.js'))
        page.wait_for_function("window._calls.live>=1 && window._calls.mediaArchive>=1 && !document.querySelector('#topStatus').textContent.includes('werden geprüft')")
        assert page.locator('.nav-link').count()==4
        assert page.locator('.sidebar').count()==0
        assert page.locator('.clock-drawer').count()==1
        assert re.match(r'Guten (Morgen|Tag|Abend), Luca\.',page.locator('#greeting').inner_text())
        assert re.match(r'\d\d:\d\d:\d\d',page.locator('#clock-hamburg').inner_text())
        assert page.locator('.world-clock').count()==3
        assert 'Global News Radar' in page.locator('main').inner_text()
        assert 'New protections for whales' in page.locator('main').inner_text()
        assert 'BAD GERMAN TRANSLATION' not in page.locator('main').inner_text()
        assert 'Datum laut Quelle' in page.locator('main').inner_text()
        assert 'Archivstand:' in page.locator('main').inner_text()
        # True date order, even when older story was first in JSON.
        assert page.evaluate("""() => itemsFor('news').every((a,i,list)=>!i||Date.parse(list[i-1].date)>=Date.parse(a.date))""")
        page.locator('#refreshBtn').click()
        page.wait_for_function("window._calls.live>=2 && document.querySelector('#toast').textContent.includes('Keine zusätzlichen Meldungen')")
        # Team-person monitoring and dated articles
        page.locator('[data-view="monitor"]').first.click()
        assert page.locator('[data-monitor-profile]').count()==9
        assert 'Andreas Dinkelmeyer' in page.locator('main').inner_text()
        assert 'Robert Kless' in page.locator('main').inner_text()
        assert 'Google News-Zeit' in page.locator('main').inner_text()
        assert page.evaluate("""() => itemsFor('monitor').every((a,i,list)=>!i||Date.parse(list[i-1].date)>=Date.parse(a.date))""")
        page.locator('[data-monitor-profile="andreas"]').click()
        assert 'Andreas Dinkelmeyer on illegal wildlife trade' in page.locator('.monitor-results').inner_text()
        assert 'Robert Kless discusses conservation' not in page.locator('.monitor-results').inner_text()
        page.locator('[data-monitor-profile="all"]').click()
        page.locator('[data-monitor-scope="owned"]').click()
        assert 'Robert Kless discusses conservation' in page.locator('.monitor-results').inner_text()
        assert 'Andreas Dinkelmeyer on illegal wildlife trade' not in page.locator('.monitor-results').inner_text()
        page.locator('[data-monitor-scope="all"]').click()
        # PR and Crisis remain separate chronological sections
        page.locator('[data-view="pr"]').first.click()
        assert 'PR-Chancen' in page.locator('.page-heading').inner_text()
        assert page.evaluate("""() => itemsFor('pr').every((a,i,list)=>!i||Date.parse(list[i-1].date)>=Date.parse(a.date))""")
        page.locator('[data-view="crisis"]').first.click()
        assert 'Crisis Watch' in page.locator('.page-heading').inner_text()
        page.locator('[data-view="news"]').first.click()
        page.locator('.research-drawer summary').click()
        page.locator('#summarizeStudy').click()
        page.get_by_text('NEUE KI-ANALYSE',exact=False).wait_for()
        assert page.locator('#studyAIResult').count()==1
        page.locator('#globalSearch').fill('whales')
        assert 'New protections for whales' in page.locator('main').inner_text()
        page.locator('#globalSearch').fill('unbekannteswort')
        assert 'Keine passenden Meldungen' in page.locator('main').inner_text() or page.locator('.date-group').count()==0
        page.locator('#globalSearch').fill('')
        page.locator('[data-view="sources"]').first.click()
        assert 'Quellen & Transparenz' in page.locator('main').inner_text()
        assert page.locator('main a[href="javascript:alert(1)"]').count()==0
        assert page.evaluate('window.XSS') is None
        assert not errors,errors
        page.locator('[data-view="news"]').first.click()
        page.screenshot(path=str(ROOT/'tests'/'screenshot-dashboard.png'),full_page=True)
        print('Browser OK: four views, genuine dates, IFAW staff profiles, live refresh, study AI, XSS and mobile-friendly layout')
        browser.close()
