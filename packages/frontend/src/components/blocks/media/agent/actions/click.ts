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

    const api = electronAPI();
    const urlBefore = ctx.wv.getURL?.() ?? '';

    // ── WORMHOLE StealthExecutor path ─────────────────────────
    if (entry.nodeId && api?.spatialInput && ctx.wcId) {
        const cdpSender = (method: string, params?: object) =>
            api.cdpSend ? api.cdpSend(ctx.wcId, method, params) : Promise.resolve({ ok: false });
        const ipcInvoker = (channel: string, ...args2: any[]) =>
            api.spatialInput ? api.spatialInput(args2[0], args2[1]) : Promise.resolve({ success: false });

        const executor = new StealthExecutor(cdpSender, ipcInvoker, ctx.wcId);

        try {
            await executor.physicalClick(entry.nodeId, undefined, entry.x, entry.y);
        } catch (e) {
            debug.log(`[WORMHOLE/click] StealthExecutor failed, falling back to nativeOsClick`);
            if (!(await nativeOsClick(api, ctx.wcId, entry.x, entry.y))) {
                await cdpClick(api, ctx.wcId, entry.x, entry.y);
            }
        }
    } else {
        // ── Legacy fallback (no backendNodeId or no Electron) ──
        if (!(await nativeOsClick(api, ctx.wcId ?? 0, entry.x, entry.y))) {
            await cdpClick(api, ctx.wcId ?? 0, entry.x, entry.y);
        }
    }

    const urlAfter = await pollForNavigation(ctx.wv, urlBefore, 2500); // 2.5s is enough to catch quick SPA route changes
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
