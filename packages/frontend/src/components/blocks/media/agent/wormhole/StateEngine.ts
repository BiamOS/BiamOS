// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── WORMHOLE / StateEngine ──────────────────────────────────
// Sprint 2: Stale-element prevention for React/Vue SPAs.
//
// Architecture:
//   - Zeno-Protokoll: freezes JavaScript execution in the target page
//     while the LLM is computing, preventing DOM mutations that would
//     invalidate backendNodeIds (Death Trap 3: 45s fail-safe watchdog)
//   - Semantic Hashing: creates a stable fingerprint per UINode so it
//     can be re-identified after a React re-render
//   - Auto-Healing: if a backendNodeId is stale, re-scans DOM and finds
//     the new ID by hash match — all in < 5ms
//
// Transport: all CDP calls go via the CdpSender IPC bridge (no Playwright).

import type { CdpSender } from './PerceptionEngine';
import { PerceptionEngine, type UINode } from './PerceptionEngine';

// ─── Pure-JS FNV-1a Hash (browser-compatible, no Node.js crypto) ─
// Replaces Node.js `createHash('md5')` — Vite externalizes 'crypto'
// and blocks it in the renderer process. FNV-1a is deterministic,
// fast (~10µs), and collision-resistant enough for semantic node matching.
function fnv1aHash(str: string): string {
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // FNV prime: 0x01000193 (multiply via bit shifts to stay in 32-bit)
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

// ─── Errors ──────────────────────────────────────────────────

/**
 * Thrown when a stale node cannot be healed — the DOM mutation was too large
 * (e.g. full page re-render). The agent MUST re-plan from a fresh page state.
 */
export class ElementLostFatalError extends Error {
    constructor(
        public readonly targetId: number,
        public readonly targetHash: string,
    ) {
        super(
            `DOM mutation zu stark. Element (Hash: ${targetHash}) existiert nicht mehr. ` +
            `Agent muss neu planen.`
        );
        this.name = 'ElementLostFatalError';
    }
}

// ─── StateEngine ─────────────────────────────────────────────

export class StateEngine {
    private readonly cdp: CdpSender;
    private readonly perception: PerceptionEngine;

    /** Whether JS execution in the target page is currently paused. */
    private frozen = false;

    /**
     * Death Trap 3: Fail-safe timer handle.
     * If the LLM call never returns (network drop, API error), this timer
     * auto-resumes the frozen tab so the user isn't left with a dead page.
     */
    private failSafeTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly FAIL_SAFE_MS = 90_000;

    /**
     * @param cdp        - CDP sender bound to the target webview
     * @param perception - PerceptionEngine instance for the same webview
     */
    constructor(cdp: CdpSender, perception: PerceptionEngine) {
        this.cdp = cdp;
        this.perception = perception;
    }

    // ─── Zeno-Protokoll ──────────────────────────────────────

    /**
     * Freeze JavaScript execution in the target page.
     * Call this BEFORE sending the current page state to the LLM so
     * that React/Vue timers cannot mutate the DOM while the AI reasons.
     *
     * Death Trap 3 mitigation: starts a 45s watchdog that auto-resumes
     * if the LLM call never comes back (network drop, API error, etc.)
     */
    async freezeExecution(): Promise<void> {
        if (this.frozen) {
            console.warn('[WORMHOLE/State] freezeExecution() called while already frozen — skipping');
            return;
        }

        await this.cdp('Debugger.enable', {});

        try {
            await this.cdp('Debugger.pause', {});
            this.frozen = true;
            console.log('[WORMHOLE/State] freezeExecution() — page JS paused ❄️');
        } catch (e) {
            // Already paused (e.g. another debugger attached) — treat as success
            const msg = String(e);
            if (msg.includes('already') || msg.includes('paused')) {
                this.frozen = true;
                console.warn('[WORMHOLE/State] Debugger already paused — continuing');
            } else {
                throw e;
            }
        }

        // Start the fail-safe watchdog (Death Trap 3)
        this.failSafeTimer = setTimeout(async () => {
            if (this.frozen) {
                console.warn(
                    `[WORMHOLE/State] ⏰ Fail-safe triggered after ${this.FAIL_SAFE_MS}ms — ` +
                    'force-resuming frozen page (LLM likely timed out)'
                );
                await this.resumeExecution().catch(() => { /* best-effort */ });
            }
        }, this.FAIL_SAFE_MS);
    }

    /**
     * Resume JavaScript execution in the target page.
     * Always call after the LLM responds (or on any error path).
     */
    async resumeExecution(): Promise<void> {
        // Clear the fail-safe timer first — even if resume fails we don't want a double-call
        if (this.failSafeTimer !== null) {
            clearTimeout(this.failSafeTimer);
            this.failSafeTimer = null;
        }

        if (!this.frozen) {
            console.warn('[WORMHOLE/State] resumeExecution() called while not frozen — skipping');
            return;
        }

        try {
            await this.cdp('Debugger.resume', {});
        } catch (e) {
            // Already resumed — that's fine
            console.warn('[WORMHOLE/State] Debugger.resume error (may already be running):', e);
        } finally {
            this.frozen = false;
            console.log('[WORMHOLE/State] resumeExecution() — page JS running ▶️');
        }
    }

    // ─── Semantic Hashing ────────────────────────────────────

    /**
     * Generates a deterministic hash for a UINode based on its stable properties.
     *
     * Uses: `role + name + parentId` — these survive React re-renders
     * because they are derived from the semantic structure (ARIA) not
     * ephemeral DOM positions.
     *
     * Algorithm: MD5 (fast, deterministic, non-cryptographic use only)
     */
    generateHash(node: UINode): string {
        const seed = `${node.r}::${node.n}::${String(node.p ?? 0)}`;
        return fnv1aHash(seed);
    }

    // ─── Auto-Healing ────────────────────────────────────────

    /**
     * Ensures that `targetId` still points to a live DOM node.
     * If the ID is stale (React re-render destroyed it), re-scans the page
     * and finds the replacement node by semantic hash match.
     *
     * Performance target: < 5ms on cache hit, < 50ms on re-scan path.
     *
     * @param targetId   - The backendNodeId the agent wants to interact with
     * @param targetHash - Hash generated with generateHash() at observation time
     * @returns          - A live backendNodeId (may be different from targetId)
     * @throws ElementLostFatalError if no matching node can be found after re-scan
     */
    async healNodeId(targetId: number, targetHash: string): Promise<number> {
        // Step 1: Fast path — check if the original ID still lives
        const resolveResp = await this.cdp('DOM.resolveNode', { backendNodeId: targetId });

        if (resolveResp.ok && resolveResp.result?.object?.objectId) {
            // Node is still alive — use original ID
            return targetId;
        }

        // Step 2: Stale path — do a fresh page scan and hash-match
        console.warn(
            `[WORMHOLE/State] Node ${targetId} is stale — scanning for hash ${targetHash}`
        );

        const freshNodes = await this.perception.getFlatState();

        for (const node of freshNodes) {
            if (this.generateHash(node) === targetHash) {
                console.log(`[WORMHOLE/State] Healed ${targetId} → ${node.i} via hash match`);
                return node.i;
            }
        }

        // Step 3: No match — the DOM mutation was too radical for auto-healing
        throw new ElementLostFatalError(targetId, targetHash);
    }

    /** Convenience: returns true if the page is currently frozen. */
    get isFrozen(): boolean {
        return this.frozen;
    }
}
