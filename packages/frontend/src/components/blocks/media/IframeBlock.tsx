// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IframeBlock (Web Integration + Browser Controls)
// ============================================================
// Orchestrator component — connects navigation hooks, context
// watcher, and sidebar sub-components.
// ============================================================

import React, { useState, useCallback, useRef } from "react";
import { debug } from "../../../utils/debug";
import { Box, IconButton, Tooltip, Typography, InputBase } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AddIcon from "@mui/icons-material/Add";
import GpsFixed from "@mui/icons-material/GpsFixed";
import LanguageIcon from "@mui/icons-material/Language";
import { COLORS, accentAlpha } from "../../ui/SharedUI";
import type { IframeBlockSpec } from "../types";
import { LinkCard } from "./LinkCard";
import { ContextSidebar } from "./ContextSidebar";
import { useContextWatcher } from "./useContextWatcher";
import { buildExtractionScript } from "./extractPageContent";

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

const WebviewWithLogging = React.forwardRef<any, { src: string }>(
    function WebviewWithLogging({ src }, ref) {
        const localRef = useRef<any>(null);
        const listenersAttachedRef = useRef(false);

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

            wv.addEventListener('did-start-loading', () => {
                debug.log(`${tag} ⏳ Loading started...`);
            });
            wv.addEventListener('did-finish-load', () => {
                debug.log(`${tag} ✅ Loaded: ${wv.getURL?.() || 'unknown'}`);
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
                if (e.level === 2) { // errors only
                    debug.log(`${tag} 📟 Page error: ${e.message?.substring(0, 150)}`);
                }
            });
            wv.addEventListener('page-title-updated', (e: any) => {
                const newTitle = e.title || '';
                const currentUrl = wv.getURL?.() || '';
                if (newTitle && newTitle !== 'about:blank') {
                    debug.log(`${tag} 📝 Title updated: "${newTitle}" (${currentUrl})`);
                    window.dispatchEvent(new CustomEvent('biamos:webview-title-updated', {
                        detail: { title: newTitle, url: currentUrl },
                    }));
                }
            });
        }, []);

        return (
            <webview
                ref={setRef}
                src={src}
                // @ts-ignore — partition keeps session/cookies across re-mounts
                partition="persist:lura"
            />
        );
    }
);

// ─── IframeBlock ────────────────────────────────────────────

export const IframeBlock = React.memo(function IframeBlock({
    url: initialUrl,
    title,
    icon,
    height,
}: IframeBlockSpec) {
    const isElectron = !!window.electronAPI?.isElectron;
    const [ctrlHeld, setCtrlHeld] = useState(false);
    const [faviconError, setFaviconError] = useState(false);
    const [currentUrl, setCurrentUrl] = useState(initialUrl);
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [urlFocused, setUrlFocused] = useState(false);
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Per-tab URL memory: remembers last navigated URL for each tab
    const lastUrlByTabRef = useRef<Map<string, string>>(new Map());

    // Per-hostname chat history for multi-turn conversations
    const chatHistoryRef = useRef<Map<string, { role: "user" | "assistant"; content: string }[]>>(new Map());

    // Sync with prop changes (tab switches)
    const prevInitialUrlRef = useRef(initialUrl);
    React.useEffect(() => {
        const isRealTabSwitch = prevInitialUrlRef.current !== initialUrl;
        if (!isRealTabSwitch) return; // Skip re-renders, fullscreen toggles, etc.

        const prevTabKey = prevInitialUrlRef.current;
        prevInitialUrlRef.current = initialUrl;

        // Save outgoing tab's navigated URL + context hints
        lastUrlByTabRef.current.set(prevTabKey, currentUrl);
        ctx.restoreCachedContext(
            lastUrlByTabRef.current.get(initialUrl) || initialUrl,
            currentUrl,
            ctx.contextHints,
        );

        // Restore to last navigated URL for this tab, not the initial URL
        const targetUrl = lastUrlByTabRef.current.get(initialUrl) || initialUrl;
        setCurrentUrl(targetUrl);
        setUrlInput(targetUrl);
        setFaviconError(false);

        // Navigate the webview to the restored URL
        if (isElectron && webviewRef.current?.loadURL) {
            webviewRef.current.loadURL(targetUrl).catch(() => { /* ERR_ABORTED from redirects is normal */ });
        }
    }, [initialUrl, isElectron]);

    // Track Ctrl key globally so overlay appears over iframe/webview
    React.useEffect(() => {
        const down = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(true); };
        const up = (e: KeyboardEvent) => { if (e.key === "Control") setCtrlHeld(false); };
        const blur = () => setCtrlHeld(false);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", blur);
        };
    }, []);

    // ─── Context Watcher Hook ───────────────────────────────
    const ctx = useContextWatcher(webviewRef, initialUrl, isElectron, {
        setCurrentUrl,
        setUrlInput,
    });

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
        if (isElectron && webviewRef.current?.loadURL) {
            webviewRef.current.loadURL(newUrl).catch(() => { /* ERR_ABORTED from redirects */ });
        } else if (iframeRef.current) {
            iframeRef.current.src = newUrl;
        }
    }, [urlInput, isElectron]);

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

    const handleUrlFocus = useCallback(() => {
        setUrlFocused(true);
        setUrlInput(currentUrl);
    }, [currentUrl]);

    const handleUrlBlur = useCallback(() => { setUrlFocused(false); }, []);

    // In browser: blocked sites get link card
    if (!isElectron && isBlockedSite(currentUrl)) {
        return <LinkCard url={currentUrl} title={title} hostname={hostname} faviconUrl={faviconUrl} />;
    }

    const navBtnSx = {
        width: 24, height: 24,
        color: COLORS.textMuted,
        transition: "color 0.15s ease",
        "&:hover": { color: COLORS.textPrimary, bgcolor: "rgba(255,255,255,0.06)" },
    };

    return (
        <Box sx={{ overflow: "hidden", display: "flex", flexDirection: "column", height: height || "100%", flex: 1, minHeight: 200 }}>
            {/* Browser-style toolbar */}
            <Box sx={{
                display: "flex", alignItems: "center", gap: 0.5, px: 1, py: 0.4,
                bgcolor: "rgba(255, 255, 255, 0.03)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                flexShrink: 0,
            }}>
                {/* Navigation buttons */}
                <Tooltip title="Back" arrow><IconButton size="small" onClick={handleBack} sx={navBtnSx}><ArrowBackIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                <Tooltip title="Forward" arrow><IconButton size="small" onClick={handleForward} sx={navBtnSx}><ArrowForwardIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                <Tooltip title="Refresh" arrow><IconButton size="small" onClick={handleRefresh} sx={navBtnSx}><RefreshIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>

                {/* URL bar */}
                <Box
                    component="form"
                    onSubmit={handleNavigate}
                    sx={{
                        flex: 1, display: "flex", alignItems: "center", gap: 0.5,
                        bgcolor: urlFocused ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                        borderRadius: 1.5,
                        border: `1px solid ${urlFocused ? accentAlpha(0.3) : "rgba(255,255,255,0.04)"}`,
                        px: 1, py: 0.2,
                        transition: "all 0.2s ease",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
                    }}
                >
                    {faviconError ? (
                        icon ? (
                            <Box component="span" sx={{ fontSize: 12, lineHeight: 1 }}>{icon}</Box>
                        ) : (
                            <LanguageIcon sx={{ fontSize: 13, color: COLORS.textMuted, flexShrink: 0 }} />
                        )
                    ) : (
                        <Box component="img" src={faviconUrl} alt=""
                            sx={{ width: 13, height: 13, borderRadius: "2px", flexShrink: 0 }}
                            onError={() => setFaviconError(true)}
                        />
                    )}
                    <InputBase
                        value={urlFocused ? urlInput : currentUrl}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onFocus={handleUrlFocus}
                        onBlur={handleUrlBlur}
                        placeholder="Enter URL or search..."
                        sx={{
                            flex: 1,
                            fontSize: "0.7rem",
                            color: urlFocused ? COLORS.textPrimary : COLORS.textSecondary,
                            fontWeight: 500,
                            "& .MuiInputBase-input": { p: 0, py: 0.15 },
                        }}
                        inputProps={{ spellCheck: false }}
                    />
                </Box>

                {/* Right-side actions */}
                <Tooltip title="Open externally" arrow>
                    <IconButton size="small" component="a" href={currentUrl} target="_blank" rel="noopener noreferrer" sx={navBtnSx}>
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="New Tab" arrow>
                    <IconButton size="small" onClick={handleNewTab} sx={{
                        ...navBtnSx,
                        color: accentAlpha(0.6),
                        "&:hover": { color: COLORS.accent, bgcolor: accentAlpha(0.1) },
                    }}>
                        <AddIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>

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
                            fontSize: "0.65rem",
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
                    {ctrlHeld && (
                        <Box sx={{ position: "absolute", inset: 0, zIndex: 10, cursor: "zoom-in" }} />
                    )}
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

                {/* Context Sidebar */}
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
