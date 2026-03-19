// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IframeBlock (Web Integration + Browser Controls)
// ============================================================
// Orchestrator component — connects navigation hooks, context
// watcher, and sidebar sub-components.
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from "react";
import { debug } from "../../../utils/debug";
import { Box, IconButton, Tooltip, Typography, InputBase, ClickAwayListener } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import GpsFixed from "@mui/icons-material/GpsFixed";
import LanguageIcon from "@mui/icons-material/Language";
import { COLORS, accentAlpha } from "../../ui/SharedUI";
import type { IframeBlockSpec } from "../types";
import { LinkCard } from "./LinkCard";
import { ContextSidebar } from "./ContextSidebar";
import { useContextWatcher } from "./useContextWatcher";
import { buildExtractionScript } from "./extractPageContent";
import { useCardContext } from "../CardContext";
import { useAgentActions } from "./useAgentActions";
import { AgentOverlay } from "./AgentOverlay";
import { ConstellationOverlay } from "./ConstellationOverlay";
import { LayoutRenderer } from "../BlockRenderer";

// ─── Blocklist ──────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────

function ensureProtocol(input: string): string {
    const trimmed = input.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) return `https://${trimmed}`;
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ─── SCRAPER API ────────────────────────────────────────────

const SCRAPER_API = "http://localhost:3001/api/scrapers";

// ─── Webview with Lifecycle Logging ─────────────────────────

// Wrapped in React.memo with () => true: the webview must NEVER re-render
// after mount. The `src` prop is only used for the initial load; subsequent
// navigation is handled internally via loadURL(). Re-rendering would cause
// the webview to reload from the new src, causing a visible double-load.
const WebviewWithLogging = React.memo(React.forwardRef<any, { src: string }>(
    function WebviewWithLogging({ src }, ref) {
        const localRef = useRef<any>(null);
        const listenersAttachedRef = useRef(false);
        // Track which URL we already attempted cookie dismissal on
        // to prevent infinite reload loops (cookie click → reload → cookie click → ...)
        const cookieDismissedUrlRef = useRef<string>('');

        // Merge refs
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

            // Increase listener limit — we attach ~12 listeners which exceeds the default 10
            try { wv.setMaxListeners?.(20); } catch { /* not all webview impls support this */ }

            wv.addEventListener('did-start-loading', () => {
                debug.log(`${tag} ⏳ Loading started...`);
            });
            wv.addEventListener('did-finish-load', () => {
                debug.log(`${tag} ✅ Loaded: ${wv.getURL?.() || 'unknown'}`);
                
                // ── Auto-dismiss overlays (2-pass system) ──────────
                // Pass 1 (1.5s): Cookie consent banners
                // Pass 2 (3.0s): Location redirects, newsletter modals,
                //                 paywalls, ad overlays, generic close buttons
                const currentUrl = wv.getURL?.() || '';
                if (currentUrl && !currentUrl.startsWith('data:') && !currentUrl.startsWith('about:')) {
                    // Guard: only attempt cookie dismissal ONCE per URL origin+path
                    // to prevent reload loops when accepting cookies causes a page refresh
                    let urlKey = currentUrl;
                    try { const u = new URL(currentUrl); urlKey = u.origin + u.pathname; } catch { /* use raw */ }
                    if (cookieDismissedUrlRef.current === urlKey) {
                        debug.log(`${tag} 🍪 Skipping auto-dismiss — already attempted for ${urlKey}`);
                    } else {
                    cookieDismissedUrlRef.current = urlKey;
                    // ── Pass 1: Cookie Consent ──
                    setTimeout(() => {
                        try {
                            wv.executeJavaScript(`
                                (function() {
                                    var keywords = [
                                        'einverstanden', 'akzeptieren', 'accept all', 'accept cookies',
                                        'alle akzeptieren', 'accept', 'agree', 'zustimmen',
                                        'i agree', 'got it', 'ok', 'allow all', 'allow cookies',
                                        'alle cookies akzeptieren', 'consent', 'continue',
                                        'accept & close', 'ich stimme zu', 'alles klar',
                                        'alle zulassen', 'j\\'accepte', 'tout accepter'
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
                            `, true).catch(() => {});
                        } catch { /* page may have navigated away */ }
                    }, 1500);

                    // ── Pass 2: All other overlays ──
                    setTimeout(() => {
                        try {
                            wv.executeJavaScript(`
                                (function() {
                                    // --- Location Redirects ---
                                    var locKeywords = [
                                        'wechseln sie zu', 'switch to', 'go to your',
                                        'redirect', 'weiterleiten', 'bleiben', 'stay on',
                                        'nein, danke', 'no thanks', 'nein danke'
                                    ];
                                    var stayKeywords = ['bleiben', 'stay', 'nein', 'no thanks', 'nein danke', 'nicht wechseln', 'dismiss'];
                                    var allClickable = document.querySelectorAll('button, a, [role="button"]');
                                    for (var i = 0; i < allClickable.length; i++) {
                                        var el = allClickable[i];
                                        var text = (el.textContent || '').trim().toLowerCase();
                                        if (text.length < 60 && stayKeywords.some(function(kw) { return text.includes(kw); })) {
                                            var parent = el.closest('[class*="modal"], [class*="overlay"], [class*="popup"], [class*="redirect"], [class*="banner"]');
                                            if (parent) {
                                                el.click();
                                                console.log('🌍 Auto-dismissed redirect: ' + text);
                                                return;
                                            }
                                        }
                                    }

                                    // --- Newsletter, Subscribe, Paywall Modals ---
                                    var modalSelectors = [
                                        '[class*="subscribe"]', '[class*="newsletter"]', '[class*="signup"]',
                                        '[class*="paywall"]', '[class*="ad-overlay"]', '[class*="popup"]',
                                        '[id*="subscribe"]', '[id*="newsletter"]', '[id*="popup"]',
                                        '[class*="modal"]', '[class*="lightbox"]'
                                    ];
                                    var closeKeywords = ['×', '✕', '✖', 'x', 'close', 'schlie\\u00dfen', 'dismiss',
                                                         'no thanks', 'nein danke', 'later', 'sp\\u00e4ter', 'skip',
                                                         'nicht jetzt', 'not now', 'maybe later'];

                                    for (var s = 0; s < modalSelectors.length; s++) {
                                        var modals = document.querySelectorAll(modalSelectors[s]);
                                        for (var m = 0; m < modals.length; m++) {
                                            var modal = modals[m];
                                            // Check if modal is visible
                                            var style = window.getComputedStyle(modal);
                                            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

                                            // Find close button within the modal
                                            var closeBtns = modal.querySelectorAll('button, [role="button"], a, .close, [class*="close"], [aria-label*="close"], [aria-label*="Close"]');
                                            for (var c = 0; c < closeBtns.length; c++) {
                                                var btn = closeBtns[c];
                                                var btnText = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
                                                if (btnText.length < 30 && closeKeywords.some(function(kw) { return btnText.includes(kw); })) {
                                                    btn.click();
                                                    console.log('🛡️ Auto-dismissed overlay: ' + btnText + ' in ' + modalSelectors[s]);
                                                    return;
                                                }
                                            }
                                        }
                                    }

                                    // --- Generic fullscreen overlays blocking the page ---
                                    var allEls = document.querySelectorAll('div, section, aside');
                                    for (var f = 0; f < allEls.length; f++) {
                                        var el2 = allEls[f];
                                        var cs = window.getComputedStyle(el2);
                                        if (cs.position === 'fixed' && cs.zIndex && parseInt(cs.zIndex) > 999 &&
                                            el2.offsetWidth > window.innerWidth * 0.5 && el2.offsetHeight > window.innerHeight * 0.5) {
                                            var closeBtn = el2.querySelector('button, [role="button"], [class*="close"], [aria-label*="close"]');
                                            if (closeBtn) {
                                                closeBtn.click();
                                                console.log('🛡️ Auto-dismissed fullscreen overlay via close button');
                                                return;
                                            }
                                        }
                                    }
                                })();
                            `, true).catch(() => {});
                        } catch { /* page may have navigated away */ }
                    }, 3000);

                    // ── Pass 3: Retry Cookie Consent (late-loading GDPR frameworks) ──
                    setTimeout(() => {
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
                                            console.log('🍪 [Pass 3] Auto-accepted cookie: ' + text);
                                            return;
                                        }
                                    }
                                    var overlays = document.querySelectorAll('[class*="consent"], [class*="cookie"], [id*="consent"], [id*="cookie"], [class*="gdpr"], [id*="gdpr"], [class*="qc-cmp"], [id*="qc-cmp"]');
                                    for (var j = 0; j < overlays.length; j++) {
                                        var btns = overlays[j].querySelectorAll('button, a, [role="button"]');
                                        for (var k = 0; k < btns.length; k++) {
                                            var t = (btns[k].textContent || '').trim().toLowerCase();
                                            if (t.length < 50 && keywords.some(function(kw) { return t.includes(kw); })) {
                                                btns[k].click();
                                                console.log('🍪 [Pass 3] Auto-accepted cookie (overlay): ' + t);
                                                return;
                                            }
                                        }
                                    }
                                })();
                            `, true).catch(() => {});
                        } catch { /* page may have navigated away */ }
                    }, 5000);
                    } // end else (cookie guard)
                }
            });
            wv.addEventListener('did-fail-load', (e: any) => {
                // ERR_ABORTED (-3) is common during redirects and not a real error
                if (e.errorCode === -3) {
                    debug.log(`${tag} ⚠️ Load aborted (ERR_ABORTED) — this is normal during redirects`);
                    return;
                }
                console.error(`${tag} ❌ Load FAILED: code=${e.errorCode} desc="${e.errorDescription}" url=${e.validatedURL}`);
            });
            wv.addEventListener('did-navigate', (e: any) => {
                debug.log(`${tag} 🔗 Navigated to: ${e.url}`);
                // Track in browsing history
                if (e.url && e.url !== 'about:blank') {
                    fetch('http://localhost:3001/api/history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: e.url }),
                    }).catch(() => {});
                }
            });
            wv.addEventListener('dom-ready', () => {
                debug.log(`${tag} 📄 DOM ready: ${wv.getURL?.() || 'unknown'}`);
            });
            wv.addEventListener('crashed', () => {
                console.error(`${tag} 💀 CRASHED!`);
            });
            wv.addEventListener('destroyed', () => {
                console.warn(`${tag} 🗑️ Destroyed (unmounted)`);
            });
            wv.addEventListener('console-message', (e: any) => {
                // GenUI prefill bridge: Dashboard action buttons pre-fill the chat input
                if (e.message?.startsWith('BIAM_PREFILL:')) {
                    const command = e.message.replace('BIAM_PREFILL:', '').trim();
                    console.log(`🎯 [GenUI] Prefill command: "${command}"`);
                    window.dispatchEvent(new CustomEvent('biamos:prefill-command', { detail: { command } }));
                    return;
                }
                // GenUI navigate bridge: links load in the same BiamOS tab
                if (e.message?.startsWith('BIAM_NAVIGATE:')) {
                    const url = e.message.replace('BIAM_NAVIGATE:', '').trim();
                    console.log(`🎯 [GenUI] Navigate to: "${url}"`);
                    if (wv?.loadURL) {
                        wv.loadURL(url).catch(() => {});
                    }
                    return;
                }
                // Legacy intent bridge (deprecated)
                if (e.message?.startsWith('BIAM_INTENT:')) {
                    const intent = e.message.replace('BIAM_INTENT:', '').trim();
                    console.log(`🎯 [GenUI] Intent received: "${intent}"`);
                    window.dispatchEvent(new CustomEvent('biamos:genui-intent', { detail: { intent } }));
                    return;
                }
                if (e.level === 2) { // errors only
                    debug.log(`${tag} 📟 Page error: ${e.message?.substring(0, 150)}`);
                }
            });
            // Catch navigation failures (fake URLs, network errors)
            // so the agent doesn't get stuck on chrome-error://
            wv.addEventListener('did-fail-load', (e: any) => {
                const url = e.validatedURL || '';
                // Ignore aborted loads (normal during rapid navigation)
                if (e.errorCode === -3) return; // ERR_ABORTED
                // Only handle MAIN FRAME failures — ignore sub-resource errors
                // (ads, tracking pixels, embedded iframes often fail without impact)
                if (e.isMainFrame === false) return;
                console.warn(`${tag} ⚠️ Main frame navigation failed: ${url} (code: ${e.errorCode})`);
                // Notify the agent system about the failure
                window.dispatchEvent(new CustomEvent('biamos:agent-feedback', {
                    detail: { error: `[NAVIGATION FAILED] Could not reach ${url}. Use search_web instead.` },
                }));
                // Navigate to a safe fallback
                try { wv.loadURL('https://www.google.com'); } catch { /* ignore */ }
            });
            wv.addEventListener('page-title-updated', (e: any) => {
                const newTitle = e.title || '';
                const currentUrl = wv.getURL?.() || '';
                if (newTitle && newTitle !== 'about:blank') {
                    debug.log(`${tag} 📝 Title updated: "${newTitle}" (${currentUrl})`);
                    // NOTE: Tab label sync is handled by IframeBlock's useEffect
                    // (which dispatches biamos:webview-title-updated with initialUrl for matching)
                    // Update history entry with title
                    if (currentUrl) {
                        fetch('http://localhost:3001/api/history', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: currentUrl, title: newTitle }),
                        }).catch(() => {});
                    }
                }
            });
            // NOTE: Popup interception is handled in main.ts via
            // setWindowOpenHandler → IPC → preload → biamos:open-as-card
        }, []);

        return (
            <webview
                ref={setRef}
                src={src}
                // @ts-ignore — partition keeps session/cookies across re-mounts
                partition="persist:lura"
                // @ts-ignore
                allowpopups="true"
            />
        );
    }
), () => true); // Never re-render — webview handles navigation internally

// ─── IframeBlock ────────────────────────────────────────────

export const IframeBlock = React.memo(function IframeBlock({
    url: initialUrl,
    title,
    icon,
    height,
    agentDisabled,
    _genuiBlocks,
}: IframeBlockSpec) {
    const hasDashboard = !!_genuiBlocks;
    const agentEnabled = !agentDisabled;
    const isElectron = !!window.electronAPI?.isElectron;
    const [ctrlHeld, setCtrlHeld] = useState(false);
    const [faviconError, setFaviconError] = useState(false);
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [urlFocused, setUrlFocused] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<Array<{ id: number; url: string; title: string; hostname: string; visit_count: number; last_visited: string }>>([]);
    const [urlSuggestions, setUrlSuggestions] = useState<Array<{ id: number; url: string; title: string; hostname: string; visit_count: number }>>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [zoomPercent, setZoomPercent] = useState(100);
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Per-hostname chat history for multi-turn conversations
    const chatHistoryRef = useRef<Map<string, { role: "user" | "assistant"; content: string }[]>>(new Map());

    // ─── AI Browser Agent ───────────────────────────────────
    const agent = useAgentActions(webviewRef, isElectron);
    const agentTaskRef = useRef("");

    // Sync agent state → sidebar chat hint
    useEffect(() => {
        const { status, currentAction, steps } = agent.agentState;
        const taskLabel = agentTaskRef.current;
        if (!taskLabel) return;
        const queryKey = `🤖 Agent: ${taskLabel}`;

        // When agent stops/resets → mark chat hint as done
        if (status === "idle") {
            ctx.setContextHints(prev => prev.map(h =>
                h.query === queryKey && h.loading
                    ? { ...h, loading: false, data: { ...h.data, summary: (h.data?.summary || "") + "\n\n⏹️ Stopped" } }
                    : h
            ));
            return;
        }

        // Build summary from steps
        const stepsSummary = steps
            .filter(s => s.action !== "ask_user")
            .map((s, i) => {
                let result = s.result || '';
                // Only show first line, truncate long results
                const firstLine = result.split('\n')[0];
                const truncated = firstLine.length > 80 ? firstLine.substring(0, 77) + '…' : firstLine;
                return `${i + 1}. ${s.description}${truncated ? ` → ${truncated}` : ''}`;
            })
            .join("\n");
        const statusEmoji = status === "done" ? "✅" : status === "error" ? "❌" : status === "paused" ? "⏸️" : "🔄";
        const stepCount = steps.filter(s => s.action !== "ask_user").length;
        const stepBadge = stepCount > 0 ? ` ${stepCount} steps` : "";
        const summary = stepsSummary
            ? `${statusEmoji}${stepBadge} ${currentAction}\n\n**Steps:**\n${stepsSummary}`
            : `${statusEmoji} ${currentAction}`;
        
        const isDone = status === "done" || status === "error";

        ctx.setContextHints(prev => prev.map(h =>
            h.query === queryKey
                ? {
                    ...h,
                    loading: !isDone,
                    data: {
                        summary,
                        _source: "page_context",
                        // Pass workflow ID for feedback buttons in sidebar
                        ...(isDone && agent.agentState.lastWorkflowId ? {
                            _workflowId: agent.agentState.lastWorkflowId,
                            _sendFeedback: agent.sendFeedback,
                        } : {}),
                    },
                }
                : h
        ));
    }, [agent.agentState]);

    // ─── Webview-only zoom (Ctrl+Scroll / Ctrl+- / Ctrl+=) ─────
    const applyZoom = useCallback((newPercent: number) => {
        const clamped = Math.max(25, Math.min(200, newPercent));
        setZoomPercent(clamped);
        const wv = webviewRef.current;
        if (wv?.setZoomFactor) {
            wv.setZoomFactor(clamped / 100);
        }
    }, []);

    // Track Ctrl key globally so overlay appears over iframe/webview
    // Safety timeout prevents ctrlHeld from getting stuck when webview
    // captures focus and swallows the keyup event.
    const ctrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        const resetCtrl = () => setCtrlHeld(false);
        const startCtrlTimer = () => {
            if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
            ctrlTimerRef.current = setTimeout(resetCtrl, 3000);
        };

        const down = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setCtrlHeld(true);
                startCtrlTimer(); // Auto-reset after 3s if keyup is missed
            }
            // Ctrl+= / Ctrl+- for webview zoom
            if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
                e.preventDefault();
                setZoomPercent(prev => { const next = Math.min(200, prev + 10); applyZoom(next); return next; });
            }
            if (e.ctrlKey && e.key === "-") {
                e.preventDefault();
                setZoomPercent(prev => { const next = Math.max(25, prev - 10); applyZoom(next); return next; });
            }
            if (e.ctrlKey && e.key === "0") {
                e.preventDefault();
                applyZoom(100);
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setCtrlHeld(false);
                if (ctrlTimerRef.current) { clearTimeout(ctrlTimerRef.current); ctrlTimerRef.current = null; }
            }
        };
        const blur = () => {
            setCtrlHeld(false);
            if (ctrlTimerRef.current) { clearTimeout(ctrlTimerRef.current); ctrlTimerRef.current = null; }
        };

        // Ctrl+Scroll for webview zoom
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoomPercent(prev => {
                const delta = e.deltaY > 0 ? -10 : 10;
                const next = Math.max(25, Math.min(200, prev + delta));
                const wv = webviewRef.current;
                if (wv?.setZoomFactor) wv.setZoomFactor(next / 100);
                return next;
            });
        };

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        window.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", blur);
            window.removeEventListener("wheel", onWheel);
            if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
        };
    }, [applyZoom]);

    // ─── Context Watcher Hook ───────────────────────────────
    const cardCtx = useCardContext();
    const ctx = useContextWatcher(webviewRef, initialUrl, isElectron, {
        setCurrentUrl,
        setUrlInput,
    }, cardCtx?.cardId, agentEnabled);

    // ─── Tab Title Sync (Chrome-like) ────────────────────────
    // Listen to this webview's title changes and re-dispatch
    // with the INITIAL URL so useCanvasItems can match the tab.
    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv || !isElectron) return;

        const handleTitle = (e: any) => {
            const newTitle = e.title || '';
            if (!newTitle || newTitle === 'about:blank') return;
            // Dispatch with initialUrl as lookup key (matches tab block URL)
            window.dispatchEvent(new CustomEvent('biamos:webview-title-updated', {
                detail: { title: newTitle, url: initialUrl, currentUrl: wv.getURL?.() || '' },
            }));
        };

        // Electron webview may not be ready immediately
        const attachListener = () => {
            try {
                wv.addEventListener('page-title-updated', handleTitle);
            } catch { /* webview not ready */ }
        };

        // Try immediately, then again on dom-ready in case it's not ready
        attachListener();
        const onReady = () => attachListener();
        try { wv.addEventListener('dom-ready', onReady); } catch { /* */ }

        return () => {
            try {
                wv.removeEventListener('page-title-updated', handleTitle);
                wv.removeEventListener('dom-ready', onReady);
            } catch { /* */ }
        };
    }, [webviewRef.current, isElectron, initialUrl]);

    // ─── GenUI Intent Bridge ────────────────────────────────
    // When a GenUI dashboard button is clicked, it sends an intent
    // via console.log → console-message → custom DOM event → here.
    // Smart routing: direct navigation for URLs, agent for complex tasks.
    useEffect(() => {
        const handler = async (e: Event) => {
            const intent = (e as CustomEvent).detail?.intent;
            if (!intent) return;

            console.log(`🎯 [GenUI] Intent received: "${intent}"`);

            // Show agent activity in sidebar
            ctx.setContextHints(prev => [
                ...prev.filter(h => !h.query.startsWith('🤖 Agent:')),
                {
                    query: `🤖 Agent: ${intent}`,
                    reason: "GenUI intent",
                    expanded: true,
                    loading: true,
                    timestamp: Date.now(),
                    data: { summary: "Processing intent..." },
                },
            ]);

            const wv = webviewRef.current;

            // Extract URL from intent
            const urlMatch = intent.match(/(?:navigate(?:\s+directly)?\s+to|open|go\s+to)\s+(https?:\/\/\S+|[\w.-]+\.\w{2,}(?:\/\S*)?)/i);
            let targetUrl = urlMatch?.[1] || '';
            if (targetUrl && !targetUrl.startsWith('http')) {
                targetUrl = 'https://' + targetUrl;
            }

            // Check if intent is PURE navigation (just "Navigate to X", nothing more)
            const isPureNav = targetUrl && /^(navigate\s+(directly\s+)?to|open)\s+\S+$/i.test(intent.trim());

            // Check if intent is a search (no navigation needed)
            const isSearch = /^search\s/i.test(intent.trim());

            if (isPureNav && wv?.loadURL) {
                // Pure navigation: go directly, no agent needed
                console.log(`🎯 [GenUI] Direct navigation to ${targetUrl} (no agent needed)`);
                try {
                    await wv.loadURL(targetUrl);
                } catch { /* navigation error handled by did-fail-load */ }
            } else if (isSearch) {
                // Search intent: start agent directly (no navigation away needed)
                console.log(`🎯 [GenUI] Search intent, starting agent directly`);
                agentTaskRef.current = intent;
                agent.startAgent(intent);
            } else if (targetUrl && wv?.loadURL) {
                // Complex intent with URL: navigate first, then agent does the rest
                console.log(`🎯 [GenUI] Complex intent: nav to ${targetUrl}, then agent handles the rest`);
                try {
                    await wv.loadURL(targetUrl);
                    await new Promise(r => setTimeout(r, 2500));
                } catch { /* navigation abort is normal */ }
                // Strip the navigation part, give agent only the task
                const taskOnly = intent.replace(/^(navigate\s+(directly\s+)?to|open|go\s+to)\s+\S+\s*(and\s+)?/i, '').trim();
                agentTaskRef.current = taskOnly || intent;
                agent.startAgent(taskOnly || intent);
            } else {
                // Fallback: just start the agent with the full intent
                agentTaskRef.current = intent;
                agent.startAgent(intent);
            }
        };
        window.addEventListener('biamos:genui-intent', handler);
        return () => window.removeEventListener('biamos:genui-intent', handler);
    }, [agent, ctx]);


    // ─── Derived values ─────────────────────────────────────
    let hostname = currentUrl;
    let faviconUrl = "";
    try {
        const u = new URL(currentUrl);
        hostname = u.hostname;
        faviconUrl = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    } catch { /* invalid URL */ }

    // ─── Navigation Handlers ────────────────────────────────
    const handleNavigate = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const newUrl = ensureProtocol(urlInput);
        setCurrentUrl(newUrl);
        setUrlInput(newUrl);
        setFaviconError(false);

        // Save current tab's context before switching, then restore new tab's
        ctx.restoreCachedContext(newUrl, currentUrl, ctx.contextHints);

        if (isElectron && webviewRef.current?.loadURL) {
            webviewRef.current.loadURL(newUrl).catch(() => { /* ERR_ABORTED from redirects */ });
        } else if (iframeRef.current) {
            iframeRef.current.src = newUrl;
        }
    }, [urlInput, isElectron, ctx]);

    const handleBack = useCallback(() => { webviewRef.current?.goBack?.(); }, []);
    const handleForward = useCallback(() => { webviewRef.current?.goForward?.(); }, []);
    const handleRefresh = useCallback(() => { webviewRef.current?.reload?.(); }, []);

    const handleNewTab = useCallback(() => {
        window.dispatchEvent(
            new CustomEvent("biamos:open-as-card", {
                detail: { url: "https://www.google.com", title: "New Tab", sourceUrl: initialUrl },
            })
        );
    }, [initialUrl]);

    const handleUrlFocus = useCallback(async () => {
        setUrlFocused(true);
        setUrlInput(currentUrl);
        // Load recent history as suggestions on focus
        try {
            const res = await fetch('http://localhost:3001/api/history?limit=8');
            const data = await res.json();
            setUrlSuggestions(data.entries ?? []);
            setShowSuggestions(true);
        } catch { /* ignore */ }
    }, [currentUrl]);

    const handleUrlBlur = useCallback(() => {
        setUrlFocused(false);
        // Delay hiding so click on suggestion can register
        setTimeout(() => setShowSuggestions(false), 200);
    }, []);

    const handleUrlInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setUrlInput(val);
        // Debounced search
        if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
        suggestionsTimerRef.current = setTimeout(async () => {
            // Empty input → show recent history (Chrome-like)
            if (!val.trim()) {
                try {
                    const res = await fetch('http://localhost:3001/api/history?limit=8');
                    const data = await res.json();
                    setUrlSuggestions(data.entries ?? []);
                    setShowSuggestions(true);
                } catch { setShowSuggestions(false); }
                return;
            }
            // Non-empty → search by URL + title
            try {
                const res = await fetch(`http://localhost:3001/api/history?limit=6&q=${encodeURIComponent(val)}`);
                const data = await res.json();
                setUrlSuggestions(data.entries ?? []);
                setShowSuggestions(true);
            } catch { /* ignore */ }
        }, 150);
    }, []);

    // In browser: blocked sites get link card
    if (!isElectron && isBlockedSite(currentUrl)) {
        return <LinkCard url={currentUrl} title={title} hostname={hostname} faviconUrl={faviconUrl} />;
    }

    const navBtnSx = {
        width: 34, height: 34,
        borderRadius: "50%",
        color: COLORS.textMuted,
        transition: "all 0.15s ease",
        "&:hover": { color: COLORS.textPrimary, bgcolor: "rgba(255,255,255,0.08)" },
    };

    return (
        <Box sx={{ overflow: "hidden", display: "flex", flexDirection: "column", height: height || "100%", flex: 1, minHeight: 200 }}>
            {/* Browser-style toolbar */}
            <Box className="no-drag" sx={{
                display: "flex", alignItems: "center", gap: 0, px: 0.5, py: 0.5,
                bgcolor: "rgba(255, 255, 255, 0.03)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                flexShrink: 0,
                minHeight: 42,
            }}>
                {/* Navigation buttons */}
                <Tooltip title="Back" arrow><IconButton size="small" onClick={handleBack} sx={navBtnSx}><ArrowBackIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
                <Tooltip title="Forward" arrow><IconButton size="small" onClick={handleForward} sx={navBtnSx}><ArrowForwardIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
                <Tooltip title="Refresh" arrow><IconButton size="small" onClick={handleRefresh} sx={navBtnSx}><RefreshIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>

                {/* URL bar */}
                <Box
                    component="form"
                    onSubmit={handleNavigate}
                    sx={{
                        flex: 1, display: "flex", alignItems: "center", gap: 0.8,
                        position: "relative",
                        bgcolor: urlFocused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                        borderRadius: 6,
                        border: `1px solid ${urlFocused ? accentAlpha(0.3) : "rgba(255,255,255,0.04)"}`,
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
                                        e.preventDefault(); // prevent blur
                                        setShowSuggestions(false);
                                        setCurrentUrl(s.url);
                                        setUrlInput(s.url);
                                        setUrlFocused(false);
                                        if (isElectron && webviewRef.current?.loadURL) {
                                            webviewRef.current.loadURL(s.url).catch(() => {});
                                        }
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
                    <IconButton size="small" onClick={handleNewTab} sx={{
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
                                            setCurrentUrl(entry.url);
                                            setUrlInput(entry.url);
                                            if (isElectron && webviewRef.current?.loadURL) {
                                                webviewRef.current.loadURL(entry.url).catch(() => {});
                                            }
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

                {/* Zoom indicator — only show when not 100% */}
                {zoomPercent !== 100 && (
                    <Tooltip title="Click to reset zoom" arrow>
                        <Box
                            component="button"
                            onClick={() => applyZoom(100)}
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

                {/* Element Picker (disabled — planned for future) */}
                {false && isElectron && (
                    <Tooltip title={ctx.pickerActive ? "Cancel Picker" : "🎯 Element Picker"} arrow>
                        <IconButton
                            size="small"
                            onClick={() => {
                                const wv = webviewRef.current;
                                if (!wv) return;
                                const newState = !ctx.pickerActive;
                                ctx.setPickerActive(newState);
                                if (newState) {
                                    wv.executeJavaScript(`
                                        (function() {
                                            if (window.__luraPicker) { window.__luraPicker.destroy(); }
                                            const style = document.createElement('style');
                                            style.id = '__lura-picker-style';
                                            style.textContent = '.__lura-picker-highlight { outline: 2px solid #00d4ff !important; outline-offset: -1px; cursor: crosshair !important; }';
                                            document.head.appendChild(style);
                                            let lastEl = null;
                                            function onMove(e) {
                                                if (lastEl) lastEl.classList.remove('__lura-picker-highlight');
                                                lastEl = e.target;
                                                lastEl.classList.add('__lura-picker-highlight');
                                            }
                                            function getXPath(el) {
                                                if (!el || el.nodeType !== 1) return '';
                                                if (el.id) return '//*[@id="' + el.id + '"]';
                                                var parts = [];
                                                while (el && el.nodeType === 1) {
                                                    var idx = 1;
                                                    var sib = el.previousSibling;
                                                    while (sib) { if (sib.nodeType === 1 && sib.tagName === el.tagName) idx++; sib = sib.previousSibling; }
                                                    parts.unshift(el.tagName.toLowerCase() + '[' + idx + ']');
                                                    el = el.parentNode;
                                                }
                                                return '/' + parts.join('/');
                                            }
                                            function getCssSelector(el) {
                                                if (el.id) return '#' + el.id;
                                                var path = [];
                                                while (el && el.nodeType === 1) {
                                                    var selector = el.tagName.toLowerCase();
                                                    if (el.className && typeof el.className === 'string') {
                                                        var cls = el.className.trim().split(/\\\\s+/).filter(function(c) { return !c.startsWith('__lura'); }).slice(0, 2);
                                                        if (cls.length) selector += '.' + cls.join('.');
                                                    }
                                                    path.unshift(selector);
                                                    el = el.parentNode;
                                                    if (path.length >= 4) break;
                                                }
                                                return path.join(' > ');
                                            }
                                            function onClick(e) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                var el = e.target;
                                                var result = {
                                                    css: getCssSelector(el),
                                                    xpath: getXPath(el),
                                                    text: (el.innerText || '').substring(0, 200),
                                                    tag: el.tagName.toLowerCase(),
                                                    url: location.href,
                                                    title: document.title
                                                };
                                                window.postMessage({ type: 'biamos:element-picked', data: result }, '*');
                                                destroy();
                                            }
                                            function destroy() {
                                                document.removeEventListener('mousemove', onMove, true);
                                                document.removeEventListener('click', onClick, true);
                                                if (lastEl) lastEl.classList.remove('__lura-picker-highlight');
                                                var s = document.getElementById('__lura-picker-style');
                                                if (s) s.remove();
                                                window.__luraPicker = null;
                                            }
                                            document.addEventListener('mousemove', onMove, true);
                                            document.addEventListener('click', onClick, true);
                                            window.__luraPicker = { destroy: destroy };
                                        })();
                                    `).catch(() => { });

                                    const handler = async (event: any) => {
                                        const msg = event.args?.[0];
                                        if (msg?.type === "biamos:element-picked") {
                                            ctx.setPickerActive(false);
                                            const d = msg.data;
                                            try {
                                                await fetch(SCRAPER_API, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        label: d.title ? `${d.tag} on ${d.title}` : `${d.tag} element`,
                                                        url_pattern: d.url,
                                                        css_selector: d.css,
                                                        xpath_selector: d.xpath,
                                                        text_anchor: d.text,
                                                        extract_type: ["ul", "ol", "table"].includes(d.tag) ? "list" : "text",
                                                    }),
                                                });
                                                ctx.setContextNotice("🎯 Element saved as scraper endpoint!");
                                                setTimeout(() => ctx.setContextNotice(null), 3000);
                                            } catch { }
                                            wv.removeEventListener("ipc-message", handler);
                                        }
                                    };
                                    wv.addEventListener("ipc-message", handler);
                                } else {
                                    wv.executeJavaScript(`
                                        if (window.__luraPicker) { window.__luraPicker.destroy(); }
                                    `).catch(() => { });
                                }
                            }}
                            sx={{
                                ...navBtnSx,
                                color: ctx.pickerActive ? "#00d4ff" : accentAlpha(0.5),
                                bgcolor: ctx.pickerActive ? "rgba(0, 212, 255, 0.12)" : undefined,
                                "&:hover": { color: "#00d4ff", bgcolor: "rgba(0, 212, 255, 0.1)" },
                            }}
                        >
                            <GpsFixed sx={{ fontSize: 15 }} />
                        </IconButton>
                    </Tooltip>
                )}

                {/* Context notice indicator */}
                {ctx.contextNotice && (
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
                        {ctx.contextNotice}
                    </Typography>
                )}
            </Box>

            {/* Content: webview + context sidebar */}
            <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "row" }}>
                {/* Main webview/iframe area */}
                <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    {/* AI Agent Overlay — only for agent-enabled webviews */}
                    {agentEnabled && (
                        <AgentOverlay
                            state={agent.agentState}
                            task={agentTaskRef.current}
                            onStop={agent.stopAgent}
                            onContinue={() => agent.continueAgent(agentTaskRef.current)}
                            onFeedback={agent.sendFeedback}
                        />
                    )}
                    {/* Constellation View — research visualization */}
                    {agentEnabled && (
                        <ConstellationOverlay
                            state={agent.agentState}
                            task={agentTaskRef.current}
                        />
                    )}
                    {ctrlHeld && (
                        <Box
                            onMouseDown={() => setCtrlHeld(false)}
                            sx={{ position: "absolute", inset: 0, zIndex: 10, cursor: "zoom-in" }}
                        />
                    )}
                    {/* Dashboard mode: render GenUI blocks with link interceptor */}
                    {hasDashboard && (
                        <Box
                            sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "#0a0e14" }}
                            onClick={(e) => {
                                const link = (e.target as HTMLElement).closest('a');
                                if (link?.href) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.dispatchEvent(new CustomEvent('biamos:open-as-card', {
                                        detail: { url: link.href, title: link.textContent || link.href },
                                    }));
                                }
                            }}
                        >
                            <LayoutRenderer layout={{ blocks: _genuiBlocks! }} stagger />
                        </Box>
                    )}
                    {/* Webview — hidden when dashboard is active */}
                    <Box sx={{ display: hasDashboard ? 'none' : 'contents' }}>
                        {isElectron ? (
                            <WebviewWithLogging ref={webviewRef} src={initialUrl} />
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={currentUrl}
                                title={title || hostname}
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                                style={{
                                    flex: 1,
                                    width: "100%", height: "100%",
                                    border: "none", backgroundColor: "#fff", display: "block",
                                }}
                            />
                        )}
                    </Box>
                </Box>

                {/* Context Sidebar — available on all webview tabs (like Chrome DevTools) */}
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

                                const contextHint = {
                                    query: "📋 Page Context",
                                    reason: "What BiamOS sees on this page",
                                    expanded: true,
                                    loading: false,
                                    data: { summary: contextText },
                                };
                                ctx.setContextHints(prev => [contextHint, ...prev]);
                            } catch { /* webview not ready */ }
                        }}
                        onTriggerAnalysis={ctx.triggerManualAnalysis}
                        onManualQuery={async (query) => {
                            // ─── Agent paused (ask_user) → Route feedback to agent ───
                            if (agent.agentState.status === "paused") {
                                const feedback = query.trim();
                                if (!feedback) return;
                                // Show feedback in chat
                                ctx.setContextHints(prev => prev.map(h =>
                                    h.query.startsWith('🤖 Agent:')
                                        ? { ...h, data: { ...h.data, summary: (h.data?.summary || '') + `\n\n💬 User: ${feedback}\n▶️ Continuing with feedback...` } }
                                        : h
                                ));
                                agent.continueAgent(agentTaskRef.current || feedback, feedback);
                                return;
                            }
                            // ─── /act command → Start AI Agent ─────────
                            if (query.trim().toLowerCase().startsWith("/act ") || query.trim().toLowerCase() === "/act") {
                                const task = query.replace(/^\/act\s*/i, "").trim() || "Analyze this page and tell me what you see";
                                agentTaskRef.current = task;
                                // Show agent activity in chat — remove old agent hints first
                                ctx.setContextHints(prev => [
                                    ...prev.filter(h => !h.query.startsWith('🤖 Agent:')),
                                    {
                                        query: `🤖 Agent: ${task}`,
                                        reason: "Manual query",
                                        expanded: true,
                                        loading: true,
                                        timestamp: Date.now(),
                                        data: { summary: "Starting AI Browser Agent..." },
                                    },
                                ]);
                                agent.startAgent(task);
                                return;
                            }
                            // Extract page context from webview for the Context Chat Agent
                            let pageUrl = "";
                            let pageTitle = "";
                            let pageText = "";
                            let screenshotBase64 = "";
                            try {
                                if (isElectron && webviewRef.current?.executeJavaScript) {
                                    const pageData = await webviewRef.current.executeJavaScript(buildExtractionScript());
                                    if (pageData) {
                                        pageUrl = pageData.url || "";
                                        pageTitle = pageData.title || "";
                                        pageText = pageData.text || "";
                                        debug.log(`🧠 [ContextChat] Page context: ${pageUrl} (${pageText.length} chars)`);
                                    }
                                    // Capture screenshot for visual context
                                    try {
                                        const nativeImage = await webviewRef.current.capturePage();
                                        if (nativeImage && !nativeImage.isEmpty()) {
                                            // Resize to max 800px wide to save tokens
                                            const size = nativeImage.getSize();
                                            const maxW = 800;
                                            const resized = size.width > maxW
                                                ? nativeImage.resize({ width: maxW })
                                                : nativeImage;
                                            screenshotBase64 = resized.toDataURL().replace(/^data:image\/\w+;base64,/, '');
                                            debug.log(`📸 [ContextChat] Screenshot captured: ${Math.round(screenshotBase64.length / 1024)}KB`);
                                        }
                                    } catch (e) {
                                        debug.log('📸 [ContextChat] Screenshot capture failed:', e);
                                    }
                                }
                            } catch { /* webview not ready */ }

                            // Get hostname for history key
                            let historyKey = "default";
                            try { historyKey = new URL(pageUrl || currentUrl).hostname; } catch { /* */ }

                            // Get existing history for this domain
                            const domainHistory = chatHistoryRef.current.get(historyKey) || [];

                            // Add as a new chat-style hint
                            const newHint = { query, reason: "Manual query", expanded: true, loading: true, timestamp: Date.now() };
                            ctx.setContextHints(prev => [...prev, newHint]);

                            // Stream Context Chat Agent with SSE
                            (async () => {
                                try {
                                    const response = await fetch("http://localhost:3001/api/context/ask/stream", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            question: query,
                                            page_url: pageUrl,
                                            page_title: pageTitle,
                                            page_text: pageText,
                                            history: domainHistory.slice(-30),
                                            ...(screenshotBase64 ? { page_screenshot: screenshotBase64 } : {}),
                                        }),
                                    });

                                    if (!response.ok || !response.body) {
                                        throw new Error(`HTTP ${response.status}`);
                                    }

                                    const reader = response.body.getReader();
                                    const decoder = new TextDecoder();
                                    let buffer = "";
                                    let accumulated = "";
                                    let source = "page_context";

                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) break;

                                        buffer += decoder.decode(value, { stream: true });
                                        const lines = buffer.split("\n");
                                        buffer = lines.pop() || "";

                                        for (const line of lines) {
                                            if (!line.startsWith("data: ")) continue;
                                            const dataStr = line.slice(6).trim();
                                            if (!dataStr) continue;

                                            try {
                                                const event = JSON.parse(dataStr);

                                                if (event.type === "token") {
                                                    accumulated += event.content;
                                                    // Update UI progressively
                                                    const currentText = accumulated;
                                                    ctx.setContextHints(prev => prev.map(h =>
                                                        h.query === query && h.loading
                                                            ? { ...h, loading: true, data: { summary: currentText, _source: undefined } }
                                                            : h
                                                    ));
                                                } else if (event.type === "search") {
                                                    // Show searching indicator
                                                    ctx.setContextHints(prev => prev.map(h =>
                                                        h.query === query && h.loading
                                                            ? { ...h, data: { summary: `🔍 Searching: "${event.query}"...`, _source: undefined } }
                                                            : h
                                                    ));
                                                } else if (event.type === "done") {
                                                    source = event.source || "page_context";
                                                    const followUps = event.follow_ups || [];

                                                    // Strip follow-up marker from displayed text
                                                    const cleanText = accumulated.replace(/---FOLLOWUPS---[\s\S]*/m, "").trim();

                                                    // Save to history
                                                    const updated = [...domainHistory, { role: "user" as const, content: query }, { role: "assistant" as const, content: cleanText }];
                                                    chatHistoryRef.current.set(historyKey, updated);

                                                    // Final update
                                                    ctx.setContextHints(prev => prev.map(h =>
                                                        h.query === query
                                                            ? { ...h, loading: false, data: { summary: cleanText || "No answer", _source: source, _follow_ups: followUps } }
                                                            : h
                                                    ));

                                                    debug.log(`🧠 [ContextChat] Stream complete: ${cleanText.substring(0, 80)}... [${source}]`);
                                                }
                                            } catch { /* skip malformed */ }
                                        }
                                    }
                                } catch (err) {
                                    console.error("💥 Stream error:", err);
                                    ctx.setContextHints(prev => prev.map(h =>
                                        h.query === query && h.loading
                                            ? { ...h, loading: false, data: { error: "Failed to load" } }
                                            : h
                                    ));
                                }
                            })();
                        }}
                    />
                )}
            </Box>
        </Box>
    );
});
