// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── CDP Input Utilities ────────────────────────────────────
// Shared helpers for click.ts and type.ts.

/**
 * Fire a CDP mouse click at CSS-pixel coordinates.
 * Includes dispatchType:'default' which YouTube/Gmail SPAs require.
 */
export async function cdpClick(
    electronAPI: any,
    wcId: number,
    x: number,
    y: number,
): Promise<void> {
    const px = { x: Math.round(x), y: Math.round(y) };
    const base = {
        button: 'left' as const,
        clickCount: 1,
        modifiers: 0,
        pointerType: 'mouse' as const,
        timestamp: Date.now() / 1000,
        // dispatchType:'default' is required for SPA click handlers (YouTube, Gmail).
        // Without it, the browser treats the event as 'untrusted' and many
        // React/Vue listeners ignore it.
        dispatchType: 'default',
    };
    await electronAPI.cdpSend(wcId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...px, ...base });
    await delay(40);
    await electronAPI.cdpSend(wcId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...px, ...base });
    await delay(80);
    await electronAPI.cdpSend(wcId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...px, ...base });
}

/**
 * Fire a JS programmatic click on the element at (x,y).
 * Used as fallback when CDP Input.dispatchMouseEvent is blocked by ad overlays.
 * elementFromPoint() pierces through invisible overlay divs to find the real target.
 */
export async function jsClick(
    electronAPI: any,
    wcId: number,
    x: number,
    y: number,
): Promise<void> {
    const expr = `
        (function() {
            // Find the deepest clickable ancestor at these coordinates
            let el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
            let tries = 0;
            while (el && tries < 10) {
                // Skip ad containers (googleadservices, doubleclick, etc.)
                const href = el.href || el.getAttribute?.('href') || '';
                if (href.includes('googleadservices') || href.includes('doubleclick') || href.includes('/pagead/')) {
                    el = el.parentElement;
                    tries++;
                    continue;
                }
                if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick || el.getAttribute?.('role') === 'link') {
                    el.click();
                    return el.href || el.tagName;
                }
                el = el.parentElement;
                tries++;
            }
            // Last resort: click whatever is there
            const target = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
            if (target) { target.click(); return target.tagName; }
            return 'none';
        })()
    `;
    await electronAPI.cdpSend(wcId, 'Runtime.evaluate', { expression: expr, returnByValue: true });
}

/**
 * Poll for URL change OR SPA title/hash change.
 * Returns new URL if navigation happened, urlBefore if not.
 *
 * Detects:
 * - Full URL change (navigate())
 * - Hash-only change (Gmail #inbox → #email)
 * - Title change (YouTube SPA router changes <title>)
 */
export async function pollForNavigation(wv: any, urlBefore: string, timeoutMs = 4000): Promise<string> {
    const end = Date.now() + timeoutMs;
    const titleBefore = wv.getTitle?.() ?? '';
    while (Date.now() < end) {
        await delay(50); // Hyper-responsive check every 50ms instead of 300ms
        try {
            const cur = wv.getURL?.() ?? await wv.executeJavaScript('location.href', true);
            if (cur && cur !== urlBefore && cur !== 'about:blank') return cur;
            // Detect SPA title change (YouTube video open, etc.)
            const titleNow = wv.getTitle?.() ?? '';
            if (titleNow && titleNow !== titleBefore && titleNow !== 'about:blank') {
                // Return modified URL (may be same for hash-routes)
                const urlNow = wv.getURL?.() ?? urlBefore;
                return urlNow !== urlBefore ? urlNow : urlBefore + '#spa-change';
            }
        } catch { /* page navigating */ }
    }
    return urlBefore;
}

export const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Fire a native OS-level click using Electron's spatialInput (webContents.sendInputEvent).
 * This completely bypasses CDP and guarantees isTrusted=true, making it 
 * immune to React/Vue synthetic event blockers.
 */
export async function nativeOsClick(
    electronAPI: any,
    wcId: number,
    x: number,
    y: number,
): Promise<boolean> {
    if (!electronAPI?.spatialInput) return false;
    const px = { x: Math.round(x), y: Math.round(y) };
    try {
        await electronAPI.spatialInput(wcId, [
            { type: 'mouseMove', ...px },
            { type: 'mouseDown', ...px, button: 'left', clickCount: 1 },
            { type: 'mouseUp', ...px, button: 'left', clickCount: 1 }
        ]);
        return true;
    } catch {
        return false;
    }
}
