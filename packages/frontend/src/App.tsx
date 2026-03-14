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
    KeyboardArrowDown as HideBottomIcon,
    KeyboardArrowUp as ShowBottomIcon,
    VolumeUp as VoiceOnIcon,
    VolumeOff as VoiceOffIcon,
    WarningAmber as WarningIcon,
} from "@mui/icons-material";
import { DragCanvas } from "./components/DragCanvas";

import { IntentInput } from "./components/IntentInput";
import { Whitebox } from "./components/Whitebox";
import { SettingsShell } from "./components/SettingsShell";
import { IntegrationSidebar } from "./components/IntegrationSidebar";
import { ChatThread } from "./components/ChatThread";
import { SplashScreen } from "./components/SplashScreen";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { LinkPrompt, type LinkOpenDetail } from "./components/LinkPrompt";
import { NavigationProvider } from "./contexts/NavigationContext";
import { useIntentHandler } from "./hooks/useIntentHandler";
import { useBiamSpeech } from "./hooks/useBiamSpeech";
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
    floatingSearchSx,
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
                bgcolor: "rgba(88,28,255,0.1)",
                color: "rgba(88,28,255,0.7)",
                border: "1px solid rgba(88,28,255,0.2)",
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
    const [bottomBarOpen, setBottomBarOpen] = useState(true);

    // ─── Container width measurement (stable, no showManager dep)
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
    const onIntent = async (text: string) => {
        const result = await handleIntent(text);
        if (result?.showManager) setShowManager(true);
    };

    const [splashDone, setSplashDone] = useState(false);
    const onSplashComplete = useCallback(() => setSplashDone(true), []);

    // Check if user has API key configured (re-check when leaving settings)
    useEffect(() => {
        fetch("/api/system/provider")
            .then(r => r.json())
            .then(d => {
                setNeedsSetup(!d.hasApiKey);
                setLlmMissing(!d.hasApiKey);
            })
            .catch(() => {
                setNeedsSetup(true);
                setLlmMissing(true);
            });
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

                    {/* ═══ Content with Sidebar ═══ */}
                    <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
                        {/* Sidebar — with integrated toggle */}
                        <Box
                            sx={{
                                display: showManager ? "none" : "flex",
                                position: "relative",
                                width: sidebarOpen ? 80 : 0,
                                minWidth: sidebarOpen ? 80 : 0,
                                overflow: "visible",
                                transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                            }}
                        >
                            {sidebarOpen && <IntegrationSidebar onFilterChange={setActiveGroups} />}
                            {/* Sidebar toggle chevron */}
                            <Tooltip title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} placement="right">
                                <IconButton
                                    onClick={() => setSidebarOpen(s => !s)}
                                    size="small"
                                    sx={{
                                        position: "absolute",
                                        right: -12,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        zIndex: 10,
                                        width: 24,
                                        height: 24,
                                        bgcolor: "rgba(16,20,30,0.95)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        color: "rgba(255,255,255,0.3)",
                                        "&:hover": { color: "rgba(255,255,255,0.7)", bgcolor: "rgba(16,20,30,1)", borderColor: "rgba(255,255,255,0.15)" },
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    {sidebarOpen ? <ChevronLeftIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                                </IconButton>
                            </Tooltip>
                        </Box>

                        {/* Settings view — stays mounted, hidden via CSS */}
                        <Box sx={{ flex: 1, display: showManager ? "flex" : "none", overflow: "auto" }}>
                            <Box sx={{ flex: 1, height: "calc(100vh - 140px)" }}>
                                <SettingsShell initialPanel={settingsPanel as any} />
                            </Box>
                        </Box>

                        {/* Canvas scroll wrapper */}
                        <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: showManager ? "none" : "block" }}>
                            <Box ref={containerRef} sx={{ px: 2, py: 2, pb: 80, minHeight: "100%" }}>
                                {error && (
                                    <Alert severity="error" onClose={clearError} sx={errorAlertSx}>
                                        {error}
                                    </Alert>
                                )}

                                {/* Watermark */}
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        transform: "translate(-50%, -60%)",
                                        pointerEvents: "none",
                                        userSelect: "none",
                                        textAlign: "center",
                                        zIndex: 0,
                                    }}
                                >
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
                                                    />
                                                </CardGroupContext.Provider>
                                            );
                                        })}
                                    </DragCanvas>
                                )}
                            </Box>
                        </Box>  {/* /canvas scroll wrapper */}
                    </Box>  {/* /canvas inner */}

                    {/* ═══ Bottom Bar Toggle Tab ═══ */}
                    {!showManager && !bottomBarOpen && (
                        <Tooltip title="Show Assistant">
                            <IconButton
                                onClick={() => setBottomBarOpen(true)}
                                size="small"
                                sx={{
                                    position: "fixed",
                                    bottom: 12,
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    zIndex: 1200,
                                    bgcolor: "rgba(16,20,30,0.9)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    color: "rgba(255,255,255,0.35)",
                                    borderRadius: "8px 8px 0 0",
                                    width: 40,
                                    height: 22,
                                    "&:hover": { color: "rgba(255,255,255,0.7)", bgcolor: "rgba(16,20,30,1)", borderColor: "rgba(255,255,255,0.15)" },
                                    transition: "all 0.2s ease",
                                }}
                            >
                                <ShowBottomIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* ═══ Floating Bottom Search + Chat Thread ═══ */}
                    <Box
                        sx={{
                            ...floatingSearchSx,
                            display: showManager ? "none" : undefined,
                            transform: bottomBarOpen
                                ? "translateX(-50%) translateY(0)"
                                : "translateX(-50%) translateY(calc(100% + 20px))",
                            transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        }}
                    >
                        {/* Hide button inside chat area */}
                        <Box sx={{ display: "flex", justifyContent: "center", mb: 0.5 }}>
                            <Tooltip title="Hide Assistant">
                                <IconButton
                                    onClick={() => setBottomBarOpen(false)}
                                    size="small"
                                    sx={{
                                        width: 28,
                                        height: 14,
                                        borderRadius: "8px 8px 0 0",
                                        color: "rgba(255,255,255,0.2)",
                                        "&:hover": { color: "rgba(255,255,255,0.5)", bgcolor: "rgba(255,255,255,0.04)" },
                                    }}
                                >
                                    <HideBottomIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                        <ChatThread
                            messages={chatMessages}
                            isOpen={chatOpen}
                            onSuggestionClick={handleSuggestionClick}
                            onToggle={toggleChat}
                        />
                        {llmMissing && (
                            <Box
                                onClick={() => { setSettingsPanel("llm"); setShowManager(true); }}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 1,
                                    mb: 1,
                                    py: 0.8,
                                    px: 2,
                                    borderRadius: 2,
                                    bgcolor: "rgba(239, 68, 68, 0.08)",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                    cursor: "pointer",
                                    transition: "all 0.2s ease",
                                    "&:hover": {
                                        bgcolor: "rgba(239, 68, 68, 0.12)",
                                        borderColor: "rgba(239, 68, 68, 0.35)",
                                    },
                                }}
                            >
                                <WarningIcon sx={{ fontSize: 16, color: "#ef4444" }} />
                                <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#ef4444" }}>
                                    No AI provider configured — Set up LLM
                                </Typography>
                            </Box>
                        )}
                        <IntentInput onSubmit={onIntent} isLoading={isLoading} activeGroups={activeGroups} pipelineStep={pipelineStep} />
                    </Box>
                </Box>
            </NavigationProvider>
            {/* ═══ Smart Link Prompt ═══ */}
            <LinkPrompt />
        </ThemeProvider>
    );
}
