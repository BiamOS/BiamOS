// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Watcher Hook (Electron only)
// ============================================================
// Handles SPA navigation detection, content extraction,
// context API calls, caching, and polling fallback.
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { debug } from "../../../utils/debug";
import { buildExtractionScript, buildSpaDetectionScript } from "./extractPageContent";
import type { ContextHint } from "./ContextSidebar";

// ─── Constants ──────────────────────────────────────────────

const CONTEXT_DEBOUNCE_MS = 2_000;     // 2s — analyze after last navigation/title event
const CONTEXT_POLL_INTERVAL = 5000;    // 5s polling fallback
const CONTEXT_API = "http://localhost:3001/api/context/analyze";

// ─── Privacy Blocklist ──────────────────────────────────────
// Domains/patterns where content extraction MUST be skipped
// to protect user privacy (banking, email, healthcare, etc.)

const PRIVACY_BLOCKLIST = [
    /\blocalhost\b/, /\b127\.0\.0\.1\b/, /\b192\.168\./, /\b10\./,
    /\bbanking\b/i, /\bbank\b/i, /\bfinanz/i, /\bsparkasse\b/i, /\bpaypal\b/i,
    /\bmail\b/i, /\bwebmail\b/i, /\boutlook\b/i, /\bgmail\b/i, /\bproton\b/i,
    /\bpassword\b/i, /\blogin\b/i, /\bauth\b/i, /\bsso\./, /\baccounts\./,
    /\bhealthcare\b/i, /\bmedical\b/i, /\bpatient\b/i, /\bkranken/i,
    /\bintranet\b/i, /\binternal\b/i, /\bcorp\./i,
];

function isPrivateDomain(url: string): boolean {
    return PRIVACY_BLOCKLIST.some(rx => rx.test(url));
}

// ─── State Setters Interface ────────────────────────────────

interface NavigationSync {
    setCurrentUrl: (url: string) => void;
    setUrlInput: (url: string) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useContextWatcher(
    webviewRef: React.RefObject<any>,
    initialUrl: string,
    isElectron: boolean,
    navSync: NavigationSync,
    cardId?: string,
) {
    const [contextNotice, setContextNotice] = useState<string | null>(null);
    const [pickerActive, setPickerActive] = useState(false);
    const [contextHints, setContextHints] = useState<ContextHint[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(280);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isPrivacyBlocked, setIsPrivacyBlocked] = useState(false);

    const contextCacheRef = useRef<Map<string, ContextHint[]>>(new Map());
    const lastAnalyzedUrlRef = useRef<string>("");
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastDetectedUrlRef = useRef<string>("");
    const lastDetectedTitleRef = useRef<string>("");
    const triggerRef = useRef<(() => void) | null>(null);
    const forceAnalysisRef = useRef(false);

    // ─── Save + Restore cached context on tab switch ─────────
    const saveCurrentContext = useCallback((url: string, hints: ContextHint[]) => {
        try {
            const u = new URL(url);
            const cacheKey = u.hostname.replace("www.", "") + u.pathname;
            if (hints.length > 0) {
                contextCacheRef.current.set(cacheKey, hints);
            }
        } catch { /* invalid url */ }
    }, []);

    const restoreCachedContext = useCallback((newUrl: string, saveUrl?: string, currentHints?: ContextHint[]) => {
        // Save current tab's hints before switching
        if (saveUrl && currentHints && currentHints.length > 0) {
            saveCurrentContext(saveUrl, currentHints);
        }
        // Restore cached hints for the new tab
        try {
            const u = new URL(newUrl);
            const cacheKey = u.hostname.replace("www.", "") + u.pathname;
            const cached = contextCacheRef.current?.get(cacheKey);
            if (cached && cached.length > 0) {
                setContextHints(cached);
            } else {
                // Keep agent hints — don't clear conversation when agent navigates
                setContextHints(prev => prev.filter(h => h.query.startsWith("🤖")));
            }
        } catch {
            setContextHints(prev => prev.filter(h => h.query.startsWith("🤖")));
        }
        lastAnalyzedUrlRef.current = "";
    }, [saveCurrentContext]);

    // ─── Broadcast hints to canvas-level ContextChips ──────────
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("biamos:context-hints", {
            detail: { hints: contextHints },
        }));
    }, [contextHints]);

    // ─── Main Effect ────────────────────────────────────────
    useEffect(() => {
        // Context extraction requires executeJavaScript() on the webview,
        // which is only available in Electron. In browser mode, same-origin
        // policy prevents reading iframe content from other domains.
        if (!isElectron) return;
        const wv = webviewRef.current;
        if (!wv) return;

        // ─── Normalize URL for cache key (hostname + pathname)
        const getCacheKey = (url: string): string => {
            try {
                const u = new URL(url);
                return u.hostname.replace("www.", "") + u.pathname;
            } catch { return url; }
        };

        // ─── Trigger Context Analysis
        let retryCount = 0;
        const triggerContextAnalysis = async () => {
            debug.log("🧠 [Trigger] START — webviewRef:", !!webviewRef.current, "force:", forceAnalysisRef.current);
            if (!webviewRef.current) { debug.log("🧠 [Trigger] ABORT — no webview ref"); return; }

            let pageData: { url: string; title: string; text: string } | null;
            try {
                pageData = await wv.executeJavaScript(buildExtractionScript());
                debug.log("🧠 [Trigger] Extracted:", pageData ? { url: pageData.url, title: pageData.title, textLen: pageData.text?.length } : "null");
            } catch (err) {
                debug.log("🧠 [Trigger] ABORT — extraction error:", err);
                return;
            }

            // Page still loading (skeleton/spinner detected) — retry once
            if (!pageData && retryCount < 1) {
                retryCount++;
                setTimeout(triggerContextAnalysis, 1500);
                return;
            }
            retryCount = 0;

            if (!pageData?.url) { debug.log("🧠 [Trigger] ABORT — no URL in pageData"); return; }

            // Privacy guard — never extract from sensitive domains
            if (isPrivateDomain(pageData.url)) {
                debug.log("🧠 [Trigger] ABORT — private/sensitive domain:", pageData.url);
                setIsPrivacyBlocked(true);
                return;
            }
            setIsPrivacyBlocked(false);

            const cacheKey = getCacheKey(pageData.url);
            const isForced = forceAnalysisRef.current;
            forceAnalysisRef.current = false;
            debug.log("🧠 [Trigger] cacheKey:", cacheKey, "forced:", isForced, "lastUrl:", lastAnalyzedUrlRef.current);

            // Skip if we already analyzed this exact URL (unless forced)
            if (!isForced && cacheKey === lastAnalyzedUrlRef.current) { debug.log("🧠 [Trigger] SKIP — already analyzed"); return; }
            lastAnalyzedUrlRef.current = cacheKey;

            // Check cache first — instant display (skip on forced re-analysis)
            if (!isForced) {
                const cached = contextCacheRef.current.get(cacheKey);
                if (cached) {
                    setContextHints(cached.map(h => ({ ...h })));
                    if (cached.length > 0 && !sidebarOpen) setSidebarOpen(true);
                    setContextNotice(cached.length > 0 ? `🧠 ${cached[0].query} (cached)` : null);
                    if (cached.length > 0) setTimeout(() => setContextNotice(null), 3000);
                    return;
                }
            }

            // Clear auto-detected hints while loading new ones,
            // but KEEP manual chat queries (user conversation history)
            setContextHints(prev => prev.filter(h => h.reason === "Manual query"));
            setIsAnalyzing(true);

            // Call context analysis API
            try {
                const body = {
                    url: pageData.url,
                    title: pageData.title,
                    text_snippet: pageData.text,
                    force: isForced,
                };
                debug.log(`🧠 [Context] Analyzing:`, { url: body.url, title: body.title, force: body.force, textLen: body.text_snippet.length, textPreview: body.text_snippet.substring(0, 120) + "..." });
                const res = await fetch(CONTEXT_API, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!res.ok) return;
                const result = await res.json();
                debug.log(`🧠 [Context] Response:`, { suggestions: result.suggestions?.length ?? 0, confidence: result.confidence, queries: result.suggestions?.map((s: any) => s.query) });
                const suggestions = (result.suggestions || []).slice(0, 3);

                // Cache the full hints (with data intact)
                contextCacheRef.current.set(cacheKey, suggestions);

                if (suggestions.length === 0) {
                    // Only show "no context" hint if user has no active chat
                    // If they already have a conversation, just keep it clean
                    setContextHints(prev => {
                        const manualQueries = prev.filter(h => h.reason === "Manual query");
                        if (manualQueries.length > 0) return manualQueries;
                        return [{
                            query: "💬 No specific context detected",
                            reason: "low_confidence",
                            expanded: true,
                            loading: false,
                            data: {
                                summary: "I couldn't find specific topics on this page to analyze automatically. Try asking me a question below — I can still read and answer about anything on the page!",
                            },
                        }];
                    });
                    return;
                }

                // Merge new suggestions with existing manual chat queries
                setContextHints(prev => {
                    const manualQueries = prev.filter(h => h.reason === "Manual query");
                    return [...suggestions, ...manualQueries];
                });
                if (!sidebarOpen) setSidebarOpen(true);

                // Show brief notice in toolbar
                setContextNotice(`🧠 ${suggestions[0].query}`);
                setTimeout(() => setContextNotice(null), 4000);
            } catch {
                /* network error — ignore */
            } finally {
                setIsAnalyzing(false);
            }
        };

        // Store ref for manual trigger from outside
        triggerRef.current = triggerContextAnalysis;

        // ─── Debounced Handler
        const handlePageChange = () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(triggerContextAnalysis, CONTEXT_DEBOUNCE_MS);
        };

        // ─── Webview Event Listeners
        const onDomReady = () => {
            wv.executeJavaScript(buildSpaDetectionScript()).catch(() => { });
            handlePageChange();
        };

        const onDidNavigate = async () => {
            handlePageChange();
            if (!webviewRef.current) return;
            try {
                const info = await wv.executeJavaScript(
                    `({ url: location.href, title: document.title })`
                );
                if (info.url) {
                    navSync.setCurrentUrl(info.url);
                    navSync.setUrlInput(info.url);
                }
                if (info.title && info.title !== "about:blank") {
                    window.dispatchEvent(
                        new CustomEvent("biamos:tab-title-update", {
                            detail: { url: info.url, title: info.title, cardId },
                        })
                    );
                }
            } catch { /* webview not ready */ }
        };

        const onIpcMessage = async () => {
            handlePageChange();
            try {
                const info = await wv.executeJavaScript(
                    `({ url: location.href, title: document.title })`
                );
                if (info.url) { navSync.setCurrentUrl(info.url); navSync.setUrlInput(info.url); }
                if (info.title && info.title !== "about:blank") {
                    window.dispatchEvent(new CustomEvent("biamos:tab-title-update", {
                        detail: { url: info.url, title: info.title, cardId },
                    }));
                }
            } catch { /* */ }
        };

        wv.addEventListener("dom-ready", onDomReady);
        wv.addEventListener("did-navigate", onDidNavigate);
        wv.addEventListener("did-navigate-in-page", onDidNavigate);
        wv.addEventListener("ipc-message", onIpcMessage);

        // Strategy 3: Polling fallback (every 5s) — also syncs URL bar + title
        pollTimerRef.current = setInterval(async () => {
            if (!webviewRef.current) return;
            try {
                const info = await wv.executeJavaScript(
                    `({ url: location.href, title: document.title })`
                );
                if (info.url !== lastDetectedUrlRef.current || info.title !== lastDetectedTitleRef.current) {
                    lastDetectedUrlRef.current = info.url;
                    lastDetectedTitleRef.current = info.title;
                    if (info.url) { navSync.setCurrentUrl(info.url); navSync.setUrlInput(info.url); }
                    if (info.title && info.title !== "about:blank") {
                        window.dispatchEvent(new CustomEvent("biamos:tab-title-update", {
                            detail: { url: info.url, title: info.title, cardId },
                        }));
                    }
                    handlePageChange();
                }
            } catch { /* webview not ready */ }
        }, CONTEXT_POLL_INTERVAL);

        return () => {
            wv.removeEventListener("dom-ready", onDomReady);
            wv.removeEventListener("did-navigate", onDidNavigate);
            wv.removeEventListener("did-navigate-in-page", onDidNavigate);
            wv.removeEventListener("ipc-message", onIpcMessage);
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, [isElectron]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Manual Trigger (bypasses cache) ─────────────────────
    const triggerManualAnalysis = useCallback(() => {
        debug.log("🧠 [Manual] Trigger clicked! triggerRef:", !!triggerRef.current);
        lastAnalyzedUrlRef.current = "";   // Clear URL guard
        forceAnalysisRef.current = true;   // Skip cache check
        triggerRef.current?.();
    }, []);

    return {
        contextNotice,
        setContextNotice,
        pickerActive,
        setPickerActive,
        contextHints,
        setContextHints,
        sidebarOpen,
        setSidebarOpen,
        sidebarWidth,
        setSidebarWidth,
        isAnalyzing,
        isPrivacyBlocked,
        restoreCachedContext,
        triggerManualAnalysis,
    };
}
