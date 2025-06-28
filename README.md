# Vote App Webanwendung

Dies ist eine Webanwendung zur Erstellung und Durchführung von Umfragen (ähnlich Doodle), entwickelt als Projektarbeit im Modul **Webengineering**.

## Features

- Registrierung & Login mit Passwort-Hashing (bcrypt, JWT)
- Umfragen erstellen (Single-/Multiple-Choice)
- Teilnahme an Umfragen & Anzeige der Resultate
- Eigene Umfragen löschen
- Responsives Design (Mobile First)
- Ergebnis-Diagramme (Balkendiagramm)
- Sichere API mit Rate-Limiting, Input-Validierung, XSS-Schutz
- Build mit Webpack (alle Ressourcen gebündelt und minifiziert)

## Projektstruktur

- **/dist** – Gebündeltes Frontend (HTML, CSS, bundle.js, Komponenten)
- **/public** – Source-Files (nur für Entwicklung)
- **server.js** – Node.js/Express Backend-Server (REST API)
- **users.json** / **polls.json** – User- & Umfragedaten (lokal, JSON)

## Entwicklung & Deployment

1. **Installieren:**
   ```bash
   npm install
   ```
