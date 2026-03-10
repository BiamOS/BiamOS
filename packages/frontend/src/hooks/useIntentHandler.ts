// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Handler Hook
// ============================================================
// Facade that composes useCanvasItems + parseSSEStream.
// Handles chat thread state and the intent processing pipeline.
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { debug } from "../utils/debug";
import type { BiamPayload, CanvasItem } from "../types/canvas";
import { smartCardSize, findNextSlot } from "../types/canvas";
import { INTENT_API_URL } from "../theme/theme";
import type { ChatMsg } from "../components/ChatMessage";
import { useLanguage } from "./useLanguage";
import { useCanvasItems } from "./useCanvasItems";
import { parseSSEStream, type SSEStepData } from "../utils/parseSSEStream";
import { handleScrapeAction, handleAutopilotAction, type ActionContext } from "./intent-actions";

// ─── Helpers ────────────────────────────────────────────────

let _msgCounter = 0;
function chatId(): string {
    return `msg-${Date.now()}-${++_msgCounter}`;
}

// ============================================================
// Hook
// ============================================================

export function useIntentHandler(options?: { speak?: (text: string) => void }) {
    const speak = options?.speak;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeGroups, setActiveGroups] = useState<string[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [pipelineStep, setPipelineStep] = useState<string | null>(null);
    const { tr } = useLanguage();
    const [chatOpen, setChatOpen] = useState(false);
    const pendingOriginalQuery = useRef<string | null>(null);

    // ─── Canvas Items (extracted hook) ──────────────────────
    const canvas = useCanvasItems();

    // ─── Push message helpers ───────────────────────────────
    const pushUserMsg = useCallback((text: string) => {
        const msg: ChatMsg = { id: chatId(), role: "user", text, timestamp: Date.now() };
        setChatMessages((prev) => [...prev, msg]);
        setChatOpen(true);
    }, []);

    const pushAssistantMsg = useCallback((text: string, suggestions?: string[]) => {
        const msg: ChatMsg = { id: chatId(), role: "lura", text, suggestions, timestamp: Date.now() };
        setChatMessages((prev) => [...prev, msg]);
        setChatOpen(true);
    }, []);

    // ─── Auto-Intent Listener (Context-Augmented Browsing) ──
    // Listens for lura:auto-intent events from IframeBlock context watcher
    const autoIntentProcessingRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const handleAutoIntent = async (e: Event) => {
            const query = (e as CustomEvent).detail?.query;
            if (!query || typeof query !== "string") return;

            // Deduplicate: skip if we already have a card for this query
            const existingMatch = canvas.itemsRef.current.some(
                (item) => item._query?.toLowerCase() === query.toLowerCase()
            );
            if (existingMatch) return;

            // Deduplicate: skip if already processing
            if (autoIntentProcessingRef.current.has(query)) return;
            autoIntentProcessingRef.current.add(query);

            try {
                // Call intent pipeline directly (no chat thread, no skeleton)
                const res = await fetch(`${INTENT_API_URL}/stream`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: query }),
                });
                if (!res.ok) return;

                const data = await parseSSEStream(res, () => { });
                if (!data || data.action === "error" || data.action === "clarify") return;

                // Handle navigate action → open as iframe card
                if (data.action === "navigate" && data.url) {
                    canvas.addIframeCard(data.url, data.title || data.url);
                    return;
                }

                // Handle multi_result
                const results: BiamPayload[] = data.action === "multi_result" && Array.isArray(data.results)
                    ? data.results.filter((r: BiamPayload) => r.action !== "error")
                    : data.action === "render_layout" ? [data] : [];

                for (const result of results) {
                    // Handle navigate results → open as iframe card
                    if (result.action === "navigate" && (result as any).url) {
                        canvas.addIframeCard((result as any).url, (result as any).title || (result as any).url);
                        continue;
                    }

                    const groupName = (result as any)._group_name as string | undefined;

                    // Try tab grouping first
                    if (groupName && canvas.addTabToGroup(groupName, result, query)) continue;

                    // Create new card with _autoContext flag
                    const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    const size = smartCardSize(result);
                    const pos = findNextSlot(canvas.itemsRef.current, size.w, size.h);
                    const card: CanvasItem = {
                        _id: id,
                        _query: result._query ?? query,
                        payload: { ...result, _query: result._query ?? query },
                        layout: { ...pos, ...size },
                        _loading: false,
                        _groupName: groupName,
                        _autoContext: true,
                    };
                    canvas.setItems((prev) => [...prev, card]);
                }
            } catch {
                /* network error — silent for auto-triggered */
            } finally {
                autoIntentProcessingRef.current.delete(query);
            }
        };

        window.addEventListener("biamos:auto-intent", handleAutoIntent);
        return () => window.removeEventListener("biamos:auto-intent", handleAutoIntent);
    }, [canvas]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Core Intent Handler ────────────────────────────────
    const handleIntent = useCallback(async (text: string) => {
        setIsLoading(true);
        setError(null);
        pushUserMsg(text);

        // ─── Check if query might target an existing group ────
        const queryWords = text.toLowerCase().split(/\s+/);
        const matchedGroupCard = canvas.itemsRef.current.find(
            (item) => {
                if (item._loading || !item._groupName) return false;
                const gn = item._groupName.toLowerCase();
                // Direct group name match
                const nameMatch = queryWords.some(w => gn.startsWith(w) || w.startsWith(gn));
                if (nameMatch) return true;
                // Integration ID match (e.g. "OpenMeteoWidget" → "openmeteo")
                const intId = item.payload?.integration_id;
                if (intId && typeof intId === "string") {
                    const intName = intId.toLowerCase().replace(/widget$/i, "");
                    if (queryWords.some(w => intName.includes(w) || w.includes(intName))) return true;
                }
                // Previous query keyword overlap (e.g. existing "wetter wien" matches new "wetter budapest")
                const prevQuery = item._query?.toLowerCase();
                if (prevQuery) {
                    const prevWords = prevQuery.split(/\s+/).filter(w => w.length >= 3);
                    const newWords = queryWords.filter(w => w.length >= 3);
                    const overlap = newWords.filter(w => prevWords.includes(w));
                    if (overlap.length > 0 && overlap.length >= Math.min(prevWords.length, newWords.length) * 0.5) return true;
                }
                return false;
            }
        );

        let loadingId = "";
        let loadingSpawned = false;
        if (matchedGroupCard) {
            loadingId = "";
            canvas.setItems((prev) => prev.map((item) =>
                item._id === matchedGroupCard._id
                    ? { ...item, _pendingTabLoading: true, _pendingPipelineStep: "🎯 Intent received" }
                    : item
            ));
        } else {
            loadingId = `card-${Date.now()}-loading-${Math.random().toString(36).slice(2, 6)}`;
            // Skeleton is spawned by SSE step callback (on "classifying" step),
            // NOT by a blind timer — prevents flash for CLARIFY/ANSWER responses.
        }

        // Track extra loading IDs for multi-intent skeleton spawning
        const extraLoadingIds: string[] = [];

        // Push thinking indicator into chat
        const thinkingId = chatId();
        setChatMessages((prev) => [...prev, {
            id: thinkingId, role: "thinking" as const, text: "", timestamp: Date.now(),
        }]);
        setChatOpen(true);

        // Helper: remove ALL loading placeholders (primary + extra)
        const removeLoading = () => {
            const allLoadingIds = new Set([loadingId, ...extraLoadingIds]);
            canvas.setItems((prev) => prev.filter((item) => !allLoadingIds.has(item._id)));
        };

        // Helper: remove thinking bubble
        const removeThinking = () => {
            setChatMessages((prev) => prev.filter((m) => m.id !== thinkingId));
        };

        try {
            // Build lightweight summary of existing cards for block targeting
            const existingCards = canvas.itemsRef.current
                .filter(i => !i._loading && i.payload?.action === "render_layout")
                .map(i => ({
                    id: i._id,
                    group_name: i._groupName,
                    integration_id: i.payload?.integration_id,
                    query: i._query,
                }));

            // ─── SSE Stream Consumer ─────────────────────────
            const response = await fetch(`${INTENT_API_URL}/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    groups: activeGroups.length > 0 ? activeGroups : undefined,
                    existing_cards: existingCards.length > 0 ? existingCards : undefined,
                }),
            });

            if (!response.ok) {
                let errorMsg = `Server error: ${response.status}`;
                const errBody = await response.text();
                try {
                    const errJson = JSON.parse(errBody);
                    if (errJson.message) errorMsg = errJson.message;
                } catch {
                    if (errBody) errorMsg = errBody;
                }
                throw new Error(errorMsg);
            }

            // Parse SSE stream — no skeleton, real blocks appear as they arrive
            const data = await parseSSEStream(response, (label, stepData?: SSEStepData) => {
                setPipelineStep(label);

                // Update pending tab-loading cards only (no skeleton to update)
                if (matchedGroupCard) {
                    canvas.setItems((prev) => prev.map((item) => {
                        if (item._pendingTabLoading && item._id === matchedGroupCard._id) {
                            return { ...item, _pendingPipelineStep: label };
                        }
                        return item;
                    }));
                }
            },
                // Progressive block rendering — blocks create/grow the real card
                (block, _blockIdx) => {
                    if (!loadingId) return;
                    canvas.setItems((prev) => {
                        const existing = prev.find(i => i._id === loadingId);

                        if (!existing) {
                            // First block: CREATE a real card with actual content
                            loadingSpawned = true;
                            debug.log(`📐 [SSE] Creating card "${loadingId}" — prev has ${prev.length} items: [${prev.map(i => i._id + '(' + i.layout.x + ',' + i.layout.y + ',' + i.layout.w + 'x' + i.layout.h + ')').join(', ')}]`);
                            const pos = findNextSlot(prev, 4, 10);
                            return [...prev, {
                                _id: loadingId,
                                _query: text,
                                _streaming: true,
                                _loading: false,
                                payload: {
                                    action: "render_layout",
                                    _query: text,
                                    layout: { blocks: [block] },
                                },
                                layout: { ...pos, w: 4, h: 10 },
                            }];
                        } else if ((existing as any)._streaming) {
                            // Subsequent blocks: append to existing card
                            return prev.map(item => {
                                if (item._id !== loadingId) return item;
                                const currentBlocks = item.payload?.layout?.blocks || [];
                                return {
                                    ...item,
                                    payload: {
                                        ...item.payload,
                                        layout: { blocks: [...currentBlocks, block] },
                                    },
                                };
                            });
                        }
                        return prev;
                    });
                });

            setPipelineStep(null);
            if (!data) throw new Error("No result received from stream");

            // ─── No API key ─────────────────────────────────
            if (data.action === "no_api_key") {
                removeThinking();
                removeLoading();
                setError("⚠️ No API key configured — please go to Settings → Usage Dashboard and enter your OpenRouter key.");
                return { showManager: true };
            }

            // ─── CLARIFY → chat bubble + suggestions ────────
            if (data.action === "clarify") {
                removeThinking();
                removeLoading();
                pendingOriginalQuery.current = data.original_query || text;
                pushAssistantMsg(data.question, data.suggestions || []);
                speak?.(data.question);
                return null;
            }

            // ─── ANSWER → show as chat bubble ────────────────
            if (data.action === "multi_result" && Array.isArray(data.results)) {
                const conciergeResult = data.results.find(
                    (r: BiamPayload) => r.integration_id === "lura-concierge"
                );
                if (conciergeResult) {
                    removeThinking();
                    removeLoading();
                    const blocks = (conciergeResult.layout as { blocks?: Array<{ text?: string }> })?.blocks;
                    const answerText = blocks?.[0]?.text || "I'm here to help!";
                    pushAssistantMsg(answerText);
                    speak?.(answerText);
                    return null;
                }
            }

            // ─── NAVIGATE → open website as webview card ────
            if (data.action === "navigate" && data.url) {
                removeThinking();
                removeLoading();
                pushAssistantMsg(`🌐 Opening ${data.title || data.url}...`);
                speak?.(`Opening ${data.title || data.url}`);
                setTimeout(() => setChatOpen(false), 1200);
                canvas.addIframeCard(data.url, data.title || data.url);
                return null;
            }

            // ─── SCRAPE → Ghost-Auth cookie-based scraping ──
            if (data.action === "scrape" && data.url) {
                removeThinking();
                removeLoading();
                const ctx: ActionContext = { text, pushAssistantMsg, speak, canvas };
                await handleScrapeAction(data, ctx);
                setTimeout(() => setChatOpen(false), 1500);
                return null;
            }

            // ─── AUTOPILOT → automated web actions ──────────
            if (data.action === "autopilot" && data.url) {
                removeThinking();
                removeLoading();
                const ctx: ActionContext = { text, pushAssistantMsg, speak, canvas };
                await handleAutopilotAction(data, ctx);
                setTimeout(() => setChatOpen(false), 2000);
                return null;
            }

            // ─── Check for all-error results (no matching skill) ─
            const isAllError = data.action === "multi_result" && Array.isArray(data.results) &&
                data.results.every((r: BiamPayload) => r.action === "error" || (r as any).status === "error");

            removeThinking();

            if (isAllError) {
                removeLoading();
                const allLoadingIds = new Set([loadingId, ...extraLoadingIds]);
                canvas.setItems((prev) => prev.filter((item) => !allLoadingIds.has(item._id)));
                const errorMsg = data.results[0]?.message || "No matching integration found.";
                pushAssistantMsg(`⚠️ ${errorMsg}`);
                speak?.(errorMsg);
                return null;
            }

            pushAssistantMsg(`✅ ${tr.resultReady}`);
            speak?.(tr.resultReady);
            setTimeout(() => setChatOpen(false), 1500);

            // ─── Multi-result (compound query) ──────────────
            if (data.action === "multi_result" && Array.isArray(data.results)) {
                // Check if streaming cards exist (from onBlock events)
                const streamingCard = canvas.itemsRef.current.find(
                    (i) => i._id === loadingId && (i as any)._streaming
                );

                // Remove all loading skeletons (but keep streaming cards for in-place update)
                const allLoadingIds = new Set([loadingId, ...extraLoadingIds]);
                canvas.setItems((prev) => prev
                    .filter((item) => {
                        // Keep the streaming card — we'll update it in-place below
                        if (item._id === loadingId && (item as any)._streaming) return true;
                        return !allLoadingIds.has(item._id);
                    })
                    .map((item) => item._pendingTabLoading ? { ...item, _pendingTabLoading: false, _pendingPipelineStep: undefined } : item)
                );
                const allResults: BiamPayload[] = data.results;

                const displayResults = allResults.map((r: BiamPayload) => {
                    if (r.action === "error") {
                        return {
                            ...r, action: "render_layout",
                            layout: {
                                blocks: [{
                                    type: "hero", props: {
                                        title: `❌ ${r._query || "Request"} failed`,
                                        subtitle: r.message || "API request failed — try again later",
                                        gradient: "warm",
                                    }
                                }]
                            },
                        } as unknown as BiamPayload;
                    }
                    return r;
                });

                if (displayResults.length > 0) {
                    const pendingCards: CanvasItem[] = [];
                    const tabUpdates: Array<{ groupName: string; result: BiamPayload }> = [];

                    for (let rIdx = 0; rIdx < displayResults.length; rIdx++) {
                        const result = displayResults[rIdx];
                        const query = result._query ?? text;

                        // Handle navigate results → open as iframe card
                        if (result.action === "navigate" && (result as any).url) {
                            canvas.addIframeCard((result as any).url, (result as any).title || (result as any).url);
                            continue;
                        }

                        const groupName = (result as any)._group_name as string | undefined;

                        if (groupName) {
                            const existingItem = canvas.itemsRef.current.find(
                                (item) => !item._loading && !(item as any)._streaming && item._groupName === groupName
                            );
                            const pendingItem = pendingCards.find(c => c._groupName === groupName);

                            if (existingItem || pendingItem) {
                                tabUpdates.push({ groupName, result: { ...result, _query: query } });
                                // If this was the first result and a streaming card was created
                                // by onBlock, remove it — the result is going into a tab instead
                                if (rIdx === 0 && streamingCard) {
                                    canvas.setItems((prev) => prev.filter((item) => item._id !== loadingId));
                                }
                                continue;
                            }
                        }

                        // If this is the first result AND a streaming card exists, update it in-place
                        if (rIdx === 0 && streamingCard) {
                            const size = smartCardSize(result);
                            canvas.setItems((prev) => prev.map(item => {
                                if (item._id !== loadingId) return item;
                                return {
                                    ...item,
                                    _query: query,
                                    payload: { ...result, _query: query },
                                    layout: { ...item.layout, ...size },
                                    _loading: false,
                                    _streaming: false,
                                    _groupName: groupName,
                                };
                            }));
                            continue;
                        }

                        const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        const size = smartCardSize(result);
                        const virtualItems = [...canvas.itemsRef.current, ...pendingCards];
                        const pos = findNextSlot(virtualItems, size.w, size.h);
                        const card: CanvasItem = {
                            _id: id, _query: query,
                            payload: { ...result, _query: query },
                            layout: { ...pos, ...size },
                            _loading: false,
                            _groupName: groupName,
                        };
                        pendingCards.push(card);
                    }

                    // Show all cards at once (no stagger delay)
                    for (const card of pendingCards) {
                        canvas.setItems((prev) => [...prev, card]);
                    }

                    // Apply tab updates
                    if (tabUpdates.length > 0) {
                        const tabDelay = pendingCards.length * 400 + 100;
                        setTimeout(() => {
                            for (const { groupName, result } of tabUpdates) {
                                canvas.addTabToGroup(groupName, result, result._query ?? text);
                            }
                        }, tabDelay);
                    }
                }
                return null;
            }

            // ─── Single result ──────────────────────────────
            if (data.action === "error") {
                removeLoading();
                setError(data.message ?? "Unknown error");
            } else {
                const query = data._query ?? text;
                const groupName = data._group_name as string | undefined;

                if (groupName && canvas.addTabToGroup(groupName, data, query)) {
                    removeLoading();
                    return null;
                }

                // Remove all skeleton cards

                const allIds = new Set([loadingId, ...extraLoadingIds]);
                const size = smartCardSize(data);
                const existingCard = canvas.itemsRef.current.find(i => i._id === loadingId);

                // If this card was already streaming blocks, update in-place (no jump)
                if (existingCard && (existingCard as any)._streaming) {
                    canvas.setItems((prev) => {
                        // Remove extra skeleton cards, keep the streaming card
                        const cleaned = prev.filter(item =>
                            item._id === loadingId || !allIds.has(item._id)
                        );
                        return cleaned.map(item => {
                            if (item._id !== loadingId) return item;
                            return {
                                ...item,
                                _query: query,
                                payload: { ...data, _query: query },
                                layout: { ...item.layout, ...size },
                                _loading: false,
                                _streaming: false,
                                _groupName: groupName,
                            };
                        });
                    });
                } else {
                    // Non-streaming path: reuse skeleton position
                    const pos = existingCard
                        ? { x: existingCard.layout.x, y: existingCard.layout.y }
                        : findNextSlot(
                            canvas.itemsRef.current.filter(i => !allIds.has(i._id)),
                            size.w, size.h
                        );
                    const resultCard: CanvasItem = {
                        _id: loadingId || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        _query: query,
                        payload: { ...data, _query: query },
                        layout: { ...pos, ...size },
                        _loading: false,
                        _groupName: groupName,
                    };
                    canvas.setItems((prev) => {
                        const cleaned = prev.filter(item => !allIds.has(item._id));
                        return [...cleaned, resultCard];
                    });
                }
            }
            setPipelineStep(null);
        } catch (err) {
            removeThinking();
            removeLoading();
            setPipelineStep(null);
            setError(err instanceof Error ? `Connection error: ${err.message}` : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
            setPipelineStep(null);
        }
        return null;
    }, [activeGroups, pushUserMsg, pushAssistantMsg, canvas]);

    // ─── Chat Thread Handlers ───────────────────────────────
    const handleChatSend = useCallback((answer: string) => {
        if (pendingOriginalQuery.current) {
            const combined = `${pendingOriginalQuery.current} ${answer}`;
            pendingOriginalQuery.current = null;
            handleIntent(combined);
        } else {
            handleIntent(answer);
        }
    }, [handleIntent]);

    const handleSuggestionClick = useCallback((suggestion: string) => {
        handleChatSend(suggestion);
    }, [handleChatSend]);

    const toggleChat = useCallback(() => setChatOpen((prev) => !prev), []);

    const clearChat = useCallback(() => {
        setChatMessages([]);
        setChatOpen(false);
        pendingOriginalQuery.current = null;
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return {
        items: canvas.items,
        isLoading,
        error,
        activeGroups,
        setActiveGroups,
        gridLayouts: canvas.gridLayouts,
        chatMessages,
        chatOpen,
        pipelineStep,
        handleIntent,
        handleChatSend,
        handleSuggestionClick,
        toggleChat,
        clearChat,
        handleRemove: canvas.handleRemove,
        handleClearAll: canvas.handleClearAll,
        handleLayoutChange: canvas.handleLayoutChange,
        handleDragStart: canvas.handleDragStart,
        handleDragStop: canvas.handleDragStop,
        handleTabChange: canvas.handleTabChange,
        handleTabClose: canvas.handleTabClose,
        clearError,
        addIframeCard: canvas.addIframeCard,
        onCardLayoutChange: canvas.onCardLayoutChange,
    };
}
