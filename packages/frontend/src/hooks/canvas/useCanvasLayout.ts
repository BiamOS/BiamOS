// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Layout Hook (Grid Manager)
// ============================================================
// Manages React-Grid-Layout integration: layout caching,
// drag guards, handleLayoutChange, and grid position sync.
// ============================================================

import { useCallback, useRef, useMemo } from "react";
import type { CanvasItem, GridLayoutItem } from "../../types/canvas";
import { CARD_CONSTRAINTS } from "../../theme/theme";
import { debug } from "../../utils/debug";
import { savePinLayouts } from "../pin-storage";
import type { SafeSetItems } from "./useCanvasState";

// ─── Types ──────────────────────────────────────────────────

export interface CanvasLayoutAPI {
    gridLayouts: GridLayoutItem[];
    handleLayoutChange: (newLayout: readonly GridLayoutItem[]) => void;
    handleDragStart: () => void;
    handleDragStop: () => void;
    onCardLayoutChange: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useCanvasLayout(
    items: CanvasItem[],
    safeSetItems: SafeSetItems,
): CanvasLayoutAPI {

    // ─── Drag guard (prevents layout thrashing during drag) ──
    const isDraggingRef = useRef(false);
    const handleDragStart = useCallback(() => { isDraggingRef.current = true; }, []);
    const handleDragStop = useCallback(() => { isDraggingRef.current = false; }, []);

    // ─── Layout cache ───────────────────────────────────────
    const layoutCacheRef = useRef<Record<string, GridLayoutItem>>({});

    const handleLayoutChange = useCallback((newLayout: readonly GridLayoutItem[]) => {
        // During active drag: don't sync layout (RGL fires onChange continuously)
        if (isDraggingRef.current) return;
        safeSetItems((prev) => {
            let hasChanges = false;
            const updated = prev.map((item) => {
                // Skip layout sync for streaming cards
                if ((item as any)._streaming) return item;
                const layoutItem = newLayout.find((l) => l.i === item._id);
                if (!layoutItem) return item;
                const { x, y, w, h } = layoutItem;
                if (item.layout.x === x && item.layout.y === y && item.layout.w === w && item.layout.h === h) return item;
                hasChanges = true;
                debug.log(`🔄 [Layout] RGL changed "${item._id}": (${item.layout.x},${item.layout.y},${item.layout.w}x${item.layout.h}) → (${x},${y},${w}x${h})`);
                const cached = layoutCacheRef.current[item._id];
                if (cached) { cached.x = x; cached.y = y; cached.w = w; cached.h = h; }
                return { ...item, layout: { x, y, w, h } };
            });

            // Save pinned card positions to localStorage
            if (hasChanges) {
                const pinLayouts: Record<string, { x: number; y: number; w: number; h: number }> = {};
                for (const item of updated) {
                    if (item._pinned) {
                        pinLayouts[item._id] = item.layout;
                    }
                }
                if (Object.keys(pinLayouts).length > 0) {
                    savePinLayouts(pinLayouts);
                }
            }

            return hasChanges ? updated : prev;
        });
    }, [safeSetItems]);

    // ─── Grid Layouts (memoized RGL input) ──────────────────
    const gridLayouts = useMemo(() => {
        // Sync: remove old cache entries that no longer have items
        const currentIds = new Set(items.map((i) => i._id));
        for (const key of Object.keys(layoutCacheRef.current)) {
            if (!currentIds.has(key)) {
                delete layoutCacheRef.current[key];
            }
        }

        // Constraints from CARD_CONSTRAINTS
        const constraints = {
            minW: CARD_CONSTRAINTS.minW,
            minH: CARD_CONSTRAINTS.minH,
        };

        // Add/update layout entries
        for (const item of items) {
            const cached = layoutCacheRef.current[item._id];
            if (cached) {
                // Sync h/w from items (card may have resized itself, e.g. tab added)
                if (cached.w !== item.layout.w || cached.h !== item.layout.h) {
                    cached.w = item.layout.w;
                    cached.h = item.layout.h;
                }
            } else {
                layoutCacheRef.current[item._id] = {
                    i: item._id,
                    ...item.layout,
                    ...constraints,
                };
                debug.log(`📦 [Layout Cache] NEW card "${item._id}" → (${item.layout.x},${item.layout.y},${item.layout.w}x${item.layout.h})`);
            }
        }

        // Sync layout changes from streaming and final-update transitions
        for (const item of items) {
            const cached = layoutCacheRef.current[item._id];
            if (cached && (cached.w !== item.layout.w || cached.h !== item.layout.h)) {
                cached.w = item.layout.w;
                cached.h = item.layout.h;
            }
        }

        return Object.values(layoutCacheRef.current);
    }, [items]);

    // Update cache when handleLayoutChange fires (drag/resize)
    const updateLayoutCache = useCallback((id: string, layout: { x: number; y: number; w: number; h: number }) => {
        const entry = layoutCacheRef.current[id];
        if (entry) {
            entry.x = layout.x;
            entry.y = layout.y;
            entry.w = layout.w;
            entry.h = layout.h;
        }
    }, []);

    // ─── Single-card layout change (DragCanvas drag/resize) ──
    const onCardLayoutChange = useCallback((id: string, layout: { x: number; y: number; w: number; h: number }) => {
        debug.log(`📐 [DragCanvas] Card "${id}" moved/resized to (${layout.x},${layout.y},${layout.w}x${layout.h})`);
        updateLayoutCache(id, layout);
        safeSetItems((prev) => prev.map((item) => {
            if (item._id !== id) return item;
            if (item.layout.x === layout.x && item.layout.y === layout.y && item.layout.w === layout.w && item.layout.h === layout.h) return item;
            return { ...item, layout };
        }));
    }, [updateLayoutCache, safeSetItems]);

    return {
        gridLayouts,
        handleLayoutChange,
        handleDragStart,
        handleDragStop,
        onCardLayoutChange,
    };
}
