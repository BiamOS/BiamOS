# 🔍 BiamOS — LLM Prompt Audit

> **Date**: 2026-03-20  
> **Purpose**: Complete inventory of every LLM call site, prompt structure, model used, and hardcoded rules  
> **Goal**: Inform the design of the **Modular Prompting Engine (Dynamic Context Injection)**

---

## Executive Summary

BiamOS has **21 distinct LLM interaction points** across **18 files**. All calls use raw `fetch()` against the OpenAI-compatible `/chat/completions` endpoint through a unified `llm-provider.ts` abstraction.

| Metric | Count |
|--------|-------|
| **Total LLM Call Sites** | 21 |
| **Unique System Prompts** | 17 |
| **Files with Direct `fetch()` to LLM** | 14 |
| **Files using `runAgent()` (indirect)** | 7 |
| **Models Used** | 4 (`MODEL_FAST`, `MODEL_THINKING`, `gemini-2.5-flash`, `openai/tts-1`) |
| **Estimated Total Hardcoded Rules** | 100+ |
| **Largest Single Prompt** | `agent-actions.ts` (~577 lines, ~15K tokens) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   LLM Call Patterns                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Pattern A: Direct fetch() to LLM                    │
│  ┌─────────────────┐     ┌──────────────┐            │
│  │ Service / Route  │────►│ llm-provider │──► LLM    │
│  └─────────────────┘     │ getChatUrl() │            │
│  (14 files)              │ getHeaders() │            │
│                          └──────────────┘            │
│                                                      │
│  Pattern B: Via agent-runner.ts                       │
│  ┌─────────────────┐     ┌──────────────┐            │
│  │ Intent Pipeline  │────►│ agent-runner  │──► LLM   │
│  └─────────────────┘     │ runAgent()    │           │
│  (7 agents)              │ runAgentJSON()│           │
│                          └──────┬───────┘            │
│                                 │                    │
│                          ┌──────▼───────┐            │
│                          │ agent-defaults│            │
│                          │ (DB prompts)  │            │
│                          └──────────────┘            │
└──────────────────────────────────────────────────────┘
```

---

## Models Configuration

**File**: [`config/models.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/config/models.ts)

| Constant | Model ID | Usage |
|----------|----------|-------|
| `MODEL_FAST` | `google/gemini-2.5-flash-lite` | Simple tasks: classification, splitting, tag generation, dashboards |
| `MODEL_THINKING` | `google/gemini-2.5-flash` | Complex reasoning: browser agent, page Q&A, context analysis |

**Hardcoded Models** (not using constants):
- `google/gemini-2.5-flash` — Voice transcription (`provider-routes.ts`, `system-routes.ts`)
- `openai/tts-1` — Text-to-speech (`provider-routes.ts`, `system-routes.ts`)
- `google/gemini-2.0-flash-001` — Block suggestion (`template-routes.ts`)

---

## LLM Call Sites — Detailed Inventory

### 1. 🤖 Browser Agent Action Loop

| Property | Value |
|----------|-------|
| **File** | [`agent-actions.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/agent-actions.ts) |
| **Function** | `streamAgentStep()` |
| **Model** | `MODEL_THINKING` |
| **Temperature** | 0 |
| **Max Tokens** | 4096 |
| **Tools** | Yes — 12 tool definitions (`search_web`, `remember_data`, `show_dashboard`, `click`, `type_text`, `select_option`, `press_key`, `scroll`, `read_page`, `wait`, `ask_user`, `done`) |
| **Prompt Size** | **~577 lines / ~15,000 tokens** (largest in the system) |

**Prompt Structure**:
```
System Message:
├── Role definition ("You are an AI Browser Agent for BiamOS")
├── Core Rules (≈ 20 rules covering phases, navigation, error handling)
├── Phase: RESEARCH (search → remember → dashboard rules)
├── Phase: PRESENT (dashboard generation rules)
├── Phase: ACTION (DOM interaction rules)
│   ├── Click/type/navigation behavior
│   ├── Platform-specific rules (YouTube, X.com, Amazon, Gmail)
│   ├── Cookie banner handling
│   └── Form interaction patterns
├── Collected Data (appended at end for recency attention)
└── Action History (compressed after 10+ steps)

User Message:
├── Task description
├── Current URL + title
├── Step progress (N/M)
├── DOM snapshot (text content + Set-of-Mark IDs)
└── Screenshot (base64, optional)
```

**Hardcoded Rules (44+)**:
- 7 research/search rules
- 8 dashboard generation rules
- 12 action/navigation rules
- 6 platform-specific rules (YouTube, X.com, Amazon, Gmail)
- 3 cookie/popup rules
- 4 error recovery rules
- 4 completion/safety rules

> [!CAUTION]
> **This is the most critical modularization target.** Platform-specific rules (YouTube search bar targeting, X.com post button sequences, cookie banners, Gmail field handling) are hardcoded into a single monolithic prompt that is sent on EVERY step regardless of the current URL.

---

### 2. 🏗️ Agent Runner (Generic DB-Agent Executor)

| Property | Value |
|----------|-------|
| **File** | [`agent-runner.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/agents/agent-runner.ts) |
| **Functions** | `runAgent()`, `runAgentJSON()` |
| **Model** | Dynamic — loaded from DB (`agent.model`) |
| **Temperature** | Dynamic — loaded from DB |
| **Max Tokens** | Dynamic — loaded from DB |

**Prompt Structure**: Loaded from the `agents` DB table. Defaults seeded from `agent-defaults.ts`.

---

### 3. 🧬 Seed Agent Defaults (7 Pipeline Agents)

**File**: [`agent-defaults.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/agents/agent-defaults.ts)

Each agent has a hardcoded system prompt stored as the DB seed:

| Agent Name | Model | Pipeline | Prompt Summary | Rules |
|------------|-------|----------|----------------|-------|
| `concierge` | `MODEL_FAST` | `intent` | Routes user text to best integration group using fuzzy matching | 5 rules |
| `translator` | `MODEL_FAST` | `intent` | Translates any-language input to English; extracts core intent | 3 rules |
| `translate-classify` | `MODEL_FAST` | `intent` | Combined translate + classify in one LLM call (~200ms) | 4 rules |
| `classifier` | `MODEL_FAST` | `intent` | Classifies intent type: `DATA`, `ARTICLE`, `IMAGE`, etc. | 8 classification types |
| `param-extractor` | `MODEL_FAST` | `intent` | Extracts API parameters from natural language | 5 rules |
| `layout-architect` | `MODEL_FAST` | `intent` | Selects block layout + sizes for dashboards | 12 rules (anti-hallucination, sizing) |
| `endpoint-scorer` | `MODEL_FAST` | `intent` | Disambiguates between same-group endpoints | 3 rules |

**Called by**: Intent pipeline files (`0-concierge.ts` through `5-layout-architect.ts`, `endpoint-scorer.ts`).

---

### 4. 💬 Context Chat (Page Copilot)

| Property | Value |
|----------|-------|
| **File** | [`context-chat.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/context-chat.ts) + [`context-chat-utils.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/context-chat-utils.ts) |
| **Function** | `answerPageQuestion()` (streaming) |
| **Model** | `MODEL_THINKING` |
| **Temperature** | 0.4 |
| **Max Tokens** | 2048 |
| **Tools** | Yes — 1 tool (`search_web`) |

**Prompt Structure (from `context-chat-utils.ts:buildSystemPrompt`)**:
```
System Message:
├── Personality rules ("smart, friendly research buddy")
├── Language matching rule (ALWAYS match user's language)
├── Quantity rules (exact counts: "top 10" = 10 items)
├── Formatting rules (Markdown, bold, numbered lists, headings)
├── Copyable content rules (```copy blocks)
├── Source/link rules (ALWAYS include links from search)
├── Page context variant:
│   ├── Page URL + title + first 6000 chars
│   ├── Page-specific rules (check page first, then search)
│   └── Screenshot handling instructions
├── OR no-page-context variant:
│   └── Search rules (always use tool for factual info)
└── Follow-up suggestion instructions

User Message:
├── Conversation history (last 10 messages)
└── Question (text or text + screenshot)
```

**Hardcoded Rules**: ~15 rules covering personality, formatting, language, sourcing, follow-ups.

---

### 5. 🧭 Context Engine (Page Analyzer)

| Property | Value |
|----------|-------|
| **File** | [`context-engine.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/context-engine.ts) |
| **Function** | `analyzePageContext()` |
| **Model** | `MODEL_THINKING` |
| **Temperature** | 0.3 |
| **Max Tokens** | 800 |

**Prompt**: Analyzes page content to suggest relevant queries. Includes: excluded group list, page text, entity extraction rules, action suggestion format.

**Hardcoded Rules**: 14 rules (entity extraction, deduplication, suggestion format, quantity limits).

---

### 6. 📄 Page Commands

| Property | Value |
|----------|-------|
| **File** | [`page-commands.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/page-commands.ts) |
| **Function** | `handlePageCommand()` |
| **Model** | `MODEL_THINKING` |
| **Temperature** | 0.3 |
| **Max Tokens** | 1500 |

**Commands**: `/summarize`, `/translate`, `/extract`

**Hardcoded**: Privacy blocklist (domains: `mail.google.com`, `outlook.live.com`, banking sites), per-command system prompts.

---

### 7. 🔬 Research Engine (2 LLM calls)

| Property | Value |
|----------|-------|
| **File** | [`research-engine.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/research-engine.ts) |
| **Model** | `MODEL_FAST` |

**Call A — Query Generation** (`generateSmartQueries()`):
- Temperature: 0
- Max Tokens: 256
- Purpose: Generate 2-4 search queries from user input
- Rules: 3 (language matching, specificity, diversity)

**Call B — Dashboard Synthesis** (`generateDashboard()`):
- Temperature: 0.5
- Max Tokens: 6000
- Purpose: Build GenUI dashboard from research data
- Imports: `buildGenUIPrompt()` from `genui-prompt.ts`
- Rules: 12 (content, layout, URL sourcing, block limits)

---

### 8. 🤖 Autopilot Engine (DOM Action Planner)

| Property | Value |
|----------|-------|
| **File** | [`autopilot-engine.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/autopilot-engine.ts) |
| **Function** | `generateAutopilotPlan()` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0 |
| **Max Tokens** | 1200 |
| **Output** | JSON (action plan with steps) |

**Prompt**: Plans DOM actions (click, type, select, wait, scroll, extract, navigate).

**Hardcoded Rules**: 6 rules (CSS selector priority, max 8 steps, wait after navigation, JSON format).

---

### 9. ✂️ Intent Splitter

| Property | Value |
|----------|-------|
| **File** | [`intent-splitter.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/intent-splitter.ts) |
| **Function** | `splitIntents()` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0 |
| **Max Tokens** | 512 |
| **Fast Path** | Regex check — skips LLM if no conjunction keywords |

**Prompt**: Splits compound queries into atomic sub-intents.

**Hardcoded Rules**: 7 rules + 7 examples (splitting logic, entity-attribute preservation).

---

### 10. 🏷️ Enrichment Service (Tag Normalizer)

| Property | Value |
|----------|-------|
| **File** | [`enrichment-service.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/services/enrichment-service.ts) |
| **Function** | `enrichIntegration()` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0 |
| **Max Tokens** | 512 |

**Prompt**: Translates any-language tags to normalized English; generates endpoint-specific tags.

**Hardcoded**: Output format (`NORMALIZED_TAGS:` / `ENDPOINT_TAGS:`), 4 rules, 2 examples.

---

### 11. 🧭 Intent Classifier (Route-Level)

| Property | Value |
|----------|-------|
| **File** | [`classify-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/classify-routes.ts) |
| **Endpoint** | `POST /classify` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0 |
| **Max Tokens** | 100 |
| **Output** | JSON (`{ mode, task, confidence }`) |

**Modes**: `RESEARCH`, `ACTION`, `ACTION_WITH_CONTEXT`, `CONTEXT_QUESTION`

**Prompt**: Classifies user intent mode. Includes dynamic context hint based on active dashboard state.

**Hardcoded Rules**: 9 classification rules + heuristic fallback with 4 keyword lists (30+ signals).

---

### 12. 📝 Scrape/Summarize Routes

| Property | Value |
|----------|-------|
| **File** | [`summarize-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/summarize-routes.ts) |
| **Endpoint** | `POST /api/scrape` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0 |
| **Max Tokens** | 1000 |
| **Output** | JSON (summary + key_points + layout blocks) |

**Prompt**: Analyzes raw DOM text, generates structured summary using block catalog subset.

**Hardcoded Rules**: 6 rules (content extraction, boilerplate removal, block limits).

---

### 13. 🎨 GenUI Dashboard Generator

| Property | Value |
|----------|-------|
| **File** | [`agent-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/agent-routes.ts) (endpoint) + [`genui-prompt.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/prompts/genui-prompt.ts) (prompt) + [`block-catalog.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/prompts/block-catalog.ts) (catalog) |
| **Endpoint** | `POST /agents/genui` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0.5 |
| **Max Tokens** | 6000 |
| **Output** | JSON (blocks array validated with Zod) |

**Prompt Structure (from `genui-prompt.ts:buildGenUIPrompt()`)**:
```
System Message:
├── Role ("content magazine architect")
├── Output format (JSON with blocks array)
├── Style rules (News, Email, Product variants)
├── Full example dashboard (≈30 lines)
├── Content rules (5: write real content, synthesize, no invented URLs)
├── Layout rules (7: start with title+text, row composition, feed limits)
├── Available data (JSON, truncated at 8000 chars)
└── Block catalog (32+ block types with schemas, dynamically generated)
```

**Block Catalog** (`block-catalog.ts`): 32 block types across 5 categories (content, data, list, media, form), each with `type`, `when` description, JSON schema, and `intentRelevance` tags. Supports dynamic filtering and custom blocks from `CustomBlocks.tsx`.

---

### 14. 🧱 Block Generator / Modifier

| Property | Value |
|----------|-------|
| **File** | [`block-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/block-routes.ts) |
| **Endpoint** | `POST /api/blocks/generate` |
| **Model** | `MODEL_FAST` |
| **Temperature** | 0.3 |
| **Max Tokens** | 4096 |

**Two Prompts**:
- `GENERATE_BLOCK_PROMPT` — Creates new React/MUI block components (12 rules, full example)
- `MODIFY_BLOCK_PROMPT` — Modifies existing blocks (7 rules)

**Hardcoded**: Design tokens (COLORS, GRADIENTS), MUI component list, component structure pattern.

---

### 15. 📦 Block Suggestion (Template Routes)

| Property | Value |
|----------|-------|
| **File** | [`template-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/template-routes.ts) |
| **Endpoint** | `POST /suggest-blocks` |
| **Model** | `google/gemini-2.0-flash-001` ⚠️ **hardcoded, not using MODEL_FAST** |
| **Temperature** | 0.3 |
| **Max Tokens** | 500 |

**Prompt**: Selects 8-15 appropriate block types for an integration based on endpoint data shapes.

**Hardcoded Rules**: 5 selection rules (always include basics, match data shape, no forms for GET, etc.).

---

### 16–17. 🎤 Voice Transcription (duplicated!)

| Property | Value |
|----------|-------|
| **Files** | [`provider-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/provider-routes.ts) + [`system-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/system-routes.ts) |
| **Model** | `google/gemini-2.5-flash` ⚠️ **hardcoded string** |
| **Temperature** | 0 |
| **Max Tokens** | 300 |

**Prompt**: `"Provide a verbatim transcript of the speech above. Output ONLY the spoken words, no other text. Preserve the original language."`

> [!WARNING]
> This transcription logic is **copy-pasted identically** in both `provider-routes.ts` (L152–210) and `system-routes.ts` (L34–76). Should be deduplicated.

---

### 18–19. 🔊 Text-to-Speech (duplicated!)

| Property | Value |
|----------|-------|
| **Files** | [`provider-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/provider-routes.ts) + [`system-routes.ts`](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/backend/src/routes/system-routes.ts) |
| **Model** | `openai/tts-1` ⚠️ **hardcoded** |
| **Voice** | `nova` (default) |

> [!WARNING]
> Also **duplicated** between the two route files.

---

## Summary Table — All LLM Call Sites

| # | Component | File | Model | Temp | Max Tokens | Has Tools | Prompt Owner |
|---|-----------|------|-------|------|------------|-----------|--------------|
| 1 | Browser Agent | `agent-actions.ts` | THINKING | 0 | 4096 | 12 tools | Inline |
| 2 | Agent Runner | `agent-runner.ts` | DB dynamic | DB | DB | No | DB/defaults |
| 3a | Concierge | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3b | Translator | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3c | Translate-Classify | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3d | Classifier | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3e | Param Extractor | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3f | Layout Architect | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 3g | Endpoint Scorer | via `agent-runner` | FAST | - | - | No | `agent-defaults.ts` |
| 4 | Context Chat | `context-chat.ts` | THINKING | 0.4 | 2048 | 1 tool | `context-chat-utils.ts` |
| 5 | Context Engine | `context-engine.ts` | THINKING | 0.3 | 800 | No | Inline |
| 6 | Page Commands | `page-commands.ts` | THINKING | 0.3 | 1500 | No | Inline |
| 7a | Research: Queries | `research-engine.ts` | FAST | 0 | 256 | No | Inline |
| 7b | Research: Dashboard | `research-engine.ts` | FAST | 0.5 | 6000 | No | `genui-prompt.ts` |
| 8 | Autopilot Planner | `autopilot-engine.ts` | FAST | 0 | 1200 | No | Inline |
| 9 | Intent Splitter | `intent-splitter.ts` | FAST | 0 | 512 | No | Inline |
| 10 | Enrichment Tags | `enrichment-service.ts` | FAST | 0 | 512 | No | Inline |
| 11 | Intent Classifier | `classify-routes.ts` | FAST | 0 | 100 | No | Inline |
| 12 | Scrape Summarizer | `summarize-routes.ts` | FAST | 0 | 1000 | No | Inline |
| 13 | GenUI Dashboard | `agent-routes.ts` | FAST | 0.5 | 6000 | No | `genui-prompt.ts` |
| 14 | Block Generator | `block-routes.ts` | FAST | 0.3 | 4096 | No | Inline |
| 15 | Block Suggester | `template-routes.ts` | hardcoded | 0.3 | 500 | No | Inline |
| 16 | Voice Transcribe | `provider-routes.ts` | hardcoded | 0 | 300 | No | Inline |
| 17 | Voice Transcribe | `system-routes.ts` | hardcoded | 0 | 300 | No | Inline (dup!) |
| 18 | TTS | `provider-routes.ts` | hardcoded | - | - | No | N/A |
| 19 | TTS | `system-routes.ts` | hardcoded | - | - | No | N/A (dup!) |

---

## Key Findings for Modular Prompting Engine

### 🔴 Critical Issues

1. **Monolithic Browser Agent Prompt** — `agent-actions.ts` sends ALL rules (YouTube, X.com, Amazon, Gmail, cookie handling, form navigation, error recovery) on EVERY step regardless of current URL. This is the #1 "Lost in the Middle" risk.

2. **4 Hardcoded Model Strings** — `gemini-2.5-flash`, `gemini-2.0-flash-001`, `openai/tts-1` bypass the centralized `models.ts` constants.

3. **Duplicated Code** — Voice transcription and TTS logic is copy-pasted between `provider-routes.ts` and `system-routes.ts`.

4. **No Prompt Versioning** — Prompt changes require code deployments; no A/B testing possible.

### 🟡 Opportunities

1. **Dynamic Context Injection** — The browser agent's prompt already has a `buildAgentPrompt()` function that assembles pieces. This is the natural hook for modular prompt injection based on URL/domain.

2. **Block Catalog Already Modular** — `block-catalog.ts` already demonstrates the pattern: a single source of truth with dynamic filtering by `intentRelevance`. This pattern should be extended to all prompts.

3. **Agent-Runner is Already Pluggable** — The `runAgent()` function loads prompts from DB, meaning pipeline agent prompts can be hot-swapped without restart.

4. **Consistent API Pattern** — All calls use the same `getChatUrl()` + `getHeaders()` wrapper, making it easy to add prompt assembly middleware.

### 🟢 Proposed Module Boundaries

Based on this audit, the prompts naturally group into modules:

| Module | Call Sites | Sharing Potential |
|--------|-----------|-------------------|
| **Base Rules** | All | Personality, language matching, formatting |
| **Browser Navigation** | Agent Actions | Click/type/scroll/wait behavior |
| **Platform: YouTube** | Agent Actions | Search bar targeting, video player interaction |
| **Platform: X.com** | Agent Actions | Post button, compose flow, search |
| **Platform: Gmail** | Agent Actions | Compose, To/Subject/Body fields |
| **Platform: Amazon** | Agent Actions | Search, product pages |
| **Cookie/Popup** | Agent Actions | Banner detection, dismiss patterns |
| **Dashboard Gen** | GenUI, Research, Summarize | Block catalog, layout rules, content rules |
| **Page Analysis** | Context Chat, Context Engine, Page Commands | Page content extraction, privacy checks |
| **Intent Classification** | Classify Routes, Concierge, Classifier | Mode detection, entity extraction |
| **Code Generation** | Block Generator | React/MUI patterns, design tokens |

---

## File Reference Map

```
packages/backend/src/
├── config/
│   └── models.ts                    ← MODEL_FAST + MODEL_THINKING constants
├── services/
│   ├── llm-provider.ts              ← LLM abstraction (getChatUrl, getHeaders)
│   ├── agent-actions.ts             ← 🔴 Browser Agent (biggest prompt)
│   ├── context-chat.ts              ← Page copilot (streaming)
│   ├── context-chat-utils.ts        ← Prompt builder + tools for copilot
│   ├── context-engine.ts            ← Page context analyzer
│   ├── page-commands.ts             ← /summarize, /translate, /extract
│   ├── research-engine.ts           ← 4-phase research pipeline
│   ├── autopilot-engine.ts          ← DOM action planner
│   ├── intent-splitter.ts           ← Compound query splitter
│   └── enrichment-service.ts        ← Tag normalizer
├── agents/
│   ├── agent-runner.ts              ← Generic agent executor
│   ├── agent-defaults.ts            ← 7 seed agent prompts
│   └── intent/
│       ├── 0-concierge.ts           ← via runAgentJSON
│       ├── 1-translator.ts          ← via runAgent
│       ├── 1-translate-classify.ts  ← via runAgentJSON
│       ├── 2-classifier.ts          ← via runAgentJSON
│       ├── 4-param-extractor.ts     ← via runAgentJSON
│       ├── 5-layout-architect.ts    ← via runAgentJSON
│       └── endpoint-scorer.ts       ← via runAgentJSON
├── prompts/
│   ├── genui-prompt.ts              ← GenUI dashboard prompt builder
│   └── block-catalog.ts             ← 32 block types (single source of truth)
└── routes/
    ├── classify-routes.ts           ← Intent mode classifier
    ├── summarize-routes.ts          ← Scrape summarizer
    ├── block-routes.ts              ← Block code generator
    ├── agent-routes.ts              ← GenUI endpoint + agent /act
    ├── template-routes.ts           ← Block suggestion
    ├── provider-routes.ts           ← Transcribe + TTS
    └── system-routes.ts             ← Transcribe + TTS (duplicated!)
```
