# 🧠 BiamOS — Lura Intent & Execution Flow

> **Version:** 2026-03  
> **Stack:** Electron + Vite/React (Frontend) · Hono (Backend) · SQLite/Drizzle (DB)  
> **AI Runtime:** OpenRouter / Ollama / LM Studio (configurable)

---

## 1. Big Picture — Was BiamOS ist

BiamOS ist ein **Spatial Operating System** im Browser-Stil. Jede Karte auf dem Canvas ist entweder:

| Kartentyp | Inhalt | Agentic? |
|---|---|---|
| **Web Card** | Electron Webview mit live Webpage | ✅ Ja — Agent steuert es |
| **Dashboard Card** | GenUI-Blöcke (Wetter, Preise, News…) | ❌ Nein — Read-only |

Der User tippt eine Nachricht ins `CommandCenter`. Was dann passiert, ist die **Lura Intent Pipeline**.

---

## 2. Der vollständige Lura Flow (Schritt für Schritt)

```
User tippt → CommandCenter.tsx
    │
    ├─► [Phase A] Focus Snapshot (useFocusStore)
    │       Welche Karte ist gerade fokussiert?
    │       → hasWebview, hasDashboard, currentUrl
    │
    ├─► [Phase B] Universal Router (POST /api/intent/route)
    │       LLM analysiert Intent → gibt JSON zurück
    │       → Aufgeteilt in 1..N Tasks
    │
    └─► [Phase C] dispatchTasks() (CommandCenter.tsx)
            Für jeden Task parallel:
            ├─ CHAT          → POST /api/chat
            ├─ RESEARCH      → POST /api/research (SSE Stream)
            ├─ ACTION        → Webview Agent Loop
            ├─ CONTEXT_QUESTION → Screenshot + POST /api/context/ask
            └─ ACTION_WITH_CONTEXT → Screenshot → Agent
```

---

## 3. Phase A — Focus Store (die Kontextlinse)

**Datei:** `packages/frontend/src/stores/useFocusStore.ts`

```typescript
interface CardMeta {
  hasWebview: boolean;   // Ist eine live Webpage offen?
  hasDashboard: boolean; // Ist es eine Dashboard-Karte?
  url?: string;          // Aktuelle URL der Webview
}
```

**Wann wird der Focus aktualisiert?**

| Event | Mechanismus |
|---|---|
| User klickt auf Karte | `onPointerDownCapture` in `IframeBlock.tsx` |
| User klickt INNERHALB der Webview | Electron-native `wv.addEventListener('focus', ...)` |
| Neue Karte wird gespawnt | `useFocusStore.getState().setFocus(cardId, meta)` |

> **Unique Solution:** Electron Webviews "schlucken" React-Events. Deshalb registrieren wir einen **nativen** `focus`-Listener direkt auf dem `<webview>` DOM-Element — dieser ist als einziger in der Lage, Klicks innerhalb der Webview zu erfassen.

---

## 4. Phase B — Universal Router (Zero-Shot JSON Schema)

**Datei:** `packages/backend/src/routes/universal-router.ts`

### 4.1 Integration Pre-Check (vor dem LLM)

```
Query: "wetter wien"
    │
    └─► getIntegrationForQuery(query)
            → Matched: "Open-Meteo" (score=6)
            → Sofortiger RESEARCH return (kein LLM-Call nötig!)
```

Integrationen sind benutzerdefinierte API-Mappings (SQLite). Wenn eine matched, wird der Router **komplett übersprungen** — kein Token-Verbrauch.

### 4.2 LLM-Call mit Zero-Shot JSON Schema

Das LLM muss **immer** dieses JSON zurückgeben:

```json
{
  "intent": {
    "language": "de",
    "requires_browser_interaction": true,
    "is_about_current_screen": false,
    "is_pure_chat": false,
    "is_read_only": true,
    "target": "KD Csapat YouTube Channel"
  },
  "tasks": [
    { "task": "kannst du mir kd csapat profil gehen?", "mode": "ACTION", "method": "GET" }
  ]
}
```

> **Unique Solution — Chain-of-Thought durch Reihenfolge:** Das `intent`-Objekt muss im JSON **vor** `tasks` stehen. Da LLMs Token-für-Token generieren, denkt das Modell zuerst über Sprache, Browser-Intention und Ziel nach — bevor es sich auf einen `mode` festlegt. Das ist implizites CoT ohne extra Prompt-Overhead.

### 4.3 TypeScript Hard Overrides (nach dem LLM)

Das LLM kann halluzinieren. Deshalb überschreiben wir die LLM-Entscheidungen hartkodiert:

```
Override 1:  requires_browser_interaction=true + hasWebview=true + mode=CHAT
             → force mode = ACTION

Override 1b: intent.target ≠ "" + hasWebview=true + mode=CHAT
             → force mode = ACTION, method = GET
             (Fängt: "kannst du kd csapat gehen?" wo LLM irrtümlich CHAT sagt)

Override 2:  is_about_current_screen=true + hasWebview=true
             → force mode = CONTEXT_QUESTION

Override 2b: requires_browser_interaction=true + mode=CONTEXT_QUESTION
             → force mode = ACTION
             (Fängt: "suche HIER mr beast" — "suche" ist ein Action-Verb!)

Override 3:  RESEARCH oder CONTEXT_QUESTION → method immer GET

Override 4:  is_read_only=true → method cap bei GET
```

---

## 5. Phase C — Task Dispatch

**Datei:** `packages/frontend/src/components/CommandCenter.tsx`

Jeder Task wird parallel verarbeitet. Zunächst wird entschieden **welche Karte** den Task bekommt:

```typescript
// Guard: ACTION auf Dashboard-Karte? → Neue Webview-Karte spawnen!
if (t.mode === 'ACTION' && !contextCardMeta.hasWebview) {
  // Neue Karte erstellen, hasDashboard = false
}
```

---

## 6. Die 5 Task-Modi im Detail

### 6.1 CHAT

```
POST /api/chat
  System: soul.md + base.md + installed integrations list
  Temp: 0.7, max_tokens: 600
  → Direktantwort als Lura-Persönlichkeit
```

Lura kennt ihre installierten Integrationen auch im CHAT-Modus (z.B. "Du kannst Wetterdaten über Open-Meteo abrufen").

---

### 6.2 RESEARCH

```
POST /api/research (SSE-Stream)
  │
  ├─► Integration Fast-Path?
  │       JA: API-Call → JSON → GenUI → Dashboard-Karte
  │       (kein Web-Scraping, echte API-Daten)
  │
  └─► Standard Web Research:
          1. DuckDuckGo HTML scrapen (max 8 Ergebnisse)
          2. OG-Metadata parallel fetchen (3s timeout/URL)
          3. Ersten 20KB jeder Seite lesen → og:image, og:description
          4. GenUI-Prompt → LLM generiert Block-JSON
          5. SSE-Events: step → step → dashboard (fertig)
```

**SSE Events die der Client empfängt:**
- `step` mit `{ phase: "planning" | "search" | "reading" | "generating" }`
- `dashboard` mit `{ blocks: [...] }` → render sofort

---

### 6.3 ACTION (der Agent Loop)

Das ist BiamOS' Kern-Unique-Feature: ein **agentic Webview-Controller**.

```
Frontend (useAgentActions.ts):
  LOOP bis done/ask_user/max_steps:
    1. Screenshot der Webview machen
    2. DOM-Snapshot (simplified HTML) extrahieren
    3. POST /api/agents/act {task, screenshot, dom, history}
    4. Agent antwortet mit Action JSON
    5. Frontend führt Action aus (navigate/click/type/scroll/genui)
    6. History anhängen → goto 1
```

**Agent Pipeline bei jedem Step:**

```
POST /api/agents/act
  │
  ├─► Pipeline-Agenten laden (aus SQLite):
  │       base → soul-lura → phase-action → method-X → safety
  │       → interaction → forms → cookies → platform-X
  │
  ├─► Prompt-Module komponieren (nur aktive, gereiht nach pipeline/step_order)
  │
  ├─► Screenshot + DOM → LLM → Action JSON
  │       { action: "click", selector: "#search-input" }
  │       { action: "navigate", url: "https://..." }
  │       { action: "type_text", text: "MrBeast" }
  │       { action: "genui", prompt: "Zeige die Suchergebnisse" }
  │       { action: "done", summary: "Task abgeschlossen" }
  │
  └─► Nach done: Workflow in SQLite speichern (agent-memory.js)
```

**Platform-Aware Prompt Injection:**  
Wenn der Agent auf `mail.google.com` navigiert, wird automatisch das `platform-gmail`-Modul in den Prompt injiziert — das LLM weiß dann Gmail-spezifische Details (Compose-Button, Label-Struktur etc.).

---

### 6.4 CONTEXT_QUESTION

```
Screenshot der aktuellen Webview/Dashboard
    → POST /api/context/ask { screenshot, query }
    → LLM sieht das Bild und beantwortet die Frage
    → Antwort erscheint als Chat-Nachricht
```

Kein Browser-Steuerung. Reine visuelle Analyse.

---

### 6.5 ACTION_WITH_CONTEXT

Kompination aus CONTEXT_QUESTION + ACTION:

```
1. Screenshot → LLM extrahiert Kontext aus aktuellem Screen
2. Kontext wird als vorhergehende Message in den Agent-History injiziert
3. Agent führt den eigentlichen Task aus (z.B. "tweete das hier")
```

---

## 7. Das Karten-Spawning-System

**Datei:** `packages/frontend/src/hooks/useCanvasPins.ts`

Wenn ein neuer Task eine neue Karte braucht:

```typescript
// RESEARCH → Dashboard-Karte (keine Webview!)
hasDashboard: true,  hasWebview: false
// → BrowserToolbar zeigt nur "Dashboard" Tab, kein "Web" Tab

// ACTION → Webview-Karte (kein Dashboard!)
hasDashboard: false, hasWebview: true
// → BrowserToolbar zeigt "Web" Tab, Agent kann steuern
```

> **Unique Solution:** Die strikte Trennung verhindert, dass eine "Wetter Wien" Karte plötzlich zu einem Gmail-Client wird. Jede Karte hat **eine Aufgabe** (Spatial OS Prinzip).

**GenUI-Blöcke werden karten-spezifisch dispatched:**

```typescript
// actions.ts → genui action
window.dispatchEvent(new CustomEvent('biamos:genui-blocks', {
  detail: { blocks, prompt, cardId }  // ← cardId verhindert wrong-card delivery
}))
```

---

## 8. Agent Memory System

**Datei:** `packages/backend/src/services/agent-memory.js`

Nach jedem erfolgreichen Task:

```
Task "öffne gmail" auf mail.google.com
    → saveWorkflowTrace(domain, task, steps)
    → Gespeichert als Workflow in SQLite (agentWorkflows table)
    → Optional: intent_embedding (all-MiniLM-L6-v2) für Semantic Search

Beim nächsten ähnlichen Task:
    → Embedding-Similarity-Suche
    → Workflow als "Memory" in den Prompt injiziert
    → Agent weiß bereits wie Gmail navigiert wird
```

**Feedback Loop:**
- 👍 `POST /api/agents/memory/feedback { positive: true }` → `success_count++`
- 👎 `positive: false` → `fail_count++`, evtl. gelöscht

---

## 9. Prompt-Modul-System (der Agenten-DNA)

Agenten sind keine monolithischen Prompts — sie sind **Pipeline-Ketten** von Modulen:

| Modul | Inhalt |
|---|---|
| `base` | Basis-Verhalten, JSON-Output-Format |
| `soul-lura` | Persönlichkeit: "Ich bin Lura, die native KI von BiamOS..." |
| `phase-action` | Was ist erlaubt im Action-Modus |
| `method-post/put/delete` | CRUD-Kontext je nach Method |
| `safety` | Was Lura niemals tut |
| `interaction` | Klick-, Scroll-, Type-Präzision |
| `forms` | Formular-spezifisches Verhalten |
| `cookies` | Cookie-Banner automatisch dismissen |
| `platform-gmail/youtube/...` | Site-spezifisches Domänenwissen |

Module werden **dynamisch** aus SQLite geladen und nach `pipeline` + `step_order` gereiht. User können Module in der UI editieren.

---

## 10. Integration Manager

**Datei:** `packages/backend/src/services/integration-context.ts`

Benutzerdefinierte API-Integrationen die Live-Daten liefern:

```
User erstellt Integration:
  Name:    "Open-Meteo"
  Trigger: "wetter, weather, temperatura"
  URL:     "https://api.open-meteo.com/v1/forecast?..."
  Fields:  { latitude, longitude } → aus Query extrahiert

Wenn Query matched (Score-System):
  → URL wird aufgelöst (Platzhalter gefüllt durch LLM extraction)
  → API-Call direkt vom Backend
  → JSON-Antwort → GenUI → Dashboard
  → KEIN Webscraping, KEINE Halluzination
```

**Scoring:** Jedes Trigger-Keyword +1 Punkt. Default-Schwelle: Score ≥ 3.

---

## 11. Ghost Auth (Login-Persistenz)

**Datei:** `packages/electron/src/ghost-auth.ts`

Webviews nutzen `session: "persist:lura"` — alle Logins (Google, GitHub, etc.) werden **dauerhaft gespeichert** über Electron-Sessions. Der User muss sich pro Site nur einmal einloggen.

```
Electron → will-attach-webview
  → X-Frame-Options Header entfernt (kein Iframe-Block)
  → Microphone erlaubt
  → allowpopups: true (verhindert leere Popup-Windows)
```

---

## 12. Das komplette Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────┐
│  ELECTRON SHELL                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  VITE FRONTEND (React)                                   │    │
│  │                                                           │    │
│  │  Canvas                    CommandCenter                  │    │
│  │  ┌──────────┐ ┌─────────┐  ┌─────────────────────────┐  │    │
│  │  │ Web Card │ │ Dash Card│  │ Input → dispatchTasks() │  │    │
│  │  │ Webview  │ │ GenUI    │  └──────────┬──────────────┘  │    │
│  │  │ Agent    │ │ Blocks   │             │                  │    │
│  │  └──────────┘ └─────────┘             │                  │    │
│  │   ▲ navigate    ▲ biamos:genui-blocks  │                  │    │
│  │   │ click       │                     ▼                  │    │
│  │   │ type        │         useFocusStore (Zustand)        │    │
│  │   │             │         hasWebview / hasDashboard       │    │
│  └───┼─────────────┼─────────────────────────────────────────┘    │
│      │             │                     │                        │
└──────┼─────────────┼─────────────────────┼────────────────────────┘
       │             │                     │
       │   ┌─────────────────────────────────────────────────────┐
       │   │  HONO BACKEND (:3001)                               │
       │   │                                                      │
       │   │  /api/intent/route  ←──── Universal Router          │
       │   │         │           Zero-Shot JSON Schema + Overrides│
       │   │         │                                            │
       │   │    ┌────┴────────────────────────────────┐          │
       │   │    │  CHAT  RESEARCH  ACTION  CONTEXT_Q   │          │
       │   │    │    │      │        │         │        │          │
       │   │    │  /chat  /res     /act    /context     │          │
       │   │    │         (SSE)   (Loop)    (Screenshot)│          │
       │   │    └─────────────────────────────────────┘          │
       │   │                                                      │
       │   │  SQLite (Drizzle):                                   │
       │   │    agents · agentWorkflows · integrations            │
       │   │    promptModules · settings                          │
       │   └─────────────────────────────────────────────────────┘
       │
  Electron IPC
  Ghost Auth
  Session persist
```

---

## 13. Unique Lösungen auf einen Blick

| Problem | BiamOS-Lösung |
|---|---|
| React-Events dringen nicht in Electron Webviews | Nativer `wv.addEventListener('focus', ...)` |
| LLM klassifiziert "kannst du gehen?" als CHAT | Zero-Shot Schema + 4 TypeScript Hard Overrides |
| Wetter-Query trifft Regex-Fast-Path | Integration Pre-Check **vor** Router + LLM |
| "suche hier" = CONTEXT_QUESTION statt ACTION | Override 2b: `requires_browser_interaction` beats `is_about_current_screen` |
| Dashboard-Karte wird zu Webview-Karte | Strict `hasDashboard`/`hasWebview` guard in `dispatchTasks` |
| GenUI-Blöcke landen auf falscher Karte | `cardId` in `biamos:genui-blocks` CustomEvent |
| Agent vergisst wie Gmail navigiert | Workflow-Memory in SQLite + Embedding-Similarity |
| CoT ohne extra Prompt-Overhead | `intent`-Objekt erzwingend VOR `tasks` im JSON Schema |
| Multilinguale Routing-Fehler | LLM erkennt `language` selbst, Overrides sind sprachagnostisch |
