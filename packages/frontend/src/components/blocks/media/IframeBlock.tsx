// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IframeBlock (Orchestrator)
// ============================================================
// Slim orchestrator: composes hooks and components for the
// webview tab experience. No business logic lives here.
// ============================================================

import React, { useState, useRef, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import type { IframeBlockSpec } from "../types";
import { LinkCard } from "./LinkCard";
import { ContextSidebar } from "./ContextSidebar";
import { useContextWatcher } from "./useContextWatcher";
import { buildExtractionScript } from "./extractPageContent";
import { useCardContext } from "../CardContext";
import { useAgentActions } from "./useAgentActions";
import { AgentOverlay } from "./AgentOverlay";
import { ConstellationOverlay } from "./ConstellationOverlay";
import { ResearchProgressPanel } from "./ResearchProgressPanel";
import { LayoutRenderer } from "../BlockRenderer";
import { MAX_STEPS } from "./agent/constants";
import { resolveTool } from "../../../tools/registry";

// ─── Extracted Hooks & Components ───────────────────────────
import { useResearchStream } from "./hooks/useResearchStream";
import { useContextChat } from "./hooks/useContextChat";
import { useWebviewLifecycle, useWebviewZoom } from "./hooks/useWebviewLifecycle";
import { BrowserToolbar } from "./components/BrowserToolbar";
import { debug } from "../../../utils/debug";

// ─── Blocklist (iframe fallback for non-Electron) ───────────

const IFRAME_BLOCKLIST = new Set([
    "youtube.com", "www.youtube.com",
    "google.com", "www.google.com",
    "twitter.com", "x.com",
    "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com",
    "linkedin.com", "www.linkedin.com",
    "github.com",
    "reddit.com", "www.reddit.com",
    "amazon.com", "www.amazon.com",
    "netflix.com", "www.netflix.com",
    "twitch.tv", "www.twitch.tv",
    "tiktok.com", "www.tiktok.com",
    "discord.com", "discord.gg",
]);

function isBlockedSite(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return IFRAME_BLOCKLIST.has(host);
    } catch {
        return false;
    }
}

// ─── WebviewWithLogging (never re-renders) ──────────────────
// Kept inline because it's a React.memo forwardRef component
// tightly coupled to the <webview> tag. Moving it out would
// require duplicating the cookie-dismiss scripts file.

const WebviewWithLogging = React.memo(React.forwardRef<any, { src: string }>(
    function WebviewWithLogging({ src }, ref) {
        const localRef = useRef<any>(null);
        const listenersAttachedRef = useRef(false);
        const cookieDismissedUrlRef = useRef<string>('');

        const setRef = useCallback((el: any) => {
            localRef.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) (ref as any).current = el;
        }, [ref]);

        React.useEffect(() => {
            const wv = localRef.current;
            if (!wv || listenersAttachedRef.current) return;
            listenersAttachedRef.current = true;

            const tag = `🌐 [Webview]`;
            try { wv.setMaxListeners?.(20); } catch { /* */ }

            let overlayTimeoutIds: ReturnType<typeof setTimeout>[] = [];

            wv.addEventListener('did-start-loading', () => {
                debug.log(`${tag} ⏳ Loading started...`);
            });
            wv.addEventListener('did-finish-load', () => {
                debug.log(`${tag} ✅ Loaded: ${wv.getURL?.() || 'unknown'}`);

                const currentUrl = wv.getURL?.() || '';
                if (currentUrl && !currentUrl.startsWith('data:') && !currentUrl.startsWith('about:')) {
                    let urlKey = currentUrl;
                    try { const u = new URL(currentUrl); urlKey = u.origin + u.pathname; } catch { /* */ }
                    if (cookieDismissedUrlRef.current === urlKey) {
                        debug.log(`${tag} 🍪 Skipping auto-dismiss — already attempted for ${urlKey}`);
                    } else {
                        cookieDismissedUrlRef.current = urlKey;
                        overlayTimeoutIds.forEach(id => clearTimeout(id));
                        overlayTimeoutIds = [];
                        // Pass 1: Cookie Consent (1.5s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try {
                                wv.executeJavaScript(`
                                    (function() {
                                        var keywords = [
                                            'einverstanden', 'akzeptieren', 'accept all', 'accept cookies',
                                            'alle akzeptieren', 'accept', 'agree', 'zustimmen',
                                            'i agree', 'got it', 'ok', 'allow all', 'allow cookies',
                                            'alle cookies akzeptieren', 'consent', 'continue',
                                            'accept & close', 'ich stimme zu', 'alles klar',
                                            'alle zulassen', "j'accepte", 'tout accepter'
                                        ];
                                        var clickable = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
                                        for (var i = 0; i < clickable.length; i++) {
                                            var el = clickable[i];
                                            var text = (el.textContent || el.value || '').trim().toLowerCase();
                                            if (text.length < 50 && keywords.some(function(kw) { return text.includes(kw); })) {
                                                el.click();
                                                console.log('🍪 Auto-accepted cookie: ' + text);
                                                return;
                                            }
                                        }
                                        var overlays = document.querySelectorAll('[class*="consent"], [class*="cookie"], [id*="consent"], [id*="cookie"], [class*="gdpr"], [id*="gdpr"]');
                                        for (var j = 0; j < overlays.length; j++) {
                                            var btns = overlays[j].querySelectorAll('button, a, [role="button"]');
                                            for (var k = 0; k < btns.length; k++) {
                                                var t = (btns[k].textContent || '').trim().toLowerCase();
                                                if (t.length < 50 && keywords.some(function(kw) { return t.includes(kw); })) {
                                                    btns[k].click();
                                                    console.log('🍪 Auto-accepted cookie (overlay): ' + t);
                                                    return;
                                                }
                                            }
                                        }
                                    })();
                                `, true).catch(() => { });
                            } catch { /* page may have navigated away */ }
                        }, 1500));
                        // Pass 2: Other overlays (3s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try {
                                wv.executeJavaScript(`
                                    (function() {
                                        var stayKeywords = ['bleiben', 'stay', 'nein', 'no thanks', 'nein danke', 'nicht wechseln', 'dismiss'];
                                        var allClickable = document.querySelectorAll('button, a, [role="button"]');
                                        for (var i = 0; i < allClickable.length; i++) {
                                            var el = allClickable[i];
                                            var text = (el.textContent || '').trim().toLowerCase();
                                            if (text.length < 60 && stayKeywords.some(function(kw) { return text.includes(kw); })) {
                                                var parent = el.closest('[class*="modal"], [class*="overlay"], [class*="popup"], [class*="redirect"], [class*="banner"]');
                                                if (parent) { el.click(); console.log('🛡️ Auto-dismissed overlay: ' + text); return; }
                                            }
                                        }
                                        var modalSelectors = ['[class*="subscribe"]', '[class*="newsletter"]', '[class*="signup"]', '[class*="paywall"]', '[class*="ad-overlay"]', '[class*="popup"]', '[id*="subscribe"]', '[id*="newsletter"]', '[id*="popup"]', '[class*="modal"]', '[class*="lightbox"]'];
                                        var closeKeywords = ['×', '✕', '✖', 'x', 'close', 'schließen', 'dismiss', 'no thanks', 'nein danke', 'later', 'später', 'skip', 'nicht jetzt', 'not now', 'maybe later'];
                                        for (var s = 0; s < modalSelectors.length; s++) {
                                            var modals = document.querySelectorAll(modalSelectors[s]);
                                            for (var m = 0; m < modals.length; m++) {
                                                var modal = modals[m];
                                                var style = window.getComputedStyle(modal);
                                                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
                                                var closeBtns = modal.querySelectorAll('button, [role="button"], a, .close, [class*="close"], [aria-label*="close"], [aria-label*="Close"]');
                                                for (var c = 0; c < closeBtns.length; c++) {
                                                    var btn = closeBtns[c];
                                                    var btnText = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
                                                    if (btnText.length < 30 && closeKeywords.some(function(kw) { return btnText.includes(kw); })) {
                                                        btn.click(); console.log('🛡️ Auto-dismissed overlay: ' + btnText); return;
                                                    }
                                                }
                                            }
                                        }
                                        var allEls = document.querySelectorAll('div, section, aside');
                                        for (var f = 0; f < allEls.length; f++) {
                                            var el2 = allEls[f]; var cs = window.getComputedStyle(el2);
                                            if (cs.position === 'fixed' && cs.zIndex && parseInt(cs.zIndex) > 999 && el2.offsetWidth > window.innerWidth * 0.5 && el2.offsetHeight > window.innerHeight * 0.5) {
                                                var closeBtn = el2.querySelector('button, [role="button"], [class*="close"], [aria-label*="close"]');
                                                if (closeBtn) { closeBtn.click(); console.log('🛡️ Auto-dismissed fullscreen overlay'); return; }
                                            }
                                        }
                                    })();
                                `, true).catch(() => { });
                            } catch { /* */ }
                        }, 3000));
                        // Pass 3: Retry Cookie (5s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try {
                                wv.executeJavaScript(`
                                    (function() {
                                        var keywords = ['einverstanden', 'akzeptieren', 'accept all', 'accept cookies', 'alle akzeptieren', 'accept', 'agree', 'zustimmen', 'i agree', 'got it', 'ok', 'allow all', 'allow cookies', 'alle cookies akzeptieren', 'consent', 'continue', 'accept & close', 'ich stimme zu', 'alles klar', 'alle zulassen', "j'accepte", 'tout accepter'];
                                        var clickable = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
                                        for (var i = 0; i < clickable.length; i++) {
                                            var el = clickable[i]; var text = (el.textContent || el.value || '').trim().toLowerCase();
                                            if (text.length < 50 && keywords.some(function(kw) { return text.includes(kw); })) { el.click(); console.log('🍪 [Pass 3] Auto-accepted cookie: ' + text); return; }
                                        }
                                        var overlays = document.querySelectorAll('[class*="consent"], [class*="cookie"], [id*="consent"], [id*="cookie"], [class*="gdpr"], [id*="gdpr"], [class*="qc-cmp"], [id*="qc-cmp"]');
                                        for (var j = 0; j < overlays.length; j++) {
                                            var btns = overlays[j].querySelectorAll('button, a, [role="button"]');
                                            for (var k = 0; k < btns.length; k++) {
                                                var t = (btns[k].textContent || '').trim().toLowerCase();
                                                if (t.length < 50 && keywords.some(function(kw) { return t.includes(kw); })) { btns[k].click(); console.log('🍪 [Pass 3] Auto-accepted cookie (overlay): ' + t); return; }
                                            }
                                        }
                                    })();
                                `, true).catch(() => { });
                            } catch { /* */ }
                        }, 5000));
                    }
                }
            });
            wv.addEventListener('did-fail-load', (e: any) => {
                if (e.errorCode === -3) { debug.log(`${tag} ⚠️ Load aborted (ERR_ABORTED)`); return; }
                console.error(`${tag} ❌ Load FAILED: code=${e.errorCode} desc="${e.errorDescription}" url=${e.validatedURL}`);
            });
            wv.addEventListener('did-navigate', (e: any) => {
                debug.log(`${tag} 🔗 Navigated to: ${e.url}`);
                if (e.url && e.url !== 'about:blank') {
                    fetch('http://localhost:3001/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: e.url }) }).catch(() => { });
                }
            });
            wv.addEventListener('dom-ready', () => { debug.log(`${tag} 📄 DOM ready: ${wv.getURL?.() || 'unknown'}`); });
            wv.addEventListener('will-navigate', () => { overlayTimeoutIds.forEach(id => clearTimeout(id)); overlayTimeoutIds = []; });
            wv.addEventListener('crashed', () => { console.error(`${tag} 💀 CRASHED!`); });
            wv.addEventListener('destroyed', () => { console.warn(`${tag} 🗑️ Destroyed`); });
            wv.addEventListener('console-message', (e: any) => {
                if (e.message?.startsWith('BIAM_PREFILL:')) {
                    window.dispatchEvent(new CustomEvent('biamos:prefill-command', { detail: { command: e.message.replace('BIAM_PREFILL:', '').trim() } }));
                    return;
                }
                if (e.message?.startsWith('BIAM_NAVIGATE:')) {
                    const url = e.message.replace('BIAM_NAVIGATE:', '').trim();
                    if (wv?.loadURL) wv.loadURL(url).catch(() => { });
                    return;
                }
                if (e.message?.startsWith('BIAM_INTENT:')) {
                    window.dispatchEvent(new CustomEvent('biamos:genui-intent', { detail: { intent: e.message.replace('BIAM_INTENT:', '').trim() } }));
                    return;
                }
                if (e.level === 2) debug.log(`${tag} 📟 Page error: ${e.message?.substring(0, 150)}`);
            });
            wv.addEventListener('did-fail-load', (e: any) => {
                const url = e.validatedURL || '';
                if (e.errorCode === -3) return;
                if (e.isMainFrame === false) return;
                console.warn(`${tag} ⚠️ Main frame navigation failed: ${url}`);
                window.dispatchEvent(new CustomEvent('biamos:agent-feedback', { detail: { error: `[NAVIGATION FAILED] Could not reach ${url}. Use search_web instead.` } }));
                try { wv.loadURL('https://www.google.com'); } catch { /* */ }
            });
            wv.addEventListener('page-title-updated', (e: any) => {
                const newTitle = e.title || '';
                const currentUrl = wv.getURL?.() || '';
                if (newTitle && newTitle !== 'about:blank') {
                    debug.log(`${tag} 📝 Title updated: "${newTitle}"`);
                    if (currentUrl) {
                        fetch('http://localhost:3001/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: currentUrl, title: newTitle }) }).catch(() => { });
                    }
                }
            });
        }, []);

        return (
            <webview
                ref={setRef}
                src={src}
                // @ts-ignore
                partition="persist:lura"
                // @ts-ignore
                allowpopups="true"
            />
        );
    }
), () => true);

// ─── IframeBlock (Orchestrator) ─────────────────────────────

export const IframeBlock = React.memo(function IframeBlock({
    url: initialUrl,
    title,
    icon,
    height,
    agentDisabled,
    _genuiBlocks,
}: IframeBlockSpec) {
    // ─── Core State ─────────────────────────────────────────
    const [dashboardDismissed, setDashboardDismissed] = useState(false);
    const [dashboardMinimized, setDashboardMinimized] = useState(false);
    const hasDashboard = !!_genuiBlocks && !dashboardDismissed;
    const agentEnabled = !agentDisabled;
    const isElectron = !!window.electronAPI?.isElectron;
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // ─── Hooks ──────────────────────────────────────────────
    const agent = useAgentActions(webviewRef, isElectron);
    const agentTaskRef = useRef("");

    const { researchState, setResearchState, startResearch, hasResearchDashboard, abortResearch } = useResearchStream(
        () => setDashboardDismissed(true) // onStart: dismiss old dashboard
    );

    const cardCtx = useCardContext();
    const ctx = useContextWatcher(webviewRef, initialUrl, isElectron, {
        setCurrentUrl,
        setUrlInput: () => { }, // BrowserToolbar manages its own urlInput
    }, cardCtx?.cardId, agentEnabled, agent.agentState.status);

    const { startContextChat } = useContextChat(webviewRef, isElectron, currentUrl, ctx.setContextHints);
    const { zoomPercent, ctrlHeld, applyZoom } = useWebviewZoom(webviewRef);

    useWebviewLifecycle({
        webviewRef, isElectron, initialUrl,
        agent, agentTaskRef, setContextHints: ctx.setContextHints,
        genuiBlocks: _genuiBlocks, dashboardDismissed, setDashboardDismissed,
    });

    // ─── Navigation Handler (for BrowserToolbar) ────────────
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

    // ─── Derived ────────────────────────────────────────────
    let hostname = currentUrl;
    try { hostname = new URL(currentUrl).hostname; } catch { /* */ }

    // In browser: blocked sites get link card
    if (!isElectron && isBlockedSite(currentUrl)) {
        let faviconUrl = "";
        try { faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`; } catch { /* */ }
        return <LinkCard url={currentUrl} title={title} hostname={hostname} faviconUrl={faviconUrl} />;
    }

    // Dashboard blocks: research engine (priority) or legacy agent
    const activeDashboardBlocks = hasResearchDashboard
        ? researchState.blocks
        : (hasDashboard ? _genuiBlocks : null);
    const showDashboard = !!activeDashboardBlocks || researchState.status === 'running';
    const dashboardTitle = researchState.query || agentTaskRef.current || 'Dashboard';

    // Navigate webview from dashboard link clicks
    const navigateWebview = (url: string) => {
        if (isElectron && webviewRef.current) {
            try { webviewRef.current.loadURL(url); } catch { /* */ }
        } else if (iframeRef.current) {
            iframeRef.current.src = url;
        }
        setCurrentUrl(url);
        setDashboardMinimized(true);
    };

    // ─── JSX ────────────────────────────────────────────────
    return (
        <Box sx={{ overflow: "hidden", display: "flex", flexDirection: "column", height: height || "100%", flex: 1, minHeight: 200 }}>
            {/* ─── Browser Toolbar ─── */}
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
            />

            {/* ─── Content: webview + sidebar ─── */}
            <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
                <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {/* Agent Overlay */}
                    {agentEnabled && (
                        <AgentOverlay
                            state={agent.agentState}
                            task={agentTaskRef.current}
                            onStop={agent.stopAgent}
                            onContinue={() => agent.continueAgent(agentTaskRef.current)}
                            onFeedback={agent.sendFeedback}
                        />
                    )}
                    {agentEnabled && (
                        <ConstellationOverlay state={agent.agentState} task={agentTaskRef.current} />
                    )}
                    {ctrlHeld && (
                        <Box onMouseDown={() => { }} sx={{ position: "absolute", inset: 0, zIndex: 10, cursor: "zoom-in" }} />
                    )}

                    {/* ─── Command Center Dashboard ─── */}
                    {showDashboard && (
                        <Box sx={{
                            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
                            height: dashboardMinimized ? '36px' : '45%',
                            minHeight: dashboardMinimized ? '36px' : '200px',
                            transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex', flexDirection: 'column',
                            bgcolor: '#0a0e14',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: dashboardMinimized ? 'none' : '0 8px 32px rgba(0,0,0,0.5)',
                            overflow: 'hidden',
                        }}>
                            {/* Smart Bar */}
                            <Box sx={{
                                display: 'flex', alignItems: 'center', height: '36px', minHeight: '36px',
                                px: 1.5, gap: 1, bgcolor: 'rgba(255,255,255,0.03)',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                cursor: 'pointer', userSelect: 'none',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                            }} onClick={() => setDashboardMinimized(prev => !prev)}>
                                <Box sx={{ fontSize: '1rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>📊</Box>
                                <Typography sx={{ fontSize: '0.85rem', color: '#e0e0e0', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '36px' }}>
                                    {researchState.status === 'running' ? `🔬 Researching: ${dashboardTitle}` : dashboardTitle}
                                </Typography>
                                <Box sx={{ fontSize: '1.2rem', color: '#888', transition: 'transform 0.3s', transform: dashboardMinimized ? 'rotate(0deg)' : 'rotate(180deg)', display: 'flex', alignItems: 'center', lineHeight: 1 }}>⌄</Box>
                                <Box component="span" onClick={(e) => { e.stopPropagation(); setResearchState({ status: 'idle', phase: '', steps: [], query: '' }); setDashboardDismissed(true); }}
                                    sx={{ fontSize: '1rem', color: '#666', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer', '&:hover': { color: '#ff5252', bgcolor: 'rgba(255,82,82,0.1)' } }}>
                                    ✕
                                </Box>
                            </Box>
                            {/* Dashboard Content */}
                            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', opacity: dashboardMinimized ? 0 : 1, transition: 'opacity 0.2s' }}>
                                {researchState.status === 'running' && (
                                    <Box sx={{ p: 2 }}>
                                        {researchState.steps.map((step, i) => (
                                            <Box key={i} sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Typography sx={{ color: step.phase === 'search' ? '#4fc3f7' : step.phase === 'fetch' ? '#81c784' : step.phase === 'synthesize' ? '#ffb74d' : '#e0e0e0', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                    {step.phase === 'search' ? '🔍' : step.phase === 'fetch' ? '📄' : step.phase === 'synthesize' ? '✨' : '✅'}
                                                    {' '}{step.status}
                                                    {step.data && (step.data as any).resultCount ? ` (${(step.data as any).resultCount} results)` : ''}
                                                    {step.data && (step.data as any).pagesRead != null ? ` (${(step.data as any).pagesRead} pages)` : ''}
                                                </Typography>
                                            </Box>
                                        ))}
                                        {researchState.phase !== 'done' && (
                                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#4fc3f7', animation: 'pulse 1.5s infinite' }} />
                                                <Typography sx={{ color: '#888', fontSize: '0.75rem' }}>
                                                    {researchState.phase === 'search' ? 'Searching...' : researchState.phase === 'fetch' ? 'Reading pages...' : 'Generating dashboard...'}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                )}
                                {activeDashboardBlocks && (
                                    <Box onClick={(e) => {
                                        const link = (e.target as HTMLElement).closest('a');
                                        if (link?.href) { e.preventDefault(); e.stopPropagation(); navigateWebview(link.href); }
                                    }} sx={{ px: 0.5 }}>
                                        <LayoutRenderer layout={{ blocks: activeDashboardBlocks as any }} stagger />
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )}

                    {/* Research Progress (legacy agent-based) */}
                    {researchState.status !== 'running' && !hasResearchDashboard && !hasDashboard && agent.agentState.taskType === 'research' && (agent.agentState.status === 'running' || agent.agentState.status === 'done') && (
                        <Box sx={{ position: 'absolute', inset: 0, zIndex: 5, bgcolor: '#060a10' }}>
                            <ResearchProgressPanel steps={agent.agentState.steps} status={agent.agentState.status} currentAction={agent.agentState.currentAction} task={agentTaskRef.current} maxSteps={MAX_STEPS} />
                        </Box>
                    )}

                    {/* Webview — hidden when dashboard is active */}
                    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: hasDashboard ? 'none' : 'block' }}>
                        {isElectron ? (
                            <WebviewWithLogging ref={webviewRef} src={initialUrl} />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={currentUrl}
                                title={title || hostname}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                                style={{
                                    position: "absolute", top: 0, left: 0,
                                    width: "100%", height: "100%",
                                    border: "none", backgroundColor: "#fff", display: "block",
                                }}
                            />
                        )}
                    </Box>
                </Box>

                {/* ─── Context Sidebar ─── */}
                {isElectron && (
                    <ContextSidebar
                        hints={ctx.contextHints}
                        setHints={ctx.setContextHints}
                        open={ctx.sidebarOpen}
                        setOpen={ctx.setSidebarOpen}
                        width={ctx.sidebarWidth}
                        setWidth={ctx.setSidebarWidth}
                        isAnalyzing={ctx.isAnalyzing}
                        isPrivacyBlocked={ctx.isPrivacyBlocked}
                        agentStatus={agent.agentState.status}
                        onShowPageContext={async () => {
                            try {
                                if (!isElectron || !webviewRef.current?.executeJavaScript) return;
                                const pageData = await webviewRef.current.executeJavaScript(buildExtractionScript());
                                if (!pageData) return;
                                const contextText = [
                                    `🔗 URL: ${pageData.url || "unknown"}`,
                                    `📄 Title: ${pageData.title || "unknown"}`,
                                    pageData.description ? `📝 Description: ${pageData.description}` : null,
                                    `\n📊 Extracted text (${(pageData.text || "").length} chars):`,
                                    `───────────────────`,
                                    pageData.text || "(no text extracted)",
                                ].filter(Boolean).join("\n");
                                ctx.setContextHints(prev => [{ query: "📋 Page Context", reason: "Manual query", expanded: true, loading: false, data: { summary: contextText } }, ...prev]);
                            } catch { /* webview not ready */ }
                        }}
                        onTriggerAnalysis={ctx.triggerManualAnalysis}
                        onManualQuery={async (query) => {
                            // ─── Agent paused → feedback routing ───
                            if (agent.agentState.status === "paused") {
                                const feedback = query.trim();
                                if (!feedback) return;
                                ctx.setContextHints(prev => prev.map(h =>
                                    h.query.startsWith('🤖 Agent:')
                                        ? { ...h, data: { ...h.data, summary: (h.data?.summary || '') + `\n\n💬 User: ${feedback}\n▶️ Continuing with feedback...` } }
                                        : h
                                ));
                                agent.continueAgent(agentTaskRef.current || feedback, feedback);
                                return;
                            }

                            // ─── LLM Intent Classifier (4-way router) ───
                            let intentMode: 'RESEARCH' | 'ACTION' | 'ACTION_WITH_CONTEXT' | 'CONTEXT_QUESTION' = 'ACTION';
                            let classifiedTask = query;
                            let crudMethod: string = 'GET';
                            let allowedTools: string[] = [];
                            let forbiddenTools: string[] = [];

                            try {
                                const classifyResp = await fetch('http://localhost:3001/api/intent/classify', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        query,
                                        hasDashboard: hasResearchDashboard || hasDashboard,
                                    }),
                                });
                                if (classifyResp.ok) {
                                    const classification = await classifyResp.json();
                                    intentMode = classification.mode;
                                    classifiedTask = classification.task || query;
                                    crudMethod = classification.method || 'GET';
                                    allowedTools = classification.allowed_tools || [];
                                    forbiddenTools = classification.forbidden || [];
                                }
                            } catch {
                                // Fallback: heuristic
                                const resolved = resolveTool(query);
                                if (resolved?.tool.trigger === 'research') intentMode = 'RESEARCH';
                                else intentMode = 'ACTION';
                            }

                            // ─── Route: RESEARCH ───
                            if (intentMode === 'RESEARCH') {
                                agentTaskRef.current = classifiedTask;
                                ctx.setContextHints(prev => [
                                    ...prev.filter(h => !h.query.startsWith('🤖 Agent:') && !h.query.startsWith('📊 Research:')),
                                    { query: `📊 Research: ${classifiedTask}`, reason: "Research Engine", expanded: true, loading: true, timestamp: Date.now(), data: { summary: `🔬 Starting research...` } },
                                ]);
                                setDashboardMinimized(false);
                                startResearch(classifiedTask);
                                return;
                            }

                            // ─── Route: ACTION_WITH_CONTEXT ───
                            if (intentMode === 'ACTION_WITH_CONTEXT') {
                                let dashboardContext = '';
                                const blocks = researchState.blocks || _genuiBlocks;
                                if (blocks && blocks.length > 0) {
                                    dashboardContext = '\n\n--- DASHBOARD CONTEXT (current research results) ---\n';
                                    for (const block of blocks as any[]) {
                                        if (block.title) dashboardContext += `## ${block.title}\n`;
                                        if (block.text) dashboardContext += `${block.text}\n`;
                                        if (block.items) {
                                            for (const item of block.items) {
                                                dashboardContext += `- ${item.title || item.label || ''}: ${item.text || item.value || item.url || ''}\n`;
                                            }
                                        }
                                        if (block.url) dashboardContext += `Source: ${block.url}\n`;
                                        dashboardContext += '\n';
                                    }
                                    dashboardContext += '--- END DASHBOARD CONTEXT ---';
                                }
                                const enrichedTask = classifiedTask + dashboardContext;
                                agentTaskRef.current = enrichedTask;
                                ctx.setContextHints(prev => [
                                    ...prev.filter(h => !h.query.startsWith('🤖 Agent:')),
                                    { query: `🤖 Agent: ${classifiedTask}`, reason: "Manual query", expanded: true, loading: true, timestamp: Date.now(), data: { summary: `Starting action with dashboard data...` } },
                                ]);
                                setDashboardMinimized(true); // Reveal webview so user can watch the agent
                                abortResearch(); // Stop background research — user switched focus
                                agent.startAgent(enrichedTask, { method: crudMethod, allowed_tools: allowedTools, forbidden: forbiddenTools });
                                return;
                            }

                            // ─── Route: CONTEXT_QUESTION (Context Chat RAG) ───
                            if (intentMode === 'CONTEXT_QUESTION') {
                                startContextChat(classifiedTask);
                                return;
                            }

                            // ─── Route: ACTION (Browser Agent) ───
                            agentTaskRef.current = classifiedTask;
                            ctx.setContextHints(prev => [
                                ...prev.filter(h => !h.query.startsWith('🤖 Agent:')),
                                { query: `🤖 Agent: ${classifiedTask}`, reason: "Manual query", expanded: true, loading: true, timestamp: Date.now(), data: { summary: `Starting browser action...` } },
                            ]);
                            abortResearch(); // Stop background research — user switched focus
                            agent.startAgent(classifiedTask, { method: crudMethod, allowed_tools: allowedTools, forbidden: forbiddenTools });
                        }}
                    />
                )}
            </Box>
        </Box>
    );
});
