# Deep Research Engine — Complete Technical Documentation

> How BiamOS researches topics, generates dashboards, and what limits apply.

---

## Architecture Overview

```
User query
    │
    ▼
[Intent Classifier] → mode: "RESEARCH"
    │
    ▼
[Frontend: useResearchStream.ts]
    │   POST /api/research (SSE streaming)
    ▼
[Backend: research-routes.ts]
    │   Calls runResearch()
    ▼
[Backend: research-engine.ts] — 4-phase pipeline
    │
    ├── Phase 1: SEARCH (LLM + DuckDuckGo)
    ├── Phase 2: FETCH  (page-fetcher + OG enrichment)
    ├── Phase 3: SYNTHESIZE (LLM → GenUI blocks)
    └── Phase 4: DELIVER (SSE → dashboard)
```

---

## 1. Models Used

| Component | Model | Config ID |
|-----------|-------|-----------|
| Search query generation | `google/gemini-2.5-flash-lite` | `MODEL_FAST` |
| Dashboard generation | `google/gemini-2.5-flash` | `MODEL_THINKING` |
| Intent classification | `google/gemini-2.5-flash-lite` | `MODEL_FAST` |

**Note:** Dashboard synthesis (Phase 3) uses `MODEL_THINKING` for logical reasoning and reduced hallucinations. Query planning (Phase 1) and intent classification use the cheaper, faster `MODEL_FAST`.

**Model config location:** `packages/backend/src/config/models.ts`

---

## 2. The 4-Phase Pipeline

### Phase 1: SEARCH

**Goal:** Turn user query into 2-3 focused search queries, execute them, enrich with OG metadata.

| Step | Implementation | Details |
|------|---------------|---------|
| 1a. Generate search queries | `generateSearchQueries()` | LLM call: system prompt asks for 2-3 JSON array search strings. Adds current year (2026) for news queries. Temp: 0, max_tokens: 200. Fallback: uses raw user query. |
| 1b. Execute searches | `executeSearches()` → `searchDdg()` | DuckDuckGo HTML search via `Promise.all` (true parallel). If query contains news keywords, appends `&df=m` (last month filter) on first attempt only. Block-by-block HTML parsing (splits on `result__title`). Max 8 results per query. Ad filtering via `result--ad` class. |
| 1c. Fallback: raw query | In main pipeline | If LLM-refined queries return 0 results, retries with the user's raw query. |
| 1d. OG enrichment | `enrichWithOg()` | Fetches first 20KB of each result URL. Extracts `og:image`, `og:title`, `og:description` via regex. Parallel, 3s timeout per URL. |
| 1e. Deduplication | `deduplicateResults()` | Removes duplicate URLs across queries. |

**SSE events emitted:**
- `step: { phase: "search", status: "planning" }`
- `step: { phase: "search", status: "searching", data: { queries } }`
- `step: { phase: "search", status: "results", data: { resultCount, results } }`

### Phase 2: FETCH

**Goal:** Download full text content from the best result pages.

| Step | Implementation | Details |
|------|---------------|---------|
| 2a. Pick best URLs | `pickBestUrls()` | Prefers URLs with OG images (= real articles vs link farms). Max 3 URLs. |
| 2b. Fetch pages | `fetchPages()` from `page-fetcher.ts` | Downloads and extracts readable text from HTML. Returns `{ url, title, text, wordCount }`. |

**SSE events emitted:**
- `step: { phase: "fetch", status: "reading", data: { urls } }`
- `step: { phase: "fetch", status: "extracted", data: { pagesRead, totalWords } }`

### Phase 3: SYNTHESIZE

**Goal:** Generate a visual dashboard from the research data.

| Step | Implementation | Details |
|------|---------------|---------|
| 3a. Build context | `buildResearchContext()` | Merges search results (top 8, snippet: 200 chars) + page content (text: **15,000 chars** cap per page). |
| 3b. Generate dashboard | `generateDashboard()` | LLM call with `MODEL_THINKING` (gemini-2.5-flash). Uses `buildGenUIPrompt()` (system) + structured research data (user). Temp: 0.2, max_tokens: 4000. |
| 3c. Validate | `GenUIResponseSchema.safeParse()` | Zod schema validation. Falls through to raw blocks on validation failure. Falls back to error blocks on total failure. |

**SSE events emitted:**
- `step: { phase: "synthesize", status: "generating" }`

### Phase 4: DELIVER

**Goal:** Send the final dashboard to the frontend.

**SSE events emitted:**
- `dashboard: { blocks, sources }` (separate event type)
- `done: { blockCount }` (or `error: { message }`)

---

## 3. Limits and Configuration

| Parameter | Value | Location |
|-----------|-------|----------|
| Max search queries | 3 | `MAX_SEARCH_QUERIES` |
| Max fetch URLs | 3 | `MAX_FETCH_URLS` |
| DuckDuckGo timeout | 5 seconds | `DDG_TIMEOUT_MS` |
| OG metadata timeout | 3 seconds | `OG_TIMEOUT_MS` |
| Max DDG results per query | 8 | Hardcoded in block loop |
| OG body read limit | 20 KB | `bytesRead < 20000` |
| Page text cap for LLM | **15,000 chars/page** | `p.text.substring(0, 15000)` |
| Page fetcher max text | **15,000 chars** | `MAX_TEXT_LENGTH` in `page-fetcher.ts` |
| Page fetcher timeout | **8 seconds** | `FETCH_TIMEOUT_MS` in `page-fetcher.ts` |
| Context injection limit | **15,000 chars** | Frontend `IframeBlock.tsx` |
| Dashboard LLM model | **MODEL_THINKING** | `generateDashboard()` |
| Dashboard LLM max_tokens | 4000 | In `generateDashboard()` |
| Dashboard LLM temperature | 0.2 | In `generateDashboard()` |
| Query planner max_tokens | 200 | In `generateSearchQueries()` |
| Query planner temperature | 0 | In `generateSearchQueries()` |
| Query max length | 500 chars | Validated in route |

---

## 4. Frontend Integration

### Hook: `useResearchStream.ts` (126 lines)

```typescript
const { researchState, setResearchState, startResearch, abortResearch, hasResearchDashboard } = useResearchStream();
```

**Note:** `abortResearch()` is called by `IframeBlock.tsx` before any `agent.startAgent()` call to cancel background research.

**State machine:**
```
idle → running (on startResearch) → done (on "dashboard" event) or error
```

**`researchState` shape:**
```typescript
{
    status: 'idle' | 'running' | 'done' | 'error',
    phase: '' | 'search' | 'fetch' | 'synthesize' | 'done',
    steps: ResearchStep[],     // Array of all emitted steps
    query: string,              // Original user query
    blocks?: GenUIBlock[],      // Dashboard blocks (set on "dashboard" event)
}
```

### Display: Command Center Dashboard

In `IframeBlock.tsx` (lines 406-470):

| Condition | Shows |
|-----------|-------|
| `researchState.status === 'running'` | Real-time step list (🔍🔄📄✨ icons) with pulsing spinner |
| `researchState.status === 'done'` + blocks | `LayoutRenderer` rendering GenUI dashboard blocks |
| SmartBar click | Toggles minimize (45% → 36px) |
| ✕ click | Dismisses dashboard, resets researchState to idle |

---

## 5. SSE Event Protocol

All events streamed via `POST /api/research` response:

```
event: step
data: {"phase":"search","status":"planning","data":{"query":"openclaw news"}}

event: step
data: {"phase":"search","status":"searching","data":{"queries":["openclaw news 2026","openclaw latest updates"]}}

event: step
data: {"phase":"search","status":"results","data":{"resultCount":12,"results":[...]}}

event: step
data: {"phase":"fetch","status":"reading","data":{"urls":[...]}}

event: step
data: {"phase":"fetch","status":"extracted","data":{"pagesRead":3,"totalWords":4523}}

event: step
data: {"phase":"synthesize","status":"generating","data":{"message":"Creating dashboard..."}}

event: dashboard
data: {"blocks":[{"type":"hero","title":"..."},{"type":"card-grid","items":[...]}],"sources":[...]}

event: done
data: {"phase":"done","status":"complete","data":{"blockCount":5}}
```

---

## 6. GenUI Dashboard Block Types

The dashboard is rendered via `LayoutRenderer` which supports these `GenUIResponseSchema` block types:

| Block Type | Purpose |
|------------|---------|
| `hero` | Large header with title, subtitle, image |
| `card-grid` | Grid of cards with title, text, url, image |
| `stat-row` | Row of labeled statistics |
| `text` | Rich text paragraph |
| `table` | Data table |
| `timeline` | Chronological list |
| `list` | Simple bullet list |
| `quote` | Blockquote |
| `link-list` | List of URLs with titles |

**Validation:** Zod schema `GenUIResponseSchema` validates the LLM output. On failure, falls back to raw blocks or error fallback.

---

## 7. Known Issues (Status: v2.1.0-alpha)

### ~~Issue 1: No Real Page Content for SPAs~~ ✅ MITIGATED
Page text cap increased to 15,000 chars. `page-fetcher.ts` timeout extended to 8s. Jina Reader fallback handles most SPA content.

### ~~Issue 2: MODEL_FAST for Dashboard Generation~~ ✅ FIXED
Dashboard generation now uses `MODEL_THINKING` (`gemini-2.5-flash`) with reasoning capabilities.

### ~~Issue 3: 2000 Character Page Content Cap~~ ✅ FIXED
Cap raised to 15,000 characters across all layers: research engine, page fetcher, and context injection.

### ~~Issue 4: No Abort on User Action~~ ✅ FIXED
`abortResearch()` is now exposed by `useResearchStream` and called before every `agent.startAgent()` call in both ACTION and ACTION_WITH_CONTEXT routes.

### ~~Issue 5: Dashboard vs Webview Conflict~~ ✅ FIXED
`setDashboardMinimized(true)` is called in the ACTION_WITH_CONTEXT route before starting the agent. Dashboard collapses to 36px so the user can watch the agent.

### ~~Issue 6: Search Loop Issue~~ ✅ FIXED
The intent classifier now:
1. Has an explicit COMBINED QUERIES rule in the LLM prompt ("check X and post Y" → RESEARCH)
2. Extracts only the research part into the `task` field (drops "and post on Y")
3. Heuristic fallback checks combined intent BEFORE individual signal arrays (fixed dead code ordering)

### Issue 7: DuckDuckGo Parser Triplication (Open)
The DDG parsing logic (`parseDdgResults`, `searchDdg`, URL extraction) exists in 3 files: `research-engine.ts`, `agent-routes.ts`, `web-search.ts`. Should be centralized into a single `src/services/duckduckgo.ts` with shared exports.

---

## 8. Search Provider Details

### DuckDuckGo HTML Search

| Property | Value |
|----------|-------|
| URL | `https://html.duckduckgo.com/html/?q={query}` |
| Time filter | `&df=m` (last month) for news keywords — **removed on retry if 0 results** |
| User-Agent | Chrome 131 on Windows 10 |
| Parsing | Block-by-block split on `result__title`, then per-block regex for link/title/snippet |
| Class matching | Tolerant: `class="[^"]*result__a[^"]*"` (survives DDG CSS changes) |
| Ad filtering | `result--ad` class in surrounding HTML + `ad_provider`/`ad_domain` in URL |
| News keywords | `news`, `neuigkeiten`, `aktuell`, `latest`, `trends`, `recent`, `neue`, `today`, `heute`, `this week`, `diese woche`, `2026` |
| Fallback | Retry without time filter → retry with raw user query |

