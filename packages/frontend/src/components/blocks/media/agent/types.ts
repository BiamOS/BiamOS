// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Types ────────────────────────────────────────────

// ─── Step & State ───────────────────────────────────────────

export interface TrajectoryStep {
    stepIndex: number;
    action: string;
    targetId?: number;
    result: 'SUCCESS' | 'FAILED' | 'NO_CHANGE';
    message: string;
}


export interface AgentStep {
    action: string;
    selector?: string;
    value?: string;
    description: string;
    result?: string;
    screenshot?: string;
    didNavigate?: boolean; // true when click caused URL change — resets scroll counter
}

export type AgentStatus = "idle" | "running" | "paused" | "done" | "error";

export interface AgentState {
    status: AgentStatus;
    steps: AgentStep[];
    currentAction: string;
    pauseQuestion: string | null;
    cursorPos: { x: number; y: number } | null;
    lastWorkflowId: number | null;
    taskType?: 'action' | 'research';
}

// ─── SoM (Set-of-Marks) ───────────────────────────────
// Sequential IDs 1…N, ephemeral per step. Never hash-based.
// Sourced from CDP DOMSnapshot — no JS injection needed.

export interface SomEntry {
    id: number;           // Sequential: 1, 2, 3… (reset each step)
    x: number;           // Center X in CSS pixels (main-frame space)
    y: number;           // Center Y in CSS pixels
    w: number;           // Bounding box width
    h: number;           // Bounding box height
    role: string;        // Semantic role: 'button' | 'link' | 'textbox' | 'input' | etc.
    name: string;        // Accessible name (aria-label > placeholder > text)
    tag?: string;        // HTML tag hint (BUTTON, INPUT, A, etc.)
    nodeId?: number;     // CDP backendNodeId for direct targeting
    paintOrder?: number; // Z-layer rank for occlusion culling (higher = more on top)
}

/** Step-scoped SoM map. Stored in a ref, reset at the start of each step. */
export type SomMap = Map<number, SomEntry>;

// ─── ActionResult ────────────────────────────────────────────
// Structured return from every action handler.
// Hard-typed facts replace fragile string-matching in the orchestrator.

export interface ActionResult {
    /** Text for the LLM prompt / step history */
    logMessage: string;
    /** True when the page URL changed — suppresses false NO-CHANGE warnings */
    didNavigate?: boolean;
    /** True for terminal actions (genui). Loop must stop after this. */
    isTerminal?: boolean;
    /** True when ctx.isAborted() fired mid-action — step must NOT be recorded */
    isAborted?: boolean;
    /** Payload for terminal actions (genui blocks, prompt text, etc.) */
    data?: any;
}

// ─── ActionContext ───────────────────────────────────────────
// Passed from the hook to each action handler.
// Actions are PURE executors — they must NEVER write React state.

export interface ActionContext {
    /** The webview element ref */
    wv: any;
    /** WebContents ID for CDP calls */
    wcId: number;
    /** Wait for page to be ready (DOM silence + not loading) */
    waitForPageReady: (label: string) => Promise<boolean>;
    /** Read current step history (for search limits, genui data collection) */
    getSteps: () => AgentStep[];
    /** Read structured search data (OG metadata etc.) */
    getStructuredData: () => any[];
    /** Add structured search data (called by search_web) */
    addStructuredData: (data: any[]) => void;
    /** Returns true if the user has aborted the agent loop */
    isAborted: () => boolean;
    /** Lookup a SoM entry by sequential ID from the current step's SomMap */
    getSomEntry: (id: number) => SomEntry | undefined;
    /** Fire a real CDP mouse click at CSS-pixel coordinates */
    cdpClick: (x: number, y: number) => Promise<void>;
    /** Send any CDP command via the main-process bridge */
    cdpSend: (method: string, params?: object) => Promise<{ ok: boolean; result?: any; error?: string }>;
    /** Updates the UI GhostCursor in real-time with live coordinates */
    updateCursorPos?: (x: number, y: number) => void;
}

// ─── EngineContext ───────────────────────────────────────────
// Context passed from the React hook to the pure engine functions.
// ONLY refs and the functional setAgentState — never stale primitives.

export interface EngineContext {
    wv: any;
    wcId: number;
    isElectron: boolean;
    stepsRef: React.MutableRefObject<AgentStep[]>;
    abortRef: React.MutableRefObject<boolean>;
    abortController: AbortController | null;
    structuredDataRef: React.MutableRefObject<any[]>;
    crudPlanRef: React.MutableRefObject<any>;
    currentTaskRef: React.MutableRefObject<string>;
    cardId: string | null;
    setAgentState: React.Dispatch<React.SetStateAction<AgentState>>;
    stepSomRef: React.MutableRefObject<SomMap>;
    trajectoryRef: React.MutableRefObject<TrajectoryStep[]>;
    lastFailedIdRef: React.MutableRefObject<number | null>;
}
