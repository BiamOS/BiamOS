# BiamOS — Complete UI Architecture Map

> A component-by-component reference for understanding and redesigning the BiamOS frontend.

---

## 1. Global Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│ ZONE A: TopBar (48px)                                            │
│ [BiamOS Logo] [v2.1.0-alpha]              [🔊 Voice] [🧹] [⚙️]  │
├──────────────────────────────────────────────────────────────────┤
│ ZONE B: SmartBar (collapsible, ~80px)                            │
│    ┌──────────────────────────────────────────┐                  │
│    │ [ChatThread: expandable message history] │                  │
│    │ [🔍 What can I help you with?  ▶ 🎤]    │  max-width: 680  │
│    │ [⚠️ No AI provider configured]          │                  │
│    └──────────────────────────────────────────┘                  │
│                        [⌄ minimize]                              │
├───────┬──────────────────────────────────────────────────────────┤
│ ZONE  │ ZONE D: Main Content                                     │
│  C:   │                                                          │
│ Side  │  ┌─Whitebox Card──────────────────────────────────────┐  │
│ bar   │  │ [drag] [breadcrumb] [📌 pin] [🔄] [🐛] [⛶] [✕]  │  │
│ 80px  │  │ [Tab1 | Tab2 | Tab3]                               │  │
│       │  │ ┌────────────────────────────────────────────────┐ │  │
│ [🏠]  │  │ │                                                │ │  │
│ [☁️]  │  │ │  LayoutRenderer / IframeBlock (Webview)        │ │  │
│ [₿]   │  │ │                                                │ │  │
│ [📰]  │  │ └────────────────────────────────────────────────┘ │  │
│       │  └────────────────────────────────────────────────────┘  │
│ [◁]   │                                                          │
│toggle │  ┌─Whitebox Card 2─┐  ┌─Whitebox Card 3─────────┐      │
│       │  │ Weather          │  │ Crypto                   │      │
│       │  └─────────────────┘  └──────────────────────────┘      │
│       │                                                          │
│       │  [BiamOS watermark — opacity 0.06]                       │
└───────┴──────────────────────────────────────────────────────────┘
```

**File:** [App.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/App.tsx) (520 lines)

---

## 2. Zone Breakdown

### Zone A: TopBar

| Element | Component | State | Notes |
|---------|-----------|-------|-------|
| Logo + Version | `VersionBadge` | `ver` from `/api/changelog/version` | Gradient text, 18px chip |
| Voice toggle | IconButton | `voiceEnabled` (localStorage) | Pulses when speaking |
| Clear All | IconButton | Shown when `items.length > 0` | Red hover |
| Settings gear | IconButton | `showManager` toggle | Swaps canvas ↔ SettingsShell |

**Key state:** `showManager` toggles between Canvas view and Settings view.

---

### Zone B: SmartBar (The Chatbar area)

| Element | Component | File | Size |
|---------|-----------|------|------|
| Chat history | `ChatThread` | [ChatThread.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/ChatThread.tsx) | 5KB |
| Input field | `IntentInput` | [IntentInput.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/IntentInput.tsx) | 29KB |
| LLM warning | Inline Box | — | Click → Settings/LLM |

**Current behavior:**
- `bottomBarOpen` state controls visibility (animated max-height transition)
- When minimized → small chevron tab appears to re-open
- **Hidden entirely** when `showManager === true` (Settings mode)
- `floatingSearchSx` styling — positioned as overlay below TopBar

**Problem:** The SmartBar sits _between_ TopBar and Canvas, pushes content down, and needs hide/show logic.

---

### Zone C: Left Sidebar

| Element | Component | File | Size |
|---------|-----------|------|------|
| Integration filters | `Lura Command Center` | [Lura Command Center.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/Lura Command Center.tsx) | 11KB |

- Fixed width: **80px** (collapsible to 0)
- `sidebarOpen` state with chevron toggle
- Shows icon buttons for each integration group (All, Weather, Crypto, Tech News...)
- Hidden when `showManager === true`
- Filters which cards appear on the canvas via `setActiveGroups`

---

### Zone D: Main Content

Two mutually exclusive views controlled by `showManager`:

#### D1: Canvas View (`DragCanvas`)

| Element | Component | File | Size |
|---------|-----------|------|------|
| Grid layout engine | `DragCanvas` | [DragCanvas.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/DragCanvas.tsx) | 10KB |
| Individual cards | `Whitebox` | [Whitebox.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/Whitebox.tsx) | 33KB |
| Watermark | Inline Box | — | "BiamOS" at 6% opacity |

Uses `react-grid-layout` for drag & resize. Fullscreen mode overrides grid with `position: fixed`.

#### D2: Settings View (`SettingsShell`)

| Panel | Component |
|-------|-----------|
| General | `GeneralSettings` |
| LLM | `LLMSettings` |
| Memory | `MemoryManager` |
| Changelog | `ChangelogPanel` |
| Prompt Library | `PromptLibrary` |
| Usage | `UsageDashboard` |
| Documentation | `DocumentationPanel` |

---

## 3. Whitebox Card (The Universal Container)

Every content piece on the canvas is wrapped in a `Whitebox`:

```
┌─Whitebox─────────────────────────────────────────────┐
│ Drag Handle Bar                                       │
│ [⠿] [Group > host > name > "query"]  [📌][🔄][🐛][⛶][✕] │
├───────────────────────────────────────────────────────┤
│ Tab Bar (optional — shown when multiple tabs exist)   │
│ [Tab 1] [Tab 2] [Tab 3]  [● Loading...]              │
├───────────────────────────────────────────────────────┤
│  Content Area (scrollable)                            │
│  → LayoutRenderer OR IframeBlock OR Loading skeleton  │
├───────────────────────────────────────────────────────┤
│ Debug Panel (collapsed by default)                    │
└───────────────────────────────────────────────────────┘
```

**Features:** Drag/resize, per-card zoom (Ctrl+scroll), pin, fullscreen, tab switching (Chrome-model: all webviews stay mounted, toggle visibility).

---

## 4. IframeBlock — The Webview World

**File:** [IframeBlock.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/blocks/media/IframeBlock.tsx) (638 lines, 42KB)

### Internal Layout

```
┌─IframeBlock───────────────────────────────────────────────────────┐
│ ┌─Browser Toolbar──────────────────────────────────────────┐      │
│ │ [◄][►][↻] [🔒 URL bar ........] [⊕ Extract] [🔍] [🤖]  │      │
│ └──────────────────────────────────────────────────────────┘      │
│                                                                    │
│ ┌─Main Container (flex row)────────────────────────┬─Copilot──┐  │
│ │ ┌─Webview Area (position: relative)──────────┐   │ Context  │  │
│ │ │                                             │   │ Sidebar  │  │
│ │ │ ┌─Dashboard Overlay (z:6)─────────────────┐│   │ (right)  │  │
│ │ │ │ [📊 SmartBar — click to expand/collapse] ││   │          │  │
│ │ │ │ ┌─Research Progress (while running)────┐ ││   │ [hints]  │  │
│ │ │ │ │ 🔍 searching... (4 results)          │ ││   │ [search] │  │
│ │ │ │ │ 📄 reading... (3 pages)              │ ││   │ [chat]   │  │
│ │ │ │ │ ✨ generating...                     │ ││   │ [agent]  │  │
│ │ │ │ └─────────────────────────────────────┘ ││   │ [ask_ai] │  │
│ │ │ │ ┌─GenUI Dashboard (when done)─────────┐ ││   │          │  │
│ │ │ │ │ LayoutRenderer → blocks             │ ││   │          │  │
│ │ │ │ └─────────────────────────────────────┘ ││   │          │  │
│ │ │ └─────────────────────────────────────────┘│   │          │  │
│ │ │                                             │   │          │  │
│ │ │ ┌─Agent Overlay (z:8)──────────────────┐   │   │          │  │
│ │ │ │  Live action stripe + status          │   │   │          │  │
│ │ │ └──────────────────────────────────────┘   │   │          │  │
│ │ │                                             │   │          │  │
│ │ │ ┌─Constellation Overlay (z:9)──────────┐   │   │          │  │
│ │ │ │  Star trail animation during agent    │   │   │          │  │
│ │ │ └──────────────────────────────────────┘   │   │          │  │
│ │ │                                             │   │          │  │
│ │ │ <webview partition="persist:lura" />         │   │          │  │
│ │ └─────────────────────────────────────────────┘   │          │  │
│ └───────────────────────────────────────────────────┴──────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Composed Components

| Component | File | Size | Z-Index | Purpose |
|-----------|------|------|---------|---------|
| `BrowserToolbar` | components/BrowserToolbar.tsx | ~8KB | — | Back/Fwd/Reload, URL bar, Extract, Search, Agent toggle |
| `WebviewWithLogging` | Inline in IframeBlock | — | 1 | Electron `<webview>` with cookie dismiss + event logging |
| Dashboard Overlay | Inline in IframeBlock | — | **6** | Research progress + GenUI dashboard (45% height) |
| `AgentOverlay` | AgentOverlay.tsx | 20KB | **8** | Live action indicator strip |
| `ConstellationOverlay` | ConstellationOverlay.tsx | 23KB | **9** | Animated star trails while agent runs |
| `ResearchProgressPanel` | ResearchProgressPanel.tsx | 14KB | **5** | Full-screen research steps (legacy, agent-based) |
| `Lura Command Center` | Lura Command Center.tsx | 44KB | — | Right sidebar: hints, chat, manual query |

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useResearchStream` | hooks/useResearchStream.ts | SSE stream for research pipeline |
| `useContextChat` | hooks/useContextChat.ts | RAG chat with page context |
| `useContextWatcher` | useContextWatcher.ts | Auto-analysis + hint generation |
| `useAgentActions` | useAgentActions.ts (36KB!) | Browser agent loop |
| `useWebviewLifecycle` | hooks/useWebviewLifecycle.ts | Navigation, URL tracking, zoom |

---

## 5. Context Copilot Sidebar (Right)

**File:** [Lura Command Center.tsx](file:///c:/Users/GaborDeli/Desktop/heute/BiamOS/packages/frontend/src/components/blocks/media/Lura Command Center.tsx) (44KB)

```
┌─Context Sidebar (resizable, default ~320px)──────┐
│ ┌─Header─────────────────────────────────────────┐│
│ │ 🧠 Context Copilot    [📋 Context] [🔄] [✕]   ││
│ └─────────────────────────────────────────────────┘│
│                                                    │
│ ┌─Hint Bubbles (expandable cards)────────────────┐│
│ │ 📊 Research: "openclaw news"                   ││
│ │   └→ 🔬 Starting research...                   ││
│ │ 🤖 Agent: "check news and post"                ││
│ │   └→ Starting browser action...                ││
│ │ 💡 Auto-suggestion: "This page is about..."    ││
│ │   └→ Summary of detected content               ││
│ │ 📋 Page Context (manual extract)               ││
│ │   └→ URL, title, text content                  ││
│ └─────────────────────────────────────────────────┘│
│                                                    │
│ ┌─Input Bar (bottom)─────────────────────────────┐│
│ │ [🔍 Ask about this page...            ▶ 🎤]   ││
│ │                                                 ││
│ │ Routes through 4-way intent classifier:         ││
│ │ RESEARCH / ACTION / ACTION_WITH_CONTEXT /       ││
│ │ CONTEXT_QUESTION                                ││
│ └─────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────┘
```

### Hint Bubble Types

| Prefix | Source | Behavior |
|--------|--------|----------|
| `📊 Research:` | Research Engine | Live progress → becomes dashboard |
| `🤖 Agent:` | Browser Agent | Shows current action, updates in real-time |
| `💡` Auto-suggestion | `useContextWatcher` | Background page analysis |
| `📋 Page Context` | Manual "Show Context" button | Full extracted text |
| `🔍` Search result | Context Chat | Web search answer with links |

---

## 6. Z-Index Stacking Order

| Z-Index | Element | Location |
|---------|---------|----------|
| 0 | Watermark "BiamOS" | Canvas background |
| 1 | Webview `<webview>` | Inside IframeBlock |
| 5 | ResearchProgressPanel (legacy) | Full-screen overlay |
| 6 | **Dashboard Overlay** (45% / 36px) | Top of webview |
| 8 | **AgentOverlay** | Action indicator strip |
| 9 | **ConstellationOverlay** | Star trail animations |
| 10 | Ctrl+scroll zoom shield | Transparent overlay |
| 50 | SmartBar expand tab | Below TopBar |
| 9997+ | Fullscreen backdrop + card | Portal on `<body>` |

---

## 7. Key State Variables

| State | Location | Controls |
|-------|----------|----------|
| `showManager` | App.tsx | Canvas ↔ Settings toggle |
| `sidebarOpen` | App.tsx | Left sidebar visibility (80px ↔ 0) |
| `bottomBarOpen` | App.tsx | SmartBar visibility |
| `dashboardMinimized` | IframeBlock | Dashboard 45% ↔ 36px |
| `dashboardDismissed` | IframeBlock | Dashboard completely hidden |
| `researchState.status` | useResearchStream | idle/running/done/error |
| `agent.agentState.status` | useAgentActions | idle/running/paused/done |
| `ctx.sidebarOpen` | useContextWatcher | Right copilot sidebar |
| `ctx.sidebarWidth` | useContextWatcher | Copilot sidebar width |
| `isFullscreen` | Whitebox | Card fills viewport |

---

## 8. Existing UX Pain Points (For Redesign)

| # | Problem | Current Workaround |
|---|---------|-------------------|
| 1 | SmartBar needs hide/show logic | `bottomBarOpen` state + animation |
| 2 | SmartBar pushes content down | Overlays with `floatingSearchSx` |
| 3 | Dashboard covers webview (45%) | SmartBar click to minimize to 36px |
| 4 | Two input points: SmartBar + Copilot sidebar | Different routing logic in each |
| 5 | Settings replaces entire canvas | `showManager` boolean, full swap |
| 6 | Webview invisible during research | Dashboard overlay covers it |
| 7 | Agent actions invisible during research | AgentOverlay under dashboard z-index |

---

## 9. Component Size Summary

| Component | Lines | KB | Role |
|-----------|------:|---:|------|
| App.tsx | 520 | 26 | Root layout orchestrator |
| IframeBlock.tsx | 638 | 42 | Webview orchestrator |
| Lura Command Center.tsx | ~800 | 44 | Right copilot sidebar |
| Whitebox.tsx | 764 | 33 | Universal card container |
| useAgentActions.ts | ~700 | 36 | Browser agent loop |
| IntentInput.tsx | ~600 | 29 | Smart chat input |
| ConstellationOverlay.tsx | ~500 | 23 | Star animation overlay |
| AgentOverlay.tsx | ~400 | 20 | Action indicator |
