# Wildlife Command Center – unabhängiger Recherche-Prototyp

**Aktuelle verifizierte Web-Vorschau (23.11.2026):** https://global-caravan-3gpyi.ship.place/

Dieses Projekt ist ein **nicht offiziell freigegebener, öffentlich erreichbarer Prototyp** zur Recherche von öffentlichen Wildtier-, Artenschutz-, Wissenschafts- und Politikmeldungen für IFAW-bezogene Themen. Keine offizielle IFAW-Webanwendung, kein Logo und keine internen Unternehmensdaten.

## Bedienung

Laptopoptimierte, minimalistische Oberfläche **ohne Seitenleiste oder Chatbot** mit Morning Briefing, Global News Radar, PR-Chancen, Crisis Watch, Studien-Scout und Policy-Meldungen. Eine Hamburger Uhr und vier Weltuhren zeigen sekundengenau die Ortszeit für Hamburg, Washington, Cape Cod, London und Sydney. Der Sonnenstand wird mit einer NOAA-Näherungsformel aus Datum, Uhrzeit und den Koordinaten Hamburgs berechnet.

**To-dos, Microsoft-Verbindungen und der Chatbot sind entfernt.**

## Tägliche Studie

Der stündliche Quellenlauf versucht, aus öffentlichen Europe-PMC-Abstracts relevante Tier- und Artenschutzpublikationen mit DOI zu übernehmen. Bei API-Ausfällen stehen **sieben anhand der Originalpublikationen geprüfte Fachartikel** bereit, die täglich wechseln können. Die Entscheidung für den aktuellen Hamburger Kalendertag wird separat gespeichert und bleibt während des Tages stabil. Themenbeschreibungen sind bewusst zurückhaltend formuliert; keine behauptete LLM-Faktenprüfung oder erfundene Forschungsergebnisse. Veröffentlichungsdaten werden angezeigt; die Rubrik beansprucht nicht, dass eine ältere Studie neu erschienen sei.

## Bilder & Gestaltung

Drei allgemeine, frei nutzbare **Symbolbilder** werden beim Deploy von Unsplash geladen und **lokal auf dem Website-Host** ausgeliefert. Es sind **keine Fotos der jeweils gemeldeten Ereignisse**:
- Eric Dekker (Elefant): https://unsplash.com/photos/an-elephant-walks-through-dry-grass-in-savanna-giucwGEgRsE
- Mike Doherty (Wal): https://unsplash.com/photos/whale-tail-in-the-middle-of-ocean-larQY4lhbT4
- Maximus Beaumont (Wald): https://unsplash.com/photos/a-lush-green-forest-filled-with-lots-of-trees-GlNSjGRugTE

Lizenz: https://unsplash.com/license . Die Quellen und Lizenzen sind auch in der Anwendung verlinkt.

Die moderne Schrift nutzt die lokal verfügbaren Systemfonts, also **keine externen Google-Fonts-Aufrufe**.

## Aufbau und Null-Euro-Betrieb

- Statische HTML/CSS/JS-Anwendung ohne kostenpflichtige KI-API.
- GitHub Actions versucht **stündlich** öffentlich zugängliche RSS-/Atom-, Crossref- und Europe-PMC-Metadaten zu sammeln. Läufe können sich verzögern oder bei Quellenausfällen fehlschlagen. Der Browser fragt die Daten ebenfalls spätestens stündlich neu ab; die Sekunden-Uhren laufen ohne Netzwerkanfrage.
- Website wird durch `.github/workflows/ifaw-publish-free.yml` auf einen kostenlosen statischen Host veröffentlicht. Dort werden HTML/CSS/JS/News-JSON und **drei lokale JPEG-Bilddateien** auf gültige HTTP-200-Antworten geprüft.
- Die neuesten öffentlichen JSON-Meldungen lädt der Browser aus diesem GitHub-Repository, mit lokalem Snapshot als Fallback.
- Es werden **keine Besucherdaten oder Chatfragen in eine Datenbank dieser Anwendung** geschrieben (es gibt keinen Chatbot). Eine freiwillige Merkliste verbleibt im Browser; Hoster und GitHub verarbeiten technische Verbindungsdaten.

**Wichtig:** Anonyme kostenlose `ship.page`-Webseiten laufen laut Betreiber nach **sieben Tagen ab**. Jede neue Veröffentlichung erzeugt eine **neue URL**. Für dauerhaft stabile, kostenlose Veröffentlichung muss GitHub Pages im eigenen Repository freigeschaltet werden; das ist aktuell nicht erfolgt.

## Lokale Tests

```bash
node --check app.js
node tests/test_analysis.cjs
python -m pytest tests/test_collect.py tests/test_browser.py -q
```

Die Browsertests benutzen ausdrücklich **künstliche Testdaten**. Die produktiven Nachrichteneinträge sind **nicht unabhängig verifiziert**.

## Datenschutz, Recht und organisatorische Freigabe

**Nicht automatisch DSGVO-konform, rechtlich freigegeben oder für den produktiven IFAW-Betrieb autorisiert.** Vor einer professionellen Veröffentlichung insbesondere mit der Organisation klären:
1. Erlaubnis für IFAW-bezogene Darstellung, Name und eventuelle künftige Markennutzung (derzeit bewusst kein offizielles Logo).
2. Verantwortliche Stelle, Impressums-/Anbieterkennzeichnungspflicht nach DDG/MStV sowie Datenschutzhinweise nach Art. 13 DSGVO einschließlich Hosting / IP- und Zugriffsdaten.
3. Medienrechte, RSS-Nutzungsbedingungen, Presseleisterschutz und eventuelle Lizenzen bei beruflicher bzw. öffentlicher Nutzung. Inhalte werden nicht als Vollartikel übernommen.
4. Keine vertraulichen Geschäftsinformationen, internen Dokumente, Personenlisten oder personenbezogenen Beschäftigtendaten in die öffentliche Web-App eingeben.
5. Die gratis Webvorschau ist **kein garantiert dauerhafter, sicherheitsgeprüfter Hostingbetrieb**.

Die Seite kann öffentlich aufgerufen werden und ist kein Passwort-geschütztes Intranet.
