<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="180"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/BiamOS-v2.3.1--alpha-blueviolet?style=for-the-badge&logo=windows&logoColor=white" alt="version"/>
  <img src="https://img.shields.io/badge/Electron_34-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="electron"/>
  <img src="https://img.shields.io/badge/React_19-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="react"/>
  <img src="https://img.shields.io/badge/License-AGPL--3.0-green?style=for-the-badge" alt="license"/>
</p>

<h1 align="center">🧬 BiamOS v2.3.1-alpha</h1>

<h3 align="center">
  <em>The Autonomous AI Web Browser</em><br/>
  Native Desktop Workspace for Windows, macOS & Linux
</h3>

<p align="center">
  <a href="#-getting-started">Quick Start</a> •
  <a href="#-autonomous-web-agent">Web Agent</a> •
  <a href="#-ghost-auth--zero-oauth">Ghost-Auth</a> •
  <a href="#-the-domain-brain--librarian">Domain Brain</a> •
  <a href="https://www.youtube.com/@BiamOS_AI/videos">📺 YouTube</a>
</p>

---

<p align="center">
  <img src="./docs/assets/1.png" alt="BiamOS Demo Screenshot 1" width="48%" style="border-radius:8px"/>
  &nbsp;
  <img src="./docs/assets/2.png" alt="BiamOS Demo Screenshot 2" width="48%" style="border-radius:8px"/>
</p>

## What is BiamOS?

**BiamOS is a complete paradigm shift for AI interaction.** We have moved beyond the "chatbot next to a browser" era. 

BiamOS is an **Autonomous AI Web Browser** disguised as a desktop environment. It operates locally, running complex agentic workflows directly on your machine. You simply type a command (e.g., `/act Find the newest video from Marques Brownlee and leave a comment`), and the built-in AI drives the browser, navigating Single Page Applications (SPAs) with absolute precision.

> It's not a browser extension. It's not a copilot wrapper. It's an autonomous agentic operating layer.

---

## 🕷️ Autonomous Web Agent (The WORMHOLE Engine)

Unlike traditional web automation tools (Playwright/Puppeteer/Selenium) that rely on fragile DOM selectors, or basic AI agents that get blocked by captchas, BiamOS uses the **WORMHOLE Stealth Executor**.

### Live 4D Raycasting
The agent doesn't guess where an element is based on outdated snapshots. Milliseconds before a click, it calculates live CSS geometry (`DOM.getBoxModel`), completely defeating lazy-loading layout shifts.

### GhostCursor & OS-Level Clicking
The agent's visual cursor mathematically tethers to the live-raycast, swooping in with a 0.6s cubic-bezier animation. Once perfectly aligned, it fires a **native OS-level click**. SPAs don't see an automation event; they see a human mouse click.

### Bézier Human Trajectories
To bypass sophisticated bot-detection (like Cloudflare Turnstile or Recaptcha v3), all automated mouse movements simulate human cursor acceleration and deceleration along randomized cubic-bezier curves.

---

## 🧠 The Domain Brain & The Librarian

BiamOS features a **Zero-Hardcoded RAG Semantic Memory**. We completely stripped out hardcoded scripts. The agent learns how to use websites purely through observation and negative reinforcement.

- **The Librarian:** An active background process that observes when the Agent makes a mistake or falls into an infinite loop. The Librarian immediately steps in, analyzes the failure, distills an "Avoid Rule" (Negative Reinforcement), and permanently memorizes it.
- **4-Tier Retrieval:** When the Agent visits a website, BiamOS instantly injects contextual rules (`Global` → `Domain` → `Subdomain` → `Exact Path`). The Agent instantly knows the eccentricities of whatever SPA it is currently viewing.

---

## 👻 Ghost-Auth: Zero-OAuth

> **The ultimate privacy feature for AI agents.**

Forget generating API keys or granting OAuth permissions to startups. BiamOS embeds a native Chromium Webview. Log into Gmail, Notion, X, or YouTube directly inside the UI just like a normal browser.

When you ask the Agent to act, it securely rides on your existing authenticated session. No tokens leave your machine. No APIs are required. 

---

## 💪 Muscle Memory (Workflow Replay)

When the Agent successfully completes a complex task (e.g., searching for a flight, applying a filter, and extracting prices), BiamOS hashes the semantic intent and saves the entire step-by-step sequence to a local SQLite database.

The next time you ask for a similar task, the system recognizes the intent via on-device embeddings (MiniLM-L6) and perfectly replays the "Muscle Memory" instantly, bypassing the expensive LLM planning phase.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron 34 Desktop Shell                    │
│    Chromium Webview  •  Stealth Executor  •  Native OS Input    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────┐    ┌──────────────────────────────┐  │
│  │   React 19 Frontend   │    │      Hono REST Backend       │  │
│  │                       │    │                              │  │
│  │  Spatial Canvas       │◄──►│  WORMHOLE Engine (CDP)       │  │
│  │  GhostCursor Engine   │    │  Domain Brain (RAG)          │  │
│  │  Set-of-Mark Overlay  │    │  The Librarian (Learning)    │  │
│  │  Agent Dashboard UI   │    │  Workflow Muscle Memory      │  │
│  │                       │    │                              │  │
│  │  TypeScript + MUI     │    │  Drizzle ORM + SQLite        │  │
│  └───────────────────────┘    └──────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

| | Windows | macOS |
|---|---|---|
| **Runtime** | Node.js 18+ & npm | Node.js 18+ & npm |
| **LLM Key** | OpenRouter API key → [Get one](https://openrouter.ai/keys) | OpenRouter API key → [Get one](https://openrouter.ai/keys) |

---

### 💻 Run from Source

```bash
# Clone the repository
git clone https://github.com/BiamOS/BiamOS.git
cd BiamOS

# Setup Environment Variables
# Copy .env.example to .env and insert your OpenRouter Key
cp .env.example .env

# Install dependencies
npm install

# Start BiamOS
npm run electron
```

### 📦 Build Distributables

```bash
# macOS → produces dist-electron/BiamOS-*.dmg (arm64 + x64)
npm run dist:mac

# Windows → produces dist-electron/BiamOS Setup *.exe
npm run dist:win
```

> **Note for macOS:** On first launch of the `.dmg`, right-click → Open to bypass Gatekeeper.

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
  <a href="https://github.com/BiamOS/BiamOS/issues">Request Feature</a> •
  <a href="https://www.youtube.com/@BiamOS_AI/videos">📺 YouTube Channel</a>
</p>
