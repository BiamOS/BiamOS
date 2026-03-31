// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Click Actions (CDP Edition + WORMHOLE StealthExecutor)
// ============================================================
// click()      → StealthExecutor: pre-flight Z-index raycasting +
//                Bézier human trajectory + wc.sendInputEvent (isTrusted:true)
// click_at()   → cdpClick (coordinate-based, no backendNodeId available)
// vision_*     → unchanged (% coordinates, no SoM IDs)
// ============================================================

import { debug } from '../../../../../utils/debug';
import type { ActionContext, ActionResult } from '../types';
import { cdpClick, jsClick, pollForNavigation, delay, nativeOsClick } from './cdpUtils';
import { StealthExecutor, ObscuredElementError } from '../wormhole/StealthExecutor';

const electronAPI = () => (window as any).electronAPI;

// ─── click(id, description) ─────────────────────────────────
// Primary click — resolves SoM ID to backendNodeId, uses StealthExecutor
// for pre-flight Z-index check + Bézier human trajectory.

export async function click(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const entry = ctx.getSomEntry(Number(args.id));
    if (!entry) {
        return { logMessage: `❌ SoM ID [${args.id}] not found in current step. IDs are ephemeral — get a fresh screenshot and use the new IDs.` };
    }

    if (entry.name && entry.name.includes('[DISABLED]')) {
        debug.log(`🚫 [Actionability] Blocked click on disabled element id=${args.id} "${entry.name}"`);
        return { logMessage: `❌ [DISABLED] Element id=${args.id} "${entry.name}" is currently disabled. Clicking it will have no effect. You must change your strategy (e.g., fill out a required input field first).` };
    }

    const api = electronAPI();
    const urlBefore = ctx.wv.getURL?.() ?? '';

    // ── B1: JIT Actionability Verification ─────────────────────────────────────
    // TOCTOU Gap: captureDomSnapshot (t=1.4s) vs executeAction (t=7.0s) = 5s+ LLM latency.
    // In a heavy SPA (YouTube, React) the DOM mutates massively during LLM inference.
    // This check fires synchronously RIGHT BEFORE the physical CDP click.
    //
    // Architect's fix (3 rules):
    //   1. Fail-CLOSED: catch MUST return { ok: false } — never blind-click on stale coords
    //   2. scrollIntoViewIfNeeded: drift > 15px means the element may be off-screen
    //   3. Occlusion Raycast: cookie banners, modals (z-index: 9999) block clicks silently
    if (entry.nodeId && api?.cdpSend && ctx.wcId) {
        const jitResult = await (async (): Promise<{ ok: boolean; liveX?: number; liveY?: number; reason?: string }> => {
            try {
                // Step 0: Fetch DPR — DOM.getBoxModel returns PHYSICAL pixels, cdpClick needs CSS pixels
                // Without this correction, every click on HiDPI displays (2x, 1.5x) lands at the wrong spot.
                let dpr = 1;
                try {
                    const dprResp = await api.cdpSend(ctx.wcId, 'Runtime.evaluate', {
                        expression: 'window.devicePixelRatio || 1',
                        returnByValue: true,
                    });
                    dpr = dprResp?.result?.result?.value ?? 1;
                } catch { /* use dpr=1 as safe fallback */ }

                // Step 1: Get live BoundingBox via CDP (the ground-truth, not the cached SoM snapshot)
                const boxResp = await api.cdpSend(ctx.wcId, 'DOM.getBoxModel', {
                    backendNodeId: entry.nodeId,
                });

                // Fail-Closed: if getBoxModel fails → element is DETACHED or display:none
                if (!boxResp.ok || !boxResp.result?.model) {
                    return { ok: false, reason: `[DETACHED] Element id=${args.id} "${entry.name}" is no longer in the DOM. Get a fresh snapshot.` };
                }

                const { content } = boxResp.result.model;
                if (!content || content.length < 8) {
                    return { ok: false, reason: `[INVISIBLE] Element id=${args.id} has no BoundingBox (display:none or opacity:0).` };
                }

                // DOM.getBoxModel returns PHYSICAL pixels — divide by DPR to get CSS pixels
                const liveW = (content[2] - content[0]) / dpr;
                const liveH = (content[5] - content[1]) / dpr;
                if (liveW <= 0 || liveH <= 0) {
                    return { ok: false, reason: `[COLLAPSED] Element id=${args.id} has 0x0 size — CSS anomaly or hidden by overlay.` };
                }

                // Center in CSS pixel space
                const liveX = Math.round((content[0] / dpr) + liveW / 2);
                const liveY = Math.round((content[1] / dpr) + liveH / 2);
                const drift = Math.hypot(liveX - entry.x, liveY - entry.y);

                // Adaptive drift threshold: small elements (calendar ≤ 32x32) need tighter guard
                const isSmallElement = liveW <= 32 || liveH <= 32;
                const driftThreshold = isSmallElement ? 8 : 15;

                if (drift > driftThreshold) {
                    debug.log(`⚠️ [JIT] id=${args.id} "${entry.name}" drifted ${drift.toFixed(0)}px since snapshot → scrolling to live position (dpr=${dpr.toFixed(2)} w=${liveW.toFixed(0)}x${liveH.toFixed(0)})`);

                    // Step 2a: Element drifted → may be off-screen. Force into viewport.
                    await api.cdpSend(ctx.wcId, 'DOM.scrollIntoViewIfNeeded', {
                        backendNodeId: entry.nodeId,
                    });
                }

                // Step 2b: UNIVERSAL Occlusion Raycast (Phase 3 Guard)
                const resolved = await api.cdpSend(ctx.wcId, 'DOM.resolveNode', { backendNodeId: entry.nodeId });
                if (resolved.ok && resolved.result?.object?.objectId) {
                    const fn = `function() {
                        const r = this.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const topEl = document.elementFromPoint(cx, cy);
                        if (!topEl) return false;
                        return this.contains(topEl) || topEl.contains(this);
                    }`;
                    const blockResp = await api.cdpSend(ctx.wcId, 'Runtime.callFunctionOn', {
                        objectId: resolved.result.object.objectId,
                        functionDeclaration: fn,
                        returnByValue: true
                    });
                    
                    if (blockResp.ok && blockResp.result?.result?.value === false) {
                        return { 
                            ok: false, 
                            reason: `[OCCLUDED] Element id=${args.id} "${entry.name}" is physically covered by a dialog, popup, or cookie banner at its live position. You MUST deal with the overlay first (e.g. ask the user to clear it, or press Escape/submit on it).`
                        };
                    }
                }

                return { ok: true, liveX, liveY };

            } catch {
                // FAIL-CLOSED: exception = element definitely not accessible
                return { ok: false, reason: `[UNAVAILABLE] Element id=${args.id} "${entry.name}" could not be verified (not renderable or detached).` };
            }
        })();

        if (!jitResult.ok) {
            debug.log(`🚫 [JIT] Blocked click on id=${args.id}: ${jitResult.reason}`);
            return {
                logMessage: `⚠️ [JIT-ACTIONABILITY FAILED] ${jitResult.reason}\n\nCapture a fresh DOM snapshot and choose a new element or strategy.`,
            };
        }

        // Update entry coordinates with live DPR-corrected position
        if (jitResult.liveX !== undefined && jitResult.liveY !== undefined) {
            entry.x = jitResult.liveX;
            entry.y = jitResult.liveY!;
        }
    }


    // ── WORMHOLE StealthExecutor path ─────────────────────────
    if (entry.nodeId && api?.spatialInput && ctx.wcId) {
        const cdpSender = (method: string, params?: object) =>
            api.cdpSend ? api.cdpSend(ctx.wcId, method, params) : Promise.resolve({ ok: false });
        const ipcInvoker = (channel: string, ...args2: any[]) =>
            api.spatialInput ? api.spatialInput(args2[0], args2[1]) : Promise.resolve({ success: false });

        const executor = new StealthExecutor(cdpSender, ipcInvoker, ctx.wcId, new Map(), ctx.updateCursorPos);

        try {
            await executor.physicalClick(entry.nodeId, undefined, entry.x, entry.y);
        } catch (e) {
            const errMsg = (e as Error).message ?? '';
            if (errMsg.includes('[ANIMATING]')) {
                // B3: Element mid-animation — wait and retry once
                debug.log(`[WORMHOLE/click] Element animating — waiting 200ms and retrying`);
                await new Promise(r => setTimeout(r, 200));
                try { await executor.physicalClick(entry.nodeId, undefined, entry.x, entry.y); } catch { /* fall through */ }
            } else {
                debug.log(`[WORMHOLE/click] StealthExecutor failed, falling back to nativeOsClick`);
                if (!(await nativeOsClick(api, ctx.wcId, entry.x, entry.y))) {
                    await cdpClick(api, ctx.wcId, entry.x, entry.y);
                }
            }
        }
    } else {
        // ── Legacy fallback (no backendNodeId or no Electron) ──
        if (!(await nativeOsClick(api, ctx.wcId ?? 0, entry.x, entry.y))) {
            await cdpClick(api, ctx.wcId ?? 0, entry.x, entry.y);
        }
    }

    // Adaptive poll timeout:
    // Heavy SPAs (YouTube, React) can take 3-6s for server round-trips before pushing history state.
    // We conditionally wait longer for links/videos to avoid Kinetic Sonar capturing prematurely.
    const submitKeywords = /kommentieren|comment|send|senden|submit|post|reply|antwort|video|watch|ansehen/i;
    const isSubmitClick = submitKeywords.test(entry.name ?? '') || submitKeywords.test(args.description ?? '');
    const isLink = entry.role === 'link' || entry.tag === 'A' || entry.tag === 'IMG';
    const navPollMs = (isSubmitClick || isLink) ? 6000 : 2500;

    const urlAfter = await pollForNavigation(ctx.wv, urlBefore, navPollMs);
    if (urlAfter !== urlBefore) {
        await ctx.waitForPageReady('post-click-nav');
        const displayUrl = urlAfter.endsWith('#spa-change') ? (ctx.wv.getURL?.() ?? urlBefore) : urlAfter;
        return {
            logMessage: `✅ SUCCESS: Clicked [${args.id}] "${entry.name}" → navigated to ${displayUrl}`,
            didNavigate: true,
        };
    }

    // No navigation occurred. This is perfectly normal for buttons, tabs, filters, and forms.
    // We intentionally DO NOT fire a backup jsClick here, because that would double-click the element 
    // and instantly undo the action (e.g. unliking a video right after liking it).
    return {
        logMessage: `✓ Clicked [${args.id}] "${entry.name}". No navigation triggered (normal for tabs, filters, toggles).`,
    };
}

// ─── click_at(x, y, description) ────────────────────────────
// Coordinate-based click (fallback when LLM knows exact position).

export async function click_at(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const x = Number(args.x ?? 0);
    const y = Number(args.y ?? 0);
    if (!x && !y) return { logMessage: '❌ click_at requires x and y coordinates.' };

    const urlBefore = ctx.wv.getURL?.() ?? '';
    
    // Fallback: Primary use nativeOsClick (human simulation) instead of bare cdpClick
    const api = electronAPI();
    if (!(await nativeOsClick(api, ctx.wcId, x, y))) {
        await cdpClick(api, ctx.wcId, x, y);
    }

    const urlAfter = await pollForNavigation(ctx.wv, urlBefore);
    if (urlAfter !== urlBefore) {
        await ctx.waitForPageReady('post-click_at-nav');
        return { logMessage: `✅ SUCCESS: Clicked at (${x},${y}) → navigated to ${urlAfter}`, didNavigate: true };
    }
    return { logMessage: `✅ SUCCESS: Clicked at (${x},${y}). ${args.description ?? ''}` };
}

// ─── vision_click(x_pct, y_pct) ─────────────────────────────
// Percentage-based click derived from screenshot ruler coordinates.

export async function vision_click(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const api = electronAPI();
    if (!api?.cdpSend || !ctx.wcId) return { logMessage: 'vision_click requires Electron + CDP' };

    const dimsResp = await api.cdpSend(ctx.wcId, 'Runtime.evaluate', {
        expression: 'JSON.stringify({w:window.innerWidth,h:window.innerHeight})',
        returnByValue: true,
    });
    const dims = JSON.parse(dimsResp?.result?.result?.value ?? '{"w":1280,"h":900}');
    const x = Math.round((args.x_pct / 100) * dims.w);
    const y = Math.round((args.y_pct / 100) * dims.h);

    const urlBefore = ctx.wv.getURL?.() ?? '';
    await cdpClick(api, ctx.wcId, x, y);
    const urlAfter = await pollForNavigation(ctx.wv, urlBefore);
    if (urlAfter !== urlBefore) {
        await ctx.waitForPageReady('post-vision_click-nav');
        return { logMessage: `✅ vision_click at (${args.x_pct}%, ${args.y_pct}%) → ${urlAfter}`, didNavigate: true };
    }
    return { logMessage: `✅ vision_click at (${args.x_pct}%, ${args.y_pct}%) css=(${x},${y})` };
}

// ─── vision_hover(x_pct, y_pct) ─────────────────────────────
// Hover to reveal hidden menus. Uses mouseMoved only (no click).

export async function vision_hover(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const api = electronAPI();
    if (!api?.cdpSend || !ctx.wcId) return { logMessage: 'vision_hover requires Electron + CDP' };

    const dimsResp = await api.cdpSend(ctx.wcId, 'Runtime.evaluate', {
        expression: 'JSON.stringify({w:window.innerWidth,h:window.innerHeight})',
        returnByValue: true,
    });
    const dims = JSON.parse(dimsResp?.result?.result?.value ?? '{"w":1280,"h":900}');
    const x = Math.round((args.x_pct / 100) * dims.w);
    const y = Math.round((args.y_pct / 100) * dims.h);

    await api.cdpSend(ctx.wcId, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y,
        button: 'none', modifiers: 0,
        pointerType: 'mouse', timestamp: Date.now() / 1000,
    });
    await delay(1000);
    debug.log(`🖱️ [CDP] vision_hover @ css(${x},${y}) from (${args.x_pct}%,${args.y_pct}%)`);
    return { logMessage: `✓ vision_hover at (${args.x_pct}%, ${args.y_pct}%) — hidden UI may now be visible` };
}

// ─── vision_drag(from, to) ───────────────────────────────────
// Drag from one % coordinate to another (n8n node connections etc).

export async function vision_drag(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const api = electronAPI();
    if (!api?.cdpSend || !ctx.wcId) return { logMessage: 'vision_drag requires Electron + CDP' };

    const dimsResp = await api.cdpSend(ctx.wcId, 'Runtime.evaluate', {
        expression: 'JSON.stringify({w:window.innerWidth,h:window.innerHeight})',
        returnByValue: true,
    });
    const dims = JSON.parse(dimsResp?.result?.result?.value ?? '{"w":1280,"h":900}');
    const sx = Math.round((args.from_x_pct / 100) * dims.w);
    const sy = Math.round((args.from_y_pct / 100) * dims.h);
    const ex = Math.round((args.to_x_pct / 100) * dims.w);
    const ey = Math.round((args.to_y_pct / 100) * dims.h);

    const base = { button: 'left' as const, clickCount: 1, modifiers: 0, pointerType: 'mouse' as const };
    await api.cdpSend(ctx.wcId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy, ...base });
    await delay(40);
    await api.cdpSend(ctx.wcId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, ...base });
    await delay(150);

    const STEPS = 15;
    for (let i = 1; i <= STEPS; i++) {
        const cx = Math.round(sx + (ex - sx) * (i / STEPS));
        const cy = Math.round(sy + (ey - sy) * (i / STEPS));
        await api.cdpSend(ctx.wcId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, ...base });
        await delay(10);
    }
    await delay(100);
    await api.cdpSend(ctx.wcId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: ex, y: ey, ...base });

    return { logMessage: `✓ vision_drag from (${args.from_x_pct}%,${args.from_y_pct}%) → (${args.to_x_pct}%,${args.to_y_pct}%)` };
}
