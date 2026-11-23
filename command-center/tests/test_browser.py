"""Desktop Chromium smoke with entirely fabricated fixtures. Never touches real accounts or services."""
import json,re,shutil
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
    {'id':'test-wale','title':'New protections for whales','title_de':'Wale erhalten neuen Schutz','translation_status':'maschinell','summary':'Protection programme for whales and dolphins.','summary_de':'Schutzprogramm für Wale und Delfine.','url':'https://example.org/wale','date':NOW,'source':'Testquelle Wissenschaft','kind':'media'},
    {'id':'test-wildtier','title':'Neue Regeln gegen illegalen Wildtierhandel','summary':'CITES und Behörden diskutieren den Wildtierhandel.','url':'https://example.org/trade','date':NOW,'source':'Testquelle EU','kind':'policy'},
    {'id':'test-studie','title':'Elephant conservation and community conflict','summary':'Die Veröffentlichung behandelt Konflikte zwischen Menschen und Wildtieren. Die Einordnung basiert auf dem wissenschaftlichen Abstract; Ergebnisse bitte im Original prüfen.','url':'https://doi.org/10.1234/abc','date':NOW,'source':'Testjournal','kind':'study','abstract_available':True,'extended_summary':['Untersuchungsfrage: Was beeinflusst die Mensch-Elefant-Konflikte?','Vorgehen: Ein Forschungsmodell untersucht Naturschutzaspekte und regionale Auswirkungen.']},
    {'id':'test-fire','title':'Wildlife wildfire emergency','summary':'A wildfire is affecting wildlife.','url':'https://example.org/fire','date':NOW,'source':'Testquelle Notfall','kind':'media'},
    {'id':'test-xss','title':'XSS <img src=x onerror="window.XSS=1"> Wildlife','summary':'Wildlife text','url':'javascript:alert(1)','date':NOW,'source':'Malicious','kind':'media'}
  ],
  'sources':[{'name':'Testquelle','kind':'media','count':4,'ok':True}],
  'failures':[],'events':[],'daily_study':{'date':TODAY,'id':'test-studie'}
}

def test_desktop_dashboard():
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'executable_path':shutil.which('chromium') or shutil.which('google-chrome')} if shutil.which('chromium') or shutil.which('google-chrome') else {}),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1512,'height':1000},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        html=(ROOT/'index.html').read_text('utf8')
        html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.I|re.S)
        html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
        page.set_content(html)
        page.add_style_tag(path=str(ROOT/'styles.css'))
        page.evaluate("""() => {
          let items={};
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:(k)=>items[k]??null,setItem:(k,v)=>{items[k]=String(v)},removeItem:(k)=>{delete items[k]}
          }});
          window.history.replaceState=()=>{};
        }""")
        page.evaluate('(feed)=>{window.fetch=async()=>({ok:true,json:async()=>feed})}',FIXTURE)
        page.add_script_tag(path=str(ROOT/'lib'/'analysis.js'))
        page.add_script_tag(path=str(ROOT/'lib'/'clock.js'))
        page.add_script_tag(path=str(ROOT/'app.js'))
        page.get_by_text('Wale erhalten neuen Schutz').first.wait_for()
        assert re.match(r'Guten (Morgen|Tag|Abend), Luca\.',page.locator('#greeting').inner_text())
        assert re.match(r'\d\d:\d\d:\d\d',page.locator('#clock-hamburg').inner_text())
        assert page.locator('.world-clock').count()==3
        assert page.locator('.clock-map').count()==3
        assert page.locator('.map-pin').count()==3
        assert page.locator('#sunGraphic').count()==1
        assert page.locator('#sunriseTime').inner_text()!='--:--'
        assert page.locator('#sunsetTime').inner_text()!='--:--'
        assert 'Sonne' in page.locator('#sunLabel').inner_text()
        assert page.locator('.sidebar').count()==0
        assert page.locator('#chatAsk').count()==0
        assert page.locator('#quickTask').count()==0
        assert page.locator('.daily-study').count()==1
        assert 'Elephant conservation' in page.locator('#dailyStudy').inner_text()
        page.locator('#toggleStudyDetails').click()
        assert 'Untersuchungsfrage' in page.locator('#studyDetails').inner_text()
        page.locator('#toggleStudyDetails').click()
        assert page.locator('#studyDetails').count()==0
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
        page.locator('#globalSearch').fill('Wale')
        page.get_by_text('Wale erhalten neuen Schutz').wait_for()
        page.locator('#globalSearch').fill('unbekannteswort')
        page.get_by_text('Keine passenden Quellen').wait_for()
        page.locator('#globalSearch').fill('')
        page.locator('[data-view="sources"]').first.click()
        page.get_by_text('Quellen & Transparenz').wait_for()
        assert 'stündlich' in page.locator('main').inner_text()
        assert not errors,errors
        page.locator('[data-view="dashboard"]').first.click()
        page.screenshot(path=str(ROOT/'tests'/'screenshot-dashboard.png'),full_page=True)
        print('Browser OK: German headline, sunset arc, 3 geo maps, expandable study, search, XSS, privacy')
        browser.close()
