// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Agent Actions Hook (Slim Orchestrator)
// ============================================================
// Manages the agent loop: screenshot → DOM snapshot → LLM →
// execute action → safety checks → repeat.
//
// Implementation details are in agent/* modules:
//   types.ts     — AgentStep, AgentState
//   constants.ts — MAX_STEPS, MAX_REPEAT, DOM_SNAPSHOT_SCRIPT
//   scripts.ts   — buildClickAtScript, buildFocusScript, etc.
//   actions.ts   — executeAction() dispatcher
//   safety.ts    — checkMaxSteps, checkRepetition, etc.
// ============================================================

import { useState, useRef, useCallback } from "react";
import { debug } from "../../../utils/debug";

// ─── Module Imports ─────────────────────────────────────────
export type { AgentStep, AgentState, AgentStatus } from "./agent/types";
import type { AgentStep, AgentState } from "./agent/types";
import { MAX_STEPS, DOM_SNAPSHOT_SCRIPT } from "./agent/constants";
import { executeAction, type ActionContext } from "./agent/actions";
import { checkMaxSteps, checkRepetition, checkSelfHealing, checkStuckDetection } from "./agent/safety";

// ─── Hook ───────────────────────────────────────────────────

export function useAgentActions(
    webviewRef: React.RefObject<any>,
    isElectron: boolean,
) {
    const [agentState, setAgentState] = useState<AgentState>({
        status: "idle",
        steps: [],
        currentAction: "",
        pauseQuestion: null,
        cursorPos: null,
        lastWorkflowId: null,
    });

    const abortRef = useRef(false);
    const stepsRef = useRef<AgentStep[]>([]);
    const currentTaskRef = useRef<string>('');

    // ─── Capture DOM snapshot ───────────────────────────────
    const captureDomSnapshot = useCallback(async (): Promise<string> => {
        if (!isElectron || !webviewRef.current?.executeJavaScript) return "";
        try {
            const raw = await webviewRef.current.executeJavaScript(DOM_SNAPSHOT_SCRIPT);
            return typeof raw === "string" ? raw : String(raw);
        } catch (err) {
            debug.log("🤖 [Agent] DOM snapshot failed:", err);
            return "";
        }
    }, [webviewRef, isElectron]);

    // ─── Capture screenshot ─────────────────────────────────
    const captureScreenshot = useCallback(async (): Promise<string | undefined> => {
        if (!isElectron || !webviewRef.current?.capturePage) return undefined;
        try {
            const nativeImage = await webviewRef.current.capturePage();
            if (nativeImage && !nativeImage.isEmpty()) {
                const size = nativeImage.getSize();
                const resized = size.width > 800 ? nativeImage.resize({ width: 800 }) : nativeImage;
                return resized.toDataURL().replace(/^data:image\/\w+;base64,/, '');
            }
        } catch { /* */ }
        return undefined;
    }, [webviewRef, isElectron]);

    // ─── Wait for page ready (DOM silence + not loading) ────
    const waitForPageReady = useCallback(async (label: string): Promise<boolean> => {
        const wv = webviewRef.current;
        if (!wv?.executeJavaScript) return false;

        const startTime = Date.now();
        const MAX_WAIT_MS = 8000;
        const DOM_SILENCE_MS = 300;

        // Phase 1: Wait for webview to stop loading and accept JS
        for (let i = 0; i < 8; i++) {
            if (Date.now() - startTime > MAX_WAIT_MS) break;
            if (wv.isLoading?.()) {
                debug.log(`🤖 [Agent] ${label}: webview loading, waiting... (${i + 1}/8)`);
                setAgentState(prev => ({ ...prev, currentAction: "⏳ Page loading..." }));
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            try {
                await wv.executeJavaScript("1", true);
                break;
            } catch {
                debug.log(`🤖 [Agent] ${label}: script injection blocked, waiting... (${i + 1}/8)`);
                setAgentState(prev => ({ ...prev, currentAction: "⏳ Waiting for page..." }));
                await new Promise(r => setTimeout(r, 500));
            }
        }

        // Phase 2: Wait for DOM silence (no mutations for 300ms)
        try {
            await wv.executeJavaScript(`
                (function() {
                    if (window.__biamos_domWatch) return;
                    window.__biamos_lastMutation = Date.now();
                    var obs = new MutationObserver(function() {
                        window.__biamos_lastMutation = Date.now();
                    });
                    obs.observe(document.body || document.documentElement, {
                        childList: true, subtree: true, attributes: true
                    });
                    window.__biamos_domWatch = obs;
                })();
            `, true);

            let silenceChecks = 0;
            while (silenceChecks < 16) {
                if (Date.now() - startTime > MAX_WAIT_MS) {
                    debug.log(`🤖 [Agent] ${label}: max wait ${MAX_WAIT_MS}ms exceeded`);
                    break;
                }
                const lastMutation = await wv.executeJavaScript(
                    'window.__biamos_lastMutation || 0', true,
                );
                if (Date.now() - lastMutation >= DOM_SILENCE_MS) {
                    debug.log(`🤖 [Agent] ${label}: DOM silent for ${DOM_SILENCE_MS}ms ✓`);
                    break;
                }
                await new Promise(r => setTimeout(r, 100));
                silenceChecks++;
            }
        } catch {
            debug.log(`🤖 [Agent] ${label}: MutationObserver failed, basic check`);
        }

        try {
            await wv.executeJavaScript("1", true);
            return true;
        } catch {
            debug.log(`🤖 [Agent] ${label}: webview never became ready`);
            return false;
        }
    }, [webviewRef]);

    // ─── Build action context (passed to actions.ts) ────────
    const buildActionContext = useCallback((): ActionContext => ({
        wv: webviewRef.current,
        waitForPageReady,
        getSteps: () => stepsRef.current,
        setTerminalState: (step: AgentStep, statusMsg: string) => {
            stepsRef.current = [...stepsRef.current, step];
            setAgentState(prev => ({
                ...prev,
                status: "done",
                steps: stepsRef.current,
                currentAction: statusMsg,
                pauseQuestion: null,
            }));
        },
    }), [webviewRef, waitForPageReady]);

    // ─── Apply safety result to React state ─────────────────
    const applySafetyStop = useCallback((reason: string, statusMessage: string) => {
        const doneStep: AgentStep = { action: 'done', description: reason };
        stepsRef.current = [...stepsRef.current, doneStep];
        setAgentState(prev => ({
            ...prev,
            status: 'done',
            steps: stepsRef.current,
            currentAction: statusMessage,
            pauseQuestion: null,
        }));
    }, []);

    // ─── Run one step of the agent loop ─────────────────────
    const runStep = useCallback(async (task: string): Promise<boolean> => {
        if (abortRef.current) return false;

        const ready = await waitForPageReady("step-start");
        if (!ready) {
            setAgentState(prev => ({ ...prev, status: "error", currentAction: "❌ Webview not available" }));
            return false;
        }

        // Get page state
        let pageUrl = "", pageTitle = "";
        try {
            const pageData = await webviewRef.current?.executeJavaScript(
                `JSON.stringify({ url: location.href, title: document.title })`, true
            );
            const parsed = JSON.parse(pageData);
            pageUrl = parsed.url || "";
            pageTitle = parsed.title || "";
        } catch { /* */ }

        let domSnapshot = await captureDomSnapshot();
        let screenshot = await captureScreenshot();

        // Blank DOM on search engines to force search_web usage
        const isSearchEngine = /google\.com|bing\.com|duckduckgo\.com|search\.yahoo/i.test(pageUrl);
        if (isSearchEngine && stepsRef.current.length === 0) {
            domSnapshot = '[Page: Search engine homepage. Use the search_web tool to search — do NOT type into the search box.]';
            screenshot = '';
        }

        setAgentState(prev => ({ ...prev, currentAction: "🧠 Analyzing page..." }));

        // Call backend
        try {
            const response = await fetch("http://localhost:3001/api/agents/act", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    task,
                    page_url: pageUrl,
                    page_title: pageTitle,
                    dom_snapshot: domSnapshot,
                    screenshot,
                    history: stepsRef.current,
                    step_number: stepsRef.current.length + 1,
                    max_steps: MAX_STEPS,
                }),
            });

            if (!response.ok || !response.body) {
                setAgentState(prev => ({ ...prev, status: "error", currentAction: "❌ Backend error" }));
                return false;
            }

            // Read SSE response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

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

                        if (event.type === "thinking") {
                            debug.log(`🧠 [LLM] Thinking: ${event.content}`);
                            setAgentState(prev => ({ ...prev, currentAction: `🧠 ${event.content}` }));
                        }

                        if (event.type === "action") {
                            const { action, args } = event;
                            const stepNum = stepsRef.current.length + 1;
                            debug.log(`\n🎯 ════════════ STEP ${stepNum}/${MAX_STEPS} ════════════`);
                            debug.log(`🎯 [Action] ${action}`, JSON.stringify(args, null, 2));

                            // ── Terminal: done ──────────────
                            if (action === "done") {
                                const summary = args.summary || "Task complete";
                                const step: AgentStep = { action: "done", description: summary };
                                stepsRef.current = [...stepsRef.current, step];
                                setAgentState(prev => ({
                                    ...prev,
                                    status: "done",
                                    steps: stepsRef.current,
                                    currentAction: `✅ ${summary}`,
                                    pauseQuestion: null,
                                }));

                                // Auto-save workflow to memory
                                const isLoopAbort = summary.includes('got stuck') || summary.includes('maximum step limit') || summary.includes('different approach');
                                if (!isLoopAbort) {
                                    try {
                                        const wv = webviewRef.current as any;
                                        const url = await wv?.executeJavaScript?.('location.href', true) ?? '';
                                        const domain = url ? new URL(url).hostname.replace(/^www\./, '') : '';
                                        if (domain && currentTaskRef.current) {
                                            const resp = await fetch('/api/agents/memory/save', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    domain,
                                                    task: currentTaskRef.current,
                                                    steps: stepsRef.current,
                                                }),
                                            });
                                            const data = await resp.json();
                                            if (data.workflow_id > 0) {
                                                setAgentState(prev => ({ ...prev, lastWorkflowId: data.workflow_id }));
                                                debug.log(`🧠 [Memory] Saved workflow #${data.workflow_id}`);
                                            }
                                        }
                                    } catch (e) {
                                        debug.log('🧠 [Memory] Save error (non-fatal):', e);
                                    }
                                }

                                return false;
                            }

                            // ── Terminal: ask_user ──────────
                            if (action === "ask_user") {
                                const step: AgentStep = { action: "ask_user", description: args.question || "Waiting for user input" };
                                stepsRef.current = [...stepsRef.current, step];
                                setAgentState(prev => ({
                                    ...prev,
                                    status: "paused",
                                    steps: stepsRef.current,
                                    currentAction: `⏸️ ${args.question}`,
                                    pauseQuestion: args.question || "Continue?",
                                }));
                                return false;
                            }

                            // ── Ghost Mouse: emit cursor position ──
                            // For SoM-based actions (click, type_text with id), pre-resolve
                            // coordinates from the SoM map before executeAction runs.
                            let cursorX = args.x ?? 0;
                            let cursorY = args.y ?? 0;

                            // Resolve SoM ID to coordinates for ghost mouse
                            if (args.id !== undefined && args.id !== null && (cursorX === 0 && cursorY === 0)) {
                                try {
                                    const wv = webviewRef.current as any;
                                    const somResult = await wv?.executeJavaScript?.(
                                        `JSON.stringify(window.__biamos_som && window.__biamos_som[${args.id}] || null)`, true
                                    );
                                    const coords = JSON.parse(somResult);
                                    if (coords) {
                                        cursorX = coords.x;
                                        cursorY = coords.y;
                                    }
                                } catch { /* fallback to 0,0 */ }
                            }

                            if ((action === "click_at" || action === "click" || action === "type_text") && (cursorX > 0 || cursorY > 0)) {
                                setAgentState(prev => ({ ...prev, cursorPos: { x: cursorX, y: cursorY } }));
                            } else if (action === "scroll" || action === "navigate" || action === "go_back") {
                                try {
                                    const wv = webviewRef.current;
                                    const bounds = wv?.getBoundingClientRect?.();
                                    if (bounds) {
                                        setAgentState(prev => ({
                                            ...prev,
                                            cursorPos: { x: Math.round(bounds.width / 2), y: Math.round(bounds.height / 2) },
                                        }));
                                    }
                                } catch { /* */ }
                            }

                            // ── Step counter ────────────────
                            setAgentState(prev => ({
                                ...prev,
                                currentAction: `🖱️ [${stepNum}/${MAX_STEPS}] ${args.description || action}`,
                            }));

                            // ── DOM hash before action ──────
                            let domHashBefore = '';
                            try {
                                const wv = webviewRef.current as any;
                                domHashBefore = await wv?.executeJavaScript?.(
                                    `document.querySelectorAll('*').length + '|' + document.title + '|' + location.href`,
                                    true,
                                ) ?? '';
                            } catch { /* */ }

                            // ── Safety checks (pure functions) ──
                            const prevSteps = stepsRef.current;

                            const maxCheck = checkMaxSteps(prevSteps);
                            debug.log(`🛡️ [Safety] maxSteps: ${maxCheck.action} | repeat: checking...`);
                            if (maxCheck.action === "stop") {
                                applySafetyStop(maxCheck.reason, maxCheck.statusMessage);
                                return false;
                            }

                            const repeatCheck = checkRepetition(prevSteps, action, args.description || '');
                            if (repeatCheck.action === "stop") {
                                applySafetyStop(repeatCheck.reason, repeatCheck.statusMessage);
                                return false;
                            }

                            const recoveryCount = prevSteps.filter((s: AgentStep) => s.action === 'system_recovery').length;
                            const healCheck = checkSelfHealing(prevSteps, action, args.description || '', recoveryCount);
                            if (healCheck.action === "stop") {
                                applySafetyStop(healCheck.reason, healCheck.statusMessage);
                                return false;
                            }
                            if (healCheck.action === "recover") {
                                // Auto-scroll
                                try {
                                    const wv = webviewRef.current as any;
                                    await wv?.executeJavaScript?.('window.scrollBy(0, 300)', true);
                                    await new Promise(r => setTimeout(r, 500));
                                } catch { /* */ }

                                stepsRef.current = [...stepsRef.current, healCheck.recoveryStep];
                                setAgentState(prev => ({
                                    ...prev,
                                    steps: stepsRef.current,
                                    currentAction: healCheck.statusMessage,
                                }));
                                return true; // Continue loop with fresh data
                            }

                            const stuckCheck = checkStuckDetection(prevSteps);
                            if (stuckCheck.action === "stop") {
                                applySafetyStop(stuckCheck.reason, stuckCheck.statusMessage);
                                return false;
                            }

                            // ── Execute action ──────────────
                            debug.log(`▶️ [Exec] Dispatching ${action}...`);
                            const ctx = buildActionContext();
                            const result = await executeAction(action, args, ctx);
                            debug.log(`◀️ [Exec] Result: ${result.substring(0, 120)}`);

                            if (result === '__GENUI_DONE__') return false;

                            // ── DOM diff after action ───────
                            let domDiffSuffix = '';
                            if (domHashBefore && ["click", "click_at"].includes(action)) {
                                try {
                                    await new Promise(r => setTimeout(r, 800));
                                    const wv = webviewRef.current as any;
                                    const domHashAfter = await wv?.executeJavaScript?.(
                                        `document.querySelectorAll('*').length + '|' + document.title + '|' + location.href`,
                                        true,
                                    ) ?? '';
                                    if (domHashAfter && domHashAfter === domHashBefore) {
                                        domDiffSuffix = ' ⚠️ [NO DOM CHANGE] — Your action may have targeted the wrong element. Take a fresh look at the screenshot and try a DIFFERENT element or approach. Do NOT repeat the same action.';
                                        debug.log('🔍 [Critic] DOM unchanged after action — soft warning with guidance');
                                    }
                                } catch { /* */ }
                            }

                            // ── Record step ─────────────────
                            const step: AgentStep = {
                                action,
                                selector: args.selector,
                                value: args.text,
                                description: args.description || action,
                                result: result + domDiffSuffix,
                            };
                            stepsRef.current = [...stepsRef.current, step];
                            debug.log(`📝 [Step ${stepNum}] ${action}: ${(result + domDiffSuffix).substring(0, 100)}`);
                            debug.log(`🎯 ════════════ END STEP ${stepNum} ════════════\n`);
                            setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

                            await waitForPageReady('post-action');
                            return true; // Continue loop
                        }

                        if (event.type === "error") {
                            setAgentState(prev => ({
                                ...prev,
                                status: "error",
                                currentAction: `❌ ${event.message}`,
                            }));
                            return false;
                        }
                    } catch { /* skip malformed */ }
                }
            }
        } catch (err) {
            debug.log("🤖 [Agent] Step error:", err);
            setAgentState(prev => ({
                ...prev,
                status: "error",
                currentAction: "❌ Connection failed",
            }));
            return false;
        }

        return false;
    }, [webviewRef, captureDomSnapshot, captureScreenshot, waitForPageReady, buildActionContext, applySafetyStop]);

    // ─── Start the agent ────────────────────────────────────
    const startAgent = useCallback(async (task: string) => {
        abortRef.current = false;
        stepsRef.current = [];

        setAgentState({
            status: "running",
            steps: [],
            currentAction: "🚀 Starting...",
            pauseQuestion: null,
            cursorPos: null,
            lastWorkflowId: null,
        });

        currentTaskRef.current = task;

        let stepCount = 0;
        let shouldContinue = true;
        let consecutiveFailures = 0;

        while (shouldContinue && !abortRef.current && stepCount < MAX_STEPS) {
            stepCount++;
            shouldContinue = await runStep(task);

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
            }));
        }

        // Auto-dismiss errors after 8s
        setTimeout(() => {
            setAgentState(prev => {
                if (prev.status === "error") {
                    return { ...prev, status: "idle", currentAction: "", pauseQuestion: null };
                }
                if (prev.status === "done" && !prev.lastWorkflowId) {
                    return { ...prev, status: "idle", currentAction: "", pauseQuestion: null };
                }
                return prev;
            });
        }, 8000);
    }, [runStep]);

    // ─── Continue after pause ───────────────────────────────
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
            shouldContinue = await runStep(task);
        }
    }, [runStep]);

    // ─── Stop the agent ─────────────────────────────────────
    const stopAgent = useCallback(() => {
        abortRef.current = true;
        setAgentState(prev => ({
            ...prev,
            status: "idle",
            currentAction: "",
            pauseQuestion: null,
        }));
    }, []);

    // ─── Memory feedback ────────────────────────────────────
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
