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
    executeAutopilotStep: (url, script) => electron_1.ipcRenderer.invoke("autopilot-step", url, script),
    /** Autopilot: Get DOM snapshot from a URL for planning */
    getPageSnapshot: (url) => electron_1.ipcRenderer.invoke("page-snapshot", url),
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
console.log("⚡ BiamOS Electron preload loaded (zoom locked)");
