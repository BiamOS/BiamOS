// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Safety Module ────────────────────────────────────
// Pure functions — zero React dependencies, zero side effects.
// Return signals that the hook orchestrator acts on.

import { debug } from "../../../../utils/debug";
import type { AgentStep } from "./types";
import { MAX_STEPS, MAX_REPEAT } from "./constants";

// ─── Safety Check Results ───────────────────────────────────

export type SafetyResult =
    | { action: "continue" }
    | { action: "stop"; reason: string; statusMessage: string }
    | { action: "recover"; recoveryStep: AgentStep; statusMessage: string };

// ─── Max Step Limit ─────────────────────────────────────────
// Hard stop at MAX_STEPS. No task should ever need more.

export function checkMaxSteps(steps: AgentStep[]): SafetyResult {
    if (steps.length >= MAX_STEPS) {
        debug.log(`🛑 [Safety] Max steps (${MAX_STEPS}) reached — forcing done`);
        return {
            action: "stop",
            reason: `Stopped: reached ${MAX_STEPS} step limit. Presenting collected data.`,
            statusMessage: `⚠️ Max steps (${MAX_STEPS}) reached`,
        };
    }
    return { action: "continue" };
}

// ─── Repetition Guard ───────────────────────────────────────
// 3x same action+description in a row = hallucination loop.
// Catches type_text reporting "✓" while typing in wrong field.

export function checkRepetition(
    steps: AgentStep[],
    currentAction: string,
    currentDescription: string,
): SafetyResult {
    if (steps.length < MAX_REPEAT) return { action: "continue" };

    const recent = steps.slice(-MAX_REPEAT);
    const currentSig = `${currentAction}|${currentDescription}`;
    const allRepeat = recent.every(
        (s: AgentStep) => `${s.action}|${s.description}` === currentSig,
    );

    if (allRepeat) {
        debug.log(
            `🛑 [Safety] Repetition guard: "${currentAction}" with same description ${MAX_REPEAT}x — forcing done`,
        );
        return {
            action: "stop",
            reason: `Stopped: repeated "${currentDescription || currentAction}" ${MAX_REPEAT} times without progress. The target element may not be responding.`,
            statusMessage: `⚠️ Stopped — repeated action ${MAX_REPEAT}x`,
        };
    }

    return { action: "continue" };
}

// ─── Self-Healing ───────────────────────────────────────────
// If same action failed 2+ times, inject recovery step instead of aborting.
// KILL-SWITCH: Max 2 recovery cycles per task.

export function checkSelfHealing(
    steps: AgentStep[],
    currentAction: string,
    currentDescription: string,
    recoveryCount: number,
): SafetyResult {
    if (steps.length < 2) return { action: "continue" };

    const last2 = steps.slice(-2);
    const currentSig = `${currentAction}|${currentDescription}`;
    const allSame = last2.every(
        (s: AgentStep) => {
            const isSameSig = `${s.action}|${s.description}` === currentSig;
            const wasSuccessful = s.result?.includes("✓ COMPLETE") ||
                                  s.result?.includes("already present") ||
                                  s.result?.includes("✓ Clicking");
            const hasErrorFlag = s.result?.includes("NO DOM CHANGE") ||
                                 s.result?.includes("No element") ||
                                 s.result?.includes("failed") ||
                                 s.result?.includes("⚠️");
            return isSameSig && hasErrorFlag && !wasSuccessful;
        },
    );

    if (!allSame) return { action: "continue" };

    if (recoveryCount >= 2) {
        debug.log(`🛑 [Self-Heal] Max recoveries (2) reached — forcing done`);
        return {
            action: "stop",
            reason: "Stopped: could not complete the interaction after multiple recovery attempts. Presenting collected data.",
            statusMessage: "⚠️ Stopped after 2 failed recovery attempts",
        };
    }

    debug.log(
        `🔄 [Self-Heal] Same action "${currentAction}" failed 2x — recovery ${recoveryCount + 1}/2`,
    );

    return {
        action: "recover",
        recoveryStep: {
            action: "system_recovery",
            description: `🔄 AUTO-RECOVERY (${recoveryCount + 1}/2): "${currentDescription || currentAction}" failed 2x. Page auto-scrolled. Try a COMPLETELY DIFFERENT approach. If you cannot make progress, call done or genui with whatever data you have.`,
            result: "Recovery triggered — fresh screenshot + DOM will follow",
        },
        statusMessage: `🔄 Self-healing (${recoveryCount + 1}/2)...`,
    };
}

// ─── Stuck Detection ────────────────────────────────────────
// 3+ consecutive NO DOM CHANGE = give up.
// BUT: Skip steps where the action itself succeeded (e.g. type_text
// reported "✓ COMPLETE"). Gmail's contenteditable often doesn't
// trigger a visible DOM diff even when text was inserted.

export function checkStuckDetection(steps: AgentStep[]): SafetyResult {
    if (steps.length < 3) return { action: "continue" };

    const last3 = steps.slice(-3);
    const allNoChange = last3.every((s: AgentStep) => {
        const hasNoDomChange = s.result?.includes("NO DOM CHANGE");
        // Successful actions should NOT count as "stuck"
        const wasSuccessful = s.result?.includes("✓ COMPLETE") ||
                              s.result?.includes("already present") ||
                              s.result?.includes("✓ Clicking");
        return hasNoDomChange && !wasSuccessful;
    });

    if (allNoChange) {
        debug.log(`🛑 [Stuck] 3 consecutive NO DOM CHANGE — forcing done`);
        return {
            action: "stop",
            reason: "Stopped: 3 consecutive actions had no effect. The page may not support this interaction.",
            statusMessage: "⚠️ Stopped — page not responding to interactions",
        };
    }

    return { action: "continue" };
}

// ─── Action-Type Repetition Guard ───────────────────────────
// Catches the LLM trick of using different descriptions for the
// same action type. Only counts since the last navigate/search_web,
// because scrolls on different pages are independent.

export function checkActionTypeRepetition(
    steps: AgentStep[],
    currentAction: string,
): SafetyResult {
    if (steps.length < 3) return { action: "continue" };

    // Find the steps SINCE the last page change (navigate or search_web)
    // Scrolls on different pages are independent — don't count together
    const pageChangeActions = new Set(['navigate', 'search_web']);
    let sinceLastNav: AgentStep[] = [];
    for (let i = steps.length - 1; i >= 0; i--) {
        if (pageChangeActions.has(steps[i].action)) break;
        sinceLastNav.unshift(steps[i]);
    }

    // Count occurrences of this action TYPE since last page change
    const count = sinceLastNav.filter((s: AgentStep) => s.action === currentAction).length;

    // Limits per page: scroll 3x, take_notes 2x (should only need 1 per page), others 4x
    const limit = currentAction === 'scroll' ? 3
                : currentAction === 'take_notes' ? 2
                : 4;

    if (count >= limit) {
        debug.log(`🛑 [ActionType] ${currentAction} called ${count}x since last navigate — forcing progression`);
        return {
            action: "stop",
            reason: `Stopped: "${currentAction}" called ${count} times on this page without progress. Move to the next page (navigate) or finish (genui/done).`,
            statusMessage: `⚠️ ${currentAction} loop detected (${count}x on this page) — forced progression`,
        };
    }

    return { action: "continue" };
}
