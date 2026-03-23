// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BrowserToolbar — Browser Chrome UI Component
// ============================================================
// Renders the navigation bar: back/forward/refresh, URL input
// with autocomplete, favicon, history dropdown, new tab, zoom.
// Pure presentational component — all logic is prop-driven.
// ============================================================

import React, { useState, useCallback, useRef } from "react";
import { Box, IconButton, Tooltip, Typography, InputBase, ClickAwayListener } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import LanguageIcon from "@mui/icons-material/Language";
import { COLORS, accentAlpha } from "../../../ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

interface HistoryEntry {
    id: number;
    url: string;
    title: string;
    hostname: string;
    visit_count: number;
    last_visited: string;
}

interface UrlSuggestion {
    id: number;
    url: string;
    title: string;
    hostname: string;
    visit_count: number;
}

export interface BrowserToolbarProps {
    currentUrl: string;
    icon?: string;
    isElectron: boolean;
    zoomPercent: number;
    onResetZoom: () => void;
    onNavigate: (url: string) => void;
    onBack: () => void;
    onForward: () => void;
    onRefresh: () => void;
    onNewTab: () => void;
    contextNotice?: string | null;
    /** Whether a generated dashboard is available for this card */
    hasDashboard?: boolean;
    /** Whether dashboard is still loading */
    dashboardLoading?: boolean;
    /** Current active view tab */
    activeTab?: 'web' | 'dashboard';
    /** Called when the user toggles between web and dashboard */
    onToggleTab?: (tab: 'web' | 'dashboard') => void;
    /** Hide the Web tab — used for pure research/dashboard cards with no webview */
    hideWebTab?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

function ensureProtocol(input: string): string {
    const trimmed = input.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return `https://${trimmed}`;
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ─── Component ──────────────────────────────────────────────

export const BrowserToolbar = React.memo(function BrowserToolbar({
    currentUrl,
    icon,
    isElectron,
    zoomPercent,
    onResetZoom,
    onNavigate,
    onBack,
    onForward,
    onRefresh,
    onNewTab,
    contextNotice,
    hasDashboard = false,
    dashboardLoading = false,
    activeTab = 'web',
    onToggleTab,
    hideWebTab = false,
}: BrowserToolbarProps) {
    const [urlInput, setUrlInput] = useState(currentUrl);
    const [urlFocused, setUrlFocused] = useState(false);
    const [faviconError, setFaviconError] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [urlSuggestions, setUrlSuggestions] = useState<UrlSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync urlInput when currentUrl changes externally (e.g. webview navigation)
    React.useEffect(() => {
        if (!urlFocused) {
            setUrlInput(currentUrl);
            setFaviconError(false);
        }
    }, [currentUrl, urlFocused]);

    // ─── Derived ────────────────────────────────────────────
    let hostname = currentUrl;
    let faviconUrl = "";
    try {
        const u = new URL(currentUrl);
        hostname = u.hostname;
        faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    } catch { /* invalid URL */ }

    // ─── Handlers ───────────────────────────────────────────
    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const newUrl = ensureProtocol(urlInput);
        setUrlFocused(false);
        setShowSuggestions(false);
        onNavigate(newUrl);
    }, [urlInput, onNavigate]);

    const handleUrlFocus = useCallback(async () => {
        setUrlFocused(true);
        setUrlInput(currentUrl);
        try {
            const res = await fetch('http://localhost:3001/api/history?limit=8');
            const data = await res.json();
            setUrlSuggestions(data.entries ?? []);
            setShowSuggestions(true);
        } catch { /* ignore */ }
    }, [currentUrl]);

    const handleUrlBlur = useCallback(() => {
        setUrlFocused(false);
        setTimeout(() => setShowSuggestions(false), 200);
    }, []);

    const handleUrlInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrlInput(val);
        if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
        suggestionsTimerRef.current = setTimeout(async () => {
            if (!val.trim()) {
                try {
                    const res = await fetch('http://localhost:3001/api/history?limit=8');
                    const data = await res.json();
                    setUrlSuggestions(data.entries ?? []);
                    setShowSuggestions(true);
                } catch { setShowSuggestions(false); }
                return;
            }
            try {
                const res = await fetch(`http://localhost:3001/api/history?limit=6&q=${encodeURIComponent(val)}`);
                const data = await res.json();
                setUrlSuggestions(data.entries ?? []);
                setShowSuggestions(true);
            } catch { /* ignore */ }
        }, 150);
    }, []);

    const selectSuggestion = useCallback((url: string) => {
        setShowSuggestions(false);
        setUrlFocused(false);
        onNavigate(url);
    }, [onNavigate]);

    // ─── Styles ─────────────────────────────────────────────
    const navBtnSx = {
        width: 34, height: 34,
        borderRadius: "50%",
        color: COLORS.textMuted,
        transition: "all 0.15s ease",
        "&:hover": { color: COLORS.textPrimary, bgcolor: "rgba(255,255,255,0.08)" },
    };

    return (
        <Box className="no-drag" sx={{
            display: "flex", alignItems: "center", gap: 0, px: 0.5, py: 0.5,
            bgcolor: "rgba(255, 255, 255, 0.03)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
            flexShrink: 0,
            minHeight: 42,
        }}>
            {/* Navigation buttons */}
            <Tooltip title="Back" arrow><IconButton size="small" onClick={onBack} sx={navBtnSx}><ArrowBackIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
            <Tooltip title="Forward" arrow><IconButton size="small" onClick={onForward} sx={navBtnSx}><ArrowForwardIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
            <Tooltip title="Refresh" arrow><IconButton size="small" onClick={onRefresh} sx={navBtnSx}><RefreshIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>

            {/* Dashboard Toggle — appears when a dashboard exists or is loading */}
            {(hasDashboard || dashboardLoading) && (
                <Box sx={{
                    display: 'flex', alignItems: 'center',
                    bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2,
                    border: '1px solid rgba(255,255,255,0.1)',
                    overflow: 'hidden', flexShrink: 0, mx: 0.5,
                }}>
                    {(['web', 'dashboard'] as const)
                        // 🔑 CARD TYPE: Skip 'web' tab for pure dashboard cards (no webview)
                        .filter(tab => !(tab === 'web' && hideWebTab))
                        .map((tab) => {
                        const isActive = activeTab === tab;
                        const isLoadingTab = tab === 'dashboard' && dashboardLoading && activeTab !== 'dashboard';
                        return (
                            <Box
                                key={tab}
                                onClick={() => !dashboardLoading && onToggleTab?.(tab)}
                                sx={{
                                    display: 'flex', alignItems: 'center', gap: 0.5,
                                    px: 1.2, py: 0.5,
                                    fontSize: '0.68rem', fontWeight: 700,
                                    cursor: dashboardLoading && tab === 'dashboard' ? 'wait' : 'pointer',
                                    bgcolor: isActive ? `rgba(255,255,255,0.12)` : 'transparent',
                                    color: isActive ? COLORS.textPrimary : 'rgba(255,255,255,0.45)',
                                    borderRight: tab === 'web' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                                    transition: 'all 0.15s ease',
                                    '&:hover': isActive ? {} : { bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)' },
                                    userSelect: 'none',
                                }}
                            >
                                {tab === 'web' ? '🌐' : isLoadingTab ? '⏳' : '📊'}
                                <span>{tab === 'web' ? 'Web' : isLoadingTab ? 'Loading…' : 'Dashboard'}</span>
                            </Box>
                        );
                    })}
                </Box>
            )}

            {/* URL bar */}
            <Box
                component="form"
                onSubmit={handleSubmit}
                sx={{
                    flex: 1, display: "flex", alignItems: "center", gap: 0.8,
                    position: "relative",
                    bgcolor: urlFocused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    border: `1px solid ${urlFocused ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.04)"}`,
                    px: 1.2, py: 0.4,
                    mx: 0.5,
                    transition: "all 0.2s ease",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                }}
            >
                {faviconError ? (
                    icon ? (
                        <Box component="span" sx={{ fontSize: 15, lineHeight: 1 }}>{icon}</Box>
                    ) : (
                        <LanguageIcon sx={{ fontSize: 17, color: COLORS.textMuted, flexShrink: 0 }} />
                    )
                ) : (
                    <Box component="img" src={faviconUrl} alt=""
                        sx={{ width: 17, height: 17, borderRadius: "3px", flexShrink: 0 }}
                        onError={() => setFaviconError(true)}
                    />
                )}
                <InputBase
                    value={urlFocused ? urlInput : currentUrl}
                    onChange={handleUrlInputChange}
                    onFocus={handleUrlFocus}
                    onBlur={handleUrlBlur}
                    placeholder="Enter URL or search..."
                    sx={{
                        flex: 1,
                        fontSize: "0.85rem",
                        color: urlFocused ? COLORS.textPrimary : COLORS.textSecondary,
                        fontWeight: 500,
                        "& .MuiInputBase-input": { p: 0, py: 0.1 },
                    }}
                    inputProps={{ spellCheck: false, autoComplete: "off" }}
                />
                {/* URL Autocomplete Suggestions */}
                {showSuggestions && urlSuggestions.length > 0 && (
                    <Box sx={{
                        position: "absolute", top: "100%", left: 0, right: 0, mt: 0.5,
                        bgcolor: "rgba(14, 14, 28, 0.98)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 1.5, py: 0.3, zIndex: 200,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    }}>
                        {urlSuggestions.map((s) => (
                            <Box
                                key={s.id}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectSuggestion(s.url);
                                }}
                                sx={{
                                    display: "flex", alignItems: "center", gap: 0.8,
                                    px: 1.2, py: 0.5, cursor: "pointer",
                                    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.05)" },
                                }}
                            >
                                <Box component="img"
                                    src={`https://www.google.com/s2/favicons?sz=16&domain=${s.hostname}`}
                                    alt="" sx={{ width: 14, height: 14, borderRadius: "2px", flexShrink: 0 }}
                                    onError={(e: any) => { e.target.style.display = 'none'; }}
                                />
                                <Box sx={{ flex: 1, overflow: "hidden" }}>
                                    <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: COLORS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {s.title || s.hostname}
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.55rem", color: COLORS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {s.url}
                                    </Typography>
                                </Box>
                                {s.visit_count > 1 && (
                                    <Typography sx={{ fontSize: "0.5rem", color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
                                        {s.visit_count}×
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* Right-side actions */}
            <Tooltip title="Open externally" arrow>
                <IconButton size="small" component="a" href={currentUrl} target="_blank" rel="noopener noreferrer" sx={navBtnSx}>
                    <OpenInNewIcon sx={{ fontSize: 19 }} />
                </IconButton>
            </Tooltip>
            <Tooltip title="New Tab" arrow>
                <IconButton size="small" onClick={onNewTab} sx={{
                    ...navBtnSx,
                    color: accentAlpha(0.6),
                    "&:hover": { color: COLORS.accent, bgcolor: accentAlpha(0.1) },
                }}>
                    <AddIcon sx={{ fontSize: 21 }} />
                </IconButton>
            </Tooltip>

            {/* History dropdown */}
            <Box sx={{ position: "relative" }}>
                <Tooltip title="History" arrow>
                    <IconButton size="small" onClick={async () => {
                        if (historyOpen) { setHistoryOpen(false); return; }
                        try {
                            const res = await fetch('http://localhost:3001/api/history?limit=20');
                            const data = await res.json();
                            setHistoryEntries(data.entries ?? []);
                        } catch { setHistoryEntries([]); }
                        setHistoryOpen(true);
                    }} sx={{
                        ...navBtnSx,
                        color: historyOpen ? accentAlpha(0.8) : navBtnSx.color,
                    }}>
                        <HistoryIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                </Tooltip>
                {historyOpen && (
                    <ClickAwayListener onClickAway={() => setHistoryOpen(false)}>
                        <Box sx={{
                            position: "absolute", top: "100%", right: 0, mt: 0.5,
                            width: 360, maxHeight: 400, overflowY: "auto",
                            bgcolor: "rgba(14, 14, 28, 0.98)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 2, py: 0.5, zIndex: 100,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                            "&::-webkit-scrollbar": { width: 4 },
                            "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.1)", borderRadius: 2 },
                        }}>
                            <Typography sx={{ px: 1.5, py: 0.5, fontSize: "0.6rem", fontWeight: 700, color: accentAlpha(0.5), textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                Recent History
                            </Typography>
                            {historyEntries.length === 0 ? (
                                <Typography sx={{ px: 1.5, py: 2, fontSize: "0.7rem", color: COLORS.textMuted, textAlign: "center" }}>
                                    No history yet
                                </Typography>
                            ) : historyEntries.map((entry) => (
                                <Box
                                    key={entry.id}
                                    onClick={() => {
                                        setHistoryOpen(false);
                                        selectSuggestion(entry.url);
                                    }}
                                    sx={{
                                        display: "flex", alignItems: "center", gap: 1,
                                        px: 1.5, py: 0.6, cursor: "pointer",
                                        transition: "bgcolor 0.1s",
                                        "&:hover": { bgcolor: "rgba(255, 255, 255, 0.04)" },
                                    }}
                                >
                                    <Box component="img"
                                        src={`https://www.google.com/s2/favicons?sz=16&domain=${entry.hostname}`}
                                        alt="" sx={{ width: 14, height: 14, borderRadius: "2px", flexShrink: 0 }}
                                        onError={(e: any) => { e.target.style.display = 'none'; }}
                                    />
                                    <Box sx={{ flex: 1, overflow: "hidden" }}>
                                        <Typography sx={{ fontSize: "0.7rem", fontWeight: 500, color: COLORS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {entry.title || entry.hostname || entry.url}
                                        </Typography>
                                        <Typography sx={{ fontSize: "0.58rem", color: COLORS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {entry.url}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.2)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                        {entry.visit_count > 1 ? `${entry.visit_count}×` : ""}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </ClickAwayListener>
                )}
            </Box>

            {/* Zoom indicator */}
            {zoomPercent !== 100 && (
                <Tooltip title="Click to reset zoom" arrow>
                    <Box
                        component="button"
                        onClick={onResetZoom}
                        sx={{
                            px: 0.8, py: 0.2,
                            fontSize: "0.7rem", fontWeight: 600,
                            color: "rgba(255, 255, 255, 0.6)",
                            bgcolor: "rgba(255, 255, 255, 0.06)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 1,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.9)" },
                        }}
                    >
                        {zoomPercent}%
                    </Box>
                </Tooltip>
            )}

            {/* Context notice indicator */}
            {contextNotice && (
                <Typography
                    variant="caption"
                    sx={{
                        color: "rgba(130, 200, 255, 0.8)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        ml: 0.5,
                        whiteSpace: "nowrap",
                        animation: "luraFadeInOut 5s ease-in-out",
                        "@keyframes luraFadeInOut": {
                            "0%": { opacity: 0 },
                            "10%": { opacity: 1 },
                            "80%": { opacity: 1 },
                            "100%": { opacity: 0 },
                        },
                    }}
                >
                    {contextNotice}
                </Typography>
            )}
        </Box>
    );
});
