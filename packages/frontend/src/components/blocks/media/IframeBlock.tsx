// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IframeBlock (Orchestrator)
// ============================================================
// Slim orchestrator: composes hooks and sub-components.
// No raw webview lifecycle code lives here.
//
// Sub-modules:
//   WebviewWithLogging.tsx          — <webview> + cookie-dismiss
//   useBiamOSEventOrchestrator.ts   — Event Bus (Agent/Research/Chat)
// ============================================================

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import { Psychology as BrainIcon } from "@mui/icons-material";
import type { IframeBlockSpec } from "../types";
import { LinkCard } from "./LinkCard";
import { useContextWatcher } from "./useContextWatcher";
import { buildExtractionScript } from "./extractPageContent";
import { useCardContext } from "../CardContext";
import { useAgentActions } from "./useAgentActions";
import { LayoutRenderer } from "../BlockRenderer";
import { resolveTool } from "../../../tools/registry";
import { useContextStore } from "../../../stores/useContextStore";

// ─── Extracted Hooks & Components ────────────────────────────
import { useResearchStream } from "./hooks/useResearchStream";
import { useContextChat } from "./hooks/useContextChat";
import { useWebviewLifecycle, useWebviewZoom } from "./hooks/useWebviewLifecycle";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { useFocusStore } from "../../../stores/useFocusStore";
import { useTaskStore } from "../../../stores/useTaskStore";

// ─── New sub-modules (extracted) ────────────────────────────
import { WebviewWithLogging, isBlockedSite } from "./WebviewWithLogging";
import { useBiamOSEventOrchestrator } from "./useBiamOSEventOrchestrator";

// ─── IframeBlock (Orchestrator) ─────────────────────────────

export const IframeBlock = React.memo(function IframeBlock({
    url: initialUrl,
    title,
    icon,
    height,
    width,
    agentDisabled,
    _genuiBlocks,
    onRequestResize,
}: IframeBlockSpec) {
    // ─── Core State ─────────────────────────────────────────
    const agentEnabled = !agentDisabled;
    const isElectron = !!window.electronAPI?.isElectron;
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const subBlocksRef = useRef<HTMLDivElement>(null);
    const agentTaskRef = useRef("");

    // ─── Bento-Box Auto-Resize Logic ────────────────────────
    useEffect(() => {
        if (!onRequestResize || !subBlocksRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const subHeight = entry.contentRect.height;
                if (subHeight > 0) {
                    const extraUnits = Math.ceil(subHeight / 50);
                    const totalH = Math.min(24, 12 + extraUnits);
                    onRequestResize(width || 12, totalH);
                }
            }
        });
        observer.observe(subBlocksRef.current);
        return () => observer.disconnect();
    }, [onRequestResize, width]);

    // ─── Hooks ──────────────────────────────────────────────
    const agent = useAgentActions(webviewRef, isElectron);
    const { researchState, startResearch, hasResearchDashboard } = useResearchStream();
    const cardCtx = useCardContext();

    // useLatest ref for handleCardFocus — lets the Global Task Sync effect below
    // call the freshest version without a forward-declaration lint error.
    const handleCardFocusRef = useRef<() => void>(() => {});

    // ─── Global Task Status Sync ─────────────────────────────
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        const allTasks = useTaskStore.getState().tasks;
        const task = Object.values(allTasks).find(t =>
            t.cardId === cardCtx.cardId && t.status === 'running'
        );
        if (!task) return;

        if (task.type === 'agent' && (agent.agentState.status === 'done' || agent.agentState.status === 'error')) {
            if (task.status !== agent.agentState.status)
                useTaskStore.getState().upsertTask({ ...task, status: agent.agentState.status });
            // Re-Focus fix: after agent navigates to a new page, refresh the focus store
            // so the next Omnibar command gets hasWebview:true + the real currentUrl (Bug 2).
            if (agent.agentState.status === 'done') {
                requestAnimationFrame(() => handleCardFocusRef.current?.());
            }
        }
        if (task.type === 'research' && (researchState.status === 'done' || researchState.status === 'error')) {
            if (task.status !== researchState.status)
                useTaskStore.getState().upsertTask({ ...task, status: researchState.status });
        }
    }, [agent.agentState.status, researchState.status, cardCtx?.cardId]);

    const ctx = useContextWatcher(webviewRef, initialUrl, isElectron, {
        setCurrentUrl,
        setUrlInput: () => { },
    }, cardCtx?.cardId, agentEnabled, agent.agentState.status);

    const { startContextChat: _startContextChat } = useContextChat(webviewRef, isElectron, currentUrl, ctx.setContextHints);

    // Auto-open sidebar when Context Chat is triggered via the Omnibar
    // (the user may not have the sidebar open, so results would be invisible)
    const startContextChat = useCallback((query: string) => {
        ctx.setSidebarOpen(true);
        _startContextChat(query);
    }, [_startContextChat, ctx.setSidebarOpen]);

    // ─── Research ↔ TaskStore Sync (parallel, not focus-gated) ─
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        const { status, phase, steps, query } = researchState;
        if (!query) return;
        // Write into TaskStore for the global CommandCenter parallel view
        useTaskStore.getState().patchTask(cardCtx.cardId, {
            researchSteps: steps,
            researchPhase: phase,
            researchStatus: status,
            researchQuery: query,
        });
        // Also keep contextHints in sync for the legacy ContextSidebar
        const queryKey = `📊 Research: ${query}`;
        ctx.setContextHints(prev => prev.map(h =>
            h.query === queryKey
                ? { ...h, loading: status === 'running', data: { ...h.data, summary: h.data?.summary || 'Researching...', _source: "web_search", _steps: steps, _status: status, _phase: phase } }
                : h
        ));
    }, [researchState, ctx.setContextHints, cardCtx?.cardId]);

    // ─── Agent State → TaskStore Sync (parallel, not focus-gated) ──────────
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        const { status, steps, currentAction, pauseQuestion } = agent.agentState;
        // Always write to TaskStore so CommandCenter can show all agents
        useTaskStore.getState().patchTask(cardCtx.cardId, {
            agentSteps: steps,
            agentStatus: status,
            currentAction,
            pauseQuestion,
        });
        // Also update the legacy contextHints for ContextSidebar compat
        ctx.setContextHints(prev => prev.map(h =>
            h.query === `🤖 Agent: ${agentTaskRef.current}`
                ? { ...h, loading: status === 'running', data: { ...h.data, _status: status, _steps: steps, _currentAction: currentAction } }
                : h
        ));
    }, [agent.agentState.status, agent.agentState.steps, agent.agentState.currentAction, agent.agentState.pauseQuestion, ctx.setContextHints, cardCtx?.cardId]);

    // ─── Agent State → TaskStore Sync ────────────────────────
    // When the agent finishes (done) or is stopped/cancelled (idle),
    // update the global TaskStore so the Omnibar spotlight reflects reality.
    const cardId = cardCtx?.cardId;
    const agentWasRunningRef = useRef(false);
    useEffect(() => {
        const { status } = agent.agentState;
        if (!cardId) return;
        // Track if this agent has ever actually started running
        if (status === 'running' || status === 'paused') {
            agentWasRunningRef.current = true;
        }
        if (status === 'done') {
            // Mark task complete — stays visible in sidebar permanently
            useTaskStore.getState().patchTask(cardId, { agentStatus: 'done', status: 'done' });
        } else if (status === 'error' && agentWasRunningRef.current) {
            // Mark as error but keep visible — user should see what failed
            agentWasRunningRef.current = false;
            useTaskStore.getState().patchTask(cardId, { agentStatus: 'error', status: 'error' });
        }
        // NOTE: We intentionally never call removeTask here anymore.
        // Tasks stay visible in the sidebar until the user clears them manually.
    }, [agent.agentState.status, cardId]);

    // ─── BiamOS Event Bus Orchestrator ───────────────────────
    useBiamOSEventOrchestrator(cardCtx?.cardId, {
        agent,
        startResearch,
        startContextChat,
        ctx,
        agentTaskRef,
    });

    // ─── Global Store Sync ───────────────────────────────────
    // Subscribe to focusedCardId as a proper React hook (not a Zustand subscription)
    // so we always get fresh ctx.contextHints/agentState when the card gains focus.
    const focusedCardId = useFocusStore(s => s.activeCardId);

    // When THIS card becomes focused → write a full snapshot to the global store
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        if (focusedCardId !== cardCtx.cardId) return;
        // Fresh read — no stale closure issue
        useContextStore.getState().setActiveCardId(cardCtx.cardId);
        useContextStore.getState().setHints(ctx.contextHints);
        useContextStore.getState().setAgentState({
            status: agent.agentState.status,
            steps: agent.agentState.steps,
            pauseQuestion: agent.agentState.pauseQuestion,
            currentAction: agent.agentState.currentAction,
        });
    }, [focusedCardId, cardCtx?.cardId]); // eslint-disable-line

    // Sync hints whenever they change (if still focused)
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        if (useFocusStore.getState().activeCardId !== cardCtx.cardId) return;
        useContextStore.getState().setHints(ctx.contextHints);
    }, [ctx.contextHints, cardCtx?.cardId]);

    // Sync agent state whenever it changes (if still focused)
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        if (useFocusStore.getState().activeCardId !== cardCtx.cardId) return;
        useContextStore.getState().setAgentState({
            status: agent.agentState.status,
            steps: agent.agentState.steps,
            pauseQuestion: agent.agentState.pauseQuestion,
            currentAction: agent.agentState.currentAction,
        });
    }, [agent.agentState.status, agent.agentState.steps, agent.agentState.currentAction, agent.agentState.pauseQuestion, cardCtx?.cardId]);

    // Listen for CommandCenter confirm/cancel events (scoped by cardId — no focus required)
    useEffect(() => {
        if (!cardCtx?.cardId) return;
        const myCardId = cardCtx.cardId;
        const onConfirm = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.cardId !== myCardId) return;
            agent.continueAgent(agentTaskRef.current || '', 'yes');
        };
        const onCancel = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.cardId !== myCardId) return;
            agent.stopAgent();
        };
        window.addEventListener('biamos:agent-confirm', onConfirm);
        window.addEventListener('biamos:agent-cancel', onCancel);
        return () => {
            window.removeEventListener('biamos:agent-confirm', onConfirm);
            window.removeEventListener('biamos:agent-cancel', onCancel);
        };
    }, [cardCtx?.cardId, agent.continueAgent, agent.stopAgent]);

    // ─── Card-Level Focus Sync ───────────────────────────────
    // Fires on ANY click or focus within the card (toolbar, sidebar, webview…)
    // and writes rich metadata to useFocusStore — prevents the "Lost Focus" bug.
    let hostname = currentUrl;
    try { hostname = new URL(currentUrl).hostname; } catch { /* */ }

    // Sync handleCardFocusRef whenever handleCardFocus changes (useLatest pattern)
    // This allows the Global Task Sync effect above to call handleCardFocus without
    // a forward-reference lint error.
    const handleCardFocus = useCallback(() => {
        const myCardId = cardCtx?.cardId;
        if (!myCardId) return;
        const wv = webviewRef.current;
        
        let liveTitle = "";
        let liveUrl = currentUrl;

        // 🚨 SAFETY GUARD: Electron throws if called before dom-ready
        try {
            if (wv && typeof wv.getTitle === 'function') {
                liveTitle = wv.getTitle();
                liveUrl = wv.getURL();
            }
        } catch (e) {
            // Webview not ready yet — fail silently
        }

        // Don't overwrite a good label with 'about:blank' while page is still loading
        if (!liveTitle && (liveUrl === 'about:blank' || !liveUrl)) {
            // Only set minimal focus if this card isn't focused yet
            const existing = useFocusStore.getState();
            if (existing.activeCardId === myCardId) return; // already focused with good meta
            useFocusStore.getState().setFocus(myCardId, {
                label: title || hostname || myCardId,
                icon: icon || "🌐",
                url: liveUrl,
                hasWebview: false,
                hasDashboard: hasResearchDashboard,
            });
            return;
        }

        let label = liveTitle || liveUrl || title || myCardId;
        if (label.length > 40) label = label.slice(0, 37) + "…";
        
        useFocusStore.getState().setFocus(myCardId, {
            label,
            icon: icon || "🌐",
            url: liveUrl,
            hasWebview: isElectron && liveUrl !== 'about:blank',
            hasDashboard: hasResearchDashboard,
        });
    }, [cardCtx?.cardId, title, icon, currentUrl, hostname, isElectron, hasResearchDashboard]);
    // Sync ref so Global Task Sync effect always has the latest handleCardFocus
    handleCardFocusRef.current = handleCardFocus;

    // Also fire when the native <webview> itself gets OS-level focus or does something
    useEffect(() => {
        // Fire once on mount to populate focus store if this card is already focused
        // (e.g. restored from saved state)
        const wv = webviewRef.current;
        if (!wv) return;
        // Fire on navigation events AND on OS-level focus (= user clicked inside webview)
        // 'focus' fires when the webview gets native focus (NOT on hover — only on click/tab)
        wv.addEventListener("dom-ready", handleCardFocus);
        wv.addEventListener("did-navigate", handleCardFocus);
        wv.addEventListener("focus", handleCardFocus);
        
        return () => {
            wv.removeEventListener("dom-ready", handleCardFocus);
            wv.removeEventListener("did-navigate", handleCardFocus);
            wv.removeEventListener("focus", handleCardFocus);
        };
    }, [handleCardFocus]);

    // ─── Zoom & Lifecycle ────────────────────────────────────
    const { zoomPercent, ctrlHeld, applyZoom } = useWebviewZoom(webviewRef);
    useWebviewLifecycle({ webviewRef, isElectron, initialUrl, agent, agentTaskRef, setContextHints: ctx.setContextHints, genuiBlocks: _genuiBlocks });

    // ─── Navigation Handlers ─────────────────────────────────
    const handleNavigate = useCallback((newUrl: string) => {
        setCurrentUrl(newUrl);
        ctx.restoreCachedContext(newUrl, currentUrl, ctx.contextHints);
        if (isElectron && webviewRef.current?.loadURL) {
            webviewRef.current.loadURL(newUrl).catch(() => { });
        } else if (iframeRef.current) {
            iframeRef.current.src = newUrl;
        }
    }, [currentUrl, isElectron, ctx]);

    const handleBack = useCallback(() => { webviewRef.current?.goBack?.(); }, []);
    const handleForward = useCallback(() => { webviewRef.current?.goForward?.(); }, []);
    const handleRefresh = useCallback(() => { webviewRef.current?.reload?.(); }, []);
    const handleNewTab = useCallback(() => {
        window.dispatchEvent(new CustomEvent("biamos:open-as-card", {
            detail: { url: "https://www.google.com", title: "New Tab", sourceUrl: initialUrl },
        }));
    }, [initialUrl]);

    // ─── Derived ─────────────────────────────────────────────
    // In browser mode: blocked sites get a LinkCard instead of an iframe
    if (!isElectron && isBlockedSite(currentUrl)) {
        let faviconUrl = "";
        try { faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`; } catch { /* */ }
        return <LinkCard url={currentUrl} title={title} hostname={hostname} faviconUrl={faviconUrl} />;
    }

    // ─── Dashboard Tab Toggle State ───────────────────────────
    // dashboardBlocks = ready blocks from either agent genui or research stream
    const subBlocks = hasResearchDashboard ? researchState.blocks : (_genuiBlocks || null);
    const dashboardBlocks = subBlocks && subBlocks.length > 0 ? subBlocks : null;
    const dashboardLoading =
        (researchState.status === 'running') ||
        (agent.agentState.status === 'running' && !!agent.agentState.currentAction?.toLowerCase().includes('genui'));

    const [activeTab, setActiveTab] = React.useState<'web' | 'dashboard'>('web');

    // Auto-switch to dashboard when blocks arrive
    React.useEffect(() => {
        if (dashboardBlocks && dashboardBlocks.length > 0) {
            setActiveTab('dashboard');
        }
    }, [dashboardBlocks?.length]);

    // Loading bubble: show "Generating dashboard..." hint when dashboard trigger starts
    React.useEffect(() => {
        if (dashboardLoading) {
            ctx.setContextHints(prev => {
                if (prev.some(h => h.query === '⏳ Generating Dashboard...')) return prev;
                return [...prev, {
                    query: '⏳ Generating Dashboard...',
                    reason: 'Context question',
                    expanded: true,
                    loading: true,
                    timestamp: Date.now(),
                }];
            });
        } else if (dashboardBlocks && dashboardBlocks.length > 0) {
            // Replace loading bubble with success bubble
            ctx.setContextHints(prev => prev.map(h =>
                h.query === '⏳ Generating Dashboard...'
                    ? { ...h, query: '📊 Dashboard ready', loading: false, data: { summary: `Dashboard generated with ${dashboardBlocks.length} blocks. Click **📊 Dashboard** in the toolbar to view.` } }
                    : h
            ));
        }
    }, [dashboardLoading, dashboardBlocks?.length]);

    // ─── Skeleton (shown while webview is loading / agent is booting) ─
    const BiamOSEngineSkeleton = (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: 'transparent', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: 'rgba(255,255,255,0.4)' }}>
                <BrainIcon sx={{ fontSize: 32, animation: 'pulseGlow 2s infinite' }} />
                <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: "-0.02em" }}>Lura Core</Typography>
            </Box>
            <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', fontWeight: 500 }}>
                {researchState.status === 'running' ? 'Executing research workflow...' :
                 agent.agentState.status === 'running' ? 'Agent is preparing action...' :
                 'Initializing layout...'}
            </Typography>
        </Box>
    );

    // ─── JSX ─────────────────────────────────────────────────
    return (
        // onClickCapture + onFocus: keep focus store fresh on every interaction
        // regardless of whether the user clicks the webview, sidebar, or toolbar.
        <Box
            sx={{ overflow: "hidden", display: "flex", flexDirection: "column", height: height || "100%", flex: 1, minHeight: 200 }}
            onPointerDownCapture={() => {
                // Fire on EVERY pointer-down in this card — toolbar, webview frame, body.
                // onPointerDownCapture fires before the browser shifts DOM focus to the URL
                // bar, so the focus store is always up-to-date for the next Omnibar command.
                // (Webview interior clicks are caught separately via wv "focus" event.)
                handleCardFocus();
            }}
        >
            {/* ── Browser Toolbar ── */}
            <BrowserToolbar
                currentUrl={currentUrl}
                icon={icon}
                isElectron={isElectron}
                zoomPercent={zoomPercent}
                onResetZoom={() => applyZoom(100)}
                onNavigate={handleNavigate}
                onBack={handleBack}
                onForward={handleForward}
                onRefresh={handleRefresh}
                onNewTab={handleNewTab}
                contextNotice={ctx.contextNotice}
                hasDashboard={!!dashboardBlocks}
                dashboardLoading={dashboardLoading}
                activeTab={activeTab}
                onToggleTab={setActiveTab}
                hideWebTab={!initialUrl || initialUrl === 'about:blank'}
            />

            {/* ── Content: webview + sidebar ── */}
            <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
                <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {ctrlHeld && (
                        <Box onMouseDown={() => { }} sx={{ position: "absolute", inset: 0, zIndex: 10, cursor: "zoom-in" }} />
                    )}

                    {/* ── Dashboard Tab: full-height LayoutRenderer ── */}
                    {activeTab === 'dashboard' && dashboardBlocks && (
                        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, bgcolor: 'background.default' }}>
                            <LayoutRenderer layout={{ blocks: dashboardBlocks as any }} stagger />
                        </Box>
                    )}

                    {/* ── Web Tab: Webview / iFrame ── */}
                    {/* For Electron: webview is always mounted (GPU layer), hidden via display:none when in dashboard mode */}
                    {isElectron ? (
                        <Box sx={{ display: activeTab === 'dashboard' ? 'none' : 'flex', flex: 1, position: 'relative', minHeight: 0, flexDirection: 'column' }}>
                            <WebviewWithLogging ref={webviewRef} src={initialUrl} />
                            {currentUrl === 'about:blank' && BiamOSEngineSkeleton}
                        </Box>
                    ) : (
                        activeTab !== 'dashboard' && (
                            <Box sx={{ flex: 1, position: 'relative' }}>
                                {currentUrl !== 'about:blank' ? (
                                    <iframe
                                        ref={iframeRef}
                                        src={currentUrl}
                                        title={title || hostname}
                                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none", backgroundColor: "#fff", display: "block" }}
                                    />
                                ) : BiamOSEngineSkeleton}
                            </Box>
                        )
                    )}

                </Box>

            </Box>
        </Box>
    );
});
