// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Types & Utilities
// ============================================================

import type { LayoutSpec, BlockSpec } from "../components/blocks";
import { debug } from "../utils/debug";

// ============================================================
// Types
// ============================================================

export interface BiamPayload {
    action: string;
    integration_id?: string;
    layout?: LayoutSpec;
    data?: Record<string, unknown>;
    message?: string;
    _query?: string;
}

export interface CanvasLayout {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface CanvasTab {
    id: string;
    label: string;
    payload: BiamPayload;
}

export interface CanvasItem {
    _id: string;
    _query: string;
    payload: BiamPayload;
    layout: CanvasLayout;
    _loading?: boolean;
    _streaming?: boolean;                // true = still receiving progressive blocks
    _pipelineStep?: string;          // live SSE step label for loading cards
    _pipelineStepIndex?: number;      // current step index (1-based)
    _pipelineTotalSteps?: number;     // total steps in pipeline
    // Tab support
    tabs?: CanvasTab[];
    activeTabIndex?: number;
    _groupName?: string;
    _pendingTabLoading?: boolean;
    _pendingPipelineStep?: string;   // live SSE step label for tab-loading
    // Pinned support
    _pinned?: boolean;               // true = persists across restarts
    _pinnedId?: number;              // backend DB id for the pin
    // Context-augmented browsing
    _autoContext?: boolean;           // true = auto-triggered by context watcher
}

export interface GridLayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

// ============================================================
// Utilities
// ============================================================

/** Content-aware card sizing — analyzes the actual blocks to compute optimal dimensions */
export function smartCardSize(payload: BiamPayload): { w: number; h: number } {
    const blocks = (payload.layout?.blocks ?? []) as BlockSpec[];
    const types = blocks.map((b) => b.type);

    // Calculator is a fixed-size system block
    if (types.includes("calculator")) {
        return { w: 4, h: 14 };
    }

    // iframe fills wide + tall
    if (types.includes("iframe")) {
        return { w: 6, h: 20 };
    }

    // ─── Accumulate height from each block ───────────────────
    let totalH = 1; // base padding (top)
    let needsWide = false;

    for (const block of blocks) {
        const b = block as any;
        switch (block.type) {
            case "title":
                totalH += 2;
                break;
            case "hero":
                totalH += 4;
                break;
            case "hero_image":
                totalH += 8;
                needsWide = true;
                break;
            case "image":
                totalH += 6;
                needsWide = true;
                break;
            case "text":
                totalH += 2 + Math.ceil((b.content?.length ?? 0) / 120);
                break;
            case "key_value": {
                const cols = b.columns ?? 2;
                const pairCount = b.pairs?.length ?? 0;
                totalH += 1 + Math.ceil(pairCount / cols) * 2.5;
                break;
            }
            case "metric_row":
                totalH += 3.5;
                needsWide = true;
                break;
            case "stat_bar":
                totalH += 1 + (b.items?.length ?? 1) * 2;
                needsWide = true;
                break;
            case "table":
                totalH += 2 + (b.rows?.length ?? 1) * 1.5;
                needsWide = true;
                break;
            case "list":
                totalH += 1 + (b.items?.length ?? 1) * 1.8;
                break;
            case "link_list":
                totalH += 1 + (b.links?.length ?? 1) * 2;
                break;
            case "timeline":
                totalH += 1 + (b.events?.length ?? 1) * 3;
                break;
            case "image_grid":
                totalH += 6;
                needsWide = true;
                break;
            case "callout":
                totalH += 3;
                break;
            case "accordion":
                totalH += 1 + (b.sections?.length ?? 1) * 2;
                break;
            case "chip_list":
                totalH += 2;
                break;
            case "badge_row":
                totalH += 3;
                break;
            case "rating":
                totalH += 2;
                break;
            case "quote":
                totalH += 3;
                break;
            case "code":
                totalH += 3 + Math.ceil((b.content?.length ?? 0) / 80);
                break;
            case "video":
            case "media_card":
                totalH += 8;
                needsWide = true;
                break;
            case "divider":
                totalH += 0.5;
                break;
            case "spacer":
                totalH += 1;
                break;
            case "progress_ring":
                totalH += 4;
                break;
            default:
                totalH += 2;
        }
    }

    totalH += 1; // bottom padding

    // ─── Determine width ─────────────────────────────────────
    let w = needsWide ? 4 : (blocks.length >= 3 ? 4 : 3);

    // Scale with size_hint if provided
    const hint = (payload.layout as any)?.size_hint as string | undefined;
    if (hint === "compact") { w = Math.max(3, w); }
    if (hint === "medium") { w = Math.max(4, w); }
    if (hint === "large") { w = Math.min(6, w + 1); }
    if (hint === "full") { w = 6; }

    // ─── Clamp ───────────────────────────────────────────────
    const h = Math.max(6, Math.min(30, Math.round(totalH)));

    return { w, h };
}

// ─── Gap-Filling Placement ──────────────────────────────────

/**
 * Find the first open slot on the canvas where a block of size
 * (newW × newH) fits, scanning row-by-row left→right.
 *
 * Uses an occupancy grid built from existing items.
 */
export function findNextSlot(
    rawItems: readonly CanvasItem[],
    newW: number,
    newH: number,
    gridCols = 12,
): { x: number; y: number } {
    // Ignore loading placeholders — they don't occupy real grid space
    const items = rawItems.filter(i => !i._loading);
    if (items.length === 0) return { x: 0, y: 0 };

    // Determine grid height we need to scan
    let maxY = 0;
    for (const item of items) {
        const bottom = item.layout.y + item.layout.h;
        if (bottom > maxY) maxY = bottom;
    }
    // Add extra rows so we always find a slot
    const scanRows = maxY + newH + 5;

    // Build occupancy grid (boolean[][]) — true = occupied
    const occupied: boolean[][] = [];
    for (let r = 0; r < scanRows; r++) {
        occupied[r] = new Array(gridCols).fill(false);
    }
    for (const item of items) {
        const { x, y, w, h } = item.layout;
        for (let r = y; r < Math.min(y + h, scanRows); r++) {
            for (let c = x; c < Math.min(x + w, gridCols); c++) {
                occupied[r][c] = true;
            }
        }
    }

    // Scan row-by-row, left→right for the first rectangular gap (newW × newH)
    for (let r = 0; r <= scanRows - newH; r++) {
        for (let c = 0; c <= gridCols - newW; c++) {
            // Check if the FULL rectangle (c..c+newW-1, r..r+newH-1) is free
            let fits = true;
            outer:
            for (let rr = r; rr < r + newH; rr++) {
                for (let cc = c; cc < c + newW; cc++) {
                    if (occupied[rr][cc]) { fits = false; break outer; }
                }
            }
            if (fits) {
                debug.log(`📐 [findNextSlot] ${items.length} existing items → placed at {x:${c}, y:${r}} (${newW}×${newH})`);
                return { x: c, y: r };
            }
        }
    }

    // Fallback: place below everything
    debug.log(`📐 [findNextSlot] fallback → placed at {x:0, y:${maxY}}`);
    return { x: 0, y: maxY };
}
