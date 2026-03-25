// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Agent Actions Hook (Slim Orchestrator)
// ============================================================
// Responsibilities (ONLY):
//   1. Hold React state (useState) and refs (useRef)
//   2. Own the AbortController — abort() on stopAgent()
//   3. Run the while-loop that calls engine.runStep()
//   4. Expose the public API: startAgent, stopAgent, continueAgent, sendFeedback
//
// All step logic lives in agent/loop/engine.ts (pure TS function).
// All action execution lives in agent/actions/* (pure TS functions).
// This hook does NOT contain any DOM, network, or LLM logic.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { debug } from "../../../utils/debug";

// ─── Module Imports ─────────────────────────────────────────
export type { AgentStep, AgentState, AgentStatus } from "./agent/types";
import type { AgentStep, AgentState, EngineContext, SomMap, TrajectoryStep } from "./agent/types";
import { MAX_STEPS } from "./agent/constants";
import { runStep, runMemoryReplay } from "./agent/loop/engine";
import { waitForPageReady } from "./agent/loop/webviewUtils";

// ─── CRUD Plan ───────────────────────────────────────────────
export interface CrudPlan {
    method: string;
    allowed_tools: string[];
    forbidden: string[];
    system_context?: string | null;
    muscle_memory?: any[];
    memory_id?: number;
}

// ─── Hook ────────────────────────────────────────────────────

export function useAgentActions(
    webviewRef: React.RefObject<any>,
    isElectron: boolean,
    cardId?: string | null,
) {
    const [agentState, setAgentState] = useState<AgentState>({
        status: "idle",
        steps: [],
        currentAction: "",
        pauseQuestion: null,
        cursorPos: null,
        lastWorkflowId: null,
    });

    // ── Refs — the ONLY mutable state the engine reads/writes ──
    const abortRef = useRef(false);
    const stepsRef = useRef<AgentStep[]>([]);
    const currentTaskRef = useRef<string>('');
    const structuredDataRef = useRef<any[]>([]);
    const crudPlanRef = useRef<CrudPlan>({ method: 'GET', allowed_tools: [], forbidden: [] });
    // CDP Refs (Phase 6)
    const stepSomRef = useRef<SomMap>(new Map());
    const wcIdRef = useRef<number>(0);
    const trajectoryRef = useRef<TrajectoryStep[]>([]);
    const lastFailedIdRef = useRef<number | null>(null);

    // ── AbortController — Zeitbombe 5 Fix ──────────────────
    // Each startAgent call gets a fresh controller. stopAgent aborts it,
    // which throws an AbortError inside the fetch. engine.ts catches it silently.
    const abortControllerRef = useRef<AbortController | null>(null);

    // Resolve wcId once when webview mounts / changes
    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv?.getWebContentsId) return;
        try {
            const id = wv.getWebContentsId();
            // getWebContentsId may return a Promise or a number depending on Electron version
            if (typeof id === 'number') { wcIdRef.current = id; }
            else if (id && typeof id.then === 'function') {
                id.then((n: number) => { wcIdRef.current = n; }).catch(() => {});
            }
        } catch { /* not ready yet */ }
    }, [webviewRef]);

    // ── Wire Cancel button to engine abort ─────────────────────
    // The Cancel button in CommandCenter fires 'biamos:agent-cancel'.
    // This effect listens for it and calls stopAgent() to set abortRef.current=true
    // and abort the in-flight fetch — stopping the engine at the next iteration.
    useEffect(() => {
        const handleCancel = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            // Only cancel if this hook's cardId matches (or no cardId = always cancel)
            if (!detail?.cardId || detail.cardId === cardId) {
                abortRef.current = true;
                abortControllerRef.current?.abort();
                setAgentState(prev => ({
                    ...prev,
                    status: 'idle',
                    currentAction: '',
                    pauseQuestion: null,
                    cursorPos: null,
                }));
                console.log(`🛑 [Agent] Cancelled via UI button (cardId=${cardId})`);
            }
        };
        window.addEventListener('biamos:agent-cancel', handleCancel);
        return () => window.removeEventListener('biamos:agent-cancel', handleCancel);
    }, [cardId]);

    // ── Build EngineContext — refs + functional setState only ──
    const buildEngineContext = useCallback((): EngineContext => ({
        wv: webviewRef.current,
        wcId: wcIdRef.current,
        isElectron,
        stepsRef,
        abortRef,
        abortController: abortControllerRef.current,
        structuredDataRef,
        crudPlanRef,
        currentTaskRef,
        cardId: cardId ?? null,
        setAgentState,
        stepSomRef,
        trajectoryRef,
        lastFailedIdRef,
    }), [webviewRef, isElectron, cardId]);

    // ─── Start the agent ─────────────────────────────────────
    const startAgent = useCallback(async (task: string, crudPlan?: CrudPlan) => {
        // Fresh AbortController for this run (Zeitbombe 5)
        abortControllerRef.current = new AbortController();
        abortRef.current = false;
        stepsRef.current = [];
        structuredDataRef.current = [];
        trajectoryRef.current = [];
        lastFailedIdRef.current = null;
        crudPlanRef.current = crudPlan || { method: 'GET', allowed_tools: [], forbidden: [] };
        currentTaskRef.current = task;

        const researchKeywords = /\b(dashboard|news|neuigkeiten|zusammenfassen|summary|show me about|find out|research|zeig|überblick|trends|aktuell)\b/i;
        const detectedType = researchKeywords.test(task) ? 'research' as const : 'action' as const;

        setAgentState({
            status: "running",
            steps: [],
            currentAction: "🚀 Starting...",
            pauseQuestion: null,
            cursorPos: null,
            lastWorkflowId: null,
            taskType: detectedType,
        });

        let stepCount = 0;
        let shouldContinue = true;
        let consecutiveFailures = 0;

        try {
            // Guard: initial about:blank navigation
            const wv = webviewRef.current as any;
            if (wv?.getURL) {
                const currentUrl = wv.getURL();
                if (currentUrl === 'about:blank' || currentUrl.startsWith('data:')) {
                    debug.log("🤖 [Agent] Webview is blank. Navigating to google.com first...");
                    setAgentState(prev => ({ ...prev, currentAction: "🌐 Loading search engine..." }));
                    try {
                        if (wv.loadURL) {
                            const navTimeout = new Promise<void>((_, reject) =>
                                setTimeout(() => reject(new Error('Navigation timeout (5s)')), 5000)
                            );
                            await Promise.race([
                                (async () => {
                                    await wv.loadURL('https://www.google.com');
                                    await waitForPageReady(wv, 'initial-load');
                                })(),
                                navTimeout,
                            ]);
                        }
                    } catch (e) {
                        debug.log("🤖 [Agent] Initial navigation failed or timed out — continuing anyway:", e);
                    }
                }
            }

            // 🧠 FAST PATH: Muscle Memory Replay
            if (crudPlanRef.current.muscle_memory && crudPlanRef.current.muscle_memory.length > 0) {
                setAgentState(prev => ({ ...prev, status: "running", currentAction: "🧠 Muscle Memory Fast-Path", lastWorkflowId: crudPlanRef.current.memory_id || null }));
                debug.log(`🧠 [Agent] Discovered muscle_memory for this task! Attempting replay before LLM fallback...`);
                try {
                    const ctx = buildEngineContext();
                    const success = await runMemoryReplay(task, crudPlanRef.current.muscle_memory, ctx);
                    if (success) return; // Completely handled by replay!
                    
                    // Replay failed: clear history and fall through to LLM loop
                    debug.log(`🧠 [Agent] Replay failed mid-flight. Falling back to LLM reasoning from scratch.`);
                    stepsRef.current = [];
                    setAgentState(prev => ({ ...prev, steps: [], currentAction: "🧠 Replay failed. Recalibrating route..." }));
                } catch (e) {
                    debug.log(`🧠 [Agent] Replay crashed, falling back:`, e);
                }
            }

            // Normal LLM Loop
            while (shouldContinue && !abortRef.current && stepCount < MAX_STEPS) {
                stepCount++;
                const ctx = buildEngineContext();
                shouldContinue = await runStep(task, ctx);

                const lastStep = stepsRef.current[stepsRef.current.length - 1];
                if (lastStep?.result?.startsWith("Action failed")) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= 2) {
                        setAgentState(prev => ({
                            ...prev,
                            status: "error",
                            currentAction: `❌ Stopped: ${consecutiveFailures} consecutive failures`,
                        }));
                        shouldContinue = false;
                    }
                } else {
                    consecutiveFailures = 0;
                }
            }

            if (stepCount >= MAX_STEPS) {
                setAgentState(prev => ({
                    ...prev,
                    status: "done",
                    currentAction: `⚠️ Step limit reached (${MAX_STEPS}/${MAX_STEPS}). Task may be incomplete — try breaking it into smaller commands.`,
                    cursorPos: null,
                }));
            }
        } catch (fatalError: any) {
            debug.log("🤖 [Agent] Fatal runtime error in startAgent loop:", fatalError);
            setAgentState(prev => ({
                ...prev,
                status: "error",
                currentAction: `❌ Fatal Error: ${fatalError?.message || 'Unknown crash'}`,
            }));
        } finally {
            // Auto-dismiss errors after 8s
            setTimeout(() => {
                setAgentState(prev => {
                    if (prev.status === "error") {
                        return { ...prev, status: "idle", currentAction: "", pauseQuestion: null, cursorPos: null };
                    }
                    if (prev.status === "done" && !prev.lastWorkflowId) {
                        return { ...prev, status: "idle", currentAction: "", pauseQuestion: null, cursorPos: null };
                    }
                    return prev;
                });
            }, 8000);
        }
    }, [webviewRef, buildEngineContext]);

    // ─── Continue after pause ────────────────────────────────
    const continueAgent = useCallback(async (task: string, userFeedback?: string) => {
        const lastStep = stepsRef.current[stepsRef.current.length - 1];
        if (lastStep?.action === "ask_user") {
            lastStep.result = userFeedback
                ? `User feedback: ${userFeedback}`
                : "User confirmed — continue";
        }

        if (userFeedback) {
            const feedbackStep: AgentStep = {
                action: "user_feedback",
                description: userFeedback,
                result: "User provided additional instructions",
            };
            stepsRef.current = [...stepsRef.current, feedbackStep];
        }

        setAgentState(prev => ({
            ...prev,
            status: "running",
            pauseQuestion: null,
            steps: stepsRef.current,
            currentAction: userFeedback
                ? `▶️ Processing: "${userFeedback.substring(0, 50)}${userFeedback.length > 50 ? '...' : ''}"`
                : "▶️ Continuing...",
        }));

        let shouldContinue = true;
        let stepCount = stepsRef.current.length;

        while (shouldContinue && !abortRef.current && stepCount < MAX_STEPS) {
            stepCount++;
            const ctx = buildEngineContext();
            shouldContinue = await runStep(task, ctx);
        }
    }, [buildEngineContext]);

    // ─── Stop the agent ──────────────────────────────────────
    const stopAgent = useCallback(() => {
        abortRef.current = true;
        abortControllerRef.current?.abort(); // Kills the in-flight fetch immediately (Zeitbombe 5)
        setAgentState(prev => ({
            ...prev,
            status: "idle",
            currentAction: "",
            pauseQuestion: null,
            cursorPos: null,
        }));
    }, []);

    // ─── Memory feedback ─────────────────────────────────────
    const sendFeedback = useCallback(async (positive: boolean) => {
        const wfId = agentState.lastWorkflowId;
        if (!wfId || wfId < 0) return;
        try {
            await fetch('/api/agents/memory/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workflow_id: wfId, positive }),
            });
            debug.log(`🧠 [Memory] Feedback sent: ${positive ? '👍' : '👎'} for workflow #${wfId}`);
            setAgentState(prev => ({
                ...prev,
                currentAction: positive ? '✅ Workflow saved! Next time even faster 🧠' : '❌ Workflow rejected',
                lastWorkflowId: null,
            }));
            setTimeout(() => {
                setAgentState(prev => {
                    if (prev.status === 'done') {
                        return { ...prev, status: 'idle', currentAction: '', pauseQuestion: null };
                    }
                    return prev;
                });
            }, 2500);
        } catch (e) {
            debug.log('🧠 [Memory] Feedback error:', e);
        }
    }, [agentState.lastWorkflowId]);

    return {
        agentState,
        startAgent,
        continueAgent,
        stopAgent,
        sendFeedback,
    };
}
