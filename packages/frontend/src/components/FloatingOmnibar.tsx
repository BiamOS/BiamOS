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

    // ─── Multi-turn Chat History ─────────────────────────────
    // Persists the last 10 user/assistant turns across queries.
    // Sent to /api/chat so Lura remembers the conversation.
    const chatHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

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

                // 2. DAG-aware Dispatch: resolve unique IDs, handle hidden tasks + depends_on
                // TS generates unique IDs — never the LLM (collision safety for queued queries)
                const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const taskResults: Record<string, string> = {}; // taskId → knowledge output

                let delayMultiplier = 0;

                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];

                    // Resolve unique task ID (TS-generated, stable within this run)
                    const taskId = `${runId}-t${i}`;
                    const dependsOnId = t.depends_on != null ? `${runId}-t${tasks.findIndex((x: any) => x.id === t.depends_on || x.id === `task_A`)}` : null;

                    // ── Hidden task: Matrix Download (no card, no webview) ──
                    if (t.hidden === true) {
                        const platform = t.task.match(/n8n|figma|webflow|salesforce|haloitsm|hubspot|notion|airtable/i)?.[0] || '';
                        console.log(`🧠 [MatrixDownload] Starting hidden research: "${t.task}"`);

                        (async () => {
                            try {
                                const knowledgeResp = await fetch("/api/agents/knowledge", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ task: t.task, platform }),
                                });
                                const knowledgeData = await knowledgeResp.json();
                                taskResults[taskId] = knowledgeData.knowledge || "";
                                console.log(`🧠 [MatrixDownload] Done (${taskResults[taskId].length} chars)`);
                            } catch (e) {
                                taskResults[taskId] = "";
                                console.error(`🧠 [MatrixDownload] Failed:`, e);
                            }
                        })();

                        continue; // No card to spawn, no event to fire
                    }

                    // ── Normal task: resolve depends_on (wait for upstream knowledge) ──
                    let targetCardId = snapshotCardId || "";
                    const needsNewCard = !targetCardId || (t.mode === "RESEARCH" && !snapshotCardId);
                    let needsDelay = false;

                    if (needsNewCard) {
                        targetCardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        needsDelay = true;

                        const spawnDelay = delayMultiplier * 800;
                        setTimeout(() => {
                            dispatchBiamosEvent({
                                type: "BIAMOS_CREATE_EMPTY_CARD",
                                cardId: targetCardId,
                                title: t.task.slice(0, 30) + "...",
                            });
                        }, spawnDelay);
                        delayMultiplier++;
                    }

                    useTaskStore.getState().upsertTask({
                        id: targetCardId!,
                        cardId: targetCardId!,
                        label: t.task,
                        type: t.mode === "RESEARCH" ? "research" : "agent",
                        status: "running",
                        startTime: Date.now(),
                    });

                    const fireAction = async () => {
                        const mode = t.mode || "ACTION";
                        const method = t.method || "GET";
                        const allowedTools = t.allowed_tools || [];
                        const forbidden = t.forbidden || [];

                        // If this task depends on an upstream hidden task, wait for its knowledge
                        let knowledgeContext = "";
                        if (dependsOnId) {
                            console.log(`🧠 [MatrixDownload] Waiting for upstream knowledge (${dependsOnId})...`);
                            for (let wait = 0; wait < 30; wait++) {
                                if (taskResults[dependsOnId] !== undefined) {
                                    knowledgeContext = taskResults[dependsOnId];
                                    break;
                                }
                                await new Promise(r => setTimeout(r, 500));
                            }
                        }

                        // Build task string: append knowledge at the END (avoids Lost-in-Middle)
                        const taskWithContext = knowledgeContext
                            ? `${t.task}\n\n---\nPLATFORM_KNOWLEDGE (use this to guide your actions):\n${knowledgeContext}`
                            : t.task;

                        console.log(`🔍 [Omnibar] FIRE mode=${mode} targetCard="${targetCardId}" task="${t.task.slice(0, 40)}${knowledgeContext ? ' [+knowledge]' : ''}"`);

                        switch (mode) {
                            case "CHAT": {
                                // ─── Direct chat with history ───────────────
                                // Call /api/chat with the last 10 turns so Lura
                                // remembers the conversation across messages.
                                try {
                                    chatHistoryRef.current = [
                                        ...chatHistoryRef.current,
                                        { role: 'user' as const, content: taskWithContext },
                                    ].slice(-10);

                                    const chatResp = await fetch('/api/chat', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            query: taskWithContext,
                                            history: chatHistoryRef.current.slice(0, -1), // send all but current
                                        }),
                                    });
                                    const chatData = await chatResp.json();
                                    const answer = chatData.answer || '';

                                    if (answer) {
                                        // Add assistant reply to history
                                        chatHistoryRef.current = [
                                            ...chatHistoryRef.current,
                                            { role: 'assistant' as const, content: answer },
                                        ].slice(-20); // keep max 20 entries (10 turns)

                                        // Show answer in chat thread via existing event
                                        dispatchBiamosEvent({
                                            type: 'BIAMOS_CONTEXT_CHAT',
                                            targetCard: targetCardId || snapshotCardId || '',
                                            query: taskWithContext,
                                        });
                                    }
                                } catch (chatErr) {
                                    console.error('[CHAT] Direct chat failed:', chatErr);
                                }
                                break;
                            }
                            case "RESEARCH":
                                dispatchBiamosEvent({ type: "BIAMOS_RESEARCH", query: taskWithContext, targetCard: targetCardId! });
                                break;
                            case "CONTEXT_QUESTION":
                                dispatchBiamosEvent({ type: "BIAMOS_CONTEXT_CHAT", targetCard: targetCardId!, query: taskWithContext });
                                break;
                            case "ACTION":
                            case "ACTION_WITH_CONTEXT":
                            default:
                                dispatchBiamosEvent({
                                    type: "BIAMOS_AGENT_ACTION",
                                    targetCard: targetCardId!,
                                    task: taskWithContext,
                                    method,
                                    tools: { allowed: allowedTools, forbidden },
                                    system_context: t.system_context || null,
                                });
                                break;
                        }
                    };

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
