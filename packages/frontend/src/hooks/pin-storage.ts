// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pin Layout & Tab Persistence (localStorage)
// ============================================================
// Extracted from useCanvasItems.ts for single-responsibility.
// ============================================================

const PIN_LAYOUTS_KEY = "BiamOS_pinnedLayouts";
const PIN_ACTIVE_TABS_KEY = "BiamOS_pinnedActiveTabs";

// ─── Pin Layouts ─────────────────────────────────────────────

export function getSavedPinLayouts(): Record<string, { x: number; y: number; w: number; h: number }> {
    try {
        const raw = localStorage.getItem(PIN_LAYOUTS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

export function savePinLayouts(layouts: Record<string, { x: number; y: number; w: number; h: number }>) {
    try {
        const existing = getSavedPinLayouts();
        localStorage.setItem(PIN_LAYOUTS_KEY, JSON.stringify({ ...existing, ...layouts }));
    } catch { /* */ }
}

export function removeSavedPinLayout(pinKey: string) {
    try {
        const existing = getSavedPinLayouts();
        delete existing[pinKey];
        localStorage.setItem(PIN_LAYOUTS_KEY, JSON.stringify(existing));
    } catch { /* */ }
}

// ─── Active Tab Index ────────────────────────────────────────

export function getSavedActiveTabs(): Record<string, number> {
    try {
        const raw = localStorage.getItem(PIN_ACTIVE_TABS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

export function saveActiveTab(pinKey: string, index: number) {
    try {
        const existing = getSavedActiveTabs();
        existing[pinKey] = index;
        localStorage.setItem(PIN_ACTIVE_TABS_KEY, JSON.stringify(existing));
    } catch { /* */ }
}
