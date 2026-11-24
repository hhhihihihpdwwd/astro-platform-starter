# Wildlife Command Center – unabhängiger Recherche-Prototyp

**Aktuelle verifizierte Web-Vorschau (23.11.2026):** https://silver-equinox-qqr13.ship.place/

Dieses Projekt ist ein **nicht offiziell freigegebener, öffentlich erreichbarer Prototyp** zur Recherche von öffentlichen Wildtier-, Artenschutz-, Wissenschafts- und Politikmeldungen für IFAW-bezogene Themen. Keine offizielle IFAW-Webanwendung, kein Logo und keine internen Unternehmensdaten.

## Bedienung

Laptopoptimierte, minimalistische Oberfläche **ohne Seitenleiste oder Chatbot** mit Morning Briefing, Global News Radar, PR-Chancen, Crisis Watch, Studien-Scout und Policy-Meldungen. Eine Hamburger Uhr und drei Weltuhren zeigen sekundengenau die Ortszeit für Washington, London und Sydney sowie jeweils eine Weltkarte mit Standortmarker (Natural Earth, gemeinfrei). Die Hamburger Uhr zeigt eine grafische, relativ skalierte Sonnenbahn (aus berechneter Sonnenhöhe), Näherungswerte für Sonnenstand sowie Auf- und Untergang.

**To-dos, Microsoft-Verbindungen und der Chatbot sind entfernt.**

## Tägliche Studie

Der stündliche Quellenlauf versucht, aus öffentlichen Europe-PMC-Abstracts relevante Tier- und Artenschutzpublikationen mit DOI zu übernehmen. Bei API-Ausfällen stehen **sieben anhand der Originalpublikationen geprüfte Fachartikel** bereit, die täglich wechseln können. Die Entscheidung für den aktuellen Hamburger Kalendertag wird separat gespeichert und bleibt während des Tages stabil. Themenbeschreibungen sind bewusst zurückhaltend formuliert; keine behauptete LLM-Faktenprüfung oder erfundene Forschungsergebnisse. Veröffentlichungsdaten werden angezeigt; die Rubrik beansprucht nicht, dass eine ältere Studie neu erschienen sei.

Bei der **Studie des Tages** ist eine längere, ausklappbare Darstellung verfügbar: für kuratierte Arbeiten stehen an den Originalpublikationen orientierte Absätze zu Forschungsfrage, Vorgehen und Einordnung bereit; für andere Arbeiten erscheint eine klar als maschinell übersetzt gekennzeichnete Abstract-Passage, falls vorhanden. Keine frei erfundenen Studienergebnisse.

## Bilder & Gestaltung

Drei allgemeine, frei nutzbare **Symbolbilder** werden beim Deploy von Unsplash geladen und **lokal auf dem Website-Host** ausgeliefert. Es sind **keine Fotos der jeweils gemeldeten Ereignisse**:
- Eric Dekker (Elefant): https://unsplash.com/photos/an-elephant-walks-through-dry-grass-in-savanna-giucwGEgRsE
- Mike Doherty (Wal): https://unsplash.com/photos/whale-tail-in-the-middle-of-ocean-larQY4lhbT4
- Maximus Beaumont (Wald): https://unsplash.com/photos/a-lush-green-forest-filled-with-lots-of-trees-GlNSjGRugTE

Lizenz: https://unsplash.com/license . Die Quellen und Lizenzen sind auch in der Anwendung verlinkt.

Die moderne Schrift nutzt die lokal verfügbaren Systemfonts, also **keine externen Google-Fonts-Aufrufe**.

## Aufbau und Null-Euro-Betrieb

- Statische HTML/CSS/JS-Anwendung ohne kostenpflichtige KI-API.
- **Aktuelles Refresh-System (24.11.2026):** Die Website fragt beim Öffnen, spätestens stündlich und per Aktualisieren-Button **zwei unabhängige Quellen parallel** ab: (1) das gespeicherte GitHub-Archiv und (2) direkte aktuelle Schlagzeilen aus der öffentlichen GDELT-Such-API; bei Ausfällen oder HTTP 429 wird alternativ der Mongabay-RSS-Feed über die kostenlose, begrenzte rss2json-API versucht. Die Live-Suche zeigt ausschließlich Originaltitel, Veröffentlichungsdaten und Links, niemals erfundene Artikeltexte. Der Button unterscheidet neue Meldungen, unveränderte Ergebnisse und Verbindungsfehler.
- GitHub Actions hat **zwei geplante Versuche pro Stunde** (11 und 41 Minuten nach UTC-Stundenbeginn), um RSS-/Atom-, Crossref- und Europe-PMC-Metadaten zu sammeln. GitHub garantiert weder punktgenaue Ausführung noch vollständige Quellenabdeckung. Fehlt ein Scheduler-Lauf, bleibt die direkte Live-Suche trotzdem nutzbar, soweit GDELT erreichbar ist.
- Website wird durch `.github/workflows/ifaw-publish-free.yml` auf einen kostenlosen statischen Host veröffentlicht. Dort werden HTML/CSS/JS/News-JSON und **drei lokale JPEG-Bilddateien** auf gültige HTTP-200-Antworten geprüft.
- Die archivierten öffentlichen JSON-Meldungen lädt der Browser aus GitHub, mit lokalem Snapshot als Fallback. Eine erfolgreiche Dateiabfrage bedeutet nicht automatisch neue Nachrichten. Live-Abfrage und Archivstand sind getrennt ausgewiesen.
- Es werden **keine Besucherdaten oder Chatfragen in eine Datenbank dieser Anwendung** geschrieben (es gibt keinen Chatbot). Eine freiwillige Merkliste verbleibt im Browser. Beim Live-Abruf sendet der Browser Netzwerkzugriffe direkt an GDELT sowie ggf. rss2json.com (Mongabay-RSS). Hoster, GitHub, GDELT und rss2json.com können technische Zugriffsdaten verarbeiten.

## Originalmeldungen und KI-Studienanalyse

**Meldungen erscheinen wieder mit den Originalüberschriften und Original-Teasern.** Die deutsche Argos-Übersetzung wurde aus dem stündlichen Workflow entfernt; zuvor gespeicherte Übersetzungsfelder werden aus dem öffentlichen Datensatz gelöscht.

**Studie des Tages – "✦ Mit KI zusammenfassen"** nutzt die offizielle Summarizer-API in unterstützten Desktop-Browsern (Chrome/Edge 138+), mit echter Generierung aus einem DOI-verknüpften wissenschaftlichen Abstract, nicht aus der bisherigen kurzen Einordnung. Das Modell arbeitet lokal, verursacht keine API-Kosten und benötigt gegebenenfalls einen einmaligen, größeren Modelldownload sowie genügend Gerätespeicher. Die Verfügbarkeit hängt von Browser, Hardware und Unternehmensrichtlinien ab.

Fehlt die Browser-KI oder der Quellentext, wird das klar angezeigt. Daneben gibt es den **Link "In ChatGPT analysieren"**, der mit DOI, Quellenangaben und einem vorformulierten Rechercheauftrag zu ChatGPT wechselt. Der Link kann Anmeldung und das Bestätigen der Anfrage erfordern; die Website selbst erhält keine generative Cloud-API ohne eigene Freigabe. Bei Nutzung des ChatGPT-Links wird der öffentlich verfügbare Abstract-Ausschnitt in der Linkadresse an ChatGPT übertragen.

Die wissenschaftliche Datensammlung ergänzt kurze Publikationsangaben soweit verfügbar um DOI-verknüpfte Originalabstracts aus OpenAlex, mit Längenbegrenzung. Diese Abstracts können Quellenbeschränkungen unterliegen und sind kein Volltext. KI-Ausgaben sind Entwürfe und dürfen ohne Gegenprüfung nicht als validierte wissenschaftliche Fakten oder Pressemitteilung verwendet werden.

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
