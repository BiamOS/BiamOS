<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="120"/>
</p>

<h1 align="center">📖 BiamOS Developer Documentation</h1>

<p align="center">
  <em>How BiamOS works — architecture, AI pipelines, agents, and FAQs.</em><br/>
  This documentation is also available in-app under <strong>Settings → Docs</strong>.
</p>

---

## Table of Contents

- [Architecture Overview](#%EF%B8%8F-architecture-overview)
- [Agent Pipeline — How AI Browses](#-agent-pipeline--how-ai-browses)
- [Context Copilot](#-context-copilot)
- [The Domain Brain](#-the-domain-brain)
- [API Reference](#-api-reference)
- [FAQ](#-frequently-asked-questions)

---

## 🏗️ Architecture Overview

BiamOS is an **Autonomous AI Web Browser** built as an Electron desktop app. The frontend (React + Vite) communicates with a local backend (Hono HTTP server) over `localhost:3001`. All data is stored in a local SQLite database via Drizzle ORM — no cloud, no external databases.

### System Diagram

```
┌──────────────┐    HTTP     ┌──────────────┐    Drizzle    ┌──────────┐
│   Frontend   │ ◄────────►  │   Backend    │ ◄──────────►  │  SQLite  │
│  React/Vite  │  /api/*     │  Hono Server │   ORM         │  BiamOS  │
└──────┬───────┘             └──────┬───────┘               │   .db    │
       │                            │                       └──────────┘
       │ IPC                        │ fetch
┌──────┴───────┐             ┌──────┴───────┐
│   Electron   │             │  LLM Provider│
│    Shell     │             │  (OpenRouter │
│  + Webview   │             │   / Ollama)  │
└──────────────┘             └──────────────┘
```

### Technology Stack

| Technology | Role |
|---|---|
| **Electron 34** | Desktop shell, webview management, IPC, session persistence |
| **React 19 + TypeScript** | Frontend UI with MUI components |
| **Vite** | Fast dev server and production bundler |
| **Hono** | Lightweight HTTP backend |
| **Drizzle ORM** | Type-safe SQLite queries and schema management |
| **SQLite (libSQL)** | Local-first database, zero configuration |
| **OpenRouter / Ollama** | LLM provider for all AI agents |
| **MiniLM / Gemini** | Embedding models for semantic matching |

---

## ⚡ Agent Pipeline — How AI Browses

When you type a command starting with `/act` or a general statement, BiamOS routes it through a **Multi-Agent Pipeline**. Instead of translating commands into static REST APIs, the AI now physically controls a headless browser using native OS-level inputs.

### Pipeline Stages

```
User Query → [1] Semantic Router → [2] Domain Brain Retrieval → [3] WORMHOLE Executor
                                                                     ↓
                                   [6] The Librarian ← [5] Native OS Input ← [4] GhostCursor Sync
```

| Stage | Agent | What It Does |
|-------|-------|-------------|
| **1. Semantic Router** | LLM | Determines the intent type: `RESEARCH`, `ACT`, `NAVIGATE`, or `GENERAL_KNOWLEDGE`. |
| **2. Domain Brain Retrieval** | Service | Fetches specific rules, instructions, or selector hints from RAG memory for the current domain. |
| **3. WORMHOLE Executor** | Service | Performs live 4D raycasting on the DOM to find coordinates of elements without relying on fragile CSS selectors. |
| **4. GhostCursor Sync** | Service | Animates the visual cursor to match the physical raycast coordinates, simulating human trajectories (Bézier). |
| **5. Native OS Input** | Service | Dispatches real OS-level mouse clicks and keyboard events through Electron. |
| **6. The Librarian** | Service | Observes execution. If the agent fails or loops, it distills 'Avoid Rules' for future runs. |

### Key Concepts

- **Muscle Memory:** Successful workflows (e.g., booking a flight) are saved locally as cached JSON step sequences. When asked again, BiamOS replays the cache instead of querying the LLM for planning.

---

## 🌐 Context Copilot

The **Context Copilot** is your persistent sidebar assistant. It actively observes your browser tabs and answers questions using live page data without requiring dedicated API integrations.

### How it Works

| Step | What Happens |
|------|-------------|
| **1. DOM Extraction** | Strips scripts/styles, extracts meaningful text from the active webview |
| **2. Context Analysis** | LLM identifies the page topic, key entities, and actionable data |
| **3. Chat Interface** | You can ask follow-up questions — Copilot understands the context of the current active tab |

### LLM Provider Setup

BiamOS requires an LLM provider to power all AI features. Currently supported:

- **OpenRouter** (recommended) — Cloud-based, access to hundreds of models (GPT-4, Gemini, Claude, Llama). Sign up at [openrouter.ai](https://openrouter.ai).
- **Ollama** — Local, private, requires installation. Models run on your machine.

Configure your API key in **Settings → LLM**.

---

## 🧠 The Domain Brain

The **Domain Brain** is the core memory system of BiamOS. Instead of brittle, hardcoded scripts for individual websites, the agent learns how to interact with DOM elements dynamically over time.

### RAG Tier System

| Tier | Description |
|------|-------------|
| **Tier 1: Global** | Rules applying to all websites (e.g., always accept cookie banners). |
| **Tier 2: Domain** | Rules for specific domains (e.g., youtube.com). |
| **Tier 3: Subdomain**| Rules for subdomains (e.g., studio.youtube.com). |
| **Tier 4: Exact Path** | Rules for specific pages (e.g., /upload) using Regex matching. |

### Knowledge Types

- `user_instruction` — High-level intent ("On GitHub, always prefer dark mode").
- `selector_rule` — Specific hints about the DOM ("The search bar is typically in div#search-container").
- `avoid_rule` — Negative reinforcement automatically generated by The Librarian to stop infinite loops.

### Learned Interface

You can manage, manually create, or delete RAG entries directly from the **Knowledge Base** panel in the UI. This allows you to explicitly train the agent on how to use internal company tools or complex web applications.

---

## 📡 API Reference

All backend routes are available at `http://localhost:3001/api/`.

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/agents` | List all pipeline agents |
| `PUT` | `/api/agents/:name` | Update agent config (model, prompt, etc.) |
| `GET` | `/api/changelog` | List changelog entries |
| `GET` | `/api/pinned` | List pinned dashboard blocks |

### Intent & AI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/intent` | Process a user query through the AI pipeline |
| `POST` | `/api/context/analyze` | Copilot — analyze page DOM content |
| `POST` | `/api/context/chat` | Copilot — chat with context |
| `POST` | `/api/agents/act` | Agent — Webview action execution loop |

### System & Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/provider` | Get current LLM provider info |
| `PUT` | `/api/system/provider` | Update LLM provider + API key |
| `GET` | `/api/system/stats` | Token usage statistics |

---

## ❓ Frequently Asked Questions

<details>
<summary><strong>Why do I need an API key?</strong></summary>

BiamOS uses large language models (LLMs) to understand your queries, route them to the right pipeline, and generate actions. These models run in the cloud (OpenRouter) or locally (Ollama). You need an API key to authenticate with the cloud provider. Without it, all AI features are disabled.
</details>

<details>
<summary><strong>What is OpenRouter?</strong></summary>

OpenRouter is an LLM gateway that gives you access to hundreds of AI models (GPT-4, Gemini, Claude, Llama, etc.) through a single API key. BiamOS uses it as the default provider because it offers the best model variety and reliability.
</details>

<details>
<summary><strong>Can I use BiamOS without internet?</strong></summary>

Partially. If you use Ollama as your LLM provider, AI features work offline. However, web browsing and copilot chat require internet access.
</details>

<details>
<summary><strong>How do I teach the agent a new flow?</strong></summary>

You don't need to 'program' it. Just ask it to perform a task. If it struggles, instruct it carefully via the Copilot chat. When it succeeds, BiamOS automatically saves the workflow as 'Muscle Memory'. Alternatively, you can explicitly add rules in the Knowledge Base.
</details>

<details>
<summary><strong>What happens when I click 'Delete All Data'?</strong></summary>

It purges all user data: agent memory, learned rules, pinned blocks, changelog entries, and system settings. The database tables remain but are emptied. The page reloads to reset the UI. **This is irreversible!**
</details>

<details>
<summary><strong>What are Blocks?</strong></summary>

Blocks are our internal visual component design system — titles, charts, key-value pairs, image grids, lists, etc. The Layout Architect (an AI agent) selectively uses these components to build custom reports and dashboards dynamically.
</details>

<details>
<summary><strong>How does semantic routing work?</strong></summary>

BiamOS generates vector embeddings (768-dimensional arrays of numbers) for intents. When you type a query, it's also converted to an embedding. This enables the agent to pattern-match commands ('find John on LinkedIn' vs. 'open John Doe LI profile') without exact text matches.
</details>

<details>
<summary><strong>Where is my data stored?</strong></summary>

All data is stored locally in a SQLite database at `packages/backend/data/BiamOS.db`. Nothing is sent to external servers except API calls to your configured LLM provider. Your data stays on your machine.
</details>

---

<p align="center">
  <em>This documentation is auto-synced with the in-app <strong>Settings → Docs</strong> panel.</em>
</p>
