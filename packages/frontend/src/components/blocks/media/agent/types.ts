// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Types ────────────────────────────────────────────

export interface AgentStep {
    action: string;
    selector?: string;
    value?: string;
    description: string;
    result?: string;
}

export type AgentStatus = "idle" | "running" | "paused" | "done" | "error";

export interface AgentState {
    status: AgentStatus;
    steps: AgentStep[];
    currentAction: string;
    pauseQuestion: string | null;
    cursorPos: { x: number; y: number } | null;
    lastWorkflowId: number | null;
}
