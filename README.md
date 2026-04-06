<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="180"/>
</p>

# 🧬 BiamOS (Konzept & Archiv)

> **⚠️ WICHTIGER HINWEIS: Dieses Projekt wurde eingestellt.**
>
> BiamOS ist eine **reine Konzeptstudie** und Ideensammlung. Es handelt sich **nicht** um eine funktionierende Software oder ein einsatzbereites Produkt. Die aktive Entwicklung und der Aufbau wurden gestoppt. Dieses Repository dient nur noch als Archiv für die konzeptionellen Ansätze und Architektur-Ideen.

---

## 🎯 Was sollte gelöst werden?

Das Projekt entstand aus der Beobachtung, dass aktuelle KI-Agenten und Web-Automatisierungs-Tools (wie Playwright, Puppeteer oder Selenium) oft an modernen, dynamischen Webseiten (Single Page Applications - SPAs) scheitern. 

Die Kernprobleme herkömmlicher Ansätze, die wir lösen wollten:
- **Fragile DOM-Selektoren:** KI-Agenten verlassen sich auf HTML-Code, der sich bei jedem Update ändern kann.
- **Bot-Erkennung:** Automatisierte Zugriffe werden durch Captchas (wie Cloudflare Turnstile oder Recaptcha v3) zuverlässig blockiert.
- **Mangelnder Kontext:** KI-Agenten haben "Amnesie". Sie lernen nicht aus vergangenen Fehlern auf spezifischen Webseiten.

## 💡 Das BiamOS Konzept

BiamOS wurde als **Autonomer KI-Webbrowser** konzipiert, der als natives Desktop-System agiert. Das Ziel war es, die Interaktion zwischen KI und Webbrowser auf eine Art menschliche Wahrnehmungs-Ebene ("Vision-First") zu heben.

Die zentralen architektonischen Ideen (Theoretische Ansätze):

### 1. 🕷️ Autonomer Web-Agent (The WORMHOLE Engine)
Anstatt sich auf DOM-Selektoren zu verlassen, sollte die KI eine visuelle Wahrnehmung nutzen (Live 4D Raycasting / Kinetic Sonar). Der Agent sollte verstehen, wo Elemente auf dem Bildschirm sind (Vision-First) und echte, menschlich wirkende OS-Level-Mausklicks über berechnete Bézier-Kurven (GhostCursor) simulieren, um Bot-Detektionen zu umgehen.

### 2. 🧠 Domain Brain & The Librarian
Eine lokale, lernende RAG-Wissensdatenbank. Der Agent sollte lernen, wie Webseiten funktionieren. Wenn ein Ansatz fehlschlägt oder der Agent in eine Endlosschleife gerät, sollte ein Hintergrundprozess ("The Librarian") eingreifen, den Prozess analysieren und eine Vermeidungsregel abspeichern.

### 3. 👻 Ghost-Auth (Zero-OAuth)
Eine radikal lokale und private Herangehensweise an Berechtigungen. Ohne API-Schlüssel oder unsichere OAuth-Tokens an Startups vergeben zu müssen, loggt sich der Nutzer im eingebetteten Chromium-Modul direkt ein (z. B. YouTube, Gmail). Die KI reitet dann sicher und völlig lokal auf dieser bestehenden Session.

### 4. 💪 Muscle Memory (Workflow-Replay)
Eine Caching-Schicht für komplexe Workflows. Wenn eine Aufgabe einmal gelöst und als "Erfolg" verbucht wurde (z. B. Flugsuche mit bestimmten Filtern), wird der exakte Ausführungsablauf in einer lokalen SQLite-Datenbank ("Muscle Memory") gespeichert. Zukünftige identische Absichts-Aufrufe (Intents) benötigen keine teuren LLM-Rechenzeiten mehr, sondern spulen die erlernte Lösung sofort ab.

## 🏗️ Theoretischer Technologie-Stack

- **Desktop Shell:** Electron (Chromium Webview, nativer OS-Zugriff)
- **Frontend / UI:** React 19 (Spatial Canvas für die KI-Wahrnehmung)
- **Backend:** Node.js / Hono
- **Speicher:** Drizzle ORM + lokales SQLite

---

*Dieses Projekt bleibt als offenes Konzept und technologische Inspiration erhalten.*
*Entwickelt in Wien, Österreich 🇦🇹.*
