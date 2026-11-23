# IFAW Command Center (unabhängiger Prototyp)

## Direkt öffnen (öffentliche Testversion)

**Web-App:** https://solid-cough-cscoi.ship.place/

Am 23.11.2026 auf einem kostenlosen Webhost veröffentlicht. Der Deployment-Check hat HTML, CSS, JavaScript und News-JSON mit HTTP 200 geprüft. Die App lädt neuere öffentliche Newsdaten aus dem GitHub-Repository. Diese URL ist eine öffentliche Testversion ohne garantierte dauerhafte Verfügbarkeit und ohne Freigabe der IFAW-IT. Keine vertraulichen Daten eingeben. Microsoft To Do benötigt weiterhin eine Entra-App-Registrierung und Freigabe.

**Eine schlanke Desktop-Web-App für öffentliche Tierschutz-/Artenschutzmeldungen, tägliche Briefings, Recherche, Aufgaben und quellenbasierten Command-Chat.** Kein offizieller IFAW-Dienst.

## Was funktioniert (ohne kostenpflichtige Anbieter)

- **Dashboard/Morning Briefing:** aktuelle, verfügbare Meldungen und Aufgaben; Quellen/Datum, keine fingierten Beispiele in Produktion.
- **Global News Radar:** RSS/Atom-Aggregation öffentlicher Quellen, dedupliziert, mit Zeit- und Themenfiltern, Original-Links und Merkliste.
- **PR-Chancen:** transparente Schlagwort- und Relevanzregeln, die *Prüfideen* geben – keine behaupteten KI-Analysen oder garantierte Nachrichtenwerte.
- **Medienmonitoring:** freie RSS-Feeds und öffentliche Google-News-Suchfeeds; ausdrücklich unvollständig, keine Meltwater-Kopie.
- **Crisis Watch:** Schlagwortbasierte Warnhinweise, ausdrücklich *keine zuverlässige Prognose* oder bestätigte Lage.
- **Studien-Scout:** Crossref-Metadaten (DOI, Titel, Journal, Datum); keine unabhängige Peer-Review- oder Ergebnisprüfung.
- **Policy Tracker:** RSS des EU-Rats, EU-Kommission und Bundesumweltministeriums; keine vollständige Agenda.
- **IFAW Knowledge Base:** öffentlich gefundene IFAW-Themenlinks, keine interne Datenanbindung.
- **Command Chatbot:** sehr schnelle *lokale Quellen-Recherche*, keine kostenpflichtige KI. Zeigt direkt die passenden öffentlichen Belege oder sagt „keine Quelle gefunden“.
- **To-dos:** lokal nutzbar; optionale bidirektionale **Microsoft To Do**-Verbindung per Microsoft Graph (Erstellen, Anzeigen, Abhaken, Löschen).
- **GitHub Actions:** Aktualisierung alle sechs Stunden (best effort; GitHub kann geplante Workflows verzögern/abschalten).

**Nicht enthalten:** freie generative LLM-Antworten, Monitoring aller Medien weltweit, verlässlich prognostizierte Krisen, automatisierte Medien-/Pressetexte, eingeloggte IFAW-Inhalte, zentrale Aufgaben-Synchronisierung ohne Microsoft-Freigabe, garantierte EU-only Verarbeitung.

## Ohne Hosting-Kosten deployen

Für den kostenlosen Plan benötigt GitHub Pages ein **öffentliches Repository**. Deshalb darf niemals internes IFAW-Material oder eine private Aufgabenliste eingecheckt werden. Die Website-URL ist öffentlich; die *lokalen Aufgaben* verbleiben im Browser des jeweiligen Nutzers. Zugangsverwaltung und private Cloud-Datenbanken sind absichtlich nicht enthalten.

1. Ein **neues öffentliches GitHub-Repository** erstellen (z. B. `ifaw-command-center`) und die Inhalte dieses Verzeichnisses direkt ins Repository-Root übernehmen. Das kann je nach verbundenen GitHub-Werkzeugen manuell nötig sein.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions** einstellen. GitHub Actions für das Repository erlauben.
3. Reiter **Actions** → „Command Center – Quellen aktualisieren und veröffentlichen“ → **Run workflow** (oder erste Änderung auf `main` pushen). Der Workflow ruft Quellen ab und publiziert die statische Seite.
4. Nach grünem „deploy-pages“-Schritt findest du die Website unter `https://<benutzer>.github.io/<repository>/`. **Erst nach erfolgreichem Lauf** als live bezeichnen.
5. In der App unter „Einstellungen“ kontrollieren, wie viele Quellen erfolgreich geladen wurden. Falls Feeds Fehler zeigen: URLs oder Antwortformat prüfen; niemals Erfolgszahlen erfinden.

Erfordert: GitHub Free, GitHub Pages/Actions-Zugriff, öffentliche GitHub-Dateien. GitHub kann kostenlose Kontingente und Plattformregeln ändern. Keine Zahlung garantiert **nicht**, dass sämtliche externen Quellen jederzeit funktionieren.

**Lokal testen:**

```bash
python -m http.server 8000
# dann im Browser http://localhost:8000 öffnen
python -m pytest -q tests/test_collect.py
node tests/test_analysis.cjs
python -m pytest -q tests/test_browser.py   # benötigt Playwright + Chromium
```

Das Dashboard zeigt beim ersten Start **ehrlich einen leeren Bestand**. Die öffentliche `data/articles.json` wird erst vom ersten erfolgreichen Quellenlauf gefüllt. Tests verwenden künstliche Fixture-Daten und schreiben diese **nicht** nach `data/articles.json`.

## Microsoft To Do anbinden

1. Vorher die IFAW-IT informieren und eine **Entra-ID-App-Registrierung** genehmigen lassen.
2. In **Microsoft Entra Admin Center → App registrations → New registration** eine geeignete App anlegen. Als Plattform **Single-page application** wählen. Die exakt in der App unter „Einstellungen“ angezeigte **Redirect URI** registrieren.
3. Delegierte Microsoft Graph API-Berechtigung **`Tasks.ReadWrite`** hinzufügen (die Login-Implementierung nutzt außerdem `User.Read` für die Anmeldung). IT-/Admin-Consent je nach Organisationsrichtlinie.
4. **Client (application) ID** und gegebenenfalls Tenant-ID in App → Einstellungen eintragen. **Niemals Client Secret** hinzufügen. Microsoft-Anmeldung starten, gewünschte Aufgabenliste wählen.
5. Erst nach erfolgreicher Anmeldung und Aufgabenabruf in den Microsoft-Modus wechseln. Änderungen werden dann direkt per Graph-API geschrieben.

Es gibt bewusst **keine automatische Übernahme lokaler Aufgaben** nach Microsoft: So werden keine privaten To-dos ohne zusätzliche Bestätigung übertragen. Zugangstoken sind nur in `sessionStorage`; nach Ablauf ist eine erneute Anmeldung erforderlich. Nicht für vertrauliche Informationen freigegeben.

## Quellen und Qualität

`/scripts/collect.py` verwendet ausschließlich Python-Standardbibliothek. Quellen: Bundesumweltministerium, Kommission, EU-Rat, BBC Science, The Guardian Environment, Mongabay, öffentliche News-Suchfeeds und Crossref. Nicht verfügbare Quellen werden pro Lauf als Fehler im Status protokolliert. Keine vollständigen Fremdartikel im Repository speichern.

**Qualitätssicherung:** Quelle, Datum und Direktlink, RSS-Kurzbeschreibung statt erfundenem Inhalt, Daten-Aktualität sichtbar, leere Zustände, automatische Backups bisheriger Meldungen bei Quellenausfall, Prüfung auf gefährliche URLs/XSS, Unit-/Smoke-Tests. Quellen können inhaltlich falsch sein – ein funktionierender Abruf ist **keine** Faktenprüfung.

## Datenschutz, Nutzungsrechte, Sicherheit

- Die News JSON-Daten enthalten **nur öffentliche URL-/Titel-/Metadaten**. Sie sind weltweit öffentlich einsehbar. Auch die Anwendung selbst ist ohne Login erreichbar.
- **Keine internen Dateien oder personenbezogene Kontakte** hochladen. Auch öffentlich zugängliche Meldungen können personenbezogene Daten enthalten. Dafür muss bei einem offiziellen Betrieb eine datenschutzrechtliche Prüfung stattfinden.
- Lokale Aufgaben/Merkliste: `localStorage` im Browser, nicht verschlüsselt; Browserprofil und Endgerät schützen. **Kein Cloud-Backup**.
- Microsoft-Aufgaben: Graph-Anfragen erfolgen direkt vom Browser zu Microsoft, nur nach Anmeldung, kein eigener Server. Zugangstoken im Sitzungsspeicher. Sicherheits- und Rechtsprüfung inkl. Microsoft-Datenverarbeitung durch eure IT.
- Die aktuelle Lösung enthält **keine Login-/Zugriffssperre** für die öffentliche Website und keinen professionellen Audit-Log. Deshalb ist sie **nicht als freigegebenes IFAW-Produkt oder DSGVO-zertifiziert** zu bezeichnen.
- Kein kostenloser Drittanbieter garantiert unbegrenzte Nutzung. Für vertrauliche Inhalte ist später ein Organisations-geprüftes Hosting, Authentifizierung und dokumentiertes Berechtigungskonzept nötig.

## Tests

`tests/test_collect.py` – RSS, Atom, XSS-Sanitizing, URL-Prüfung, Fehlschläge, Duplikate, Datumsfilter, Crossref.
`tests/test_analysis.cjs` – Relevanz, Themen, Krise, Suche, Ideen-Kennzeichnung.
`tests/test_browser.py` – reale UI-Bedienung in Chromium mit kontrollierten Fixtures, lokalem Speicher und Link-Sicherheit.

## Projektstruktur

```
index.html             HTML-Grundgerüst
styles.css             Laptop-zentriertes Design
app.js                 Dashboard, Ansichten, Aufgaben, Recherche
lib/analysis.js        Transparente Regel-Auswertung
lib/graph.js           Microsoft To Do OAuth/Graph
scripts/collect.py     Geplanter Feed-/Crossref-Abruf
data/articles.json     Öffentliche Quellendaten (initial leer)
.github/workflows/refresh.yml   Geplanter Abruf/Pages-Veröffentlichung
tests/                  Unit-/Smoke-Tests
```

Lizenz: Nutzungsrechte an externen Quelltexten/Marken bleiben bei den jeweiligen Rechteinhabern. Für Veröffentlichung unter offiziellem IFAW-Namen/Logo bitte Unternehmensfreigabe einholen.
