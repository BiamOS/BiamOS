// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module Types
// ============================================================
// Defines the PromptModule interface used by all prompt modules
// and the PromptAssembler engine.
// ============================================================

/**
 * A composable prompt module that can be dynamically injected
 * into the agent's system prompt based on context (URL, task, phase).
 */
export interface PromptModule {
    /** Unique identifier, e.g. "platform-x" */
    id: string;

    /** Human-readable name, e.g. "X.com / Twitter" */
    name: string;

    /**
     * Sorting priority in the final prompt (lower = earlier).
     *   0  = Base rules (always first)
     *  10  = Phase-specific rules
     *  20  = Safety rules
     *  30  = Interaction rules
     *  40  = Form/text rules
     *  50  = Platform-specific rules
     *  60  = Utility rules (cookies, etc.)
     */
    priority: number;

    /** Conditions that determine when this module is injected */
    match: {
        /** URL patterns — module is injected when current URL matches any */
        urls?: RegExp[];

        /** Task patterns — module is injected when user task matches any */
        taskPatterns?: RegExp[];

        /** Phase filter — module is only injected during these phases */
        phases?: PromptPhase[];

        /** If true, module is always injected regardless of other conditions */
        always?: boolean;
    };

    /** The prompt rules as a string (injected into the system prompt) */
    rules: string;

    /**
     * Optional additional tools this module provides.
     * ⚠️ DEDUP: The PromptAssembler merges by function.name —
     *    modules may override existing tools (e.g. extended descriptions)
     *    but never produce duplicates in the final array.
     */
    tools?: ToolDefinition[];
}

/** Agent execution phases */
export type PromptPhase = "research" | "action" | "present";

/** OpenAI-compatible tool definition */
export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, unknown>;
            required?: string[];
        };
    };
}

/** Context passed to the PromptAssembler for module resolution */
export interface AssemblerContext {
    url: string;
    task: string;
    phase: PromptPhase;
    stepNumber: number;
    maxSteps: number;
    historyBlock: string;
    collectedData: string;
    contextData?: string;
    nextStepHint?: string;
}
