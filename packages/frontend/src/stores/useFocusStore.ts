// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Global Focus Store (Zustand)
// ============================================================
// Tracks which Whitebox card the user is interacting with.
// The Omnibar uses this to route commands to the correct card.
//
// CONTEXT ANCHOR LOGIC:
//   - activeCard*    = live focus, cleared when user clicks elsewhere
//   - lastKnownCard* = sticky anchor, ONLY updated when a real card is
//                      explicitly focused via setFocus(). Clicking the
//                      CommandCenter input is "neutral ground" and never
//                      clears it. This ensures Lura stays mentally bound
//                      to the last active webview even while typing.
//   - snapshotCard*  = frozen at submit time, prefers lastKnownCard* as
//                      fallback when activeCard* is null.
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

    // ─── Persistent Context Anchor ───────────────
    // Sticky - only updated by setFocus(), never by clearFocus().
    // CommandCenter input clicks are "neutral ground" — they never erase this.
    lastKnownCardId: string | null;
    lastKnownCardMeta: CardMeta | null;

    // ─── Snapshot (frozen at submit time) ────────
    snapshotCardId: string | null;
    snapshotCardMeta: CardMeta | null;

    // ─── Actions ────────────────────────────────
    setFocus: (cardId: string, meta: CardMeta) => void;
    clearFocus: () => void;
    /** Call on card DELETE — clears lastKnownCard* to prevent ghost UI. */
    cardRemoved: (cardId: string) => void;
    takeSnapshot: () => void;
    clearSnapshot: () => void;
}


// ─── Store ──────────────────────────────────────────────────

export const useFocusStore = create<FocusState>((set, get) => ({
    activeCardId: null,
    activeCardMeta: null,
    lastKnownCardId: null,
    lastKnownCardMeta: null,
    snapshotCardId: null,
    snapshotCardMeta: null,

    setFocus: (cardId, meta) =>
        set({
            activeCardId: cardId,
            activeCardMeta: meta,
            // Always update the sticky anchor when a card is explicitly focused
            lastKnownCardId: cardId,
            lastKnownCardMeta: meta,
        }),

    clearFocus: () =>
        set({
            activeCardId: null,
            activeCardMeta: null,
            // ⚠️ DO NOT clear lastKnownCard* here — that's the whole point.
            // The user un-focused a card but Lura stays mentally bound to it.
        }),

    // Bug 0 fix: explicit card delete — must clear lastKnown* to prevent ghost UI
    cardRemoved: (cardId: string) =>
        set((state) => {
            const isAnchor = state.lastKnownCardId === cardId;
            const isActive = state.activeCardId === cardId;
            const isSnapshot = state.snapshotCardId === cardId;
            return {
                activeCardId: isActive ? null : state.activeCardId,
                activeCardMeta: isActive ? null : state.activeCardMeta,
                lastKnownCardId: isAnchor ? null : state.lastKnownCardId,
                lastKnownCardMeta: isAnchor ? null : state.lastKnownCardMeta,
                snapshotCardId: isSnapshot ? null : state.snapshotCardId,
                snapshotCardMeta: isSnapshot ? null : state.snapshotCardMeta,
            };
        }),

    takeSnapshot: () => {
        const { activeCardId, activeCardMeta, lastKnownCardId, lastKnownCardMeta } = get();
        // Prefer live active card; fall back to last known anchor
        set({
            snapshotCardId: activeCardId ?? lastKnownCardId,
            snapshotCardMeta: activeCardMeta ?? lastKnownCardMeta,
        });
    },

    clearSnapshot: () =>
        set({ snapshotCardId: null, snapshotCardMeta: null }),
}));
