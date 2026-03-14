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

/** Content-aware card sizing — analyzes actual blocks for optimal width AND height */
export function smartCardSize(payload: BiamPayload): { w: number; h: number } {
    const blocks = (payload.layout?.blocks ?? []) as BlockSpec[];
    const types = blocks.map((b) => b.type);

    // Calculator is a fixed-size system block
    if (types.includes("calculator")) {
        return { w: 4, h: 14 };
    }

    // iframe — use a minimum width; actual width is determined at placement time
    // by findSlotForWebview() which fills the remaining row
    if (types.includes("iframe")) {
        return { w: 4, h: 18 };
    }

    // ─── Accumulate height + track width per block ──────────
    let totalH = 1; // top padding
    let maxW = 2;   // minimum default width

    for (const block of blocks) {
        const b = block as any;
        switch (block.type) {
            case "title":
                totalH += 2;
                // titles are compact
                break;

            case "hero":
                totalH += 4;
                // hero with long subtitle may need more width
                if ((b.subtitle?.length ?? 0) > 80) maxW = Math.max(maxW, 4);
                break;

            case "hero_image":
                totalH += 8;
                maxW = Math.max(maxW, 4);
                break;

            case "image":
                totalH += 6;
                maxW = Math.max(maxW, 4);
                break;

            case "text": {
                const len = b.content?.length ?? b.text?.length ?? 0;
                totalH += 2 + Math.ceil(len / 100);
                // Long text benefits from wider card
                if (len > 300) maxW = Math.max(maxW, 4);
                break;
            }

            case "key_value": {
                const cols = b.columns ?? 2;
                const pairCount = b.pairs?.length ?? 0;
                const rows = Math.ceil(pairCount / cols);
                totalH += 1 + rows * 1.6;
                // Width based on columns: 1-2 cols → compact, 3+ → wider
                if (cols >= 3) maxW = Math.max(maxW, 4);
                break;
            }

            case "metric_row": {
                const metricCount = b.metrics?.length ?? b.items?.length ?? 3;
                totalH += 3.5;
                // 2-3 metrics fit in w=3, 4+ need more space
                if (metricCount >= 4) maxW = Math.max(maxW, 4);
                if (metricCount >= 6) maxW = Math.max(maxW, 5);
                break;
            }

            case "stat_bar": {
                const itemCount = b.items?.length ?? 1;
                totalH += 1 + itemCount * 2;
                // Stat bars with labels need width for the label text
                if (itemCount >= 3) maxW = Math.max(maxW, 4);
                break;
            }

            case "table": {
                const colCount = b.headers?.length ?? b.columns?.length ?? 0;
                const rowCount = b.rows?.length ?? 1;
                totalH += 2 + rowCount * 1.5;
                // Width scales with column count
                if (colCount >= 5) maxW = Math.max(maxW, 5);
                else if (colCount >= 3) maxW = Math.max(maxW, 4);
                break;
            }

            case "list": {
                const listItems = b.items?.length ?? 1;
                totalH += 1 + listItems * 1.8;
                break;
            }

            case "link_list": {
                const linkCount = b.links?.length ?? 1;
                totalH += 1 + linkCount * 2;
                break;
            }

            case "timeline": {
                const eventCount = b.events?.length ?? 1;
                totalH += 1 + eventCount * 3;
                if (eventCount >= 3) maxW = Math.max(maxW, 4);
                break;
            }

            case "image_grid": {
                const imgCount = b.images?.length ?? b.items?.length ?? 4;
                totalH += 6;
                // More images → wider grid
                if (imgCount >= 4) maxW = Math.max(maxW, 4);
                if (imgCount >= 6) maxW = Math.max(maxW, 5);
                break;
            }

            case "callout":
                totalH += 3;
                break;

            case "accordion": {
                const sectionCount = b.sections?.length ?? 1;
                totalH += 1 + sectionCount * 2;
                break;
            }

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

            case "code": {
                const codeLen = b.content?.length ?? 0;
                totalH += 3 + Math.ceil(codeLen / 60);
                if (codeLen > 200) maxW = Math.max(maxW, 4);
                break;
            }

            case "video":
            case "media_card":
                totalH += 8;
                maxW = Math.max(maxW, 4);
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
                // Handle block types not in the static union (e.g. feed)
                if ((block as any).type === "feed") {
                    const feedItems = b.items?.length ?? 3;
                    totalH += 2 + feedItems * 3;
                    maxW = Math.max(maxW, 4);
                } else {
                    totalH += 2;
                }
        }
    }

    totalH += 1; // bottom padding

    // ─── Apply size_hint override if provided ────────────────
    const hint = (payload.layout as any)?.size_hint as string | undefined;
    if (hint === "compact") { maxW = Math.min(maxW, 3); }
    if (hint === "medium") { maxW = Math.max(4, maxW); }
    if (hint === "large") { maxW = Math.max(5, maxW); }
    if (hint === "full") { maxW = 6; }

    // ─── Clamp ───────────────────────────────────────────────
    const w = Math.max(2, Math.min(6, maxW));
    const h = Math.max(6, Math.min(18, Math.round(totalH)));

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
/**
 * Placement helper for webview/iframe cards.
 * Finds a slot and expands width to fill the remaining row space.
 * If the row is already >70% occupied (slot starts at column 8+),
 * drops to the next empty row and uses the full width.
 */
export function findSlotForWebview(
    items: readonly CanvasItem[],
    minW: number,
    h: number,
    gridCols = 12,
): { x: number; y: number; w: number } {
    const threshold = Math.floor(gridCols * 0.7); // column 8 on 12-col grid

    // First try: find a slot for the minimum width
    const slot = findNextSlot(items, minW, h, gridCols);

    if (slot.x >= threshold) {
        // Row is >70% occupied — go to next completely empty row
        const nonLoading = items.filter(i => !i._loading);
        let maxY = 0;
        for (const item of nonLoading) {
            const bottom = item.layout.y + item.layout.h;
            if (bottom > maxY) maxY = bottom;
        }
        debug.log(`📐 [Webview] Row too full (col ${slot.x} ≥ ${threshold}) → next row at y=${maxY}, full width`);
        return { x: 0, y: maxY, w: gridCols };
    }

    // Fill remaining width from the slot position to the right edge
    const remainingW = gridCols - slot.x;
    debug.log(`📐 [Webview] Slot at col ${slot.x} → filling remaining ${remainingW} cols (of ${gridCols})`);
    return { x: slot.x, y: slot.y, w: remainingW };
}
