// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Safety Module ─────────────────────────────────────────
// Pure functions — zero React dependencies, zero side effects.
//
// KINETIC SONAR ARCHITECTURE: Only 1 guard remains.
// checkMaxSteps: absolute hard limit — the last line of defence.
//
// checkActionFingerprint was removed (-120 lines). Loop-detection is now
// handled by the Visual Verifier (loop/visualVerifier.ts):
//   - Post-action pixel-diff catches wasted clicks immediately
//   - No more semantic-fingerprint false-positives
//   - No more conflicting system_recovery injection storms
// ─────────────────────────────────────────────────────────────────

import { debug } from "../../../../utils/debug";
import type { AgentStep } from "./types";
import { MAX_STEPS } from "./constants";

// ─── Safety Check Results ────────────────────────────────────────

export type SafetyResult =
    | { action: "continue" }
    | { action: "stop"; reason: string; statusMessage: string };

// ─── Max Step Limit ──────────────────────────────────────────────
// Hard stop at MAX_STEPS. The absolute, non-negotiable emergency brake.
// No task should ever need more — if it reaches this, the LLM is stuck.

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
