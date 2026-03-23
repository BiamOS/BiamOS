// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Whitebox: IntegrationFrame
// ============================================================
// Renders a single integration result card on the Canvas.
// Uses LayoutRenderer (Block system) to render the AI-generated
// JSON layout into UI components.
// ============================================================

import React from "react";
import { createPortal } from "react-dom";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Alert,
    IconButton,
} from "@mui/material";
import {
    Close as CloseIcon,
    DragIndicator as DragIcon,
    ChevronRight as ArrowIcon,
    BugReport as DebugIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    PushPin as PinIcon,
    PushPinOutlined as PinOutlinedIcon,
    Refresh as RefreshIcon,
} from "@mui/icons-material";
import { LayoutRenderer, type LayoutSpec } from "./blocks";
import { CardContextProvider } from "./blocks/CardContext";
import { ErrorBoundary } from "./ErrorBoundary";
import { accentAlpha, COLORS } from "./ui/SharedUI";
import { useFocusStore, type CardMeta } from "../stores/useFocusStore";
import type { CanvasTab } from "../types/canvas";
import {
    DebugPanel,
    alertStyles,
    cardSx,
    dragHandleSx,
    scrollContentSx,
    type DebugStep,
} from "./WhiteboxParts";

interface BiamPayload {
    action: string;
    integration_id?: string;    // integration name (legacy field name from DB)
    layout?: LayoutSpec;
    data?: Record<string, unknown>;
    message?: string;
    _query?: string;
    _matched_keywords?: string[];
    _group_name?: string | null;
    _api_endpoint?: string;
    _debug?: DebugStep[];
    _pinnable?: { query: string; endpoint_id: number; params: Record<string, string> };
}

interface WhiteboxProps {
    cardId: string;
    payload: BiamPayload;
    onRemove: () => void;
    tabs?: CanvasTab[];
    activeTabIndex?: number;
    onTabChange?: (index: number) => void;
    onTabClose?: (index: number) => void;
    pendingTabLoading?: boolean;
    pipelineStep?: string;
    pipelineStepIndex?: number;
    pipelineTotalSteps?: number;
    pendingPipelineStep?: string;
    isPinnedInitial?: boolean;
    onRequestResize?: (w: number, h: number) => void;
}

// ============================================================
// Shared Styles (re-exported from WhiteboxParts)
// ============================================================

// ============================================================
// IntegrationFrame — drag handle + scrollable card (memoized)
// ============================================================

// DebugPanel is imported from WhiteboxParts

interface IntegrationFrameProps {
    cardId: string;
    children: React.ReactNode;
    query?: string;
    integrationName?: string;
    groupName?: string | null;
    apiEndpoint?: string;
    matchedKeywords?: string[];
    onRemove: () => void;
    fullbleed?: boolean;
    tabBar?: React.ReactNode;
    debugSteps?: DebugStep[];
    pinnable?: { query: string; endpoint_id?: number; params?: Record<string, string>; pin_type?: "intent" | "webview"; url?: string; related_queries?: string[] };
    isPinnedInitial?: boolean;
}

const IntegrationFrame = React.memo(function IntegrationFrame({
    cardId,
    children,
    query,
    integrationName,
    groupName,
    apiEndpoint,
    matchedKeywords,
    onRemove,
    fullbleed = false,
    tabBar,
    debugSteps,
    pinnable,
    isPinnedInitial,
}: IntegrationFrameProps) {
    const [showDebug, setShowDebug] = React.useState(false);
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [isPinned, setIsPinned] = React.useState(isPinnedInitial ?? false);
    const [pinLoading, setPinLoading] = React.useState(false);
    const [refreshing, setRefreshing] = React.useState(false);
    // ─── Per-block zoom ─────────────────────────────────────
    const [zoom, setZoom] = React.useState(1);
    const cardRef = React.useRef<HTMLDivElement>(null);

    // ─── Focus Store integration ─────────────────────────────
    const activeCardId = useFocusStore((s) => s.activeCardId);
    const setFocus = useFocusStore((s) => s.setFocus);
    const clearFocusStore = useFocusStore((s) => s.clearFocus);
    const isFocused = activeCardId === cardId;

    const handleCardClick = React.useCallback(() => {
        // Check if there's already richer meta from IframeBlock (live page title + URL).
        // If so, keep it and only update hasDashboard — don't overwrite with generic Whitebox meta.
        const existing = useFocusStore.getState().activeCardMeta;
        if (existing && useFocusStore.getState().activeCardId === cardId && existing.hasWebview && existing.url && !existing.url.startsWith('about:')) {
            // IframeBlock already set rich meta — just re-affirm cardId without degrading the label
            useFocusStore.getState().setFocus(cardId, existing);
            return;
        }
        const meta: CardMeta = {
            label: groupName || integrationName || query || cardId,
            icon: "📦",
            url: apiEndpoint,
            hasWebview: false,
            hasDashboard: true,
        };
        setFocus(cardId, meta);
    }, [cardId, groupName, integrationName, query, apiEndpoint, setFocus]);

    React.useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            e.stopPropagation();
            setZoom((prev) => {
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                return Math.min(2, Math.max(0.5, +(prev + delta).toFixed(2)));
            });
        };
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    }, []);

    // Build breadcrumb: group → host → name → query
    const breadcrumbParts: string[] = [];
    if (groupName) breadcrumbParts.push(groupName);
    if (apiEndpoint && !apiEndpoint.startsWith("auto-builder://")) {
        try {
            const host = new URL(apiEndpoint).hostname.replace("www.", "");
            breadcrumbParts.push(host);
        } catch { /* skip invalid urls */ }
    }
    if (integrationName) breadcrumbParts.push(integrationName.replace("Widget", ""));
    // Show the query as last breadcrumb item
    if (query && breadcrumbParts.length > 0) breadcrumbParts.push(`"${query}"`);

    const arrowSx = { fontSize: 10, color: accentAlpha(0.35), mx: 0.3 };

    const cardContent = (
        <Card ref={cardRef} onClick={handleCardClick} sx={{
            ...cardSx,
            // Sanfte Transition, damit der Staub weich ein- und ausblendet, wenn du klickst
            transition: "box-shadow 0.3s ease-out, border 0.3s ease-out",
            ...(isFocused ? {
                // Der "Staub"-Effekt: 
                // 1. Ein hauchdünner, scharfer Ring (0.4 Opacity)
                // 2. Eine dichte Staubwolke (12px Blur, 0.2 Opacity)
                // 3. Eine weite, ganz feine Staubwolke (30px Blur, 0.08 Opacity)
                // + den existierenden schwarzen Schatten für die Tiefe
                boxShadow: `
            0 0 0 1px rgba(220, 0, 112, 0.4), 
            0 0 12px rgba(220, 0, 112, 0.2), 
            0 0 30px rgba(220, 0, 112, 0.08), 
            ${(cardSx as any).boxShadow || '0 8px 32px rgba(0,0,0,0.5)'}
        `,
            } : {}),
            ...(isFullscreen ? {
                width: "100%",
                height: "100%",
                borderRadius: 2,
            } : {}),
        }}>
            {/* ─── Drag Handle Bar ─── */}
            <Box className="drag-handle" sx={dragHandleSx}>
                <DragIcon sx={{ fontSize: 14, color: "rgba(255, 255, 255, 0.15)" }} />

                {/* Breadcrumb: integration → integration → keyword */}
                {breadcrumbParts.length > 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden", gap: 0.2 }}>
                        {breadcrumbParts.map((part, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <ArrowIcon sx={arrowSx} />}
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: i === 0
                                            ? COLORS.textPrimary
                                            : i === breadcrumbParts.length - 1
                                                ? COLORS.textSecondary
                                                : COLORS.textFaint,
                                        fontSize: "0.62rem",
                                        fontWeight: i === 0 ? 700 : 500,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        textTransform: i === 0 ? "uppercase" : "none",
                                        letterSpacing: i === 0 ? "0.04em" : undefined,
                                    }}
                                >
                                    {part}
                                </Typography>
                            </React.Fragment>
                        ))}
                    </Box>
                ) : query ? (
                    <Typography
                        variant="caption"
                        sx={{
                            color: COLORS.textSecondary,
                            fontSize: "0.65rem",
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {query}
                    </Typography>
                ) : null}

                {/* Zoom badge — only shown when zoomed */}
                {zoom !== 1 && (
                    <Box
                        onDoubleClick={() => setZoom(1)}
                        sx={{
                            px: 0.8,
                            py: 0.1,
                            borderRadius: 1,
                            bgcolor: accentAlpha(0.15),
                            border: `1px solid ${accentAlpha(0.25)}`,
                            cursor: "pointer",
                            "&:hover": { bgcolor: accentAlpha(0.25) },
                        }}
                    >
                        <Typography variant="caption" sx={{
                            color: "rgba(167, 139, 250, 0.9)",
                            fontSize: "0.58rem",
                            fontWeight: 700,
                        }}>
                            {Math.round(zoom * 100)}%
                        </Typography>
                    </Box>
                )}

                {/* 📌 Pin Button */}
                {pinnable && (
                    <IconButton
                        className="no-drag"
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (isPinned || pinLoading) return;
                            setPinLoading(true);
                            try {
                                const res = await fetch("http://localhost:3001/api/pinned", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(pinnable),
                                });
                                if (res.ok) {
                                    const result = await res.json();
                                    setIsPinned(true);
                                    window.dispatchEvent(new CustomEvent("biamos:pin-card", {
                                        detail: { cardId, pinnedId: result.pin?.id },
                                    }));
                                }
                            } catch { /* ignore */ }
                            setPinLoading(false);
                        }}
                        size="small"
                        sx={{
                            p: 0.5,
                            color: isPinned ? accentAlpha(0.8) : "rgba(255, 255, 255, 0.15)",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                color: accentAlpha(0.9),
                                bgcolor: accentAlpha(0.08),
                            },
                        }}
                    >
                        {isPinned ? <PinIcon sx={{ fontSize: 16 }} /> : <PinOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                )}

                {/* 🔄 Refresh Button */}
                {query && (
                    <IconButton
                        className="no-drag"
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (refreshing) return;
                            setRefreshing(true);
                            window.dispatchEvent(new CustomEvent("biamos:refresh-card", {
                                detail: { cardId, query },
                            }));
                            setTimeout(() => setRefreshing(false), 3000);
                        }}
                        size="small"
                        sx={{
                            p: 0.5,
                            color: refreshing ? accentAlpha(0.6) : "rgba(255, 255, 255, 0.15)",
                            transition: "all 0.2s ease",
                            animation: refreshing ? "spin 1s linear infinite" : "none",
                            "@keyframes spin": {
                                "0%": { transform: "rotate(0deg)" },
                                "100%": { transform: "rotate(360deg)" },
                            },
                            "&:hover": {
                                color: accentAlpha(0.9),
                                bgcolor: accentAlpha(0.08),
                            },
                        }}
                    >
                        <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}

                {debugSteps && debugSteps.length > 0 && (
                    <IconButton
                        className="no-drag"
                        onClick={(e) => { e.stopPropagation(); setShowDebug(prev => !prev); }}
                        size="small"
                        sx={{
                            p: 0.5,
                            color: showDebug ? accentAlpha(0.8) : "rgba(255, 255, 255, 0.15)",
                            "&:hover": {
                                color: accentAlpha(0.9),
                                bgcolor: accentAlpha(0.08),
                            },
                        }}
                    >
                        <DebugIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}
                <IconButton
                    className="no-drag"
                    onClick={(e) => { e.stopPropagation(); setIsFullscreen(f => !f); }}
                    size="small"
                    sx={{
                        ml: "auto",
                        p: 0.5,
                        color: isFullscreen ? accentAlpha(0.7) : "rgba(255, 255, 255, 0.15)",
                        "&:hover": {
                            color: accentAlpha(0.9),
                            bgcolor: accentAlpha(0.08),
                        },
                    }}
                >
                    {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: 17 }} /> : <FullscreenIcon sx={{ fontSize: 17 }} />}
                </IconButton>
                <IconButton
                    className="no-drag"
                    onClick={(e) => {
                            e.stopPropagation();
                            // Bug 0 fix: always call cardRemoved (clears lastKnownCard* if this card was the anchor)
                            useFocusStore.getState().cardRemoved(cardId);
                            onRemove();
                        }}

                    size="small"
                    sx={{
                        p: 0.5,
                        color: "rgba(255, 255, 255, 0.15)",
                        "&:hover": {
                            color: "rgba(255, 80, 80, 0.9)",
                            bgcolor: "rgba(255, 80, 80, 0.08)",
                        },
                    }}
                >
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            {/* ─── Tab Bar (between header and content) ─── */}
            {tabBar}

            {/* ─── Scrollable Content (click/select enabled) ─── */}
            <CardContent
                className="no-drag"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                sx={fullbleed ? {
                    flex: 1,
                    overflow: "hidden",
                    p: "0 !important",
                    display: "flex",
                    flexDirection: "column",
                } : scrollContentSx}
            >
                <Box sx={{
                    zoom: zoom !== 1 ? zoom : undefined,
                    height: "100%",
                    flex: fullbleed ? 1 : undefined,
                    display: fullbleed ? "flex" : undefined,
                    flexDirection: fullbleed ? "column" : undefined,
                    transition: "zoom 0.1s ease-out",
                }}>
                    {children}
                </Box>
            </CardContent>
            {showDebug && debugSteps && <DebugPanel steps={debugSteps} />}
        </Card>
    );

    // ─── Fullscreen: override the grid item's CSS directly ──
    // No portal (destroys webview), no child position:fixed (broken inside transform).
    // Instead: find the .react-grid-item ancestor and override its inline styles.
    const backdropRef = React.useRef<HTMLDivElement | null>(null);
    const ancestorOverridesRef = React.useRef<{ el: HTMLElement; orig: string }[]>([]);

    React.useEffect(() => {
        const el = cardRef.current;
        if (!el) return;

        const gridItem = el.closest('.canvas-card') as HTMLElement;
        if (!gridItem) return;

        if (isFullscreen) {
            // Save original styles for restoration
            gridItem.dataset.originalStyle = gridItem.style.cssText;

            // Override grid item to fill viewport
            gridItem.style.cssText = `
                position: fixed !important;
                transform: none !important;
                top: 12px !important;
                left: 12px !important;
                right: 12px !important;
                bottom: 12px !important;
                width: auto !important;
                height: auto !important;
                z-index: 9998 !important;
            `;

            // Lift all ancestors so the card stacks above the backdrop
            const overrides: { el: HTMLElement; orig: string }[] = [];
            let parent = gridItem.parentElement;
            while (parent && parent !== document.body) {
                overrides.push({ el: parent, orig: parent.style.zIndex });
                parent.style.zIndex = '9999';
                parent = parent.parentElement;
            }
            ancestorOverridesRef.current = overrides;

            // Add backdrop
            const backdrop = document.createElement('div');
            backdrop.style.cssText = `
                position: fixed; inset: 0; z-index: 9997;
                background: rgba(0,0,0,0.85);
            `;
            backdrop.addEventListener('click', () => setIsFullscreen(false));
            document.body.appendChild(backdrop);
            backdropRef.current = backdrop;
        } else {
            // Restore original grid item styles
            gridItem.style.cssText = gridItem.dataset.originalStyle || '';
            delete gridItem.dataset.originalStyle;

            // Restore ancestor z-indexes
            for (const { el: ancestor, orig } of ancestorOverridesRef.current) {
                ancestor.style.zIndex = orig;
            }
            ancestorOverridesRef.current = [];

            // Remove backdrop
            if (backdropRef.current) {
                backdropRef.current.remove();
                backdropRef.current = null;
            }
        }

        return () => {
            // Cleanup on unmount
            if (backdropRef.current) {
                backdropRef.current.remove();
                backdropRef.current = null;
            }
            for (const { el: ancestor, orig } of ancestorOverridesRef.current) {
                ancestor.style.zIndex = orig;
            }
            ancestorOverridesRef.current = [];
        };
    }, [isFullscreen]);

    return cardContent;
});

// ============================================================
// Whitebox — Main export (memoized)
// ============================================================

export const Whitebox = React.memo(function Whitebox({
    cardId,
    payload,
    onRemove,
    tabs,
    activeTabIndex = 0,
    onTabChange,
    onTabClose,
    pendingTabLoading = false,
    pipelineStep,
    pipelineStepIndex,
    pipelineTotalSteps,
    pendingPipelineStep,
    isPinnedInitial,
    onRequestResize,
}: WhiteboxProps) {
    if (!payload) return null;

    const query = payload._query;
    const hasTabs = (tabs && tabs.length > 1) || pendingTabLoading;

    // ─── Tab Bar Component ─────────────────────────────────
    const tabBar = hasTabs ? (
        <Box
            className="no-drag"
            sx={{
                display: "flex",
                gap: 0.3,
                px: 1.5,
                py: 0.6,
                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                bgcolor: "rgba(255, 255, 255, 0.015)",
                overflowX: "auto",
                flexWrap: "nowrap",
                minWidth: 0,
                alignItems: "center",
                "&::-webkit-scrollbar": { height: 3 },
                "&::-webkit-scrollbar-track": { background: "transparent" },
                "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.1)", borderRadius: 2 },
            }}
        >
            {(tabs ?? [{ id: "single", label: query || "Tab", payload }]).map((tab, i) => (
                <Box
                    key={tab.id}
                    onClick={() => onTabChange?.(i)}
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.4,
                        px: 1,
                        py: 0.45,
                        borderRadius: 1,
                        fontSize: "0.76rem",
                        fontWeight: i === activeTabIndex ? 600 : 400,
                        color: i === activeTabIndex ? COLORS.textPrimary : COLORS.textMuted,
                        bgcolor: i === activeTabIndex ? "rgba(255, 255, 255, 0.06)" : "transparent",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                        "&:hover": {
                            bgcolor: "rgba(255, 255, 255, 0.04)",
                            color: COLORS.textSecondary,
                        },
                        "&:hover .tab-close": {
                            opacity: 1,
                        },
                    }}
                >
                    {tab.label}
                    {tabs && tabs.length > 1 && (
                        <Box
                            className="tab-close"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTabClose?.(i);
                            }}
                            sx={{
                                ml: 0.3,
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "0.66rem",
                                opacity: i === activeTabIndex ? 0.5 : 0,
                                transition: "all 0.15s ease",
                                color: COLORS.textMuted,
                                "&:hover": {
                                    bgcolor: "rgba(255, 80, 80, 0.15)",
                                    color: "rgba(255, 80, 80, 0.9)",
                                    opacity: 1,
                                },
                            }}
                        >
                            ×
                        </Box>
                    )}
                </Box>
            ))}
            {pendingTabLoading && (
                <Box
                    sx={{
                        px: 1,
                        py: 0.35,
                        borderRadius: 1.5,
                        fontSize: "0.63rem",
                        fontWeight: 600,
                        color: accentAlpha(0.6),
                        animation: "pulse 1.5s ease-in-out infinite",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        "@keyframes pulse": {
                            "0%, 100%": { opacity: 0.4 },
                            "50%": { opacity: 1 },
                        },
                    }}
                >
                    {pendingPipelineStep || "● Loading..."}
                </Box>
            )}
        </Box>
    ) : null;

    // ─── Loading state (shimmer skeleton + pipeline step) ──────────
    if (payload.action === "loading") {
        const shimmerBarSx = (width: string, delay: string) => ({
            height: 10,
            width,
            borderRadius: 1.5,
            bgcolor: "rgba(255,255,255,0.04)",
            position: "relative" as const,
            overflow: "hidden" as const,
            "&::after": {
                content: '""',
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                background: `linear-gradient(90deg, transparent 0%, ${accentAlpha(0.08)} 50%, transparent 100%)`,
                animation: "shimmerSweep 1.8s ease-in-out infinite",
                animationDelay: delay,
            },
        });

        return (
            <IntegrationFrame cardId={cardId} query={query} onRemove={onRemove}>
                <Box sx={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    p: 2,
                    gap: 1.8,
                    justifyContent: "center",
                    minHeight: 140,
                }}>
                    {/* Shimmer skeleton bars — simulate content layout */}
                    <Box sx={shimmerBarSx("65%", "0s")} />
                    <Box sx={shimmerBarSx("90%", "0.15s")} />
                    <Box sx={shimmerBarSx("40%", "0.3s")} />
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Box sx={shimmerBarSx("30%", "0.45s")} />
                        <Box sx={shimmerBarSx("30%", "0.55s")} />
                    </Box>

                    {/* Step progress bar */}
                    {pipelineTotalSteps && pipelineStepIndex ? (
                        <Box sx={{
                            width: "50%", height: 3, mx: "auto", borderRadius: 2,
                            bgcolor: "rgba(255,255,255,0.06)", overflow: "hidden",
                        }}>
                            <Box sx={{
                                width: `${Math.min(100, (pipelineStepIndex / pipelineTotalSteps) * 100)}%`,
                                height: "100%", borderRadius: 2,
                                bgcolor: accentAlpha(0.5),
                                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                            }} />
                        </Box>
                    ) : null}

                    {/* Pipeline step label + count */}
                    <Box sx={{ textAlign: "center", animation: "fadeIn 0.3s ease-out" }}>
                        <Typography
                            key={pipelineStep}
                            sx={{
                                color: accentAlpha(0.5),
                                fontSize: "0.65rem",
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                animation: "slideUpFade 0.35s ease-out",
                                "@keyframes slideUpFade": {
                                    "0%": { opacity: 0, transform: "translateY(6px)" },
                                    "100%": { opacity: 1, transform: "translateY(0)" },
                                },
                            }}
                        >
                            {pipelineStep?.replace(/^[\p{Emoji}\s]*/u, "") || "Processing…"}
                        </Typography>
                        {pipelineTotalSteps && pipelineStepIndex ? (
                            <Typography sx={{
                                color: "rgba(255,255,255,0.2)",
                                fontSize: "0.55rem",
                                fontWeight: 500,
                                mt: 0.3,
                                letterSpacing: "0.03em",
                            }}>
                                Step {pipelineStepIndex} of {pipelineTotalSteps}
                            </Typography>
                        ) : null}
                    </Box>
                </Box>
            </IntegrationFrame>
        );
    }

    // ─── render_layout (Block System) ─────────────────────────
    if (payload.action === "render_layout" && payload.layout) {
        // Check if ANY tab (not just the active one) has an iframe block.
        // This ensures the Chrome-model (keep-alive) rendering is used even when
        // a non-iframe tab (like a GenUI dashboard) is active, preventing the
        // webview tree from being destroyed and rebuilt on tab switch.
        const isIframe = tabs && tabs.length > 0
            ? tabs.some((tab) => {
                const bl = tab.payload?.layout?.blocks;
                return Array.isArray(bl) && bl.some((b: any) => b.type === "iframe");
            })
            : payload.layout.blocks?.some((b: any) => b.type === "iframe");
        // Auto-generate pinnable for webview cards — use ACTIVE tab's URL
        const activePayload = (tabs && tabs.length > 0 && activeTabIndex != null)
            ? tabs[activeTabIndex]?.payload
            : null;
        const pinSourceBlocks = activePayload?.layout?.blocks ?? payload.layout.blocks ?? [];
        const iframeUrl = isIframe
            ? (pinSourceBlocks.find((b: any) => b.type === "iframe") as any)?.url
            : undefined;
        const pinData = payload._pinnable ?? (isIframe && iframeUrl
            ? { pin_type: "webview" as const, url: iframeUrl, query: query || iframeUrl }
            : undefined);
        return (
            <IntegrationFrame cardId={cardId} query={query} integrationName={payload.integration_id}
                groupName={payload._group_name} apiEndpoint={payload._api_endpoint}
                matchedKeywords={payload._matched_keywords} onRemove={onRemove}
                fullbleed={isIframe}
                tabBar={tabBar}
                debugSteps={payload._debug}
                pinnable={pinData}
                isPinnedInitial={isPinnedInitial}
            >
                <ErrorBoundary label={payload.integration_id ?? "Block"} compact>
                    <Box sx={{ minHeight: 0, display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
                        {/* Chrome-model: webview cards with tabs → one webview per tab, toggle visibility */}
                        {isIframe && tabs && tabs.length > 0 ? (
                            tabs.map((tab, i) => {
                                if (!tab.payload?.layout) return null;
                                return (
                                    <Box key={tab.id} sx={{
                                        display: i === (activeTabIndex ?? 0) ? "flex" : "none",
                                        flexDirection: "column", flex: 1, minHeight: 0,
                                    }}>
                                        <CardContextProvider cardId={cardId}>
                                            <LayoutRenderer layout={tab.payload.layout} stagger onRequestResize={onRequestResize} />
                                        </CardContextProvider>
                                    </Box>
                                );
                            })
                        ) : (
                            <CardContextProvider cardId={cardId}>
                                <LayoutRenderer layout={payload.layout} stagger onRequestResize={onRequestResize} />
                            </CardContextProvider>
                        )}
                    </Box>
                </ErrorBoundary>
            </IntegrationFrame>
        );
    }

    // ─── Fallback ──────────────────────────────────────────────
    return (
        <IntegrationFrame cardId={cardId} query={query} onRemove={onRemove}>
            <Alert severity="info" sx={alertStyles.info}>
                Action: {payload.action ?? "unknown"}
            </Alert>
        </IntegrationFrame>
    );
});
