<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="180"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/BiamOS-v1.0.0--alpha-blueviolet?style=for-the-badge&logo=windows&logoColor=white" alt="version"/>
  <img src="https://img.shields.io/badge/Electron_34-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="electron"/>
  <img src="https://img.shields.io/badge/React_19-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="react"/>
  <img src="https://img.shields.io/badge/License-AGPL--3.0-green?style=for-the-badge" alt="license"/>
</p>

<h1 align="center">🧬 BiamOS</h1>

<h3 align="center">
  <em>Base for Intent & AI Middleware</em><br/>
  The AI-Native Workspace OS — Windows, macOS & Linux
</h3>

<p align="center">
  <a href="#-getting-started">Quick Start</a> •
  <a href="#-ghost-auth--zero-oauth-integrations">Ghost-Auth</a> •
  <a href="#-the-dual-agent-system">Dual-Agent</a> •
  <a href="#-core-features">Features</a> •
  <a href="#%EF%B8%8F-architecture">Architecture</a> •
  <a href="DOCUMENTATION.md">📖 Docs</a> •
  <a href="#-license">License</a>
</p>

---

<!-- 🎥 REPLACE WITH YOUR DEMO GIF/VIDEO -->
<p align="center">
  <img src="docs/assets/demo.gif" alt="BiamOS Demo" width="800"/>
</p>

---

## What is BiamOS?

DEMO VIDEO: https://www.youtube.com/watch?v=QOKNlAsJjyw
BASIC WORKFLOW VIDEO: https://youtu.be/hPPa_Wx1dnM

**BiamOS is not just another wrapper.** It transforms your desktop into a **proactive command center**. By combining a native Chromium webview with a local AI pipeline, BiamOS acts as your personal agent — extracting data, bypassing complex API auth via **Ghost-Auth**, and generating modular UI dashboards instantly.

> It's not a browser. It's not a chatbot. It's a **desktop-native AI operating layer** that sits between you and the web.

---

## 👻 Ghost-Auth — Zero-OAuth Integrations

> **The Game Changer.**

Forget generating API keys. Forget OAuth permission screens. Forget giving third-party apps access to your accounts.

BiamOS uses a **built-in Chromium Webview** with persistent sessions. Log into Gmail, Notion, or WhatsApp — just like you normally would. Then ask the Copilot:

```
"Summarize my unread emails."
```

The local AI **securely reads the DOM** directly from the webview and renders the results. No APIs. No tracking. No tokens leaving your machine.

### 🛡️ Smart Privacy Shield

Sensitive domains (banking, healthcare, email) are **automatically blocked** from background analysis. BiamOS won't auto-scan these pages. But when **you** explicitly ask a question, the Copilot reads the page content on-demand.

> **You** decide when the AI reads. Not the other way around.

---

## 🧠 The Dual-Agent System

BiamOS runs **two independent AI assistants**, each with a distinct role:

<table>
<tr>
<td width="50%">

### 🎙️ System Assistant
**Controls the main canvas.**

- 🗣️ **Voice Control** — speak naturally, get audio responses (TTS)
- 🔀 **Intent Router** — classifies queries: web search vs. API integrations vs. browser action
- 📊 **UI Block Generator** — renders weather cards, tables, crypto charts, and custom blocks
- 📌 **Pin & Dashboard** — pin any result to your canvas to build a persistent workspace

</td>
<td width="50%">

### 🌐 Web Copilot
**Lives inside the webview.**

- 📖 **DOM-Aware** — reads the actual content of the page you're browsing
- 📸 **Screenshot Analysis** — takes a visual snapshot for multimodal understanding
- 🔍 **Web Search Buddy** — answers questions with clickable source links
- 💬 **Context Chat** — multi-turn conversations scoped to the current site
- 🤖 **AI Browser Agent (Alpha)** — autonomous click, type, scroll, search, and navigate across any website

</td>
</tr>
</table>

**Example flow:**
1. You browse `gmail.com` in the built-in webview
2. The Web Copilot extracts the page content (DOM + screenshot)
3. You type: *"Which emails are urgent?"*
4. The Copilot analyzes the inbox and responds — **no API, no OAuth, just local AI magic** 👻

---

## 🤖 AI Browser Agent (Alpha)

> **Your AI can now control the browser.**

Type `/act` followed by a task, and the AI Browser Agent takes over — clicking, typing, scrolling, and searching autonomously. No APIs needed, no code required.

```
/act Open Gmail, compose an email to team@company.com. Subject: "AI Market Update".
    Search the web for "top AI browser agents 2026" and write a professional
    briefing with the top 3 tools, their links, and what each does. Don't send.
```

**What happens:**
1. 📧 Agent opens Gmail, clicks Compose, fills To and Subject
2. 🔍 Background web search runs (no tab switch!) — finds real results with links
3. ✍️ Agent writes the email body with research findings
4. ⏸️ Pauses before sending — asks for your confirmation

### Agent Tools
| Tool | Description |
|------|-------------|
| `click_at` | Click any element by coordinates |
| `type_text` | Type into inputs, textareas, contenteditable |
| `scroll` | Scroll up/down to reveal content |
| `navigate` | Go to a different website |
| `go_back` | Return to the previous page |
| `search_web` | Background web search without leaving the current page |
| `ask_user` | Pause and ask for confirmation before destructive actions |

> ⚠️ **Alpha**: This is the first release of autonomous browser automation. Works best with Gmail, YouTube, Google, and Hacker News. More sites and capabilities coming soon.


## ✨ Core Features

<table>
<tr>
<td width="50%">

### 🔌 Plugin-Based Integrations & Shop
Pre-built templates: Weather, Crypto, Wikipedia, Exchange Rates, Hacker News, and more. Create custom integrations via **AI Discovery** (paste any URL), **Swagger import**, or manual JSON schema. Toggle and filter integrations from the sidebar.

### 🧩 Dynamic UI Blocks
The LLM generates fully customizable UI blocks — weather cards, data tables, numbered lists, charts. **Pin** any block to your canvas to build a persistent, custom dashboard that updates in the background.

### 📌 Pinned Data Cards
Pin any query result to your workspace. Pinned cards **auto-refresh** on a schedule, keeping your dashboard always up-to-date without manual intervention.

</td>
<td width="50%">

### 🗣️ Voice Control & TTS
Speak to the System Assistant. It classifies your intent, fetches data, and **replies with audio** using text-to-speech. Full hands-free operation.

### 🔒 Data Audit & Local Privacy
Open the **Data Audit** panel in Settings. See exactly what is stored: API keys, agent prompts, browser cookies, integration configs. Wipe **everything** with a single "Delete All Data" button. All data lives in a local SQLite database. Nothing leaves your machine unless you ask.

### 📑 Multi-Tab Browser
A full tabbed browsing experience with back/forward/refresh, persistent login sessions, and **webview-only zoom** (sidebar stays fixed). Each tab remembers its URL, context, and copilot chat history independently.

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron 34 Desktop Shell                    │
│    Webview (Ghost-Auth)  •  TTS  •  Session Persistence         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐    ┌──────────────────────────────┐  │
│  │   React 19 Frontend   │    │      Hono REST Backend       │  │
│  │                       │    │                              │  │
│  │  Canvas Workspace     │◄──►│  Intent Pipeline (6 stages)  │  │
│  │  Context Sidebar      │    │  Context Engine (DOM → LLM)  │  │
│  │  Dynamic UI Blocks    │    │  Agent Router & Scorer       │  │
│  │  Integration Sidebar  │    │  Integration Manager         │  │
│  │  Settings & Audit     │    │  Context Chat (Web Search)   │  │
│  │                       │    │                              │  │
│  │  TypeScript + MUI     │    │  Drizzle ORM + SQLite        │  │
│  └───────────────────────┘    └──────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Stack | Role |
|-------|-------|------|
| **Frontend** | React 19, TypeScript, MUI | Canvas workspace, dynamic UI blocks, browser tabs |
| **Backend** | Hono, Drizzle ORM, SQLite | AI pipeline, intent classification, agent routing |
| **Desktop** | Electron 34 | Native webview, Ghost-Auth, TTS, session persistence |
| **AI** | OpenRouter (GPT-4o, Claude, etc.) | Multi-model intent routing and content generation |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- An **OpenRouter API key** → [Get one here](https://openrouter.ai/keys)

### Installation

```bash
# Clone the repository
git clone https://github.com/BiamOS/BiamOS.git
cd BiamOS

# Install all dependencies (frontend + backend + electron)
npm install

# Start the full application
npm run electron
```

On first launch, go to **Settings → LLM** and paste your OpenRouter API key.

> **That's it.** BiamOS auto-starts the backend, launches the frontend, and opens the desktop window. No Docker, no cloud, no config files.

---

## 📋 Changelog

BiamOS has a **built-in Changelog panel** (Settings → Changelog) that tracks every feature, improvement, and fix across releases.

See the latest changes: **v1.0.0-alpha** — AI Browser Agent with autonomous web automation, background web search, smart email composition, and multi-site navigation.

---

## 🛣️ Roadmap

- [x] **Autopilot Mode** — Multi-step browser automation (click, fill, submit) ✅ *v1.0.0-alpha*
- [ ] **Plugin Marketplace** — Community-created integrations
- [ ] **Scheduled Agents** — Cron-based data collection and alerts
- [ ] **macOS & Linux Builds** — Cross-platform Electron packaging
- [ ] **Offline Mode** — Local LLM support (Ollama / llama.cpp)
- [ ] **Team Workspaces** — Shared dashboards with role-based access

---

## 📄 License

BiamOS is licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

You are free to use, modify, and distribute this software under the terms of the AGPL-3.0. If you modify and deploy BiamOS as a service, you must release your modifications under the same license.

---

<p align="center">
  <strong>Built with 🧬 by the BiamOS Contributors</strong><br/>
  <em>From Vienna, Austria 🇦🇹</em>
</p>

<p align="center">
  <a href="https://github.com/BiamOS/BiamOS/issues">Report Bug</a> •
  <a href="https://github.com/BiamOS/BiamOS/issues">Request Feature</a>
</p>
