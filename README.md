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
  <strong>The AI-Native Workspace OS</strong><br/>
  <sub>Windows • macOS • Linux</sub>
</p>

<br/>

<!-- 🎥 Replace this with a GIF or MP4 demo of BiamOS in action -->
<p align="center">
  <img src="docs/assets/demo.gif" alt="BiamOS Demo" width="800"/>
</p>

<br/>

BiamOS is **not just another wrapper**. It transforms your desktop into a **proactive command center**. By combining a native Chromium webview with a local AI pipeline, BiamOS **reads the DOM** of the sites you browse. It acts as your personal agent — extracting data, bypassing complex API auth, and generating modular UI blocks instantly.

> _No cloud dependency. No tracking. Everything runs locally on your machine._

---

<p align="center">
  <a href="#-the-game-changer">🔥 Game Changer</a> •
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-getting-started">Getting Started</a> •
  <a href="#-license">License</a>
</p>

---

## 👻 The Game Changer

### Zero-OAuth "Ghost" Integrations

<table>
  <tr>
    <td width="60%">
      <p>Forget generating API keys or giving OAuth permissions to third-party apps.</p>
      <p>BiamOS uses a <strong>built-in Chromium Webview</strong>. Log into Gmail, Notion, or WhatsApp <em>normally</em>, and ask BiamOS to <code>"summarize my unread emails"</code>.</p>
      <p>The local AI <strong>securely reads the DOM</strong> directly from the webview and renders the results. No APIs. No tracking. <strong>Pure local magic.</strong></p>
      <blockquote>💡 We call this <strong>Ghost-Auth</strong> — because the user is already authenticated through normal browser login. BiamOS just reads what's on screen.</blockquote>
    </td>
    <td width="40%">
      <!-- 🎥 Replace with Ghost-Auth demo GIF -->
      <p align="center"><em>🎥 Ghost-Auth demo coming soon</em></p>
    </td>
  </tr>
</table>

<br/>

## ✨ Features

<table>
  <tr>
    <td width="50%">
      <h3>🗣️ Natural Language Interface</h3>
      <p>Type anything — from <code>"weather in Vienna"</code> to <code>"compare Tesla vs BMW stock"</code> — and BiamOS understands, routes, and renders beautiful results instantly.</p>
    </td>
    <td width="50%">
      <h3>🧠 Context-Augmented Browsing</h3>
      <p>The UI <strong>thinks with you</strong>. Browsing apartments in Tokyo on Airbnb? BiamOS detects the context and automatically generates interactive cards on your canvas for Tokyo's weather, currency exchange rates, and local time — <em>before you even type a single query</em>.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🔎 AI Copilot Sidebar</h3>
      <p>An intelligent research buddy next to every webpage. Ask questions about the page you're viewing, get summaries with source links, and deep-dive into any topic — with <strong>full page context + web search + screenshot analysis</strong>.</p>
    </td>
    <td width="50%">
      <h3>🔌 Plugin-Based Integrations</h3>
      <p>Connect to any API — weather, crypto, news, stocks, translations, and more. Create your own integrations with a simple JSON schema. <strong>No coding required.</strong></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>📌 Persistent Workspaces</h3>
      <p>Pin your most-used widgets, API cards, and browser tabs. They survive restarts, remember their position, and stay exactly where you left them.</p>
    </td>
    <td width="50%">
      <h3>🎙️ Voice Control</h3>
      <p>Speak your commands. BiamOS transcribes via Whisper, understands intent, and speaks back with natural-sounding TTS. <strong>Hands-free computing, finally.</strong></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🤖 Multi-Agent AI Pipeline</h3>
      <p>Behind every query, a 6-stage AI pipeline classifies, routes, fetches, and renders your results — all in under 2 seconds. <br/><code>Concierge → Classifier → Router → Executor → Renderer</code></p>
    </td>
    <td width="50%">
      <h3>🎨 Stunning Dark UI</h3>
      <p>Premium glassmorphism design with smooth animations, gradient cards, and a drag-and-drop canvas workspace. <strong>Organize your world like a pro.</strong></p>
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
