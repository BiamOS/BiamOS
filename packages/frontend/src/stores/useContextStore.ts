// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// useContextStore — Global Context Bridge Store
// ============================================================
// Bridges per-card IframeBlock state (agent/research/chat hints)
// to the global CommandCenter component.
//
// Data flow:
//   Focused IframeBlock → writes state here →
//   CommandCenter reads and renders.
// ============================================================

import { create } from 'zustand';
import type { AgentStep, AgentStatus } from '../components/blocks/media/agent/types';

// ─── Re-export ContextHint here so it's importable from the store ─
// (ContextSidebar.tsx still defines it for backward compat)
export interface ContextHint {
    query: string;
    reason: string;
    data?: any;
    loading?: boolean;
    expanded?: boolean;
    timestamp?: number;
}

// ─── Store Shape ─────────────────────────────────────────────

interface ContextStoreState {
    /** The card ID that currently has focus / is writing its state */
    activeCardId: string | null;

    /** Live chat bubbles + research + agent hints from the focused card */
    hints: ContextHint[];

    /** The agent's current execution status */
    agentStatus: AgentStatus;

    /** Agent step history */
    agentSteps: AgentStep[];

    /** Question the agent is waiting on ('paused' state) */
    pauseQuestion: string | null;

    /** Human-readable current agent action description */
    currentAction: string;

    // ─── Setters (called by focused IframeBlock) ───────────

    setActiveCardId: (id: string | null) => void;

    /** Full replace or functional updater — mirrors React setState API */
    setHints: (hintsOrUpdater: ContextHint[] | ((prev: ContextHint[]) => ContextHint[])) => void;

    setAgentState: (partial: {
        status?: AgentStatus;
        steps?: AgentStep[];
        pauseQuestion?: string | null;
        currentAction?: string;
    }) => void;

    // ─── Agent Actions (called by CommandCenter buttons) ───

    /** Dispatch biamos:agent-confirm — IframeBlock listens and calls continueAgent() */
    confirmAgent: () => void;

    /** Dispatch biamos:agent-cancel — IframeBlock listens and calls stopAgent() */
    cancelAgent: () => void;

    /** Reset store to idle state (called when card loses focus) */
    resetToIdle: () => void;
}

// ─── Store ───────────────────────────────────────────────────

export const useContextStore = create<ContextStoreState>((set) => ({
    activeCardId: null,
    hints: [],
    agentStatus: 'idle',
    agentSteps: [],
    pauseQuestion: null,
    currentAction: '',

    setActiveCardId: (id) => set({ activeCardId: id }),

    setHints: (hintsOrUpdater) =>
        set((state) => ({
            hints: typeof hintsOrUpdater === 'function'
                ? hintsOrUpdater(state.hints)
                : hintsOrUpdater,
        })),

    setAgentState: (partial) =>
        set((state) => ({
            agentStatus: partial.status ?? state.agentStatus,
            agentSteps: partial.steps ?? state.agentSteps,
            pauseQuestion: partial.pauseQuestion !== undefined ? partial.pauseQuestion : state.pauseQuestion,
            currentAction: partial.currentAction ?? state.currentAction,
        })),

    confirmAgent: () => {
        window.dispatchEvent(new CustomEvent('biamos:agent-confirm'));
    },

    cancelAgent: () => {
        window.dispatchEvent(new CustomEvent('biamos:agent-cancel'));
    },

    resetToIdle: () =>
        set({
            hints: [],
            agentStatus: 'idle',
            agentSteps: [],
            pauseQuestion: null,
            currentAction: '',
        }),
}));
