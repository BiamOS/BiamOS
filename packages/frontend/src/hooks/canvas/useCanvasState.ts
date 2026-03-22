// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas State (Foundation Hook)
// ============================================================
// Manages the core items[] array, safe state updates,
// removal tracking, and basic item CRUD operations.
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import type { CanvasItem } from "../../types/canvas";
import { debug } from "../../utils/debug";
import {
    savePinLayouts,
    removeSavedPinLayout,
} from "../pin-storage";

const PIN_API = "http://localhost:3001/api/pinned";

// ─── Exported Types ─────────────────────────────────────────

export type SafeSetItems = React.Dispatch<React.SetStateAction<CanvasItem[]>>;

export interface CanvasStateAPI {
    items: CanvasItem[];
    itemsRef: React.MutableRefObject<CanvasItem[]>;
    safeSetItems: SafeSetItems;
    handleRemove: (id: string) => void;
    handleClearAll: () => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useCanvasState(): CanvasStateAPI {
    const [items, rawSetItems] = useState<CanvasItem[]>([]);

    // ─── Removal tracking (prevents race with RGL and other setItems callers) ──
    const removedIdsRef = useRef<Set<string>>(new Set());

    // Safe setItems wrapper: always filters out removed card IDs
    const safeSetItems: SafeSetItems = useCallback((updater) => {
        rawSetItems((prev) => {
            const result = typeof updater === 'function' ? updater(prev) : prev;
            // Filter out any items that have been removed
            if (removedIdsRef.current.size === 0) return result;
            const filtered = result.filter((item) => !removedIdsRef.current.has(item._id));
            return filtered;
        });
    }, []);

    // Ref that always holds current items (avoids stale closure in callbacks)
    const itemsRef = useRef<CanvasItem[]>([]);
    useEffect(() => { itemsRef.current = items; }, [items]);

    // ─── Item Management ─────────────────────────────────────

    const handleRemove = useCallback((id: string) => {
        debug.log(`🗑️ [Canvas] handleRemove: ${id}`);
        // Track removal so handleLayoutChange doesn't re-add via stale RGL events
        removedIdsRef.current.add(id);
        // CR-5: Cleanup after 5s to prevent infinite set growth
        setTimeout(() => removedIdsRef.current.delete(id), 5000);
        // If pinned, also delete from backend
        const item = itemsRef.current.find((i) => i._id === id);
        if (item?._pinned && item._pinnedId) {
            fetch(`${PIN_API}/${item._pinnedId}`, { method: "DELETE" }).catch(() => { });
            // Clean up localStorage
            removeSavedPinLayout(id);
        }
        safeSetItems((prev) => {
            const next = prev.filter((item) => item._id !== id);
            debug.log(`🗑️ [Canvas] setItems: ${prev.length} → ${next.length} items`);
            return next;
        });
    }, []);

    const handleClearAll = useCallback(() => {
        // Keep pinned items, remove everything else
        safeSetItems((prev) => prev.filter((item) => item._pinned));
    }, []);

    return {
        items,
        itemsRef,
        safeSetItems,
        handleRemove,
        handleClearAll,
    };
}
