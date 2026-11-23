# Sicherheitsgrenzen

**Vor kommerzieller/organisationsinterner Nutzung prüfen lassen.** Diese Version ist ein öffentliches Recherchefrontend mit optionaler Microsoft-To-Do-Verbindung, kein für vertrauliche Unternehmensdaten ausgelegtes System.

- Public GitHub Pages ist öffentlich. Keine internen Strategien, Reporterlisten, Zugangstoken, personenbezogenen Kontaktdaten oder unveröffentlichten Pressemitteilungen in das Repository, RSS-Suchanfragen oder App-Notizen übernehmen.
- Microsoft Graph verwendet OAuth 2.0 Authorization Code + PKCE, keine Client-Secrets, minimale delegierte Rechte für Aufgaben. Tokens verbleiben in sessionStorage. Nur in freigegebenen Entra-Tenants verwenden.
- Browser-lokale To-dos sind unverschlüsselt. Geschützter Browser/Windows-Account nötig, keine sensiblen Daten eingeben. Gerätewechsel synchronisiert nur über die erlaubte Microsoft-Verbindung.
- Quellen-Titel und Beschreibungen werden HTML-escaped. Nur http(s) Links sind klickbar, mit `noopener noreferrer`.
- Der Quellenmonitor speichert keine vollständigen Artikel und behauptet keine unabhängige Verifizierung. Relevanz und Krisenrisiko sind Schlagwortregeln.
- Vor dem echten Einsatz: IT-/DSB-Freigabe, Verzeichnis von Verarbeitungstätigkeiten soweit erforderlich, Prüfung AVV und internationaler Datenübertragungen, Rechtekonzept, Marken-/Urheberrechtsprüfung, Löschregeln, Monitoring und verantwortlicher Betreiber.
