// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Electron Preload Script
// ============================================================
// Exposes a minimal API to the renderer process so the frontend
// can detect it's running inside Electron and use webview.
// Phase 2: Added scrapeUrl for Ghost-Auth cookie-based scraping.
// ============================================================

import { contextBridge, ipcRenderer, webFrame } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
    /** Ghost-Auth: Scrape a URL using the app's session cookies */
    scrapeUrl: (url: string): Promise<{ url: string; title: string; text: string }> =>
        ipcRenderer.invoke("scrape-url", url),
    /** Autopilot: Execute a single step script in a hidden webview */
    executeAutopilotStep: (taskId: string, url: string, script: string): Promise<{ success: boolean; error?: string; text?: string }> =>
        ipcRenderer.invoke("autopilot-step", taskId, url, script),
    /** Autopilot: Get DOM snapshot from a URL for planning */
    getPageSnapshot: (taskId: string, url: string): Promise<{ url: string; text: string; title: string }> =>
        ipcRenderer.invoke("page-snapshot", taskId, url),
    /** Spatial Agent: Fire native mouse events via Main Process WebContents */
    spatialInput: (webContentsId: number, events: object[]): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke("spatial-input", webContentsId, events),

    // ── CDP Bridge (Phase 1 of CDP Rebuild) ────────────────────
    // Routes Chrome DevTools Protocol commands through the privileged
    // main process. CSP cannot block these. Guest process isolation
    // cannot interfere. The ONLY correct way to query page state.

    /** CDP: Attach debugger to a webview WebContents (idempotent) */
    cdpAttach: (wcId: number): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('cdp-attach', wcId),
    /** CDP: Detach debugger from a webview WebContents */
    cdpDetach: (wcId: number): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('cdp-detach', wcId),
    /** CDP: Send any CDP command. Auto-attaches if not yet attached. */
    cdpSend: (wcId: number, method: string, params?: object): Promise<{ ok: boolean; result?: any; error?: string }> =>
        ipcRenderer.invoke('cdp-send', wcId, method, params),

    // ── WORMHOLE IPC Channels ───────────────────────────────────
    // Sprint 1 - PerceptionEngine: batch V8 listener mining (Death Trap 1)
    cdpGetListenersBatch: (wcId: number, nodeIds: number[]): Promise<number[]> =>
        ipcRenderer.invoke('cdp-get-listeners-batch', wcId, nodeIds),
    // Sprint 4 - NetworkSandbox: Fetch interception
    cdpFetchEnable: (wcId: number, patterns: object[]): Promise<{ ok: boolean; error?: string }> =>
        ipcRenderer.invoke('cdp-fetch-enable', wcId, patterns),
    cdpFetchContinue: (wcId: number, requestId: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('cdp-fetch-continue', wcId, requestId),
    cdpFetchFail: (wcId: number, requestId: string, reason: string): Promise<{ ok: boolean }> =>
        ipcRenderer.invoke('cdp-fetch-fail', wcId, requestId, reason),
});


// ─── Lock main window zoom ──────────────────────────────────
// The <webview> tags manage their own zoom independently.
// We only want to prevent the MAIN RENDERER from being zoomed
// (which would scale the toolbar + sidebar + entire React UI).
try {
    webFrame.setZoomLevel(0);
    webFrame.setZoomFactor(1);
} catch { /* safe to ignore on first load */ }

// Continuously enforce zoom lock — Chromium may reset it on navigation
setInterval(() => {
    try {
        if (webFrame.getZoomLevel() !== 0) {
            webFrame.setZoomLevel(0);
            webFrame.setZoomFactor(1);
        }
    } catch { /* ignore */ }
}, 500);

// ─── Popup → New Tab bridge ─────────────────────────────────
// When a webview popup is intercepted in main.ts, it sends the
// URL here via IPC. We dispatch a DOM event that the renderer
// picks up and opens as a new BiamOS tab/card.
ipcRenderer.on("open-url-in-tab", (_event: any, url: string) => {
    console.log(`🪟 [Preload] Opening popup URL as new tab: ${url}`);
    (globalThis as any).dispatchEvent(new (globalThis as any).CustomEvent("biamos:open-as-card", {
        detail: { url, title: "New Tab" },
    }));
});

// ─── WORMHOLE: Fetch intercept event bridge ──────────────────
// main.ts sends 'wormhole-fetch-event' via mainWindow.webContents.send()
// when a Fetch.requestPaused debugger message fires.
// We re-dispatch it as a window CustomEvent so NetworkSandbox.ts can
// listen without needing its own IPC reader.
ipcRenderer.on("wormhole-fetch-event", (_event: any, payload: { wcId: number; params: any }) => {
    (globalThis as any).dispatchEvent(new (globalThis as any).CustomEvent("wormhole:fetch-event", {
        detail: payload,
    }));
});

console.log("⚡ BiamOS Electron preload loaded (zoom locked)");
