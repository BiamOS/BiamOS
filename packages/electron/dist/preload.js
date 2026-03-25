"use strict";
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Electron Preload Script
// ============================================================
// Exposes a minimal API to the renderer process so the frontend
// can detect it's running inside Electron and use webview.
// Phase 2: Added scrapeUrl for Ghost-Auth cookie-based scraping.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
    /** Ghost-Auth: Scrape a URL using the app's session cookies */
    scrapeUrl: (url) => electron_1.ipcRenderer.invoke("scrape-url", url),
    /** Autopilot: Execute a single step script in a hidden webview */
    executeAutopilotStep: (taskId, url, script) => electron_1.ipcRenderer.invoke("autopilot-step", taskId, url, script),
    /** Autopilot: Get DOM snapshot from a URL for planning */
    getPageSnapshot: (taskId, url) => electron_1.ipcRenderer.invoke("page-snapshot", taskId, url),
    /** Spatial Agent: Fire native mouse events via Main Process WebContents */
    spatialInput: (webContentsId, events) => electron_1.ipcRenderer.invoke("spatial-input", webContentsId, events),
    // ── CDP Bridge (Phase 1 of CDP Rebuild) ────────────────────
    // Routes Chrome DevTools Protocol commands through the privileged
    // main process. CSP cannot block these. Guest process isolation
    // cannot interfere. The ONLY correct way to query page state.
    /** CDP: Attach debugger to a webview WebContents (idempotent) */
    cdpAttach: (wcId) => electron_1.ipcRenderer.invoke('cdp-attach', wcId),
    /** CDP: Detach debugger from a webview WebContents */
    cdpDetach: (wcId) => electron_1.ipcRenderer.invoke('cdp-detach', wcId),
    /** CDP: Send any CDP command. Auto-attaches if not yet attached. */
    cdpSend: (wcId, method, params) => electron_1.ipcRenderer.invoke('cdp-send', wcId, method, params),
    // ── WORMHOLE IPC Channels ───────────────────────────────────
    // Sprint 1 - PerceptionEngine: batch V8 listener mining (Death Trap 1)
    cdpGetListenersBatch: (wcId, nodeIds) => electron_1.ipcRenderer.invoke('cdp-get-listeners-batch', wcId, nodeIds),
    // Sprint 4 - NetworkSandbox: Fetch interception
    cdpFetchEnable: (wcId, patterns) => electron_1.ipcRenderer.invoke('cdp-fetch-enable', wcId, patterns),
    cdpFetchContinue: (wcId, requestId) => electron_1.ipcRenderer.invoke('cdp-fetch-continue', wcId, requestId),
    cdpFetchFail: (wcId, requestId, reason) => electron_1.ipcRenderer.invoke('cdp-fetch-fail', wcId, requestId, reason),
});
// ─── Lock main window zoom ──────────────────────────────────
// The <webview> tags manage their own zoom independently.
// We only want to prevent the MAIN RENDERER from being zoomed
// (which would scale the toolbar + sidebar + entire React UI).
try {
    electron_1.webFrame.setZoomLevel(0);
    electron_1.webFrame.setZoomFactor(1);
}
catch { /* safe to ignore on first load */ }
// Continuously enforce zoom lock — Chromium may reset it on navigation
setInterval(() => {
    try {
        if (electron_1.webFrame.getZoomLevel() !== 0) {
            electron_1.webFrame.setZoomLevel(0);
            electron_1.webFrame.setZoomFactor(1);
        }
    }
    catch { /* ignore */ }
}, 500);
// ─── Popup → New Tab bridge ─────────────────────────────────
// When a webview popup is intercepted in main.ts, it sends the
// URL here via IPC. We dispatch a DOM event that the renderer
// picks up and opens as a new BiamOS tab/card.
electron_1.ipcRenderer.on("open-url-in-tab", (_event, url) => {
    console.log(`🪟 [Preload] Opening popup URL as new tab: ${url}`);
    globalThis.dispatchEvent(new globalThis.CustomEvent("biamos:open-as-card", {
        detail: { url, title: "New Tab" },
    }));
});
// ─── WORMHOLE: Fetch intercept event bridge ──────────────────
// main.ts sends 'wormhole-fetch-event' via mainWindow.webContents.send()
// when a Fetch.requestPaused debugger message fires.
// We re-dispatch it as a window CustomEvent so NetworkSandbox.ts can
// listen without needing its own IPC reader.
electron_1.ipcRenderer.on("wormhole-fetch-event", (_event, payload) => {
    globalThis.dispatchEvent(new globalThis.CustomEvent("wormhole:fetch-event", {
        detail: payload,
    }));
});
console.log("⚡ BiamOS Electron preload loaded (zoom locked)");
