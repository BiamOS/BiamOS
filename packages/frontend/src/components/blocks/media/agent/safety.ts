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
    | { action: "recover"; recoveryStep: AgentStep; statusMessage: string }
    | { action: "re_observe"; blacklistedAction: string; blacklistedId?: number | string; statusMessage: string };

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
            `🔄 [Safety] Repetition guard: "${currentAction}" with same description ${MAX_REPEAT}x — triggering re_observe`,
        );
        return {
            action: "re_observe",
            blacklistedAction: currentAction,
            statusMessage: `🔄 Re-observing: "${currentDescription?.slice(0, 40)}" repeated ${MAX_REPEAT}x`,
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
                                  s.result?.includes("✓ Clicking") ||
                                  s.result?.includes("✅ SUCCESS");
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
                              s.result?.includes("✓ Clicking") ||
                              s.result?.includes("✅ SUCCESS");
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

    // Find the steps SINCE the last page change.
    // Page-change actions: navigate, search_web, go_back, AND click/click_at that actually navigated.
    // This ensures a successful thumbnail click resets the scroll counter for the new page.
    const pageChangeActions = new Set(['navigate', 'search_web', 'go_back']);
    let sinceLastNav: AgentStep[] = [];
    for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i];
        if (pageChangeActions.has(s.action) || s.didNavigate === true) break;
        sinceLastNav.unshift(s);
    }

    // Count occurrences of this action TYPE since last page change
    const count = sinceLastNav.filter((s: AgentStep) => s.action === currentAction).length;

    // Limits per page: scaled for Enterprise Builder SPAs
    const limit = currentAction === 'scroll' ? 15
                : currentAction === 'take_notes' ? 5
                : currentAction === 'type_text' ? 20
                : currentAction === 'click' ? 20
                : 10;

    if (count >= limit) {
        debug.log(`🛑 [ActionType] ${currentAction} called ${count}x since last navigate — triggering re_observe`);

        // For scroll: recover (not stop) — give agent a chance to use go_back/navigate
        if (currentAction === 'scroll') {
            return {
                action: "recover",
                recoveryStep: {
                    action: "system_recovery",
                    description: `🚨 SCROLL LOOP DETECTED: scroll called ${count}x on this page. The system is forcing a strategy change. You MUST NOT scroll again on this page. Options: 1) call go_back() if you landed on the wrong page, 2) call navigate() to a more specific URL, 3) call done/genui with whatever data you already have.`,
                    result: "STUCK: Scroll loop terminated. Change strategy immediately.",
                },
                statusMessage: `⚠️ Scroll loop (${count}x) — forcing strategy change`,
            };
        }

        // For click/type_text and others: re_observe (fresh screenshot + DOM + console errors)
        // This is the "Anti-Wahnsinn" rule — take a new photo, blacklist the failed action
        return {
            action: "re_observe",
            blacklistedAction: currentAction,
            statusMessage: `🔄 Re-observing page after ${currentAction} loop (${count}x)`,
        };
    }


    return { action: "continue" };
}

// ─── Action Fingerprint Guard ────────────────────────────
// Fix 2: Catches same action+target repeated with different descriptions.
// Checks action:id / action:url / action:direction — not the LLM description.
// Fires after 3 consecutive identical physical fingerprints.

export function checkActionFingerprint(
    steps: AgentStep[],
    currentAction: string,
    currentArgs: Record<string, any>,
): SafetyResult {
    if (steps.length < 3) return { action: "continue" };

    const toFp = (action: string, a: Record<string, any> | undefined): string => {
        const args = a ?? {};
        if (action === 'click' || action === 'type_text') return `${action}:${args.id ?? ''}`;
        if (action === 'click_at') {
            // Bucket to nearest 50px to catch same-area repeats, allow different areas
            const bx = Math.round((args.x ?? 0) / 50) * 50;
            const by = Math.round((args.y ?? 0) / 50) * 50;
            return `${action}:${bx},${by}`;
        }
        if (action === 'navigate') return `${action}:${(args.url ?? '').substring(0, 80)}`;
        if (action === 'scroll') return `${action}:${args.direction ?? ''}`;
        if (action === 'vision_click') return `${action}:${args.x_pct ?? ''},${args.y_pct ?? ''}`;
        return `${action}:_`;
    };

    const currentFp = toFp(currentAction, currentArgs);
    let streak = 0;
    for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i] as any;
        if (toFp(s.action, s.arguments ?? s.args ?? {}) === currentFp) {
            streak++;
        } else {
            break;
        }
    }

    if (streak >= 3) {
        debug.log(`🔴 [FingerprintGuard] "${currentFp}" repeated ${streak + 1}x — forcing strategy change`);
        return {
            action: "recover",
            recoveryStep: {
                action: "system_recovery",
                description: `🚨 FINGERPRINT LOOP: "${currentFp}" attempted ${streak + 1}x without progress. DO NOT repeat. Element may be disabled, missing, or needs a prerequisite. Change strategy completely.`,
                result: `STUCK: Do NOT repeat ${currentFp}. Change approach.`,
            },
            statusMessage: `⚠️ Loop (${streak + 1}x on same target) — forcing new strategy`,
        };
    }

    return { action: "continue" };
}
