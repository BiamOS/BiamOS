// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Items Hook (Orchestrator)
// ============================================================
// Thin composition layer that wires together the domain hooks:
//   useCanvasState  → items[], safeSetItems, remove, clear
//   useCanvasLayout → RGL grid, drag guards, position sync
//   useCanvasTabs   → tab change/close, addIframeCard, titles
//   useCanvasPins   → pin loading, auto-save, GenUI events
//
// This file should stay under 50 lines.
// ============================================================

import { useCanvasState } from "./canvas/useCanvasState";
import { useCanvasLayout } from "./canvas/useCanvasLayout";
import { useCanvasTabs } from "./canvas/useCanvasTabs";
import { useCanvasPins } from "./canvas/useCanvasPins";

export function useCanvasItems() {
    // 1. Foundation: items[], safeSetItems, remove, clear
    const {
        items, itemsRef, safeSetItems,
        handleRemove, handleClearAll,
    } = useCanvasState();

    // 2. Grid: RGL layouts, drag guards, position sync
    const {
        gridLayouts, handleLayoutChange,
        handleDragStart, handleDragStop,
        onCardLayoutChange,
    } = useCanvasLayout(items, safeSetItems);

    // 3. Tabs: change, close, grouping, addIframeCard, live titles
    const {
        handleTabChange, handleTabClose,
        addTabToGroup, addIframeCard,
    } = useCanvasTabs(itemsRef, safeSetItems);

    // 4. Pins: load on startup, auto-save, GenUI events (side-effect only)
    useCanvasPins(items, itemsRef, safeSetItems);

    return {
        items,
        itemsRef,
        setItems: safeSetItems,
        gridLayouts,
        handleRemove,
        handleClearAll,
        handleLayoutChange,
        handleDragStart,
        handleDragStop,
        handleTabChange,
        handleTabClose,
        addTabToGroup,
        addIframeCard,
        onCardLayoutChange,
    };
}
