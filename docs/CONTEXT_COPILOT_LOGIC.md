# Context Copilot Sidebar — Complete Logic Documentation

> Detailed technical reference for the Context Sidebar architecture.
> Intended for AI review of the data flow, state management, and intent routing logic.

---

## File Map

| File | Role | Lines |
|------|------|-------|
| `IframeBlock.tsx` | Command center — intent routing, agent/research dispatch | ~635 |
| `useContextWatcher.ts` | Auto-analysis — URL change detection, context API calls, caching | ~384 |
| `useWebviewLifecycle.ts` → `useAgentSidebarSync()` | Agent progress — syncs agent steps into sidebar hints | ~80 |
| `Lura Command Center.tsx` | Render layer — chat UI, drag-resize, hint cards | ~737 |
| `Lura Command CenterParts.tsx` | Sub-components — markdown renderer, hint blocks, badges | N/A |

---

## 1. Data Model: `ContextHint`

Every item in the sidebar is a `ContextHint` (defined in `Lura Command Center.tsx:30`):

```typescript
interface ContextHint {
    query: string;        // Display title (e.g. "🤖 Agent: open Gmail")
    reason: string;       // Classification: "Manual query" | "Research Engine" | "low_confidence" | auto-detection reason
    data?: any;           // Payload: { summary: string, _source?: string, _workflowId?: number, _sendFeedback?: fn }
    loading?: boolean;    // true = spinner shown, false = content rendered
    expanded?: boolean;   // Collapse state in UI
    timestamp?: number;   // Date.now() when created
}
```

### Hint Categories (by survival semantics)

| Category | Identification | Survives auto-analysis clear? | Created by |
|----------|---------------|-------------------------------|------------|
| Agent progress | `query.startsWith("🤖 Agent:")` | ✅ Yes | `useAgentSidebarSync` + `IframeBlock.tsx` ACTION routes |
| Manual chat | `reason === "Manual query"` | ✅ Yes | User typing in sidebar → context chat RAG |
| Research progress | `query.startsWith("📊 Research:")` | ❌ **No — BUG** | `IframeBlock.tsx` RESEARCH route (line 578) |
| Auto-suggestions | anything else | ❌ No (replaced) | `useContextWatcher` → `/api/context/analyze` |
| Page context | `query === "📋 Page Context"` | ❌ No | "Show Page Context" button click (line 525) |
| No-context placeholder | `reason === "low_confidence"` | ❌ No | `useContextWatcher` when API returns 0 suggestions |

---

## 2. State Flow: `contextHints` Array

The `contextHints` state lives in `useContextWatcher.ts` (line 61) and is shared via props through `IframeBlock.tsx` → `Lura Command Center.tsx`.

### Who writes to `setContextHints`?

| Writer | When | What it does |
|--------|------|-------------|
| `useContextWatcher` init (line 61) | Mount | Restores `"Manual query"` items from `sessionStorage` |
| `useContextWatcher` → `restoreCachedContext` (line 97) | Tab switch | Saves current hints to cache, restores cached hints for new tab |
| `useContextWatcher` → `triggerContextAnalysis` (line 224) | URL change (debounced 4s) | **Clears** all auto-hints, keeps `🤖` and `"Manual query"`, then replaces with API suggestions |
| `useAgentSidebarSync` (line 147) | Every agent state change | Updates the matching `🤖 Agent:` hint with new step progress |
| `IframeBlock.tsx` RESEARCH route (line 577) | User starts research | Adds `📊 Research:` hint |
| `IframeBlock.tsx` ACTION route (line 623) | User starts browser action | Adds `🤖 Agent:` hint with `reason: "Manual query"` |
| `IframeBlock.tsx` ACTION_WITH_CONTEXT route (line 607) | User starts action after research | Adds `🤖 Agent:` hint with `reason: "Action with dashboard context"` |
| `IframeBlock.tsx` paused agent feedback (line 534) | User responds to ask_user | Appends `💬 User: {feedback}` to existing agent hint |
| `IframeBlock.tsx` page context button (line 525) | User clicks "Show Page Context" | Prepends `📋 Page Context` hint |

---

## 3. Auto-Analysis Flow (`useContextWatcher.ts`)

### Trigger Chain

```
Webview Event → handlePageChange() → setTimeout(4000ms) → triggerContextAnalysis()

Events that trigger:
  - dom-ready (line 295)         → page fully loaded
  - did-navigate (line 300)       → full navigation
  - did-navigate-in-page (line 343) → SPA hash/pushState navigation
  - ipc-message (line 321)       → injected SPA detection script fires on URL change
```

### `triggerContextAnalysis()` — Step by Step (line 166-283)

```
1. Extract page content via webview.executeJavaScript(buildExtractionScript())
   → Returns { url, title, text }

2. Privacy check: if URL matches PRIVACY_BLOCKLIST → abort
   (banking, email, healthcare, auth, intranet domains)

3. Cache key = hostname + pathname (normalized, no "www.")

4. Duplicate check: if cacheKey === lastAnalyzedUrlRef → skip (unless forced)

5. Cache hit? → restore cached hints, merge with existing agent/chat hints → done

6. CLEAR auto-hints (line 224):
   setContextHints(prev => prev.filter(h =>
       h.reason === "Manual query" || h.query.startsWith("🤖")
   ))
   ⚠️ BUG: "📊 Research:" hints do NOT start with "🤖" → they get removed here

7. Call POST /api/context/analyze with { url, title, text_snippet, force }

8. API returns { suggestions: ContextHint[], confidence: number }
   - Max 3 suggestions

9. Cache result: contextCacheRef.set(cacheKey, suggestions)

10. Merge: setContextHints(prev => [
        ...suggestions,
        ...prev.filter(h => h.reason === "Manual query" || h.query.startsWith("🤖"))
    ])

11. If 0 suggestions → show "💬 No specific context detected" placeholder
    (only if no existing chat/agent hints)
```

### Cache Architecture

```typescript
contextCacheRef = Map<string, ContextHint[]>  // in-memory, per-session
// Key: hostname + pathname (e.g. "github.com/biamos/BiamOS")
// Value: array of auto-detected suggestions

sessionStorage["biamos:chat-history"]  // persists across HMR
// Only saves "Manual query" hints (user chat messages)
```

---

## 4. Intent Router (`IframeBlock.tsx` line 543-627)

When user submits text in the sidebar (`onManualQuery`):

### Step 0: Agent Paused Check (line 531)
If agent is paused (waiting for `ask_user` response):
- Append user feedback to existing `🤖 Agent:` hint
- Call `agent.continueAgent()` with the feedback
- **Return early** — no intent classification

### Step 1: LLM Classification (line 550-566)
```
POST /api/intent/classify
Body: { query, hasDashboard }
Response: { mode, task, method, allowed_tools, forbidden }
```

Returns one of 4 modes:

### Route: RESEARCH (line 575-583)
```
- agentTaskRef.current = classifiedTask
- Clear existing agent/research hints
- Add: { query: "📊 Research: {task}", reason: "Research Engine", loading: true }
- Call startResearch(classifiedTask)
- Research engine runs: search_web → fetch pages → genui → dashboard
```

### Route: ACTION_WITH_CONTEXT (line 587-612)
```
- Extract dashboard content from researchState.blocks or _genuiBlocks
- Build dashboardContext string from block titles, text, items, URLs
- Append dashboardContext to task string
- Clear existing Agent hints
- Add: { query: "🤖 Agent: {task}", reason: "Action with dashboard context", loading: true }
- Call agent.startAgent(enrichedTask, { method, allowed_tools, forbidden })
```

### Route: CONTEXT_QUESTION (line 616-618)
```
- Call startContextChat(classifiedTask)
- This uses the copilot RAG to answer questions about the current page
- Does NOT start the browser agent
```

### Route: ACTION (line 621-627)
```
- agentTaskRef.current = classifiedTask
- Clear existing Agent hints
- Add: { query: "🤖 Agent: {task}", reason: "Manual query", loading: true }
- Call agent.startAgent(classifiedTask, { method, allowed_tools, forbidden })
```

---

## 5. Agent Progress Sync (`useAgentSidebarSync`)

Located in `useWebviewLifecycle.ts` line 82-163.

### Trigger
Runs on every `agentState` change (status, currentAction, steps array).

### Logic

```
1. If status === "idle" → mark the "🤖 Agent:" hint as stopped (loading: false, append "⏹️ Stopped")

2. Build step summary from agentState.steps:
   - Each step gets an icon: 🔍 search_web, 🌐 navigate, 📝 take_notes, 🖱️ click, etc.
   - Format: "1. 🔍 Searching for X\n   → Found 5 results..."
   - Results truncated at 150 chars, word-boundary aware

3. Build status line: "🔄 3 steps: Clicking login button"

4. Update the matching hint:
   setContextHints(prev => prev.map(h =>
       h.query === queryKey ? { ...h, loading: !isDone, data: { summary } } : h
   ))

5. If done → add workflow feedback buttons (_workflowId, _sendFeedback)
```

---

## 6. Known Bugs and Issues

### Bug 1: Research Hints Get Cleared
**Location:** `useContextWatcher.ts` line 224
**Cause:** Clearing filter preserves `🤖` prefix and `"Manual query"` reason, but `📊 Research:` has neither.
**Effect:** After research completes, any URL navigation triggers auto-analysis → research progress is removed from sidebar.
**Fix:** Add `h.query.startsWith("📊")` to the filter.

### Bug 2: Auto-Suggestions Appear After Agent/Research Tasks
**Location:** `useContextWatcher.ts` line 166-283
**Cause:** No awareness of agent/research state — auto-analysis always runs on URL change regardless.
**Effect:** Useless suggestions like "🧠 I notice this page has..." appear in the sidebar after the user just ran a task.
**Fix:** Suppress auto-analysis when `agentStatus !== "idle"` or within N seconds of a research/agent task completing.

### Bug 3: ACTION_WITH_CONTEXT Hint Reason
**Location:** `IframeBlock.tsx` line 609
**Cause:** Agent hint created with `reason: "Action with dashboard context"` (not `"Manual query"`).
**Effect:** This hint survives the clearing filter because it starts with `🤖`, but the inconsistent reason could cause issues in other filter logic.

---

## 7. Data Flow Diagram

```
USER types in sidebar
        │
        ▼
[IframeBlock.tsx onManualQuery]
        │
        ├── Agent paused? → append feedback → continueAgent()
        │
        ▼
[POST /api/intent/classify] → { mode, task, method }
        │
        ├── RESEARCH ────────→ startResearch() → search_web → genui → dashboard
        │                      📊 Research hint added to contextHints
        │
        ├── ACTION ──────────→ startAgent() → screenshot loop → tool calls
        │                      🤖 Agent hint added to contextHints
        │                      useAgentSidebarSync updates on each step
        │
        ├── ACTION_WITH_CONTEXT → extract dashboard data → startAgent(enrichedTask)
        │                         🤖 Agent hint added to contextHints
        │
        └── CONTEXT_QUESTION → startContextChat() → RAG answer
                               Chat hint added to contextHints

        Meanwhile, in parallel:

[useContextWatcher]
        │
        ├── Webview URL changes (navigate, SPA, dom-ready)
        │         │
        │         ▼
        │   handlePageChange() → 4s debounce → triggerContextAnalysis()
        │         │
        │         ├── Privacy blocked? → abort
        │         ├── Same URL? → skip
        │         ├── Cached? → restore from cache
        │         └── Call /api/context/analyze
        │               │
        │               ▼
        │         Clear auto-hints (KEEP: 🤖 prefix + "Manual query" reason)
        │         Replace with API suggestions (max 3)
        │         ⚠️ 📊 Research hints get removed here
        │
        └── Tab switch → save/restore cached hints
```

---

## 8. Session Persistence

| Data | Storage | Survives |
|------|---------|----------|
| Manual chat messages | `sessionStorage["biamos:chat-history"]` | Tab refresh, HMR |
| Auto-suggestion cache | In-memory `Map` via `contextCacheRef` | Nothing (lost on refresh) |
| Agent state | In-memory via React state | Nothing (lost on refresh) |
| Research dashboard | In-memory via `researchState` | Nothing (lost on refresh) |
