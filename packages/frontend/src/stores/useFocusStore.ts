// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Global Focus Store (Zustand)
// ============================================================
// Tracks which Whitebox card the user is interacting with.
// The Omnibar uses this to route commands to the correct card.
//
// SNAPSHOT LOGIC: When the Omnibar input is focused, a snapshot
// of the current targetCardId is taken. All commands submitted
// refer to this snapshot, even if the user clicks another card
// while typing. This prevents race conditions.
// ============================================================

import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────

export interface CardMeta {
    label: string;       // "GitHub", "Gmail", "Weather"
    icon: string;        // Emoji or icon name
    url?: string;        // Current webview URL (if iframe)
    hasWebview: boolean;  // Can receive agent actions?
    hasDashboard: boolean; // Has research dashboard?
}

interface FocusState {
    // ─── Live Focus ─────────────────────────────
    activeCardId: string | null;
    activeCardMeta: CardMeta | null;

    // ─── Snapshot (frozen on Omnibar focus) ──────
    snapshotCardId: string | null;
    snapshotCardMeta: CardMeta | null;

    // ─── Actions ────────────────────────────────
    setFocus: (cardId: string, meta: CardMeta) => void;
    clearFocus: () => void;
    takeSnapshot: () => void;
    clearSnapshot: () => void;
}

// ─── Store ──────────────────────────────────────────────────

export const useFocusStore = create<FocusState>((set, get) => ({
    activeCardId: null,
    activeCardMeta: null,
    snapshotCardId: null,
    snapshotCardMeta: null,

    setFocus: (cardId, meta) =>
        set({ activeCardId: cardId, activeCardMeta: meta }),

    clearFocus: () =>
        set({
            activeCardId: null,
            activeCardMeta: null,
            snapshotCardId: null,
            snapshotCardMeta: null,
        }),

    takeSnapshot: () => {
        const { activeCardId, activeCardMeta } = get();
        set({ snapshotCardId: activeCardId, snapshotCardMeta: activeCardMeta });
    },

    clearSnapshot: () =>
        set({ snapshotCardId: null, snapshotCardMeta: null }),
}));
