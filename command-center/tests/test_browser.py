"""Chromium smoke test with fabricated source data; no external API, model or account."""
import re,shutil
from pathlib import Path
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
NOW=datetime.now(timezone.utc).isoformat()
TODAY=datetime.now(ZoneInfo('Europe/Berlin')).date().isoformat()
FIXTURE={
  'schema_version':2,'generated_at':NOW,
  'articles':[
    {'id':'test-wale','title':'New protections for whales','title_de':'BAD GERMAN TRANSLATION',
     'translation_status':'maschinell','summary':'Protection programme for whales and dolphins.',
     'summary_de':'BAD MACHINE TEASER','url':'https://example.org/wale','date':NOW,
     'source':'Scientific Fixture','kind':'media'},
    {'id':'test-wildtier','title':'Neue Regeln gegen illegalen Wildtierhandel',
     'summary':'CITES und Behörden diskutieren den Wildtierhandel.',
     'url':'https://example.org/trade','date':NOW,'source':'Test EU','kind':'policy'},
    {'id':'test-studie','title':'Elephant conservation and community conflict',
     'summary':'Die Veröffentlichung untersucht Konflikte von Menschen und Elefanten.',
     'url':'https://doi.org/10.1234/abc','date':NOW,'source':'Journal Fixture','kind':'study',
     'abstract_available':True,
     'abstract_source_text':'This is an original scientific abstract with observations of elephant movement, habitat use and human elephant conflict across multiple villages. '*4},
    {'id':'test-fire','title':'Wildlife wildfire emergency','summary':'A wildfire is affecting wildlife.',
     'url':'https://example.org/fire','date':NOW,'source':'Test Emergency','kind':'media'},
    {'id':'test-xss','title':'XSS <img src=x onerror="window.XSS=1"> Wildlife',
     'summary':'Wildlife text','url':'javascript:alert(1)','date':NOW,'source':'Malicious','kind':'media'}
  ],
  'sources':[{'name':'Testquelle','kind':'media','count':4,'ok':True}],
  'failures':[],'events':[],'daily_study':{'date':TODAY,'id':'test-studie'}
}

def test_desktop_dashboard():
    with sync_playwright() as p:
        executable=shutil.which('chromium') or shutil.which('google-chrome')
        browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1512,'height':1000},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        html=(ROOT/'index.html').read_text('utf8')
        html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.I|re.S)
        html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
        page.set_content(html)
        page.add_style_tag(path=str(ROOT/'styles.css'))
        page.evaluate("""() => {
          const store={};
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}
          }});
          window.history.replaceState=()=>{};
          window.Summarizer={
            create:async options=>({
              async summarize(input){
                if(!input.includes('original scientific abstract'))throw Error('Source abstract not read');
                return 'KI NEU GENERIERT: Die Untersuchung beschreibt Landnutzung und Mensch-Elefant-Konflikte. Die Befunde müssen anhand der Originalstudie geprüft werden.';
              },destroy(){}
            })
          };
        }""")
        page.evaluate("""(feed)=>{
          window._calls={archive:0,live:0};
          window._liveResponse={articles:[
            {title:'Elephant wildlife conservation rescue after floods',
             url:'https://news.example.org/elephant',
             seendate:new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'}
          ]};
          window.fetch=async(u)=>{
            if(String(u).includes('api.gdeltproject.org')){
              window._calls.live++;
              return {ok:true,status:200,json:async()=>window._liveResponse};
            }
            window._calls.archive++;
            return {ok:true,status:200,json:async()=>feed};
          };
        }""",FIXTURE)
        page.add_script_tag(path=str(ROOT/'lib'/'analysis.js'))
        page.add_script_tag(path=str(ROOT/'lib'/'clock.js'))
        page.add_script_tag(path=str(ROOT/'lib'/'study-ai.js'))
        page.add_script_tag(path=str(ROOT/'lib'/'live-news.js'))
        page.add_script_tag(path=str(ROOT/'app.js'))
        page.get_by_text('New protections for whales').first.wait_for()
        assert page.get_by_text('BAD GERMAN TRANSLATION').count()==0
        assert page.get_by_text('BAD MACHINE TEASER').count()==0
        page.wait_for_function('window._calls.live>=1 && window._calls.archive>=1')
        assert 'GDELT geprüft' in page.locator('#topStatus').inner_text()
        assert 'Elephant wildlife conservation rescue after floods' in page.locator('main').inner_text()
        page.locator('#refreshBtn').click()
        page.wait_for_function('window._calls.live>=2')
        assert 'Keine neueren Meldungen' in page.locator('#toast').inner_text()
        page.evaluate("""() => window._liveResponse.articles.unshift({
          title:'Wildlife trafficking authorities launch protection drive',
          url:'https://news.example.org/wildlife-new',
          seendate:new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'
        })""")
        page.locator('#refreshBtn').click()
        page.wait_for_function('window._calls.live>=3')
        assert 'zusätzliche Meldungen' in page.locator('#toast').inner_text()

        assert re.match(r'Guten (Morgen|Tag|Abend), Luca\.',page.locator('#greeting').inner_text())
        assert re.match(r'\d\d:\d\d:\d\d',page.locator('#clock-hamburg').inner_text())
        assert page.locator('.world-clock').count()==3
        assert page.locator('.clock-map').count()==3
        assert page.locator('.map-pin').count()==3
        assert page.locator('#sunriseTime').inner_text()!='--:--'
        assert page.locator('#sunsetTime').inner_text()!='--:--'
        assert page.locator('.sidebar').count()==0
        assert page.locator('#chatAsk').count()==0
        assert page.locator('#quickTask').count()==0
        assert page.locator('.daily-study').count()==1
        assert 'Elephant conservation' in page.locator('#dailyStudy').inner_text()
        assert page.locator('#studyAIResult').count()==0
        assert page.get_by_text('Die Veröffentlichung untersucht Konflikte').count()>=1
        page.locator('#summarizeStudy').click()
        page.get_by_text('KI NEU GENERIERT',exact=False).wait_for()
        ai_text=page.locator('#studyAIResult').inner_text()
        assert 'KI NEU GENERIERT' in ai_text
        assert 'Die Veröffentlichung untersucht Konflikte' not in ai_text
        assert page.locator('#dailyStudy a[href^="https://chatgpt.com/?q="]').count()==1
        assert page.locator('main a[href="javascript:alert(1)"]').count()==0
        assert page.locator('main img[src="x"]').count()==0
        assert page.evaluate('window.XSS') is None
        page.locator('[data-view="studies"]').first.click()
        page.get_by_text('Studien-Scout').wait_for()
        assert page.get_by_text('Elephant conservation and community conflict').count()>0
        page.locator('[data-bookmark]').first.click()
        assert page.locator('[data-bookmark].saved').count()==1
        page.locator('[data-view="news"]').first.click()
        page.get_by_text('Global News Radar').wait_for()
        page.locator('#globalSearch').fill('whales')
        search_page=page.locator('main').inner_text()
        assert 'New protections for whales' in search_page, 'Search results missing original article: '+repr(search_page[:500])
        page.locator('#globalSearch').fill('unbekannteswort')
        page.get_by_text('Keine passenden Quellen').wait_for()
        page.locator('#globalSearch').fill('')
        page.locator('[data-view="sources"]').first.click()
        page.get_by_text('Quellen & Transparenz').wait_for()
        assert 'stündlich' in page.locator('main').inner_text()
        assert not errors,errors
        page.locator('[data-view="dashboard"]').first.click()
        page.screenshot(path=str(ROOT/'tests'/'screenshot-dashboard.png'),full_page=True)
        print('Browser OK: original news, AI-generated text, DOI fallback, 3 maps, sun, XSS, search')
        browser.close()
