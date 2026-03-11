// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Pinned Dashboard (Command Center)
// ============================================================
// Shows pinned API results as auto-refreshing cards.
// Uses the same react-grid-layout as the main canvas for
// consistent drag/resize behavior.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography, IconButton, CircularProgress, Tooltip } from "@mui/material";
import {
    Close as UnpinIcon,
    Refresh as RefreshIcon,
    DragIndicator as DragIcon,
} from "@mui/icons-material";
import { Responsive } from "react-grid-layout";
import { LayoutRenderer, type LayoutSpec } from "./blocks";
import { CardContextProvider } from "./blocks/CardContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { COLORS, accentAlpha, scrollbarSx } from "./ui/SharedUI";
import {
    GRID_COLS,
    GRID_BREAKPOINTS,
    GRID_MARGIN,
    GRID_PADDING,
    ROW_HEIGHT,
    resizeHandleSx,
} from "../theme/theme";

// Cast for incomplete TS defs
const GridLayout = Responsive as unknown as React.ComponentType<Record<string, unknown>>;

// ─── Types ──────────────────────────────────────────────────

interface PinnedItem {
    id: number;
    query: string;
    endpoint_id: number | null;
    params: Record<string, string> | null;
    refresh_minutes: number;
    last_data: Record<string, unknown> | null;
    last_layout: LayoutSpec | null;
    last_refreshed: string | null;
    sort_order: number;
    created_at: string;
}

// ─── Constants ──────────────────────────────────────────────

const API_BASE = "http://localhost:3001/api/pinned";
const POLL_INTERVAL = 60_000; // 60 seconds

// ─── Pin Card ───────────────────────────────────────────────

const PinCard = React.memo(function PinCard({
    pin,
    onUnpin,
    onRefresh,
}: {
    pin: PinnedItem;
    onUnpin: (id: number) => void;
    onRefresh: (id: number) => void;
}) {
    const [unpinning, setUnpinning] = useState(false);
    const [cardRefreshing, setCardRefreshing] = useState(false);
    const layout = pin.last_layout;

    const integrationName =
        (pin.last_data as any)?.integration_id ||
        (pin.last_data as any)?._group_name ||
        pin.query;

    const timeAgo = pin.last_refreshed
        ? getTimeAgo(new Date(pin.last_refreshed))
        : "never";

    return (
        <Box sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            bgcolor: "rgba(14, 14, 28, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 2,
            overflow: "hidden",
            transition: "border-color 0.2s",
            "&:hover": { borderColor: accentAlpha(0.2) },
        }}>
            {/* ─── Card Header (drag handle) ─── */}
            <Box
                className="drag-handle"
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.8,
                    px: 1.5,
                    py: 0.5,
                    cursor: "grab",
                    bgcolor: "rgba(255, 255, 255, 0.02)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                    minHeight: 32,
                    "&:active": { cursor: "grabbing" },
                    userSelect: "none" as const,
                }}
            >
                <DragIcon sx={{ fontSize: 14, color: "rgba(255, 255, 255, 0.15)" }} />
                <Typography
                    sx={{
                        flex: 1,
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        color: accentAlpha(0.7),
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    📌 {integrationName}
                </Typography>

                {/* Timestamp + Refresh (inside card, not far away) */}
                <Tooltip title={`Refreshed ${timeAgo}`}>
                    <Typography sx={{ fontSize: "0.55rem", color: COLORS.textMuted, whiteSpace: "nowrap" }}>
                        {timeAgo}
                    </Typography>
                </Tooltip>
                <IconButton
                    onClick={async (e) => {
                        e.stopPropagation();
                        setCardRefreshing(true);
                        onRefresh(pin.id);
                        setTimeout(() => setCardRefreshing(false), 3000);
                    }}
                    size="small"
                    sx={{
                        p: 0.3,
                        color: cardRefreshing ? accentAlpha(0.5) : "rgba(255, 255, 255, 0.15)",
                        "&:hover": { color: accentAlpha(0.9), bgcolor: accentAlpha(0.08) },
                    }}
                >
                    {cardRefreshing
                        ? <CircularProgress size={11} sx={{ color: "inherit" }} />
                        : <RefreshIcon sx={{ fontSize: 13 }} />
                    }
                </IconButton>
                <IconButton
                    onClick={async (e) => {
                        e.stopPropagation();
                        setUnpinning(true);
                        try {
                            await fetch(`${API_BASE}/${pin.id}`, { method: "DELETE" });
                            onUnpin(pin.id);
                        } catch { /* ignore */ }
                        setUnpinning(false);
                    }}
                    disabled={unpinning}
                    size="small"
                    sx={{
                        p: 0.3,
                        color: "rgba(255, 255, 255, 0.15)",
                        "&:hover": {
                            color: "rgba(255, 80, 80, 0.9)",
                            bgcolor: "rgba(255, 80, 80, 0.08)",
                        },
                    }}
                >
                    <UnpinIcon sx={{ fontSize: 13 }} />
                </IconButton>
            </Box>

            {/* ─── Card Body ─── */}
            <Box
                className="no-drag"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                sx={{
                    flex: 1,
                    overflow: "auto",
                    px: 1.2,
                    pt: 0.5,
                    pb: 1,
                    ...scrollbarSx,
                }}
            >
                {layout ? (
                    <ErrorBoundary label={pin.query} compact>
                        <CardContextProvider>
                            <LayoutRenderer layout={layout} stagger />
                        </CardContextProvider>
                    </ErrorBoundary>
                ) : (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4, opacity: 0.4 }}>
                        <Typography sx={{ fontSize: "0.75rem", color: COLORS.textMuted }}>
                            Waiting for first refresh…
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* ─── Card Footer ─── */}
            <Box sx={{
                px: 1.5, py: 0.5,
                borderTop: "1px solid rgba(255, 255, 255, 0.03)",
                bgcolor: "rgba(255, 255, 255, 0.01)",
            }}>
                <Typography sx={{
                    fontSize: "0.58rem",
                    color: "rgba(0, 200, 255, 0.4)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontStyle: "italic",
                }}>
                    &quot;{pin.query}&quot;
                </Typography>
            </Box>
        </Box>
    );
});

// ─── Main Dashboard ─────────────────────────────────────────

export const PinnedDashboard = React.memo(function PinnedDashboard() {
    const [pins, setPins] = useState<PinnedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);

    const fetchPins = useCallback(async () => {
        try {
            const res = await fetch(API_BASE);
            if (!res.ok) return;
            const data = await res.json();
            setPins(data.pins ?? []);
        } catch { /* ignore */ }
    }, []);

    /** Trigger backend staleness check + refresh, then re-fetch pin list */
    const refreshStalePins = useCallback(async () => {
        try {
            await fetch(`${API_BASE}/refresh-stale`, { method: "POST" });
            await fetchPins();
        } catch { /* ignore */ }
    }, [fetchPins]);

    // Container width tracking for react-grid-layout
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width) setContainerWidth(width);
        });
        ro.observe(el);
        setContainerWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    // Initial load + auto-refresh polling
    useEffect(() => {
        setLoading(true);
        fetchPins().finally(() => setLoading(false));
        // Refresh stale pins shortly after startup (3s delay so UI loads first)
        const startupTimer = setTimeout(refreshStalePins, 3000);
        // Poll: trigger backend staleness check → refresh stale pins → re-fetch
        timerRef.current = setInterval(refreshStalePins, POLL_INTERVAL);

        // Listen for pin/unpin events from Whitebox for instant sync
        const onPinsChanged = () => fetchPins();
        window.addEventListener("biamos:pins-changed", onPinsChanged);

        return () => {
            clearTimeout(startupTimer);
            if (timerRef.current) clearInterval(timerRef.current);
            window.removeEventListener("biamos:pins-changed", onPinsChanged);
        };
    }, [fetchPins, refreshStalePins]);

    const handleUnpin = useCallback((id: number) => {
        setPins((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const handleRefresh = useCallback(async (id: number) => {
        try {
            await fetch(`${API_BASE}/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            // Fetch updated data after a short delay
            setTimeout(fetchPins, 1500);
        } catch { /* ignore */ }
    }, [fetchPins]);

    if (loading) {
        return (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
                <CircularProgress size={24} sx={{ color: accentAlpha(0.5) }} />
            </Box>
        );
    }

    if (pins.length === 0) return null;

    // ─── Persisted grid layouts (survive remount) ────────────
    const STORAGE_KEY = "BiamOS_pinnedLayouts";

    const getSavedLayouts = (): Record<string, { w: number; h: number; x: number; y: number }> => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    };

    const savedLayouts = getSavedLayouts();

    const gridLayouts = pins.map((pin, i) => {
        const key = `pin-${pin.id}`;
        const saved = savedLayouts[key];
        return {
            i: key,
            x: saved?.x ?? (i % 3) * 4,
            y: saved?.y ?? Math.floor(i / 3) * 5,
            w: saved?.w ?? 4,
            h: saved?.h ?? 5,
            minW: 2,
            minH: 3,
        };
    });

    const handleLayoutChange = (layout: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
        const toSave: Record<string, { w: number; h: number; x: number; y: number }> = {};
        for (const item of layout) {
            toSave[item.i] = { w: item.w, h: item.h, x: item.x, y: item.y };
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch { /* */ }
    };

    return (
        <Box
            ref={containerRef}
            sx={{
                width: "100%",
                position: "relative",
                zIndex: 1,
                animation: "fadeIn 0.4s ease-out",
                "@keyframes fadeIn": {
                    from: { opacity: 0, transform: "translateY(8px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                },
            }}
        >
            <GridLayout
                layouts={{ lg: gridLayouts }}
                breakpoints={GRID_BREAKPOINTS}
                cols={GRID_COLS}
                rowHeight={ROW_HEIGHT}
                draggableHandle=".drag-handle"
                draggableCancel=".no-drag"
                isResizable
                isDraggable
                compactType="vertical"
                preventCollision={false}
                useCSSTransforms
                transformScale={1}
                margin={GRID_MARGIN}
                containerPadding={GRID_PADDING}
                width={containerWidth}
                autoSize
                onLayoutChange={handleLayoutChange}
            >
                {pins.map((pin) => (
                    <Box key={`pin-${pin.id}`} sx={resizeHandleSx}>
                        <PinCard
                            pin={pin}
                            onUnpin={handleUnpin}
                            onRefresh={handleRefresh}
                        />
                    </Box>
                ))}
            </GridLayout>
        </Box>
    );
});

// ─── Helpers ────────────────────────────────────────────────

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default PinnedDashboard;
