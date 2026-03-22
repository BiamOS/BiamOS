// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — FloatingOmnibar (Single Point of Input)
// ============================================================
// The global, floating input bar at the bottom of the screen.
// Replaces the old SmartBar (Zone B) and ContextSidebar input.
//
// Architecture:
// - Reads focus target from useFocusStore (snapshot on focus)
// - Dispatches typed events via biamosEvents (never imports
//   execution hooks directly)
// - Composes OmnibarInput, ContextChip, SpotlightPanel
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box } from "@mui/material";
import { OmnibarInput } from "./omnibar/OmnibarInput";
import { SpotlightPanel } from "./omnibar/SpotlightPanel";
import { useFocusStore } from "../stores/useFocusStore";
import { useTaskStore } from "../stores/useTaskStore";
import { dispatchBiamosEvent } from "../events/biamosEvents";
import { COLORS, accentAlpha } from "../theme/theme";

// ─── History Helpers (migrated from IntentInput) ────────────

const HISTORY_KEY = "BiamOS_search_history";
const MAX_HISTORY = 15;

function getHistory(): string[] {
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addToHistory(query: string): string[] {
    const history = getHistory().filter((h) => h.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}

function removeFromHistory(query: string): string[] {
    const history = getHistory().filter((h) => h !== query);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return history;
}

function clearAllHistory(): string[] {
    localStorage.removeItem(HISTORY_KEY);
    return [];
}

// ─── Integration Fetcher ────────────────────────────────────

interface IntegrationInfo {
    name: string;
    intent_description: string;
    human_triggers?: string | null;
    group_name?: string | null;
    is_active?: boolean;
    sidebar_icon?: string | null;
    sidebar_label?: string | null;
}

// ─── Styles (Design Tokens) ────────────────────────────────

const omnibarWrapperSx = {
    position: "fixed" as const,
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    width: "100%",
    maxWidth: 680,
    px: 2,
};

// ─── Component ──────────────────────────────────────────────

interface FloatingOmnibarProps {
    /** Pipeline step text from useIntentHandler */
    pipelineStep?: string | null;
    /** External loading state from useIntentHandler */
    externalLoading?: boolean;
}

export const FloatingOmnibar = React.memo(function FloatingOmnibar({
    pipelineStep,
    externalLoading = false,
}: FloatingOmnibarProps) {
    const [inputValue, setInputValue] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [spotlightOpen, setSpotlightOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);

    // Focus store (snapshot approach)
    const snapshotCardId = useFocusStore((s) => s.snapshotCardId);
    const snapshotCardMeta = useFocusStore((s) => s.snapshotCardMeta);
    const takeSnapshot = useFocusStore((s) => s.takeSnapshot);

    // Blur timeout ref (cleanup on unmount → prevents memory leak)
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Load history + integrations on mount
    useEffect(() => {
        setHistory(getHistory());
        fetch("/api/integrations")
            .then((res) => res.json())
            .then((data) => {
                const list = Array.isArray(data) ? data : data.integrations ?? [];
                setIntegrations(list);
            })
            .catch(() => { });
    }, []);

    // ─── Phase 2B: Universal Router & Parallel Dispatch Loop ───
    const handleSubmit = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || isLoading) return;

            setHistory(addToHistory(trimmed));
            setInputValue("");
            setSpotlightOpen(false);
            setIsLoading(true);

            try {
                // 1. Direkt an den LLM Intent Router (Phase 2B Multi-Agent)
                const classifyResp = await fetch("/api/intent/route", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        query: trimmed,
                        hasDashboard: snapshotCardMeta?.hasDashboard || false,
                        hasWebview: snapshotCardMeta?.hasWebview || false,
                        currentUrl: snapshotCardMeta?.url || '',
                    }),
                });

                if (!classifyResp.ok) {
                    const errText = await classifyResp.text();
                    try {
                        const errData = JSON.parse(errText);
                        if (errData.action === "no_api_key") {
                            alert("Please go to Settings and make the LLM ready, then you can use me.");
                            setIsLoading(false);
                            return;
                        }
                    } catch (e) { /* ignore */ }
                    throw new Error("Router API failed");
                }
                const tasks = await classifyResp.json(); // Returns an ARRAY of tasks!

                // 2. Iteriere über alle generierten Tasks (Parallel Dispatch mit Staggering!)
                let delayMultiplier = 0; // Hält fest, wie viele NEUE Karten wir spawnen

                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];
                    let targetCardId = snapshotCardId || "";

                    // 3. Discover OR Create Card
                    // For RESEARCH: use existing focused card if one is selected,
                    // otherwise create a new card on the empty canvas.
                    const needsNewCard = !targetCardId || (t.mode === "RESEARCH" && !snapshotCardId);
                    let needsDelay = false;

                    if (needsNewCard) {
                        targetCardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        needsDelay = true;
                        
                        // Staggered Card Creation!
                        const spawnDelay = delayMultiplier * 800;
                        
                        setTimeout(() => {
                            dispatchBiamosEvent({
                                type: "BIAMOS_CREATE_EMPTY_CARD",
                                cardId: targetCardId,
                                title: t.task.slice(0, 30) + "..."
                            });
                        }, spawnDelay);
                        
                        delayMultiplier++; // Nächste Karte muss warten
                    }

                    // 4. Register Active Task in Global Store (Sofort, damit UI im Spotlight reagiert)
                    useTaskStore.getState().upsertTask({
                        id: targetCardId!,
                        cardId: targetCardId!,
                        label: t.task,
                        type: t.mode === "RESEARCH" ? "research" : "agent",
                        status: "running",
                        startTime: Date.now()
                    });

                    // Helper Funktion für den Dispatch
                    const fireAction = () => {
                        const mode = t.mode || "ACTION";
                        const method = t.method || "GET";
                        const allowedTools = t.allowed_tools || [];
                        const forbidden = t.forbidden || [];

                        // 🔍 DIAGNOSTIC LOG — remove after debugging
                        console.log(`🔍 [Omnibar] FIRE mode=${mode} targetCard="${targetCardId}" snapshotCard="${snapshotCardId}" task="${t.task}"`);

                        switch (mode) {
                            case "RESEARCH":
                                dispatchBiamosEvent({
                                    type: "BIAMOS_RESEARCH",
                                    query: t.task,
                                    targetCard: targetCardId!,
                                });
                                break;
                            case "CONTEXT_QUESTION":
                                console.log(`🔍 [Omnibar] Dispatching BIAMOS_CONTEXT_CHAT to card "${targetCardId!}"`);
                                dispatchBiamosEvent({
                                    type: "BIAMOS_CONTEXT_CHAT",
                                    targetCard: targetCardId!,
                                    query: t.task,
                                });
                                break;
                            case "ACTION":
                            case "ACTION_WITH_CONTEXT":
                            default:
                                dispatchBiamosEvent({
                                    type: "BIAMOS_AGENT_ACTION",
                                    targetCard: targetCardId!,
                                    task: t.task,
                                    method,
                                    tools: { allowed: allowedTools, forbidden },
                                });
                                break;
                        }
                    };

                    // Die Action muss auf den Spawn warten + 400ms Puffer für den IframeBlock (Boot Zeit!)
                    // Wenn es KEINE neue Karte ist (needsDelay=false), feuern wir sofort
                    if (needsDelay) {
                        const actionDelay = ((delayMultiplier - 1) * 800) + 400; 
                        setTimeout(fireAction, actionDelay);
                    } else {
                        fireAction();
                    }
                }
            } catch (err) {
                console.error("Router Dispatch failed:", err);
                // Fallback, falls der Router offline ist oder Fehler wirft
                let fallbackCardId = snapshotCardId;
                if (!fallbackCardId) {
                     fallbackCardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                     dispatchBiamosEvent({
                        type: "BIAMOS_CREATE_EMPTY_CARD",
                        cardId: fallbackCardId,
                        title: trimmed.slice(0, 30) + "..."
                    });
                     setTimeout(() => {
                         dispatchBiamosEvent({
                             type: "BIAMOS_AGENT_ACTION",
                             targetCard: fallbackCardId!,
                             task: trimmed,
                             method: "GET",
                             tools: { allowed: [], forbidden: [] },
                         });
                     }, 100);
                } else {
                    dispatchBiamosEvent({
                        type: "BIAMOS_AGENT_ACTION",
                        targetCard: fallbackCardId,
                        task: trimmed,
                        method: "GET",
                        tools: { allowed: [], forbidden: [] },
                    });
                }
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, snapshotCardId, snapshotCardMeta]
    );

    // ─── Spotlight Handlers ─────────────────────────────────
    const handleSelectOption = useCallback(
        (text: string) => {
            setInputValue(text);
            setSpotlightOpen(false);
        },
        []
    );

    const handleDeleteHistory = useCallback(
        (item: string) => {
            setHistory(removeFromHistory(item));
        },
        []
    );

    const handleClearHistory = useCallback(() => {
        setHistory(clearAllHistory());
    }, []);

    const handleFocus = useCallback(() => {
        setSpotlightOpen(true);
        takeSnapshot(); // Freeze the currently focused card as the command target
    }, [takeSnapshot]);

    const handleBlur = useCallback(() => {
        // Delay close so click events on SpotlightPanel can fire
        blurTimeoutRef.current = setTimeout(() => setSpotlightOpen(false), 200);
    }, []);

    // Cleanup blur timeout on unmount
    useEffect(() => {
        return () => clearTimeout(blurTimeoutRef.current);
    }, []);

    return (
        <Box sx={omnibarWrapperSx}>
            <Box sx={{ position: "relative" }}>
                {/* Spotlight Panel — opens upward */}
                <SpotlightPanel
                    open={spotlightOpen}
                    inputValue={inputValue}
                    history={history}
                    integrations={integrations}
                    onSelectOption={handleSelectOption}
                    onDeleteHistory={handleDeleteHistory}
                    onClearHistory={handleClearHistory}
                />

                {/* Omnibar Input */}
                <OmnibarInput
                    value={inputValue}
                    onChange={setInputValue}
                    onSubmit={handleSubmit}
                    isLoading={isLoading || externalLoading}
                    statusText={pipelineStep || undefined}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                />
            </Box>
        </Box>
    );
});
