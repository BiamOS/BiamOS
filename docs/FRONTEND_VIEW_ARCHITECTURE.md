# Frontend View Architecture — Complete Logic Documentation

> All visual layers the user sees before the Settings panel.
> For Gemini to review: data flow, state management, and consolidation proposals.

---

## 1. The View Stack (Z-Index Order)

All views render inside `IframeBlock.tsx` (the orchestrator). The rendering stack from top to bottom:

```
┌──────────────────────────────────────────────────────┐
│  z:6  Command Center Dashboard (overlay, 45% height) │ ← Research results / GenUI dashboard
│       ├── SmartBar (title + minimize + close)        │
│       ├── ResearchSteps (during running)             │
│       └── LayoutRenderer (dashboard blocks)          │
├──────────────────────────────────────────────────────┤
│  z:5  ResearchProgressPanel (legacy, fullscreen)     │ ← Only for agent-based research (old path)
├──────────────────────────────────────────────────────┤
│  z:4  AgentOverlay (floating status bar)             │ ← Shows current step: "Clicking login..."
│       ConstellationOverlay (animated dots)           │
├──────────────────────────────────────────────────────┤
│  z:3  Zoom overlay (Ctrl+scroll)                     │
├──────────────────────────────────────────────────────┤
│  z:0  Webview / iframe (the actual website)           │ ← Hidden when GenUI dashboard is active
├──────────────────────────────────────────────────────┤
│  SIDE  Lura Command Center (right, resizable 280px)       │ ← Chat, agent progress, auto-hints
└──────────────────────────────────────────────────────┘
  TOP  BrowserToolbar (URL bar, nav buttons, zoom)
```

---

## 2. Each View Layer in Detail

### 2.1 BrowserToolbar

| Property | Value |
|----------|-------|
| File | `components/BrowserToolbar.tsx` |
| Position | Top of IframeBlock, always visible |
| Shows | URL bar, Back/Forward/Refresh, New Tab, Zoom %, context notice |
| State | `currentUrl`, `contextNotice`, `zoomPercent` |

### 2.2 Command Center Dashboard (z:6)

| Property | Value |
|----------|-------|
| File | Inline in `IframeBlock.tsx` lines 406-470 |
| Position | Absolute overlay, top 0, 45% height (or 36px when minimized) |
| Trigger | `showDashboard = !!activeDashboardBlocks || researchState.status === 'running'` |
| Content | Running: real-time research steps (🔍/📄/✨ icons). Done: `LayoutRenderer` rendering GenUI blocks |

**Data sources** (priority order):
1. `researchState.blocks` — from research engine SSE (new path)
2. `_genuiBlocks` — from agent genui tool call (legacy path)

**State variables:**
- `dashboardDismissed` — user clicked ✕ to close
- `dashboardMinimized` — user clicked SmartBar to collapse
- `showDashboard` — computed: has blocks OR research is running

**SmartBar interaction:**
- Click bar → toggle minimize/expand
- Click ✕ → dismiss dashboard entirely, reset researchState

### 2.3 ResearchProgressPanel (z:5 — Legacy)

| Property | Value |
|----------|-------|
| File | `ResearchProgressPanel.tsx` |
| Position | Absolute fullscreen overlay |
| Trigger | `researchState.status !== 'running' && !hasResearchDashboard && !hasDashboard && agent.agentState.taskType === 'research' && (status === 'running' || status === 'done')` |
| Purpose | Old agent-based research path (when agent calls search_web → take_notes → genui) |

**Note:** This is the **legacy** path. The new research engine (SSE-based) uses the Command Center Dashboard instead. This panel only shows when the research engine is NOT running and the AGENT is doing a research task.

### 2.4 AgentOverlay + ConstellationOverlay (z:4)

| Property | Value |
|----------|-------|
| Files | `AgentOverlay.tsx`, `ConstellationOverlay.tsx` |
| Position | Floating over webview |
| Trigger | `agentEnabled` (always mounted when agent feature is on) |
| Content | AgentOverlay: current action text, Stop/Continue/Feedback buttons. Constellation: animated particle effect during agent execution |

### 2.5 Webview (z:0)

| Property | Value |
|----------|-------|
| File | `WebviewWithLogging` (inline in IframeBlock) |
| Position | Fills remaining space |
| Visibility | `display: hasDashboard ? 'none' : 'block'` |
| Note | Hidden when legacy GenUI dashboard is active. Visible behind Command Center overlay. |

### 2.6 Lura Command Center (right side)

| Property | Value |
|----------|-------|
| File | `Lura Command Center.tsx` + `useContextWatcher.ts` |
| Position | Right side, resizable (default 280px) |
| Content | Auto-suggestions, agent progress (🤖), research progress (📊), manual chat, page context |
| Documented in | `docs/CONTEXT_COPILOT_LOGIC.md` |

---

## 3. View Conflicts — Current Problems

### Problem 1: The User Sees Too Many Layers at Once
```
User types: "search for openclaw news and post on X"

1. Classifier → RESEARCH mode
2. Command Center opens (z:6, 45% height) — shows search steps
3. Dashboard renders — user sees results ✅
4. User types: "post that on X"
5. Classifier → ACTION_WITH_CONTEXT mode
6. Agent starts — webview navigates to X.com
7. ⚠️ The Command Center Dashboard is STILL SHOWING at 45%
8. ⚠️ The webview (behind the dashboard) is on X.com
9. ⚠️ The user can't see the agent working on X.com!
10. The user is stuck looking at the research dashboard while the agent posts on X
```

### Problem 2: Dashboard Hides Webview (Legacy GenUI)
When `hasDashboard` is true (legacy `_genuiBlocks` path), the webview gets `display: none`. The user can't see the website underneath at all.

### Problem 3: Two Competing Research Views
- **New path**: Command Center Dashboard (z:6) — SSE streaming from `/api/research`
- **Old path**: ResearchProgressPanel (z:5) — agent-based with `taskType: 'research'`
- Both can theoretically show at the same time (though conditional logic tries to prevent it)

### Problem 4: No Connection Between Dashboard Content and Agent Actions
When the agent does ACTION_WITH_CONTEXT, the dashboard context is serialized into a text string and appended to the task. But visually, the dashboard stays showing old content while the agent works on a different page.

---

## 4. Consolidation Proposals

### Proposal A: Single Unified Panel with Tabs

Replace 3 separate overlays (Command Center, ResearchProgressPanel, AgentOverlay) with ONE unified "Activity Panel":

```
┌─────────────────────────────────────────┐
│  Activity Panel (collapsible, top)      │
│  ┌────────┬──────────┬─────────┐        │
│  │Research│ Agent    │ Results │        │
│  └────────┴──────────┴─────────┘        │
│  [Active tab content here]              │
└─────────────────────────────────────────┘
│  Webview (always visible underneath)    │
```

**Benefits:**
- User always sees the webview
- Tab switching gives context without losing data
- Clear visual hierarchy

### Proposal B: Smart Auto-Minimize

Keep the current architecture but add automatic state transitions:

```
Research done → Dashboard auto-minimizes to SmartBar (36px)
Agent starts → Dashboard auto-minimizes → webview becomes visible
Agent done → If dashboard has results, expand back
```

**Benefits:**
- Minimal code changes
- Preserves existing UI
- Solves the "can't see agent working" problem

### Proposal C: Split View (Dashboard Left, Webview Right)

Instead of overlaying, show research results in a resizable left panel (like the sidebar but on the left):

```
┌──────────────────┬───────────────────────┐
│  Dashboard       │  Webview              │
│  (resizable)     │  (always visible)     │
│                  │                       │
│  Research results│  Agent works here     │
│  GenUI blocks    │                       │
└──────────────────┴───────────────────────┘
```

**Benefits:**
- Both views always visible
- No z-index conflicts
- Natural reading flow (left context, right action)

---

## 5. State Flow Summary

```
                  ┌─ RESEARCH ─────────┐
                  │  useResearchStream  │
User input → Classifier → │  SSE /api/research │ → researchState.blocks → LayoutRenderer
                  │  (MODEL_FAST)       │
                  └────────────────────┘
                  
                  ┌─ ACTION ───────────┐
                  │  useAgentActions    │
              → │  SSE /api/act       │ → agentState.steps → AgentOverlay
                  │  (MODEL_THINKING)   │   + useAgentSidebarSync → Lura Command Center
                  └────────────────────┘

                  ┌─ ACTION_WITH_CONTEXT ─┐
              → │  Same as ACTION but   │
                  │  task string includes  │
                  │  dashboard text blocks │
                  └────────────────────────┘

                  ┌─ CONTEXT_QUESTION ──┐
              → │  useContextChat     │ → Lura Command Center hint
                  │  RAG over page text │
                  └────────────────────┘
```
