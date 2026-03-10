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
    executeAutopilotStep: (url: string, script: string): Promise<{ success: boolean; error?: string; text?: string }> =>
        ipcRenderer.invoke("autopilot-step", url, script),
    /** Autopilot: Get DOM snapshot from a URL for planning */
    getPageSnapshot: (url: string): Promise<{ url: string; text: string; title: string }> =>
        ipcRenderer.invoke("page-snapshot", url),
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

console.log("⚡ BiamOS Electron preload loaded (zoom locked)");
