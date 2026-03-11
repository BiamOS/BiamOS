<p align="center">
  <img src="docs/assets/logo.png" alt="BiamOS Logo" width="120"/>
</p>

<h1 align="center">📖 BiamOS Developer Documentation</h1>

<p align="center">
  <em>How BiamOS works — architecture, AI pipelines, integrations, and FAQs.</em><br/>
  This documentation is also available in-app under <strong>Settings → Docs</strong>.
</p>

---

## Table of Contents

- [Architecture Overview](#%EF%B8%8F-architecture-overview)
- [Intent Pipeline — How Queries Work](#-intent-pipeline--how-queries-work)
- [Copilot & AI Create](#-copilot--ai-create)
- [Integration Manager](#-integration-manager)
- [API Reference](#-api-reference)
- [FAQ](#-frequently-asked-questions)

---

## 🏗️ Architecture Overview

BiamOS is an **AI-native workspace OS** built as an Electron desktop app. The frontend (React + Vite) communicates with a local backend (Hono HTTP server) over `localhost:3001`. All data is stored in a local SQLite database via Drizzle ORM — no cloud, no external databases.

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
| **Hono** | Lightweight HTTP backend (replaces Express) |
| **Drizzle ORM** | Type-safe SQLite queries and schema management |
| **SQLite (libSQL)** | Local-first database, zero configuration |
| **OpenRouter / Ollama** | LLM provider for all AI agents |
| **MiniLM / Gemini** | Embedding models for semantic matching |

### Project Structure

```
packages/
  ├── frontend/       React + Vite (port 5173)
  │   └── src/
  │       ├── components/   UI panels, blocks, dialogs
  │       ├── hooks/        Reusable state hooks
  │       ├── theme/        Design tokens (COLORS, GRADIENTS)
  │       └── types/        TypeScript interfaces
  ├── backend/        Hono API server (port 3001)
  │   └── src/
  │       ├── agents/       AI pipeline stages
  │       ├── db/           Schema, bootstrap, migrations
  │       ├── routes/       API endpoints (REST)
  │       ├── services/     Business logic
  │       └── prompts/      LLM system prompts
  └── electron/       Electron main process + preload
```

---

## ⚡ Intent Pipeline — How Queries Work

When you type a query in BiamOS, it goes through a **multi-stage AI pipeline**. Each stage is handled by a specialized LLM agent. The pipeline transforms your natural language into a structured API call, then renders the result as a visual card layout.

### Pipeline Stages

```
User Query → [1] Concierge → [2] Classifier → [3] Router → [4] Param Extractor
                                                                     ↓
              UI ← [8] Renderer ← [7] Layout Architect ← [6] Guard ← [5] API Call
```

| Stage | Agent | What It Does |
|-------|-------|-------------|
| **1. Concierge** | Cache | Checks if the query matches a known group embedding. If yes, skips classification. |
| **2. Classifier** | LLM | Determines intent type: `API_CALL`, `WEB_SEARCH`, `NAVIGATE`, `OPEN_APP`, `GENERAL_KNOWLEDGE`. |
| **3. Router** | LLM | Selects the best integration endpoint using semantic matching + LLM reasoning. |
| **4. Param Extractor** | LLM | Extracts API parameters from the query (e.g., "weather in Berlin" → `city=Berlin`). |
| **5. API Call** | Service | Executes the HTTP request with extracted params and auth config. |
| **6. Guard** | Service | Validates the API response — retries on error or redirects if needed. |
| **7. Layout Architect** | LLM | Generates a block-based layout (JSON) for displaying the response data. |
| **8. UI Renderer** | React | Renders the layout as visual blocks (cards, charts, lists, etc.). |

### Key Concepts

- **Embeddings:** Each integration gets a 768-dimensional vector (via Gemini) for fast semantic matching. The Concierge compares your query embedding against all group embeddings using cosine similarity.
- **Agents vs. Services:** Agents are LLM-powered (they call an AI model). Services are deterministic code (embedding, caching, routing). Agents are configurable in the Agents panel.

---

## 🌐 Copilot & AI Create

BiamOS has two AI-powered creation tools: the **Context Copilot** (sidebar assistant) and the **AI Create / Builder** (auto-generates integrations from API docs).

### Context Copilot

The Copilot sidebar analyzes the current webpage you're viewing inside the built-in browser. It extracts DOM content, detects the page context, and provides contextual AI insights.

| Step | What Happens |
|------|-------------|
| **1. DOM Extraction** | Strips scripts/styles, extracts meaningful text from the active webview |
| **2. Context Analysis** | LLM identifies the page topic, key entities, and actionable data |
| **3. Hint Generation** | Suggests relevant actions (e.g., "Check stock price" when on a finance page) |
| **4. Chat Interface** | Users can ask follow-up questions — Copilot uses web search + page context |

### AI Create (Builder Pipeline)

The Builder takes an API documentation URL and auto-generates a full integration with endpoints, param schemas, and block layouts.

| Step | Agent | What It Does |
|------|-------|-------------|
| **1. Blueprint Generator** | LLM | Reads API docs and creates a structured endpoint definition (name, method, params, triggers) |
| **2. Docs Verifier** | LLM | Cross-checks the blueprint against the original docs — catches hallucinated endpoints |
| **3. Save & Embed** | Service | Stores the integration in the DB and generates embeddings for semantic routing |

### LLM Provider Setup

BiamOS requires an LLM provider to power all AI features. Currently supported:

- **OpenRouter** (recommended) — Cloud-based, access to hundreds of models (GPT-4, Gemini, Claude, Llama). Sign up at [openrouter.ai](https://openrouter.ai).
- **Ollama** — Local, private, requires installation. Models run on your machine.

Configure your API key in **Settings → LLM**.

---

## 🔌 Integration Manager

Integrations connect BiamOS to external APIs. Each integration has one or more **endpoints** grouped under a common name. BiamOS routes queries to the best-matching endpoint using semantic similarity + LLM reasoning.

### Integration Types

| Type | Description |
|------|-------------|
| **API Integration** | REST API calls with auto-param extraction. Powers data cards. |
| **Web Integration** | Iframe-based. Opens websites as tabs inside BiamOS. |
| **Template** | Pre-built integrations from the Template Shop (Wikipedia, Pexels, etc.). |
| **Custom** | User-created via AI Create or manual setup. |

### Key Database Fields

| Field | Purpose |
|-------|---------|
| `group_name` | Groups multiple endpoints under one integration |
| `human_triggers` | Keywords that help the Concierge match queries (e.g., "weather \| forecast \| temperature") |
| `endpoint_tags` | LLM-optimized tags for endpoint selection within a group |
| `api_config` | JSON auth config: API key, bearer token, OAuth setup |
| `allowed_blocks` | Restricts which UI blocks the Layout Architect can use for this endpoint |
| `health_status` | Health check result: `healthy`, `degraded`, `offline`, `unchecked` |

### Health Checks

BiamOS can ping integration endpoints to verify they're reachable:
- 🟢 **healthy** — responds within 3 seconds
- 🟡 **degraded** — slow response (>3s)
- 🔴 **offline** — 5xx error or timeout

Results are stored in the `health_checks` table with full history.

### Import / Export

Integrations can be exported as `.biam` packages (JSON format) and shared with other BiamOS users. Import auto-creates all endpoints and config.

---

## 📡 API Reference

All backend routes are available at `http://localhost:3001/api/`.

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/integrations` | List all integrations |
| `POST` | `/api/integrations` | Create new integration |
| `PATCH` | `/api/integrations/:id` | Update integration |
| `DELETE` | `/api/integrations/:id` | Delete integration |
| `GET` | `/api/integrations/templates` | List available templates |
| `POST` | `/api/integrations/install-template` | Install a template |
| `POST` | `/api/integrations/install-web` | Install web integration from URL |
| `GET` | `/api/integrations/health` | Run health check on all integrations |
| `GET` | `/api/integrations/health/history` | Health check history |
| `GET` | `/api/integrations/:id/export` | Export integration as .biam |
| `POST` | `/api/integrations/import` | Import .biam package |

### Intent & AI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/intent` | Process a user query through the AI pipeline |
| `POST` | `/api/builder/auto-create` | AI Create — generate integration from URL |
| `POST` | `/api/context/analyze` | Copilot — analyze page DOM content |
| `POST` | `/api/context/chat` | Copilot — chat with context |

### System & Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system/provider` | Get current LLM provider info |
| `PUT` | `/api/system/provider` | Update LLM provider + API key |
| `GET` | `/api/system/stats` | Token usage statistics |
| `GET` | `/api/agents` | List all pipeline agents |
| `PUT` | `/api/agents/:name` | Update agent config (model, prompt, etc.) |
| `GET` | `/api/changelog` | List changelog entries |
| `GET` | `/api/pinned` | List pinned dashboard blocks |

---

## ❓ Frequently Asked Questions

<details>
<summary><strong>Why do I need an API key?</strong></summary>

BiamOS uses large language models (LLMs) to understand your queries, route them to the right API, and generate visual layouts. These models run in the cloud (OpenRouter) or locally (Ollama). You need an API key to authenticate with the cloud provider. Without it, all AI features are disabled.
</details>

<details>
<summary><strong>What is OpenRouter?</strong></summary>

OpenRouter is an LLM gateway that gives you access to hundreds of AI models (GPT-4, Gemini, Claude, Llama, etc.) through a single API key. BiamOS uses it as the default provider because it offers the best model variety and reliability. Sign up at [openrouter.ai](https://openrouter.ai).
</details>

<details>
<summary><strong>Can I use BiamOS without internet?</strong></summary>

Partially. If you use Ollama as your LLM provider, AI features work offline. However, API integrations (weather, stock data, etc.) require internet to reach the external APIs. Web integrations also need internet for iframe content.
</details>

<details>
<summary><strong>How do I add a custom integration?</strong></summary>

Three ways:
1. **AI Create** — paste an API docs URL and the AI auto-generates endpoints.
2. **Template Shop** — install pre-built integrations (Wikipedia, Pexels, etc.).
3. **Manual setup** — click "New Integration" and fill in the endpoint details.
</details>

<details>
<summary><strong>What happens when I click 'Delete All Data'?</strong></summary>

It purges all user data: integrations, agents, pinned blocks, scraper endpoints, changelog entries, usage logs, and system settings. The database tables remain but are emptied. The page reloads to reset the UI. **This is irreversible!**
</details>

<details>
<summary><strong>What are Blocks?</strong></summary>

Blocks are the visual components that display API data — titles, charts, key-value pairs, image grids, lists, etc. The Layout Architect (an AI agent) selects which blocks to use based on the API response shape. You can restrict which blocks an integration uses via `allowed_blocks`.
</details>

<details>
<summary><strong>How do embeddings work?</strong></summary>

BiamOS generates vector embeddings (768-dimensional arrays of numbers) for each integration group. When you type a query, it's also converted to an embedding, and cosine similarity determines which integration is the best match. This happens in the Concierge stage, before any LLM call — making routing extremely fast.
</details>

<details>
<summary><strong>Where is my data stored?</strong></summary>

All data is stored locally in a SQLite database at `packages/backend/data/BiamOS.db`. Nothing is sent to external servers except API calls to your configured LLM provider and integration endpoints. Your data stays on your machine.
</details>

<details>
<summary><strong>What AI models does BiamOS use?</strong></summary>

By default: **Gemini 2.5 Flash Lite** for fast agents (classifier, param-extractor) and **Gemini 2.5 Flash** for thinking agents (router, layout-architect). You can change any agent's model in Settings → Agents. For embeddings, MiniLM (384-dim) and Gemini Embedding (768-dim) are used.
</details>

---

<p align="center">
  <em>This documentation is auto-synced with the in-app <strong>Settings → Docs</strong> panel.</em>
</p>
