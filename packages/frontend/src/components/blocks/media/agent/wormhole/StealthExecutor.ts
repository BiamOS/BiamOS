// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── WORMHOLE / StealthExecutor ──────────────────────────────
// Sprint 3: Trusted click execution with pre-flight safety checks.
//
// Architecture:
//   - Uses wc.sendInputEvent() via the existing 'spatial-input' IPC handler
//     which fires direct C++-level input events → isTrusted: true on the page
//     (no @nut-tree/nut-js — avoids OS coordinate complexity)
//   - Pre-flight Raycasting: verifies the target is topmost at click coords
//   - IFrame Coordinate Offset: Death Trap 2 fix — nodes from cross-origin
//     iframes get their local coords offset by the iframe's global position
//   - Human Trajectory Simulation: Bézier curve with 10-20 mouseMove steps
//     + 2-8ms jitter to defeat bot-detection heuristics
//
// Transport: `spatial-input` IPC (existing handler in main.ts)

import type { CdpSender, IpcInvoker } from './PerceptionEngine';

// ─── Errors ──────────────────────────────────────────────────

/** Thrown when a pre-flight Z-index check reveals an overlapping element. */
export class ObscuredElementError extends Error {
    public readonly payload: { code: 'BLOCKED_BY_LAYER'; targetId: number; blockingId: number };

    constructor(public readonly targetId: number, public readonly blockingId: number) {
        super(
            `Klick blockiert! Element ${targetId} wird von Z-Index Layer ${blockingId} überlagert.`
        );
        this.name = 'ObscuredElementError';
        this.payload = { code: 'BLOCKED_BY_LAYER', targetId, blockingId };
    }
}

// ─── Internal helpers ─────────────────────────────────────────

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/** Cubic Bézier interpolation at parameter t ∈ [0, 1]. */
function cubicBezier(
    p0: number, p1: number, p2: number, p3: number, t: number
): number {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── StealthExecutor ──────────────────────────────────────────

/**
 * FrameRegistry maps frameId (from UINode.frameId) to the frame's absolute
 * top-left position in the main-frame viewport.
 *
 * Built by the caller (e.g. engine.ts) from DOM.getBoxModel on each
 * <iframe> element in the main document. Needed for Death Trap 2.
 */
export type FrameRegistry = Map<string, { x: number; y: number }>;

export class StealthExecutor {
    private readonly cdp: CdpSender;
    private readonly ipc: IpcInvoker;
    private readonly wcId: number;
    private readonly frameRegistry: FrameRegistry;
    private readonly onTargetUpdate?: (x: number, y: number) => void;

    /**
     * @param cdp           - CDP sender for the target webview
     * @param ipc           - IPC invoker (electronAPI.invoke)
     * @param wcId          - WebContentsId
     * @param frameRegistry - Map of frameId → absolute {x, y} in main viewport
     *                        (Death Trap 2: IFrame coordinate offsets)
     * @param onTargetUpdate - Reports live raycasted physical click coordinates back to UI
     */
    constructor(
        cdp: CdpSender,
        ipc: IpcInvoker,
        wcId: number,
        frameRegistry: FrameRegistry = new Map(),
        onTargetUpdate?: (x: number, y: number) => void,
    ) {
        this.cdp = cdp;
        this.ipc = ipc;
        this.wcId = wcId;
        this.frameRegistry = frameRegistry;
        this.onTargetUpdate = onTargetUpdate;
    }

    // ─── Sichtbarkeit erzwingen ───────────────────────────────

    /**
     * Scrolls the target node into the visible viewport via CDP.
     * Must be called before getBoxModel — off-screen nodes return zero-size.
     */
    async scrollIntoView(backendNodeId: number): Promise<void> {
        await this.cdp('DOM.scrollIntoViewIfNeeded', { backendNodeId });
    }

    // ─── Pre-Flight Raycasting (Z-Index Check) ────────────────

    /**
     * Verifies that the target node is the topmost element at its click point.
     *
     * Returns the absolute {x, y} (main-frame coords) of the element centre.
     * Throws ObscuredElementError if another element is layered on top.
     *
     * Death Trap 2 fix: if the node lives in a cross-origin iframe (frameId set),
     * its local coords are offset by the iframe's global position.
     */
    async checkVisibility(
        backendNodeId: number,
        frameId?: string,
    ): Promise<{ x: number; y: number }> {
        const boxResp = await this.cdp('DOM.getBoxModel', { backendNodeId });
        if (!boxResp.ok || !boxResp.result?.model) {
            throw new Error(`DOM.getBoxModel failed for node ${backendNodeId}: ${boxResp.error}`);
        }

        const { content } = boxResp.result.model;
        // content quad: [x0,y0, x1,y1, x2,y2, x3,y3]
        const localX = Math.round((content[0] + content[2]) / 2);
        const localY = Math.round((content[1] + content[5]) / 2);

        // ── Death Trap 2: IFrame coordinate offset ────────────
        let absX = localX;
        let absY = localY;
        if (frameId) {
            const frameOffset = this.frameRegistry.get(frameId);
            if (frameOffset) {
                absX = localX + frameOffset.x;
                absY = localY + frameOffset.y;
            } else {
                console.warn(
                    `[WORMHOLE/Executor] frameId "${frameId}" not in FrameRegistry — ` +
                    'using local coords (may misclick)'
                );
            }
        }

        // ── Raycasting: is our node on top? ───────────────────
        const rayResp = await this.cdp('DOM.getNodeForLocation', {
            x: absX,
            y: absY,
            includeUserAgentShadowDOM: true,
        });

        if (rayResp.ok && rayResp.result?.backendNodeId) {
            const topNodeId: number = rayResp.result.backendNodeId;
            // Accept if the topmost node IS our target or a descendant of it
            // (descendants are fine — e.g. an icon <svg> inside a <button>)
            if (topNodeId !== backendNodeId) {
                // Check if topNode is a child by resolving both and comparing
                // For performance: just check if backendNodeId matches (child check
                // would require full subtree walk — not worth it here)
                throw new ObscuredElementError(backendNodeId, topNodeId);
            }
        }
        // If getNodeForLocation fails: proceed anyway (some pages block it)

        return { x: absX, y: absY };
    }

    // ─── Human Trajectory Simulation ─────────────────────────

    /**
     * Simulates a human-like mouse trajectory to (targetX, targetY).
     *
     * Uses a cubic Bézier curve with random control points to avoid
     * bot-detection heuristics that flag straight mouse lines.
     * Sends 10-20 mouseMove events with 2-8ms variable delay each.
     *
     * The call goes via the existing 'spatial-input' IPC handler in main.ts
     * which uses wc.sendInputEvent() → isTrusted: true in the page.
     */
    private async simulateHumanTrajectory(
        fromX: number, fromY: number,
        toX: number, toY: number,
    ): Promise<void> {
        const STEPS = Math.floor(randomBetween(10, 20));

        // Random Bézier control points (adds organic curve to movement)
        const cpX1 = fromX + randomBetween(-80, 80);
        const cpY1 = fromY + randomBetween(-50, 50);
        const cpX2 = toX + randomBetween(-80, 80);
        const cpY2 = toY + randomBetween(-50, 50);

        const events: Array<{ type: string; x: number; y: number }> = [];

        for (let i = 1; i <= STEPS; i++) {
            const t = i / STEPS;
            const x = Math.round(cubicBezier(fromX, cpX1, cpX2, toX, t));
            const y = Math.round(cubicBezier(fromY, cpY1, cpY2, toY, t));
            events.push({ type: 'mouseMove', x, y });
        }

        // Send via spatial-input IPC (mouse moves — no click yet)
        // We send in small batches to preserve timing between moves
        for (const evt of events) {
            await this.ipc('spatial-input', this.wcId, [evt]);
            await delay(Math.floor(randomBetween(2, 8)));
        }
    }

    // ─── B3: Element Stability Check (Animation Frame Delta) ─────
    //
    // Before clicking, verify the element is NOT mid-animation.
    // Playwright calls this "stable" — two consecutive AnimationFrames
    // must produce identical BoundingBoxes before a click is trusted.
    //
    // WHY: Dropdown menus, modals, toasts slide in over ~200ms.
    // If we click at t=100ms the element is at y=250 (mid-slide).
    // At t=200ms it settles at y=300. Click lands in empty space.
    //
    // IMPLEMENTATION: Two DOM.getBoxModel calls ~32ms apart.
    // If all 8 quad-points are within 1px → STABLE → proceed.
    // Otherwise → throw AnimatingError so click.ts can re-queue.
    async checkStability(backendNodeId: number): Promise<void> {
        try {
            const get = () => this.cdp('DOM.getBoxModel', { backendNodeId });
            const [r1, r2] = await Promise.all([
                get(),
                new Promise<any>(resolve => setTimeout(() => get().then(resolve), 32)) // ~2 frames @ 60fps
            ]);
            if (!r1.ok || !r2.ok) return; // can't check = proceed (non-fatal)
            const c1: number[] = r1.result?.model?.content ?? [];
            const c2: number[] = r2.result?.model?.content ?? [];
            if (c1.length !== 8 || c2.length !== 8) return;
            const isStable = c1.every((v: number, i: number) => Math.abs(v - c2[i]) < 1);
            if (!isStable) {
                const maxDelta = Math.max(...c1.map((v: number, i: number) => Math.abs(v - c2[i])));
                throw new Error(`[ANIMATING] Element ${backendNodeId} is mid-animation (max Δ=${maxDelta.toFixed(1)}px). Retry in 200ms.`);
            }
        } catch (err) {
            if ((err as Error).message.includes('[ANIMATING]')) throw err;
            // DOM.getBoxModel error = non-fatal for stability check
        }
    }

    // ─── Physical Click ───────────────────────────────────────

    /**
     * Performs a stealth click on a node:
     * 1. Scroll into view
     * 2. B3: Stability Check (2 AnimationFrames — blocks clicks on sliding menus)
     * 3. Pre-flight Z-index check (throws ObscuredElementError if blocked)
     * 4. Human Bézier trajectory to target
     * 5. Random delay 40-100ms (human reaction gap)
     * 6. mouseDown + mouseUp via wc.sendInputEvent (isTrusted: true)
     *
     * @param backendNodeId - The node to click
     * @param frameId       - Optional frameId if node is in a cross-origin iframe
     * @param fromX/fromY   - Current cursor position (for trajectory start), defaults to centre of viewport
     */
    async physicalClick(
        backendNodeId: number,
        frameId?: string,
        fromX = 640,
        fromY = 400,
    ): Promise<void> {
        // 1. Scroll into view
        await this.scrollIntoView(backendNodeId);

        // 2. B3: Stability Check — element must not be mid-animation
        await this.checkStability(backendNodeId);

        // 3. Pre-flight raycasting
        const { x: targetX, y: targetY } = await this.checkVisibility(backendNodeId, frameId);

        // Notify UI to gracefully animate GhostCursor to the exact live target
        if (this.onTargetUpdate) this.onTargetUpdate(targetX, targetY);

        // 4. Human trajectory
        await this.simulateHumanTrajectory(fromX, fromY, targetX, targetY);

        // 5. Random pre-click delay (simulates human reaction time)
        await delay(Math.floor(randomBetween(40, 100)));

        // 6. Click via wc.sendInputEvent (isTrusted: true at C++ level)
        await this.ipc('spatial-input', this.wcId, [
            { type: 'mouseDown', x: targetX, y: targetY, button: 'left', clickCount: 1 },
        ]);
        await delay(Math.floor(randomBetween(40, 80)));
        await this.ipc('spatial-input', this.wcId, [
            { type: 'mouseUp', x: targetX, y: targetY, button: 'left', clickCount: 1 },
        ]);

        console.log(
            `[WORMHOLE/Executor] physicalClick node=${backendNodeId} at (${targetX},${targetY})` +
            `${frameId ? ` frame=${frameId}` : ''}`
        );
    }
}
