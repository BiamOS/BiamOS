// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Visual Verifier (Kinetic Sonar — Phase 2)
// ============================================================
// Post-action pixel-diff: after every click/type/scroll,
// the engine compares the screenshot BEFORE and AFTER the action.
// If < CHANGE_THRESHOLD% of pixels changed, the action had NO effect.
//
// Algorithm: resize both frames to 64x64 → compare RGB at each pixel.
// This is O(4096) — effectively zero latency per step.
//
// The engine injects the result as a system_recovery step so the
// LLM immediately knows the action was wasted without burning another LLM call.
// ============================================================

// ─── Configuration ───────────────────────────────────────────

/** Minimum pixel-change ratio to consider an action "effective" (0–100%) */
const CHANGE_THRESHOLD_PCT = 0.5; // Lowered to 0.5% to allow micro-interactions (checkboxes, hover states, loading bars)
const THUMBNAIL_SIZE = 64;        // 64×64 = 4096 pixels, fast comparison
const SAMPLE_RESOLUTION = 8;      // Sample every Nth pixel for speed

// ─── VerifyResult ────────────────────────────────────────────

export interface VerifyResult {
    changed: boolean;       // True if the action had a visible effect
    changePct: number;      // Percentage of pixels that changed (0–100)
    message: string;        // Human-readable verdict
}

// ─── verifyActionEffect ─────────────────────────────────────
// Compare two Base64 JPEG screenshots in a canvas element.
// Returns whether the action had a visible UI effect.
// Safe to call in any context — will return changed=true on error
// to avoid false-positive "no effect" blocks.

export async function verifyActionEffect(
    screenshotBefore: string,
    screenshotAfter: string,
    action: string,
): Promise<VerifyResult> {
    // These actions are expected to produce minimal pixel changes
    // (e.g. scroll may only shift content 10px, type has internal verification).
    // We explicitly exempt them from the diff threshold.
    const ALWAYS_EFFECTIVE = new Set(['navigate', 'go_back', 'wait', 'ask_user', 'done', 'search_web', 'type_text']);
    if (ALWAYS_EFFECTIVE.has(action)) {
        return { changed: true, changePct: 100, message: `✅ [Sonar] ${action} is always effective` };
    }

    // Skip if no screenshots (e.g. running in test/headless mode)
    if (!screenshotBefore || !screenshotAfter) {
        return { changed: true, changePct: 100, message: '⚠️ [Sonar] No screenshots — skipping diff' };
    }

    // If screenshots are identical strings (exact same base64), skip canvas decode
    if (screenshotBefore === screenshotAfter) {
        return { changed: false, changePct: 0, message: `🚫 [Sonar] Wirkungslos: ${action} — identische Screenshots` };
    }

    try {
        const changePct = await pixelDiff(screenshotBefore, screenshotAfter);
        const changed = changePct >= CHANGE_THRESHOLD_PCT;
        const message = changed
            ? `✅ [Sonar] ${action} wirksam (${changePct.toFixed(1)}% Pixel geändert)`
            : `🚫 [Sonar] Wirkungslos: ${action} — nur ${changePct.toFixed(1)}% Pixel-Änderung (< ${CHANGE_THRESHOLD_PCT}%)`;
        return { changed, changePct, message };
    } catch (err) {
        // Fail open: if diff crashes (unsupported env, etc.), let the engine proceed
        return { changed: true, changePct: 50, message: `⚠️ [Sonar] Diff-Fehler (fail-open): ${err}` };
    }
}

// ─── pixelDiff (Canvas-based) ────────────────────────────────
// Renders both Base64 images onto off-screen canvases,
// reads pixel data, and computes the changed ratio.

function pixelDiff(base64Before: string, base64After: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let loaded = 0;
        const imgBefore = new Image();
        const imgAfter = new Image();
        const size = THUMBNAIL_SIZE;

        const onLoad = () => {
            loaded++;
            if (loaded < 2) return;
            try {
                // ── Draw BEFORE ───────────────────────────────
                const canvasBefore = document.createElement('canvas');
                canvasBefore.width = size; canvasBefore.height = size;
                const ctxB = canvasBefore.getContext('2d');
                if (!ctxB) return resolve(50);
                ctxB.drawImage(imgBefore, 0, 0, size, size);
                const dataBefore = ctxB.getImageData(0, 0, size, size).data;

                // ── Draw AFTER ────────────────────────────────
                const canvasAfter = document.createElement('canvas');
                canvasAfter.width = size; canvasAfter.height = size;
                const ctxA = canvasAfter.getContext('2d');
                if (!ctxA) return resolve(50);
                ctxA.drawImage(imgAfter, 0, 0, size, size);
                const dataAfter = ctxA.getImageData(0, 0, size, size).data;

                // ── Pixel comparison ──────────────────────────
                // Sample every SAMPLE_RESOLUTION-th pixel for speed.
                const totalPixels = size * size;
                const step = SAMPLE_RESOLUTION * 4; // RGBA = 4 bytes per pixel
                let diffCount = 0;
                let sampled = 0;

                for (let i = 0; i < dataBefore.length; i += step) {
                    const dr = Math.abs(dataBefore[i] - dataAfter[i]);
                    const dg = Math.abs(dataBefore[i + 1] - dataAfter[i + 1]);
                    const db = Math.abs(dataBefore[i + 2] - dataAfter[i + 2]);
                    // "Significantly different" = any channel delta > 20 (out of 255)
                    if (dr + dg + db > 20) diffCount++;
                    sampled++;
                }

                const changePct = sampled > 0 ? (diffCount / sampled) * 100 : 0;
                resolve(changePct);
            } catch (e) {
                reject(e);
            }
        };

        imgBefore.onload = onLoad;
        imgAfter.onload = onLoad;
        imgBefore.onerror = () => reject(new Error('before-img load failed'));
        imgAfter.onerror = () => reject(new Error('after-img load failed'));

        imgBefore.src = `data:image/jpeg;base64,${base64Before}`;
        imgAfter.src = `data:image/jpeg;base64,${base64After}`;
    });
}

// ─── buildSonarRecoveryStep ───────────────────────────────────
// Constructs the system_recovery step that gets injected into
// the step history when visualVerifier detects a wasted action.
// Written from the LLM's perspective: actionable, not accusatory.

export function buildSonarRecoveryStep(
    action: string,
    args: Record<string, any>,
    changePct: number,
) {
    const target = args.description || (args.id !== undefined ? `element [${args.id}]` : action);
    return {
        action: 'system_recovery' as const,
        description: `🔊 [KINETIC SONAR] "${action}" on ${target} had NO visible effect (${changePct.toFixed(1)}% pixel change).
The UI did NOT change after this action. Do NOT repeat it.
POSSIBLE CAUSES:
1. Element was already in the correct state (e.g. checkbox already checked, field already focused)
2. The click missed — try scroll to find the element, then click again
3. A modal/overlay intercepted the click — check screenshot for overlays and dismiss them first
4. The element requires a different interaction (double-click, hover to reveal, keyboard shortcut)
REQUIRED: Look at the NEW screenshot carefully. Choose a DIFFERENT action.`,
        result: `SONAR: ${action} wirkungslos. Strategie ändern.`,
    };
}
