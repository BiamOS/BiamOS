// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — App Root
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { ThemeProvider, CssBaseline, Box, Typography, IconButton, Tooltip, Alert, Chip } from "@mui/material";
import {
    Psychology as BrainIcon,
    Home as HomeIcon,
    DeleteSweep as ClearAllIcon,
    ChevronLeft as ChevronLeftIcon,
    ChevronRight as ChevronRightIcon,
    VolumeUp as VoiceOnIcon,
    VolumeOff as VoiceOffIcon,
    WarningAmber as WarningIcon,
} from "@mui/icons-material";
import { DragCanvas } from "./components/DragCanvas";

import { Whitebox } from "./components/Whitebox";
import { SettingsShell } from "./components/SettingsShell";
import { CommandCenter } from "./components/CommandCenter";
import { SplashScreen } from "./components/SplashScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { LinkPrompt, type LinkOpenDetail } from "./components/LinkPrompt";
import { NavigationProvider } from "./contexts/NavigationContext";
import { useIntentHandler } from "./hooks/useIntentHandler";
import { useBiamSpeech } from "./hooks/useBiamSpeech";
import { useFocusStore } from "./stores/useFocusStore";
import { matchAppRegistry } from "./tools/registry";
import { onBiamosEvent, offBiamosEvent, type BiamosEventHandler } from "./events/biamosEvents";
import {
    theme,
    LOGO_GRADIENT,
    GRID_COLS,
    GRID_BREAKPOINTS,
    GRID_MARGIN,
    GRID_PADDING,
    ROW_HEIGHT,
    rootSx,
    topBarSx,
    errorAlertSx,
    resizeHandleSx,
    accentAlpha,
} from "./theme/theme";
import type { CanvasTab } from "./types/canvas";
import type { GridLayoutItem } from "./types/canvas";
import { CardGroupContext } from "./contexts/CardGroupContext";
import "./index.css";



// ============================================================
// Version Badge
// ============================================================

function VersionBadge() {
    const [ver, setVer] = useState("");
    useEffect(() => {
        fetch("/api/changelog/version").then(r => r.json()).then(d => setVer(d.version || "")).catch(() => {});
    }, []);
    if (!ver) return null;
    return (
        <Chip
            size="small"
            label={`v${ver}`}
            sx={{
                height: 18,
                fontSize: "0.6rem",
                fontWeight: 700,
                bgcolor: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.1)",
            }}
        />
    );
}

// ============================================================
// App
// ============================================================

export default function App() {
    const [voiceEnabled, setVoiceEnabled] = useState(() => {
        try { return localStorage.getItem("BiamOS_voice") === "on"; }
        catch { return false; }
    });
    const { speak, stop: stopSpeech, isSpeaking } = useBiamSpeech({ enabled: voiceEnabled });

    const {
        items,
        isLoading,
        error,
        activeGroups,
        setActiveGroups,
        gridLayouts,
        chatMessages,
        chatOpen,
        pipelineStep,
        handleIntent,
        handleChatSend,
        handleSuggestionClick,
        toggleChat,
        handleRemove,
        handleClearAll,
        handleTabChange,
        handleTabClose,
        clearError,
        addIframeCard,
        onCardLayoutChange,
    } = useIntentHandler({ speak });

    const toggleVoice = useCallback(() => {
        setVoiceEnabled(v => {
            const next = !v;
            try { localStorage.setItem("BiamOS_voice", next ? "on" : "off"); } catch { /* */ }
            if (!next) stopSpeech();
            return next;
        });
    }, [stopSpeech]);

    const [showManager, setShowManager] = useState(false);
    const [settingsPanel, setSettingsPanel] = useState<string>("general");
    const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
    const [llmMissing, setLlmMissing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(1200);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // ─── Container width measurement (stable, no showManager dep)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width) {
                window.requestAnimationFrame(() => {
                    setContainerWidth(width);
                });
            }
        });
        ro.observe(el);
        setContainerWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    // ─── Smart Link Handling: open links as iframe cards ─────
    useEffect(() => {
        const handler = (e: Event) => {
            const { url, title, groupName, sourceUrl } = (e as CustomEvent<LinkOpenDetail>).detail;
            addIframeCard(url, title, groupName, sourceUrl);
        };
        window.addEventListener("biamos:open-as-card", handler);
        return () => window.removeEventListener("biamos:open-as-card", handler);
    }, [addIframeCard]);

    // Wrap handleIntent to handle showManager signal
    const onIntent = useCallback(async (text: string) => {
        const result = await handleIntent(text);
        if (result?.showManager) setShowManager(true);
    }, [handleIntent]);

    // ─── BIAMOS_GLOBAL_INTENT listener (from FloatingOmnibar) ──
    // Bridge: splits compound queries on conjunctions until Phase 2B
    // adds the backend universal router (/api/intent/route).
    useEffect(() => {
        const handler: BiamosEventHandler = (event) => {
            if (event.type === 'BIAMOS_CREATE_EMPTY_CARD') {
                addIframeCard("about:blank", event.title, undefined, undefined, event.cardId);
                return;
            }

            if (event.type === 'BIAMOS_GLOBAL_INTENT') {
                const query = event.query.trim();
                if (!query) return;

                // 1. Direct single-intent app call? (e.g. "gmail", "open youtube")
                const appMatch = matchAppRegistry(query);
                if (appMatch) {
                    addIframeCard(appMatch.url, appMatch.label);
                    return;
                }

                // 2. Compound query? Split on conjunctions and handle each part
                const hasConjunction = /\s+(und|and)\s+|,\s*/i.test(query);
                if (hasConjunction) {
                    const subQueries = query
                        .split(/\s+(?:und|and)\s+|,\s*/i)
                        .map(q => q.trim())
                        .filter(Boolean);

                    for (const sub of subQueries) {
                        const subAppMatch = matchAppRegistry(sub);
                        if (subAppMatch) {
                            addIframeCard(subAppMatch.url, subAppMatch.label);
                        } else {
                            onIntent(sub);
                        }
                    }
                    return;
                }

                // 3. Single intent → backend
                onIntent(query);
            }
        };
        onBiamosEvent(handler);
        return () => offBiamosEvent(handler);
    }, [onIntent, addIframeCard]);

    // ─── Focus clearing: ESC key + canvas background click ──
    const clearFocus = useFocusStore((s) => s.clearFocus);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') clearFocus();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearFocus]);

    const [splashDone, setSplashDone] = useState(false);
    const onSplashComplete = useCallback(() => setSplashDone(true), []);

    // Check if user has API key configured (re-check when leaving settings)
    useEffect(() => {
        let cancelled = false;
        const checkProvider = async (retries = 3, delayMs = 1000) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                if (cancelled) return;
                try {
                    const r = await fetch("/api/system/provider");
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const d = await r.json();
                    if (cancelled) return;
                    setNeedsSetup(prev => prev === null ? !d.hasApiKey : prev);
                    setLlmMissing(!d.hasApiKey);
                    return; // Success — stop retrying
                } catch {
                    if (attempt < retries) {
                        // Backend not ready yet — wait and retry
                        await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
                    }
                }
            }
            // All retries failed — show setup
            if (!cancelled) {
                setNeedsSetup(prev => prev === null ? true : prev);
                setLlmMissing(true);
            }
        };
        checkProvider();
        return () => { cancelled = true; };
    }, [showManager]);

    const toggleManager = () => setShowManager((s) => !s);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {!splashDone && <SplashScreen onComplete={onSplashComplete} />}
            {splashDone && needsSetup && (
                <OnboardingScreen onComplete={() => setNeedsSetup(false)} />
            )}
            <NavigationProvider onNavigate={addIframeCard}>
                <Box sx={rootSx}>
                    {/* ═══ Top Bar ═══ */}
                    <Box sx={topBarSx}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography
                                variant="h5"
                                sx={{
                                    fontWeight: 900,
                                    letterSpacing: "-0.03em",
                                    background: LOGO_GRADIENT,
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                            >
                                BiamOS
                            </Typography>
                            <VersionBadge />
                        </Box>

                        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                            {!showManager && (
                                <>
                                    <Tooltip title={voiceEnabled ? "Mute Assistant" : "Unmute Assistant"}>
                                        <IconButton
                                            onClick={toggleVoice}
                                            size="small"
                                            sx={{
                                                color: voiceEnabled ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.2)",
                                                "&:hover": { color: "rgba(255, 255, 255, 0.7)", bgcolor: "rgba(255,255,255,0.04)" },
                                                ...(isSpeaking && {
                                                    color: accentAlpha(0.8),
                                                    animation: "pulseGlow 1.5s ease-in-out infinite",
                                                }),
                                            }}
                                        >
                                            {voiceEnabled ? <VoiceOnIcon sx={{ fontSize: 20 }} /> : <VoiceOffIcon sx={{ fontSize: 20 }} />}
                                        </IconButton>
                                    </Tooltip>
                                </>
                            )}
                            {items.length > 0 && (
                                <Tooltip title="Clear all">
                                    <IconButton
                                        onClick={handleClearAll}
                                        sx={{
                                            color: "rgba(255, 80, 80, 0.5)",
                                            "&:hover": {
                                                color: "rgba(255, 80, 80, 0.9)",
                                                bgcolor: "rgba(255, 80, 80, 0.06)",
                                            },
                                        }}
                                    >
                                        <ClearAllIcon />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title={showManager ? "Back to Canvas" : "Settings"}>
                                <IconButton
                                    onClick={toggleManager}
                                    sx={{
                                        color: showManager
                                            ? accentAlpha(0.9)
                                            : "rgba(255, 255, 255, 0.3)",
                                        border: "1px solid",
                                        borderColor: showManager
                                            ? accentAlpha(0.3)
                                            : "rgba(255, 255, 255, 0.08)",
                                        transition: "all 0.3s ease",
                                        "&:hover": {
                                            bgcolor: accentAlpha(0.1),
                                            borderColor: accentAlpha(0.4),
                                        },
                                    }}
                                >
                                    {showManager ? <HomeIcon /> : <BrainIcon />}
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* ═══ Content: Canvas + CommandCenter ═══ */}
                    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                        {/* Settings view — stays mounted, hidden via CSS */}
                        <Box sx={{ flex: 1, display: showManager ? 'flex' : 'none', overflow: 'auto' }}>
                            <Box sx={{ flex: 1, height: 'calc(100vh - 140px)' }}>
                                <SettingsShell initialPanel={settingsPanel as any} />
                            </Box>
                        </Box>

                        {/* Canvas Area with Fixed Watermark */}
                        <Box sx={{ flex: 1, position: 'relative', display: showManager ? 'none' : 'flex', flexDirection: 'column' }}>
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                    userSelect: "none",
                                    zIndex: 0,
                                }}
                            >
                                <Box sx={{ transform: "translateY(-10%)", textAlign: "center" }}>
                                    <Typography
                                        sx={{
                                            fontWeight: 900,
                                            fontSize: "4.5rem",
                                            letterSpacing: "-0.03em",
                                            background: LOGO_GRADIENT,
                                            WebkitBackgroundClip: "text",
                                            WebkitTextFillColor: "transparent",
                                            opacity: 0.06,
                                        }}
                                    >
                                        BiamOS
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: "rgba(255, 255, 255, 0.04)",
                                            letterSpacing: "0.25em",
                                            textTransform: "uppercase",
                                            fontSize: "0.65rem",
                                            fontWeight: 500,
                                            mt: -1,
                                        }}
                                    >
                                        Base for Intent & AI Middleware
                                    </Typography>
                                </Box>
                            </Box>

                            {/* Canvas scroll wrapper */}
                            <Box
                                sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', zIndex: 1 }}
                                onClick={(e: React.MouseEvent) => {
                                    // Click on canvas background → clear focus
                                    if (e.target === e.currentTarget) clearFocus();
                                }}
                            >
                                <Box ref={containerRef} sx={{ pl: 2, pr: 4, py: 2, pb: 4, minHeight: '100%' }}>
                                    {error && (
                                        <Alert severity="error" onClose={clearError} sx={errorAlertSx}>
                                            {error}
                                        </Alert>
                                    )}


                                {/* ═══ Draggable + Resizable Canvas ═══ */}
                                {items.length > 0 && (
                                    <DragCanvas
                                        layouts={gridLayouts}
                                        width={containerWidth}
                                        onLayoutChange={onCardLayoutChange}
                                    >
                                        {items.map((item) => {
                                            // Resolve active tab's payload
                                            const activePayload = item.tabs && item.activeTabIndex != null
                                                ? item.tabs[item.activeTabIndex]?.payload ?? item.payload
                                                : item.payload;
                                            return (
                                                <CardGroupContext.Provider key={item._id} value={item._groupName}>
                                                    <Whitebox
                                                        cardId={item._id}
                                                        payload={activePayload}
                                                        onRemove={() => handleRemove(item._id)}
                                                        tabs={item.tabs}
                                                        activeTabIndex={item.activeTabIndex ?? 0}
                                                        onTabChange={(idx: number) => handleTabChange(item._id, idx)}
                                                        onTabClose={(idx: number) => handleTabClose(item._id, idx)}
                                                        pendingTabLoading={item._pendingTabLoading}
                                                        pipelineStep={item._pipelineStep}
                                                        pipelineStepIndex={item._pipelineStepIndex}
                                                        pipelineTotalSteps={item._pipelineTotalSteps}
                                                        pendingPipelineStep={item._pendingPipelineStep}
                                                        isPinnedInitial={item._pinned}
                                                        onRequestResize={(w, h) => {
                                                            const layout = gridLayouts.find(g => g.i === item._id);
                                                            if (layout && (layout.w !== w || layout.h !== h)) {
                                                                onCardLayoutChange(item._id, { ...layout, w, h });
                                                            }
                                                        }}
                                                    />
                                                </CardGroupContext.Provider>
                                            );
                                        })}
                                    </DragCanvas>
                                )}
                            </Box>
                        </Box>  {/* /canvas scroll wrapper */}
                        </Box>  {/* /Canvas Area with Fixed Watermark */}
                        {!showManager && (
                            <CommandCenter
                                onOpenSettings={() => {
                                    setSettingsPanel('llm');
                                    setShowManager(true);
                                }}
                            />
                        )}
                    </Box>  {/* /content: canvas + commandcenter */}
                </Box>
            </NavigationProvider>
            {/* ═══ Smart Link Prompt ═══ */}
            <LinkPrompt />
        </ThemeProvider>
    );
}
