"""Playwright-Smoke-Tests mit lokaler HTTP-Seite und kontrolliertem Quellendatensatz.
Die UI-Tests verwenden ausdrücklich künstliche Testdaten, nicht den Produktionsfeed.
"""
import re
import json
import shutil
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
FIXTURE={
  'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),
  'articles':[
    {'id':'test-wale','title':'Wale erhalten neuen Schutz', 'summary':'Meeresschutz für Wale und Delfine in einer Region.', 'url':'https://example.org/wale','date':datetime.now(timezone.utc).isoformat(),'source':'Testquelle Wissenschaft','kind':'media'},
    {'id':'test-wildtier','title':'Neue Regeln gegen illegalen Wildtierhandel','summary':'CITES und Behörden diskutieren den Wildtierhandel.', 'url':'https://example.org/trade','date':datetime.now(timezone.utc).isoformat(),'source':'Testquelle EU','kind':'policy'},
    {'id':'test-studie','title':'Elephant conservation and community conflict','summary':'Bibliografischer Eintrag (Crossref); Ergebnisse nicht geprüft.', 'url':'https://doi.org/10.1234/abc','date':datetime.now(timezone.utc).isoformat(),'source':'Testjournal','kind':'study'},
    {'id':'test-xss','title':'XSS <img src=x onerror="window.XSS=1"> Wildlife', 'summary':'Wildlife text', 'url':'javascript:alert(1)','date':datetime.now(timezone.utc).isoformat(),'source':'Malicious','kind':'media'}
  ],'sources':[{'name':'Fixture','kind':'media','count':4,'ok':True}], 'failures':[],'events':[]
}
def test_browser_full_workflow():
    # Die Laufzeitumgebung blockiert URL-Navigation im Chromium per Administrator-Policy.
    # Statt eines Servers wird derselbe reale HTML/CSS/JS-Code in about:blank injiziert.
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'executable_path':shutil.which('chromium') or shutil.which('google-chrome')} if (shutil.which('chromium') or shutil.which('google-chrome')) else {}),args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1500,'height':950})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        html=(ROOT/'index.html').read_text('utf8')
        html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.I|re.S)
        html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
        page.set_content(html)
        page.add_style_tag(path=str(ROOT/'styles.css'))
        page.evaluate("""() => {
          let entries = {};
          let storage = { getItem:k=>entries[k]??null,setItem:(k,v)=>{entries[k]=String(v)},removeItem:k=>{delete entries[k]} };
          Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
          Object.defineProperty(window,'sessionStorage',{configurable:true,value:storage});
          window.history.replaceState=()=>{};
        }""")
        page.evaluate('(f)=>{window.fetch=async()=>({ok:true,json:async()=>f})}',FIXTURE)
        page.add_script_tag(path=str(ROOT/'lib'/'analysis.js'))
        page.add_script_tag(path=str(ROOT/'app.js'))
        page.wait_for_selector('text=Wale erhalten neuen Schutz')
        assert 'Dein Überblick' in page.locator('h1').inner_text()
        page.screenshot(path=str(ROOT/'tests'/'screenshot-dashboard.png'),full_page=True)
        assert page.locator('main [href="javascript:alert(1)"]').count()==0
        assert page.locator('main img[src="x"]').count()==0
        assert page.locator('[data-nav="todos"]').count()==0
        assert page.locator('#quickTask').count()==0
        assert page.locator('.welcome-hero').count()==1
        assert page.locator('.featured-story').count()==3
        assert page.locator('.featured-story img').count()>=1
        page.locator('[data-nav="news"]').first.click()
        page.wait_for_selector('h1:text-is("Global News Radar")')
        assert page.get_by_text('Wale erhalten neuen Schutz').count()>=1
        page.locator('[data-bookmark]').first.click()
        assert page.locator('[data-bookmark].saved').count()==1
        page.locator('[data-nav="command"]').first.click()
        page.locator('#chatAsk input').fill('Wale')
        page.locator('#chatAsk button').click()
        assert 'Wale erhalten neuen Schutz' in page.locator('#chatConvo').inner_text()
        page.locator('#chatAsk input').fill('xyzunbekannterbegriff')
        page.locator('#chatAsk button').click()
        assert 'Keine passende Quelle' in page.locator('#chatConvo').inner_text()
        page.locator('#settingsSide').click()
        assert 'Datenschutz & Quellen' in page.locator('main').inner_text()
        assert not errors,errors
        print('Browser-Test OK: Laden, XSS, keine To-dos, Bilder, Suche, Merken, Chatbot, Datenschutz')
        page.screenshot(path=str(ROOT/'tests'/'screenshot-desktop.png'),full_page=True)
        browser.close()
