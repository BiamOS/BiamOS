// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// useContextChat — Context Chat RAG Pipeline Hook
// ============================================================
// Manages the /api/context/ask/stream SSE pipeline for in-page
// questions. Extracts page context (text + screenshot) from the
// webview, sends it to the backend, and streams the response.
// ============================================================

import { useRef, useCallback, type RefObject } from "react";
import { debug } from "../../../../utils/debug";
import { buildExtractionScript } from "../extractPageContent";
import type { ContextHint } from "../ContextSidebar";

// ─── Types ──────────────────────────────────────────────────

type SetContextHints = React.Dispatch<React.SetStateAction<ContextHint[]>>;

// ─── Hook ───────────────────────────────────────────────────

export function useContextChat(
    webviewRef: RefObject<any>,
    isElectron: boolean,
    currentUrl: string,
    setContextHints: SetContextHints,
) {
    // Per-hostname chat history for multi-turn conversations
    const chatHistoryRef = useRef<Map<string, { role: "user" | "assistant"; content: string }[]>>(new Map());

    const startContextChat = useCallback(async (query: string) => {
        // Extract page context from webview
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
        const newHint: ContextHint = { query, reason: "Context question", expanded: true, loading: true, timestamp: Date.now() };
        setContextHints(prev => [...prev, newHint]);

        // Stream Context Chat Agent with SSE
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
                            // Strip FOLLOWUPS marker during streaming to prevent flashing
                            const currentText = accumulated.replace(/---FOLLOWUPS---[\s\S]*/m, "").trim();
                            setContextHints(prev => prev.map(h =>
                                h.query === query && h.loading
                                    ? { ...h, loading: true, data: { summary: currentText, _source: undefined } }
                                    : h
                            ));
                        } else if (event.type === "search") {
                            // Show searching indicator
                            setContextHints(prev => prev.map(h =>
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
                            setContextHints(prev => prev.map(h =>
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
            setContextHints(prev => prev.map(h =>
                h.query === query && h.loading
                    ? { ...h, loading: false, data: { error: "Failed to load" } }
                    : h
            ));
        }
    }, [webviewRef, isElectron, currentUrl, setContextHints]);

    return { startContextChat };
}
