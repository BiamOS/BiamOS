// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// DragCanvas — Custom absolute-positioned canvas (no RGL)
// ============================================================
// Each card is positioned with `position: absolute` using pixel
// coordinates derived from grid units (x, y, w, h).
// Drag and resize are handled via native mouse events.
// ============================================================

import React, { useCallback, useRef, useState, useEffect } from "react";
import { Box } from "@mui/material";
import { ROW_HEIGHT, GRID_MARGIN } from "../theme/theme";

const COLS = 12;

interface DragCanvasProps {
    children: React.ReactNode[];
    /** Layout for each child: { i, x, y, w, h } */
    layouts: { i: string; x: number; y: number; w: number; h: number }[];
    /** Container width in pixels */
    width: number;
    /** Called when a card's layout changes (drag or resize) */
    onLayoutChange: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
}

/** Convert grid units to pixel coordinates */
function gridToPixels(
    layout: { x: number; y: number; w: number; h: number },
    containerWidth: number,
) {
    const colWidth = (containerWidth - GRID_MARGIN[0] * (COLS + 1)) / COLS;
    const left = layout.x * (colWidth + GRID_MARGIN[0]) + GRID_MARGIN[0];
    const top = layout.y * (ROW_HEIGHT + GRID_MARGIN[1]) + GRID_MARGIN[1];
    const width = layout.w * colWidth + (layout.w - 1) * GRID_MARGIN[0];
    const height = layout.h * ROW_HEIGHT + (layout.h - 1) * GRID_MARGIN[1];
    return { left, top, width, height };
}

/** Convert pixel coordinates back to grid units (snapped) */
function pixelsToGrid(
    px: { left: number; top: number; width: number; height: number },
    containerWidth: number,
) {
    const colWidth = (containerWidth - GRID_MARGIN[0] * (COLS + 1)) / COLS;
    const x = Math.max(0, Math.round((px.left - GRID_MARGIN[0]) / (colWidth + GRID_MARGIN[0])));
    const y = Math.max(0, Math.round((px.top - GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1])));
    const w = Math.max(2, Math.round((px.width + GRID_MARGIN[0]) / (colWidth + GRID_MARGIN[0])));
    const h = Math.max(4, Math.round((px.height + GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1])));
    return { x: Math.min(x, COLS - w), y, w: Math.min(w, COLS), h };
}

// ─── Individual Card Wrapper ────────────────────────────────

interface CardWrapperProps {
    id: string;
    layout: { x: number; y: number; w: number; h: number };
    containerWidth: number;
    onLayoutChange: (id: string, layout: { x: number; y: number; w: number; h: number }) => void;
    children: React.ReactNode;
}

const CardWrapper = React.memo(function CardWrapper({
    id,
    layout,
    containerWidth,
    onLayoutChange,
    children,
}: CardWrapperProps) {
    const [dragging, setDragging] = useState<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);
    const [resizing, setResizing] = useState<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
    const [livePos, setLivePos] = useState<{ left: number; top: number } | null>(null);
    const [liveSize, setLiveSize] = useState<{ width: number; height: number } | null>(null);

    const px = gridToPixels(layout, containerWidth);

    // ─── Drag (event delegation — only if target is inside .drag-handle, not .no-drag) ──
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Check: target or an ancestor must have .drag-handle class
        const dragHandle = target.closest(".drag-handle");
        if (!dragHandle) return;
        // Check: target must NOT be inside .no-drag (buttons, inputs, etc.)
        if (target.closest(".no-drag")) return;
        e.preventDefault();
        setDragging({
            startX: e.clientX,
            startY: e.clientY,
            origLeft: px.left,
            origTop: px.top,
        });
    }, [px.left, px.top]);

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - dragging.startX;
            const dy = e.clientY - dragging.startY;
            setLivePos({
                left: Math.max(0, dragging.origLeft + dx),
                top: Math.max(0, dragging.origTop + dy),
            });
        };
        const onUp = (e: MouseEvent) => {
            const dx = e.clientX - dragging.startX;
            const dy = e.clientY - dragging.startY;
            const finalLeft = Math.max(0, dragging.origLeft + dx);
            const finalTop = Math.max(0, dragging.origTop + dy);
            const grid = pixelsToGrid({ left: finalLeft, top: finalTop, width: px.width, height: px.height }, containerWidth);
            onLayoutChange(id, grid);
            setDragging(null);
            setLivePos(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [dragging, px.width, px.height, containerWidth, id, onLayoutChange]);

    // ─── Resize ───────────────────────────────────────
    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing({
            startX: e.clientX,
            startY: e.clientY,
            origW: px.width,
            origH: px.height,
        });
    }, [px.width, px.height]);

    useEffect(() => {
        if (!resizing) return;
        const onMove = (e: MouseEvent) => {
            const dw = e.clientX - resizing.startX;
            const dh = e.clientY - resizing.startY;
            setLiveSize({
                width: Math.max(100, resizing.origW + dw),
                height: Math.max(100, resizing.origH + dh),
            });
        };
        const onUp = (e: MouseEvent) => {
            const dw = e.clientX - resizing.startX;
            const dh = e.clientY - resizing.startY;
            const finalW = Math.max(100, resizing.origW + dw);
            const finalH = Math.max(100, resizing.origH + dh);
            const grid = pixelsToGrid({ left: px.left, top: px.top, width: finalW, height: finalH }, containerWidth);
            onLayoutChange(id, grid);
            setResizing(null);
            setLiveSize(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [resizing, px.left, px.top, containerWidth, id, onLayoutChange]);

    // ─── Computed position ────────────────────────────
    const left = livePos?.left ?? px.left;
    const top = livePos?.top ?? px.top;
    const width = liveSize?.width ?? px.width;
    const height = liveSize?.height ?? px.height;

    return (
        <Box
            className="canvas-card"
            onMouseDown={onMouseDown}
            sx={{
                position: "absolute",
                left, top, width, height,
                transition: dragging || resizing ? "none" : "left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease",
                zIndex: dragging || resizing ? 100 : 1,
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Card content — no overlay, drag is handled via event delegation */}
            <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {children}
            </Box>
            {/* Resize handle */}
            <Box
                onMouseDown={onResizeStart}
                sx={{
                    position: "absolute",
                    bottom: 0, right: 0,
                    width: 16, height: 16,
                    cursor: "se-resize",
                    zIndex: 10,
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        bottom: 3, right: 3,
                        width: 8, height: 8,
                        borderRight: "2px solid rgba(255,255,255,0.2)",
                        borderBottom: "2px solid rgba(255,255,255,0.2)",
                    },
                }}
            />
        </Box>
    );
});

// ─── Main DragCanvas ────────────────────────────────────────

export const DragCanvas = React.memo(function DragCanvas({
    children,
    layouts,
    width,
    onLayoutChange,
}: DragCanvasProps) {
    // Calculate container height from layouts
    const containerHeight = React.useMemo(() => {
        if (layouts.length === 0) return 200;
        let maxBottom = 0;
        for (const l of layouts) {
            const px = gridToPixels(l, width);
            const bottom = px.top + px.height;
            if (bottom > maxBottom) maxBottom = bottom;
        }
        return maxBottom + GRID_MARGIN[1] * 2;
    }, [layouts, width]);

    const childArray = React.Children.toArray(children);

    return (
        <Box sx={{ position: "relative", width: "100%", minHeight: containerHeight }}>
            {layouts.map((layout, idx) => {
                const child = childArray[idx];
                if (!child) return null;
                return (
                    <CardWrapper
                        key={layout.i}
                        id={layout.i}
                        layout={layout}
                        containerWidth={width}
                        onLayoutChange={onLayoutChange}
                    >
                        {child}
                    </CardWrapper>
                );
            })}
        </Box>
    );
});
