<p align="center">
  <img src="https://img.shields.io/badge/BiamOS-v0.9.0-blueviolet?style=for-the-badge&logo=windows&logoColor=white" alt="version"/>
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="electron"/>
  <img src="https://img.shields.io/badge/AI%20Powered-OpenRouter-FF6B35?style=for-the-badge&logo=openai&logoColor=white" alt="ai"/>
  <img src="https://img.shields.io/badge/License-AGPL--3.0-green?style=for-the-badge" alt="license"/>
</p>

<h1 align="center">
  🧬 BiamOS
</h1>

<p align="center">
  <strong>The AI-Native Desktop Operating Layer for Windows</strong>
</p>

<p align="center">
  <em>One input. Infinite possibilities. Your desktop has never been this alive.</em>
</p>

---

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-license">License</a>
</p>

---

## 🎯 What is BiamOS?

BiamOS transforms your Windows desktop into an **AI-powered command center**. Instead of switching between apps, tabs, and search bars — you just **talk, type, or think** and BiamOS handles the rest.

> _"Imagine if Siri, a web browser, and a research assistant had a baby — and it lived on your desktop."_

<br/>

## ✨ Features

<table>
  <tr>
    <td width="50%">
      <h3>🗣️ Natural Language Interface</h3>
      <p>Type anything — from "weather in Vienna" to "compare Tesla vs BMW stock" — and BiamOS understands, routes, and renders beautiful results instantly.</p>
    </td>
    <td width="50%">
      <h3>🌐 Built-In Web Browser</h3>
      <p>Full Chromium-based browser embedded inside BiamOS. Browse any website, log into your accounts, manage tabs — all without leaving your workspace.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🧠 AI Copilot Sidebar</h3>
      <p>An intelligent research buddy that appears next to every webpage. Ask questions, get summaries with source links, and deep-dive into any topic — with context from the page you're viewing.</p>
    </td>
    <td width="50%">
      <h3>🔌 Plugin-Based Integrations</h3>
      <p>Connect to any API — weather, crypto, news, stocks, translations, and more. Create your own integrations with a simple JSON schema. No coding required.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>📌 Persistent Workspaces</h3>
      <p>Pin your most-used widgets, API cards, and browser tabs. They survive restarts, remember their position, and stay exactly where you left them.</p>
    </td>
    <td width="50%">
      <h3>🎙️ Voice Control</h3>
      <p>Speak your commands. BiamOS transcribes, understands, and even speaks back with natural-sounding TTS. Hands-free computing, finally.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🤖 Multi-Agent AI Pipeline</h3>
      <p>Behind every query, a 6-stage AI pipeline classifies, routes, fetches, and renders your results — all in under 2 seconds. Concierge → Classifier → Router → Executor → Renderer.</p>
    </td>
    <td width="50%">
      <h3>🎨 Stunning Dark UI</h3>
      <p>Premium glassmorphism design with smooth animations, gradient cards, and a canvas-based workspace. Drag, resize, and organize your world like a pro.</p>
    </td>
  </tr>
</table>

<br/>

## 🔄 How It Works

```
┌─────────────────────────────────────────────────┐
│                  YOU TYPE / SPEAK                │
│              "Bitcoin price today"               │
└──────────────────────┬──────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │   🎯 Concierge AI   │  Decides: API? Browse? Answer?
            └──────────┬──────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │ 🔌 API    │ │ 🌐 Web    │ │ 💬 Answer │
   │ Execute   │ │ Browser   │ │ Direct    │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
         │             │             │
         └─────────────┼─────────────┘
                       │
            ┌──────────▼──────────┐
            │  🎨 Canvas Render   │  Beautiful cards on your workspace
            └─────────────────────┘
```

<br/>

## 🏗️ Architecture

BiamOS is built as a **monorepo** with three core packages:

| Package | Tech | Purpose |
|---------|------|---------|
| **`frontend`** | React + TypeScript + MUI | Canvas workspace, chat, widgets |
| **`backend`** | Hono + Drizzle + SQLite | AI pipeline, API proxy, agents |
| **`electron`** | Electron 34 | Native desktop shell, webview |

### The AI Intent Pipeline

```
D1: Intent Pipeline    →  Concierge → Classifier → Router → Executor
D2: WebView + Copilot  →  Built-in browser with AI sidebar
D3: Design System      →  25+ block types (hero, table, chart, list...)
D4: Integration Manager →  JSON-schema API plugins, hot-reload
D5: Backend & Database  →  Structured logger, SQLite, settings
D6: Electron Shell     →  Webview permissions, Ghost-Auth, TTS
```

<br/>

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** 10+
- An **OpenRouter API key** (free tier available at [openrouter.ai](https://openrouter.ai))

### Installation

```bash
# Clone the repository
git clone https://github.com/BiamOS/BiamOS.git
cd BiamOS

# Install dependencies
npm install

# Start the desktop app
npm run electron
```

On first launch, go to **Settings → Usage Dashboard** and enter your OpenRouter API key.

<br/>

## 🛡️ Privacy & Security

- 🔒 **All data stays local** — SQLite database on your machine
- 🚫 **No telemetry** — BiamOS never phones home
- 🛡️ **Privacy blocklist** — Banking, email, and healthcare sites are never analyzed
- 🔑 **API keys stored locally** — encrypted in your local database, never transmitted

<br/>

## 📋 Roadmap

- [x] Natural language intent pipeline
- [x] Built-in web browser with tab management
- [x] AI Copilot sidebar with web search
- [x] Voice input & TTS output
- [x] Plugin-based API integrations
- [x] Persistent pinned workspaces
- [ ] Autopilot — automated web actions
- [ ] Multi-window support
- [ ] Custom themes & layouts
- [ ] Mobile companion app

<br/>

## 📄 License

BiamOS is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See [LICENSE](LICENSE) for details.

<br/>

---

<p align="center">
  <strong>Built with 🧬 by the BiamOS Organization</strong>
  <br/>
  <sub>© 2026 BiamOS Contributors</sub>
</p>
