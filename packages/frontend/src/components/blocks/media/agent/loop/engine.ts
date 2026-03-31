// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Engine ────────────────────────────────────────────
// Pure async function — one step of the agent loop.
// NO React hooks, NO useState, NO useRef — all state access via EngineContext.
// The hook (useAgentActions.ts) is the ONLY place that reads/writes React state.

import { debug } from "../../../../../utils/debug";
import type { AgentStep, EngineContext } from "../types";
import { MAX_STEPS } from "../constants";
import { executeAction } from "../actions/index";
import { checkMaxSteps } from "../safety";
import { waitForPageReady, captureDomSnapshot, captureVisionFrame, captureScreenshot } from "./webviewUtils";
import { verifyActionEffect, buildSonarRecoveryStep } from "./visualVerifier";
import { useContextStore } from "../../../../../stores/useContextStore";
// DEAD-1 removed: StateEngine + PerceptionEngine (imported but never instantiated — Zeno-Freeze disabled)

// Fix #4 — CDP Health-Check Cache
// Once the CDP bridge is confirmed for a given wcId, no need to re-check every step.
// This avoids a full round-trip CDP call per step (saves 50-200ms on each).
const _cdpHealthyIds = new Set<number>();

// ─── runStep ─────────────────────────────────────────────────
// Executes one complete step: page-state → LLM call → action → record.
// Returns true to continue the loop, false to stop.

export async function runStep(task: string, ctx: EngineContext): Promise<boolean> {
    const { wv, stepSomRef, abortRef, stepsRef, crudPlanRef, currentTaskRef, cardId, setAgentState, lastFailedIdRef } = ctx;

    if (abortRef.current) return false;

    // ── CRITICAL: Resolve wcId fresh at the START of each step ──
    // Do NOT use ctx.wcId (may be 0 if webview wasn't ready when context was built).
    // getWebContentsId() is synchronous on Electron webview tag.
    let wcId = ctx.wcId;
    try {
        if (wv?.getWebContentsId) {
            const freshId = wv.getWebContentsId();
            if (typeof freshId === 'number' && freshId > 0) {
                wcId = freshId;
            }
        }
    } catch { /* webview not ready yet */ }

    console.log(`🔍 [ENGINE] Step start — wcId=${wcId} wcId_from_ctx=${ctx.wcId} wv=${!!wv}`);
    const electronAPI = (window as any).electronAPI;
    console.log(`🔍 [ENGINE] electronAPI.cdpSend=${!!electronAPI?.cdpSend} cdpAttach=${!!electronAPI?.cdpAttach}`);

    // Fix #4: Only run CDP health check once per wcId (cached) — not every step
    if (wcId > 0 && electronAPI?.cdpSend && !_cdpHealthyIds.has(wcId)) {
        try {
            const versionResp = await electronAPI.cdpSend(wcId, 'Browser.getVersion', {});
            console.log(`✅ [CDP] Bridge OK — chromium: ${versionResp?.result?.product ?? 'unknown'}`);
            _cdpHealthyIds.add(wcId); // Cache: don't re-check this wcId again
        } catch (e) {
            console.error(`❌ [CDP] Bridge FAILED at step start:`, e);
        }
    }

    // ── Phase 1A: Pre-Flight Router ─────────────────────────────────────────
    // BEFORE any expensive DOM capture, read URL/title (cheap JS eval ~10ms)
    // and run the Intent Pre-Resolver.
    // If we can fast-path (direct URL navigation), we skip DOM + Screenshot entirely.
    // This cuts Step 1 latency from ~4s to ~1.5s for all "open X" tasks.

    // Step PF-1: Cheap page state read (always needed, very fast)
    let pageUrl = '', pageTitle = '';
    try {
        const pageData = await wv?.executeJavaScript(`JSON.stringify({ url: location.href, title: document.title })`, true);
        const parsed = JSON.parse(pageData);
        pageUrl = parsed.url || '';
        pageTitle = parsed.title || '';
    } catch { /* webview may not be ready */ }

    debug.log(`⚡ [PreFlight] URL=${pageUrl.substring(0, 60)}`);

    // Step PF-2: Direct-URL Fast-Path (Vision-First — no hardcoded app list)
    // If task contains a direct URL → navigate immediately, skip LLM call for step 1.
    // Lura navigates to everything else herself (via Google or by typing the URL).
    if (stepsRef.current.length === 0) {
        const directUrlMatch = task.match(/https?:\/\/[^\s]+/i);
        if (directUrlMatch && !pageUrl.startsWith(directUrlMatch[0].replace(/\/+$/, ''))) {
            const targetUrl = directUrlMatch[0];
            debug.log(`⚡ [PreFlight] Direct URL in task → navigate ${targetUrl}`);
            setAgentState(prev => ({ ...prev, currentAction: `⚡ → ${targetUrl}` }));

            const eAPI = (window as any).electronAPI;
            const fastCtx = {
                wv, wcId,
                waitForPageReady: (lbl: string) => waitForPageReady(wv, lbl, 400),
                getSteps: () => stepsRef.current,
                getStructuredData: () => ctx.structuredDataRef.current,
                addStructuredData: (data: any[]) => { ctx.structuredDataRef.current = [...ctx.structuredDataRef.current, ...data]; },
                isAborted: () => abortRef.current,
                getSomEntry: (id: number) => stepSomRef.current.get(id),
                cdpClick: async (x: number, y: number) => {
                    const { cdpClick: doCdpClick } = await import('../actions/cdpUtils');
                    await doCdpClick(eAPI, wcId, x, y);
                },
                cdpSend: async (method: string, params?: object) =>
                    eAPI?.cdpSend ? eAPI.cdpSend(wcId, method, params) : { ok: false, error: 'no cdp' },
                updateCursorPos: (x: number, y: number) => { setAgentState(prev => ({ ...prev, cursorPos: { x, y } })); },
            };

            const navResult = await executeAction('navigate', { url: targetUrl }, fastCtx);
            if (!navResult.isAborted && !abortRef.current) {
                stepsRef.current = [{ action: 'navigate', description: `Navigate to ${targetUrl}`, result: navResult.logMessage, didNavigate: true }];
                setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: `🌐 Loading...` }));
                await waitForPageReady(wv, 'post-direct-navigate', 1200);
                return true;
            }
        }
    }

    // Step PF-3: waitForPageReady (only reached if no fast-path was taken)
    const ready = await waitForPageReady(wv, 'step-start', 400);
    if (!ready) {
        setAgentState(prev => ({ ...prev, status: 'error', currentAction: '❌ Webview not available' }));
        return false;
    }

    // Step PF-4: Full DOM Capture (only when needed — Pre-Flight didn't short-circuit)
    // NOTE: Zeno-Freeze (Debugger.pause) is NOT used here.
    // DOMSnapshot.captureSnapshot hangs when JS is paused via Debugger.pause.
    // DEAD-1: stateEngine const removed — Zeno-Freeze permanently disabled.

    let domSnapshot = await captureDomSnapshot(wv, wcId, stepSomRef, lastFailedIdRef.current);
    let cleanScreenshotBefore = await captureScreenshot(wv); // 👈 Fix 1: Clean snapshot for Sonar
    let screenshot = await captureVisionFrame(wv, stepSomRef.current, lastFailedIdRef.current);

    setAgentState(prev => ({ ...prev, currentAction: '🧠 Analyzing page...' }));

    // ── LLM call ──
    try {
        // VISION-FIRST: Build a short semantic legend from the SoM map
        // (replaces the 400-element DOM text dump).
        // The legend is the ground-truth for Box IDs — LLM combines it with
        // the screenshot for 99.9% accurate targeting (Refinement #1).
        const { buildSomLegend } = await import('./webviewUtils');
        // Kinetic Sonar: 40-entry semantic anchor (100-150 tokens — no DOM dump)
        const somLegend = buildSomLegend(stepSomRef.current, 40);

        const fetchOpts: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                page_url: pageUrl,
                page_title: pageTitle,
                som_legend: somLegend,
                screenshot,
                // dom_snapshot removed (Phase 1 Purge) — LLM is vision-only
                history: stepsRef.current,
                step_number: stepsRef.current.length + 1,
                max_steps: MAX_STEPS,
                method: crudPlanRef.current.method,
                allowed_tools: crudPlanRef.current.allowed_tools,
                forbidden: crudPlanRef.current.forbidden,
                system_context: crudPlanRef.current.system_context || null,
                domain_knowledge: crudPlanRef.current.domain_knowledge || null,
            }),
        };
        if (ctx.abortController?.signal) {
            (fetchOpts as any).signal = ctx.abortController.signal;
        }

        // Phase 3A (NeuroSymbolic Compiled Replay) permanently deleted (Phase 1 Purge).
        // Vision-First: LLM always decides from screenshot. No compiled scripts.

    const response = await fetch('http://localhost:3001/api/agents/act', fetchOpts);

        if (!response.ok || !response.body) {
            setAgentState(prev => ({ ...prev, status: 'error', currentAction: '❌ Backend error' }));
            return false;
        }

        // ── Read SSE response ──
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // BUG-2: try/finally ensures reader.cancel() on abort, early return, or exception
        try {
            while (true) {
                const { done, value } = await reader.read();

                // LOGIC-4: flush TextDecoder on stream end — without this, the last SSE
                // event is stuck in the decoder buffer and never processed if stream
                // ends without a trailing newline.
                if (done) {
                    const tail = decoder.decode(); // flush (no stream:true = final flush)
                    if (tail) buffer += tail;
                } else {
                    // Abort check — reader.cancel() handled by finally block below
                    if (abortRef.current) return false;
                    buffer += decoder.decode(value, { stream: true });
                }

                const lines = buffer.split('\n');
                buffer = done ? '' : (lines.pop() || '');

                for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const dataStr = line.slice(6).trim();
                if (!dataStr) continue;

                try {
                    const event = JSON.parse(dataStr);

                    if (event.type === 'thinking') {
                        debug.log(`🧠 [LLM] Thinking: ${event.content}`);
                        setAgentState(prev => ({ ...prev, currentAction: `🧠 ${event.content}` }));
                    }

                    if (event.type === 'action') {
                        const { action, args = {} } = event;
                        // Fix 2: ReAct Amnesia (Destructure thoughts securely from ANY level)
                        const state_evaluation = event.state_evaluation || args.state_evaluation || event.analysis?.state_evaluation || args.analysis?.state_evaluation;
                        const step_by_step_plan = event.step_by_step_plan || args.step_by_step_plan || event.analysis?.step_by_step_plan || args.analysis?.step_by_step_plan;
                        const next_action_justification = event.next_action_justification || args.next_action_justification || event.analysis?.next_action_justification || args.analysis?.next_action_justification;

                        if (state_evaluation) debug.log(`🧠 [State]: ${state_evaluation}`);
                        if (step_by_step_plan) debug.log(`📋 [Plan]: ${step_by_step_plan}`);
                        if (next_action_justification) debug.log(`💡 [Logic]: ${next_action_justification}`);

                        const stepNum = stepsRef.current.length + 1;
                        debug.log(`\n🎯 ════════════ STEP ${stepNum}/${MAX_STEPS} ════════════`);
                        debug.log(`🎯 [Action] ${action}`, JSON.stringify(args, null, 2));

                        // ── Terminal: done — Assertion Engine ──────────────────
                        // The LLM declares done(). Before accepting, we verify
                        // its assertions deterministically. No hallucination passes.
                        if (action === 'done') {
                            const summary = args.summary || 'Task complete';
                            const assertText: string | undefined = args.assert_text;
                            const assertSelector: string | undefined = args.assert_selector;
                            const assertUrl: string | undefined = args.assert_url_contains;

                            // ── Run deterministic assertion checks ──────────────
                            const hasAnyAssertion = assertText || assertSelector || assertUrl;
                            let assertionFailed = false;
                            let assertionFeedback = '';

                            if (hasAnyAssertion) {
                                debug.log(`🔍 [AssertionEngine] Verifying done() — text="${assertText}" sel="${assertSelector}" url="${assertUrl}"`);
                                setAgentState(prev => ({ ...prev, currentAction: '🔍 Verifying result...' }));

                                try {
                                    // Check 1: assert_text — must appear in page body text
                                    if (assertText && !assertionFailed) {
                                        const found = await wv?.executeJavaScript(
                                            `document.body.innerText.toLowerCase().includes(${JSON.stringify(assertText.toLowerCase())})`,
                                            true
                                        );
                                        if (!found) {
                                            assertionFailed = true;
                                            const snippet = await wv?.executeJavaScript(
                                                `document.body.innerText.substring(0, 300)`,
                                                true
                                            ).catch(() => '[could not read]');
                                            assertionFeedback = `assert_text FAILED: "${assertText}" not found in page.\nCurrent page text starts with: "${snippet}"`;
                                        }
                                    }

                                    // Check 2: assert_selector — element must exist
                                    if (assertSelector && !assertionFailed) {
                                        const safeSelector = assertSelector.replace(/`/g, '');
                                        const found = await wv?.executeJavaScript(
                                            `!!document.querySelector(\`${safeSelector}\`)`,
                                            true
                                        );
                                        if (!found) {
                                            assertionFailed = true;
                                            assertionFeedback = `assert_selector FAILED: "${assertSelector}" not found in DOM.\nThe expected element does not exist yet.`;
                                        }
                                    }

                                    // Check 3: assert_url_contains — URL must contain fragment
                                    if (assertUrl && !assertionFailed) {
                                        const currentUrl: string = await wv?.executeJavaScript(`location.href`, true) ?? '';
                                        if (!currentUrl.toLowerCase().includes(assertUrl.toLowerCase())) {
                                            assertionFailed = true;
                                            assertionFeedback = `assert_url_contains FAILED: "${assertUrl}" not in current URL.\nCurrent URL: "${currentUrl}"`;
                                        }
                                    }
                                } catch (assertErr) {
                                    // Assertion check itself crashed — non-fatal, let done() through
                                    debug.log(`⚠️ [AssertionEngine] Check error (non-fatal, allowing done): ${assertErr}`);
                                    assertionFailed = false;
                                }
                            }

                            // ── Assertion failed → REJECT done() ───────────────
                            if (assertionFailed) {
                                // BUG-5 FIX: After 3 assertion rejections, the task genuinely failed.
                                // We MUST NOT save a poisoned trajectory to workflow memory.
                                // TERMINATE_FAILED: hard stop, no DB write, not marked as success.
                                const priorRejections = stepsRef.current.filter(
                                    (s: AgentStep) => s.action === 'system_recovery' && s.result?.includes('ASSERTION FAILED')
                                ).length;

                                if (priorRejections >= 3) {
                                    debug.log(`⛔ [AssertionEngine] 3 rejections — TERMINATE_FAILED. Blocking DB write to prevent memory poisoning.`);
                                    const failedStep: AgentStep = {
                                        action: 'done',
                                        description: `⛔ Task failed after 3 assertion cycles. The expected UI state was never confirmed. Workflow trace will NOT be saved to prevent memory poisoning.`,
                                    };
                                    stepsRef.current = [...stepsRef.current, failedStep];
                                    setAgentState(prev => ({
                                        ...prev,
                                        status: 'error',                // ← 'error' not 'done' — no success state
                                        steps: stepsRef.current,
                                        currentAction: `⛔ Task failed — assertion never passed`,
                                        pauseQuestion: null,
                                        cursorPos: null,
                                    }));
                                    return false; // ← HARD STOP. The auto-save block below is NEVER reached.
                                }

                                debug.log(`❌ [AssertionEngine] done() REJECTED (${priorRejections + 1}/3) — ${assertionFeedback}`);
                                const rejectionStep: AgentStep = {
                                    action: 'system_recovery',
                                    description: `⛔ ASSERTION ENGINE: done() REJECTED.\n${assertionFeedback}\n\nThe task is NOT complete. The UI has not yet confirmed the expected result. Continue working: check the current screen state and take the necessary action to reach the goal.`,
                                    result: `ASSERTION FAILED: ${assertionFeedback.substring(0, 100)}`,
                                };
                                stepsRef.current = [...stepsRef.current, rejectionStep];
                                setAgentState(prev => ({
                                    ...prev,
                                    steps: stepsRef.current,
                                    currentAction: `⛔ Assertion failed (${priorRejections + 1}/3) — continuing...`,
                                }));
                                return true; // continue the loop — LLM must try again
                            }

                            // ── Assertion passed (or no assertion) → accept done() ──
                            debug.log(`✅ [AssertionEngine] done() accepted — ${hasAnyAssertion ? 'assertions passed' : 'no assertions (research task)'}`);
                            const step: AgentStep = { action: 'done', description: summary };
                            stepsRef.current = [...stepsRef.current, step];
                            setAgentState(prev => ({
                                ...prev,
                                status: 'done',
                                steps: stepsRef.current,
                                currentAction: `✅ ${summary}`,
                                pauseQuestion: null,
                                cursorPos: null,
                            }));

                            // ── Auto-save workflow (Memory V2 — Kinetic Sonar Quality Gate) ──────────
                            // Memory V2 contract:
                            //   CLEAN workflow   = 0 sonar_recovery steps AND 0 system_recovery steps
                            //                   → saved, eligible for compiled replay
                            //   DEGRADED workflow= has sonar_recovery steps (wasted clicks caught by Sonar)
                            //                   → saved but flagged, Librarian analyses for improvement
                            //   LOOP-ABORT       = done() called because stuck/max-steps
                            //                   → NEVER saved (would poison memory)
                            //
                            // This is the Memory Poisoning firewall.
                            // A workflow that burned clicks cannot be promoted to compiled replay.

                            const isLoopAbort = summary.includes('got stuck')
                                || summary.includes('maximum step limit')
                                || summary.includes('different approach')
                                || summary.includes('assertion never passed');

                            if (!isLoopAbort) {
                                try {
                                    const pageUrlFinal = await wv?.executeJavaScript?.('location.href', true) ?? '';
                                    const domain = pageUrlFinal ? new URL(pageUrlFinal).hostname.replace(/^www\./, '') : '';
                                    if (domain && currentTaskRef.current) {
                                        // ── Sonar Quality Audit ──────────────────────────────────────
                                        const allSteps = stepsRef.current as AgentStep[];
                                        const recoverySteps = allSteps.filter(
                                            (s) => s.action === 'system_recovery'
                                        ).length;
                                        const sonarRecoverySteps = allSteps.filter(
                                            (s) => s.action === 'system_recovery' &&
                                            s.description?.startsWith('🔊 [KINETIC SONAR]')
                                        ).length;
                                        const genuineRecoverySteps = recoverySteps - sonarRecoverySteps;

                                        // Quality tier for Librarian
                                        const qualityTier = sonarRecoverySteps === 0 && genuineRecoverySteps === 0
                                            ? 'clean'          // Perfect run — eligible for compiled replay
                                            : sonarRecoverySteps > 0
                                                ? 'degraded'   // Had wasted clicks — needs Librarian analysis
                                                : 'recovered';  // Had LLM confusion but self-corrected

                                        debug.log(`🧠 [Memory V2] Quality: ${qualityTier} | sonar=${sonarRecoverySteps} genuine=${genuineRecoverySteps}`);

                                        const controller = new AbortController();
                                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                                        const resp = await fetch('/api/agents/memory/save', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                domain,
                                                task: currentTaskRef.current,
                                                steps: allSteps,
                                                url: pageUrlFinal,
                                                recoverySteps: genuineRecoverySteps, // V3: Librarian only sees genuine recoveries
                                                sonarRecoverySteps,                  // V4: Sonar hit count
                                                qualityTier,                         // V4: 'clean' | 'degraded' | 'recovered'
                                            }),
                                            signal: controller.signal
                                        }).finally(() => clearTimeout(timeoutId));

                                        const data = await resp.json();
                                        if (data.workflow_id > 0) {
                                            setAgentState(prev => ({ ...prev, lastWorkflowId: data.workflow_id }));
                                            debug.log(`🧠 [Memory V2] Saved workflow #${data.workflow_id} [${qualityTier}] (sonar=${sonarRecoverySteps} genuine=${genuineRecoverySteps})`);
                                        }
                                    }
                                } catch (e) {
                                    debug.log('🧠 [Memory] Save error (non-fatal):', e);
                                }
                            }

                            // Post summary to chat log
                            useContextStore.getState().setHints(prev => [
                                ...prev,
                                {
                                    query: `🤖 ${currentTaskRef.current.slice(0, 60)}${currentTaskRef.current.length > 60 ? '...' : ''}`,
                                    reason: 'system',
                                    loading: false,
                                    timestamp: Date.now(),
                                    data: { summary: `✅ ${summary}` },
                                },
                            ]);
                            return false;
                        }

                        // ── Terminal: ask_user ──
                        if (action === 'ask_user') {
                            const step: AgentStep = { action: 'ask_user', description: args.question || 'Waiting for user input' };
                            stepsRef.current = [...stepsRef.current, step];
                            setAgentState(prev => ({
                                ...prev,
                                status: 'paused',
                                steps: stepsRef.current,
                                currentAction: `⏸️ ${args.question}`,
                                pauseQuestion: args.question || 'Continue?',
                                cursorPos: null,
                            }));
                            return false;
                        }

                        // ── Ghost Mouse cursor (reads from stepSomRef — no JS injection) ──
                        let cursorX = args.x ?? 0;
                        let cursorY = args.y ?? 0;
                        if (args.id !== undefined && args.id !== null && cursorX === 0 && cursorY === 0) {
                            const entry = stepSomRef.current.get(Number(args.id));
                            if (entry) { cursorX = entry.x; cursorY = entry.y; }
                        }
                        if (['click_at', 'click', 'type_text'].includes(action) && (cursorX > 0 || cursorY > 0)) {
                            setAgentState(prev => ({ ...prev, cursorPos: { x: cursorX, y: cursorY } }));
                        } else if (['scroll', 'navigate', 'go_back'].includes(action)) {
                            try {
                                const bounds = wv?.getBoundingClientRect?.();
                                if (bounds) setAgentState(prev => ({ ...prev, cursorPos: { x: Math.round(bounds.width / 2), y: Math.round(bounds.height / 2) } }));
                            } catch { /* */ }
                        }

                        setAgentState(prev => ({
                            ...prev,
                            currentAction: `🖱️ [${stepNum}/${MAX_STEPS}] ${args.description || action}`,
                        }));

                        // ── Safety check (Kinetic Sonar: only max-steps guard remains) ──
                        const prevSteps = stepsRef.current;

                        const maxCheck = checkMaxSteps(prevSteps);
                        if (maxCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: maxCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: maxCheck.statusMessage, pauseQuestion: null, cursorPos: null }));
                            return false;
                        }

                        // ── Build ActionContext for executor ──
                        const electronAPI = (window as any).electronAPI;
                        const actionCtx = {
                            wv,
                            wcId,
                            waitForPageReady: (label: string) => waitForPageReady(wv, label),
                            getSteps: () => stepsRef.current,
                            getStructuredData: () => ctx.structuredDataRef.current,
                            addStructuredData: (data: any[]) => {
                                ctx.structuredDataRef.current = [...ctx.structuredDataRef.current, ...data];
                            },
                            isAborted: () => abortRef.current,
                            getSomEntry: (id: number) => stepSomRef.current.get(id),
                            cdpClick: async (x: number, y: number) => {
                                const { cdpClick: doCdpClick } = await import('../actions/cdpUtils');
                                await doCdpClick(electronAPI, wcId, x, y);
                            },
                            cdpSend: async (method: string, params?: object) =>
                                electronAPI?.cdpSend ? electronAPI.cdpSend(wcId, method, params) : { ok: false, error: 'no cdp' },
                            updateCursorPos: (x: number, y: number) => {
                                setAgentState(prev => ({ ...prev, cursorPos: { x, y } }));
                            },
                        };

                        // ── HOTFIX-1: Freeze pre-click state (Simplified) ─────────────────────────
                        const preClickUrl = (() => { try { return wv?.getURL?.() || ''; } catch { return ''; } })();

                        // ── Pre-Click Disabled Guard ───────────────────────────────────────
                        // Before executing a click, verify the target element is not disabled.
                        // The DOM snapshot parser already reads aria-disabled/disabled attributes
                        // and prefixes the SoM name with "[DISABLED]". We block the click here
                        // and inject a system_recovery so the LLM knows it picked the wrong target.
                        if (['click', 'click_at', 'vision_click'].includes(action) && args.id !== undefined) {
                            const targetEntry = stepSomRef.current.get(Number(args.id));
                            if (targetEntry?.name?.includes('[DISABLED]')) {
                                debug.log(`🚫 [DisabledGuard] Blocked click on disabled element [${args.id}] "${targetEntry.name}"`);
                                const disabledRecovery: AgentStep = {
                                    action: 'system_recovery',
                                    description: `🚫 [DISABLED ELEMENT] You tried to click element [${args.id}] "${targetEntry.name?.replace('[DISABLED] ', '')}" but it is DISABLED (greyed out).
REASON: This button/element cannot be clicked in its current state.
COMMON CAUSES:
  1. A required form field above is empty — fill it in first
  2. A prerequisite action hasn't been completed yet
  3. You need to type text into an input field before the submit button activates
REQUIRED ACTION: Look at the screenshot. Find what is missing or empty ABOVE this button and fill it in first. Do NOT click the disabled element again.`,
                                    result: `BLOCKED: click on [DISABLED] element [${args.id}] "${targetEntry.name?.substring(0, 60)}"`,
                                };
                                stepsRef.current = [...stepsRef.current, disabledRecovery];
                                setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: `🚫 Blocked: target element is disabled — fixing...` }));
                                return true; // Continue the loop — LLM must choose a different action
                            }
                        }

                        // ── Execute action ──
                        console.log(`🚀 [ENGINE] Dispatching action="${action}" with wcId=${wcId} somSize=${stepSomRef.current.size} cdpSend=${!!electronAPI?.cdpSend} args=`, JSON.stringify(args));
                        debug.log(`▶️ [Exec] Dispatching ${action}...`);
                        const actionResult = await executeAction(action, args, actionCtx);

                        console.log(`◀️ [ENGINE] Action result: ${actionResult.logMessage}`);
                        debug.log(`◀️ [Exec] Result: ${actionResult.logMessage.substring(0, 120)}`);

                        // Record exact failed ID to flag in future SoM
                        const isFailed = actionResult.logMessage.includes('❌') || actionResult.logMessage.includes('failed');
                        if (isFailed && args.id !== undefined && args.id !== null) {
                            lastFailedIdRef.current = Number(args.id);
                        } else {
                            lastFailedIdRef.current = null;
                        }


                        // ── Guard: abort mid-flight (Pre-flight Fix 2) ──
                        if (actionResult.isAborted || abortRef.current) {
                            debug.log('🛑 Action execution aborted mid-flight — discarding step');
                            return false; // Loop ends, step NOT recorded
                        }

                        // ── Terminal: genui (Pre-flight Fix 3: include cardId) ──
                        if (actionResult.isTerminal) {
                            if (actionResult.data?.blocks) {
                                window.dispatchEvent(new CustomEvent('biamos:genui-blocks', {
                                    detail: {
                                        blocks: actionResult.data.blocks,
                                        prompt: actionResult.data.prompt,
                                        cardId: cardId ?? null, // Pre-flight Fix 3: routing to correct card
                                    },
                                }));
                            }
                            const genUiStep: AgentStep = { action: 'done', description: actionResult.logMessage };
                            stepsRef.current = [...stepsRef.current, genUiStep];
                            setAgentState(prev => ({
                                ...prev,
                                status: 'done',
                                steps: stepsRef.current,
                                currentAction: `✅ ${actionResult.logMessage}`,
                                pauseQuestion: null,
                                cursorPos: null,
                            }));
                            return false;
                        }

                        // ── Adaptive post-action wait — navigate: 1200ms, scroll: 150ms, type: 400ms, click: 600ms
                        const postSilenceMs = (action === 'navigate' || action === 'go_back') ? 1200
                            : action === 'scroll' ? 150
                            : action === 'type_text' ? 400
                            : 600;
                        await waitForPageReady(wv, 'post-action', postSilenceMs);

                        // ── SPA Navigation Detector ──────────────────────────────────────────
                        // Detect URL changes via History.pushState (YouTube, React SPAs etc.)
                        // that don't fire a WebContents didNavigate event. Without this, the LLM
                        // sees "no navigation" after clicking YouTube's search button → retries 3-4×.
                        let spaNavigated = false;
                        if (!actionResult.didNavigate) {
                            try {
                                const postActionUrl = wv?.getURL?.() || '';
                                if (postActionUrl && preClickUrl && postActionUrl !== preClickUrl) {
                                    spaNavigated = true;
                                    debug.log(`🔀 [SPA Nav] ${preClickUrl} → ${postActionUrl}`);
                                }
                            } catch { /* non-fatal */ }
                        }

                        // ── Record step ──
                        let cleanResult = actionResult.logMessage;
                        const structIdx = cleanResult.indexOf('__STRUCTURED__');
                        if (structIdx >= 0) cleanResult = cleanResult.substring(0, structIdx).trim();

                        // Inject SPA navigation signal into cleanResult so LLM knows the click worked
                        if (spaNavigated) {
                            const postUrl = (() => { try { return wv?.getURL?.() || ''; } catch { return ''; } })();
                            cleanResult += ` ✅ [PAGE NAVIGATED] URL changed to: ${postUrl} — your click succeeded. Do NOT click the same element again. Proceed to the next step.`;
                        }

                        // Flag for engine-side auto-termination (set by Fix B below).
                        // When set, the engine calls done() immediately after recording the step
                        // WITHOUT asking the LLM — prevents muscle-memory from overriding success.
                        let _autoTerminate: string | null = null;

                        // ── Fix A: [ALREADY THERE] false-positive guard ─────────────────────────────────
                        // [ALREADY THERE] only makes sense on 2nd+ click of the SAME element.
                        // The 1st click on a submit/toggle button might just need a moment to process.
                        // Downgrade to [DOM STABLE] so the LLM retries once before giving up.
                        if (cleanResult.includes('[ALREADY THERE]') && action === 'click' && args.id !== undefined) {
                            const prevStep = stepsRef.current[stepsRef.current.length - 1];
                            // Fix 5: ALREADY THERE guard using secure string comparison
                            const prevWasSameClick = prevStep?.action === 'click' && prevStep?.value === String(args.id);
                            if (!prevWasSameClick) {
                                // First click on this element — give it one more chance
                                cleanResult = actionResult.logMessage +
                                    ' ℹ️ [DOM STABLE] Click registered, no immediate page navigation. ' +
                                    'If this is a submit/send button, try clicking once more to confirm it was received. ' +
                                    'If you are already on the target page (e.g. sidebar link), proceed with the actual task directly.';
                            }
                        }



                        let cssSelector = args.selector;
                        if (!cssSelector && args.id !== undefined && args.id !== null) {
                            const entry = stepSomRef.current.get(Number(args.id));
                            if (entry) cssSelector = entry.name || entry.role;
                        }

                        // Semantic Fingerprint Injection removed (Phase 1 Purge — FingerprintGuard deleted).
                        const finalDesc = args.description || action;

                        const step: AgentStep = {
                            action,
                            selector: cssSelector,
                            // Fix 4/2: Save direction for scroll loop detector & persist ReAct thoughts
                            value: args.text ?? args.direction ?? (args.id !== undefined ? String(args.id) : undefined),
                            description: finalDesc,
                            result: cleanResult,
                            didNavigate: actionResult.didNavigate === true ? true : undefined,
                            state_evaluation,
                            step_by_step_plan,
                            next_action_justification
                        };
                        stepsRef.current = [...stepsRef.current, step];
                        debug.log(`📝 [Step ${stepNum}] ${action}: ${cleanResult.substring(0, 100)}`);
                        debug.log(`🎯 ════════════ END STEP ${stepNum} ════════════\n`);
                        setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

                        // ── Phase 2: Kinetic Sonar — Post-Action Visual Verification ──
                        // Only for DOM-mutating actions (click, type_text) — not for navigations.
                        const SONAR_ACTIONS = new Set(['click', 'click_at', 'type_text', 'scroll', 'vision_click']);
                        if (SONAR_ACTIONS.has(action) && !spaNavigated && !actionResult.didNavigate) {
                            try {
                                const screenshotAfterAction = await captureScreenshot(wv);
                                const verifyResult = await verifyActionEffect(
                                    cleanScreenshotBefore,  // Fix 1: Use clean image for baseline diffing
                                    screenshotAfterAction,
                                    action,
                                );
                                debug.log(`🔊 [Sonar] ${verifyResult.message}`);

                                if (!verifyResult.changed) {
                                    // Action had no effect — inject recovery BEFORE next LLM call
                                    const recoveryStep = buildSonarRecoveryStep(action, args, verifyResult.changePct);
                                    stepsRef.current = [...stepsRef.current, recoveryStep];
                                    setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: '🔊 Sonar: Aktion wirkungslos — Strategie ändern' }));
                                    debug.log(`🔊 [Sonar] Recovery step injected for ${action}`);
                                }
                            } catch (sonarErr) {
                                debug.log(`⚠️ [Sonar] Diff-Fehler (non-fatal): ${sonarErr}`);
                            }
                        }

                        // ── Workflow-Level Loop Detector (Generic — no domain tuning) ────────
                        // Sonar catches "pixel-level wasted actions".
                        // This catches "strategic loops" — same (action + target) repeated N times,
                        // even when each individual action visually "worked" (changed pixels).
                        // e.g. agent clicks comment box 3 times believing it's not focused.
                        //
                        // Progressive penalty system:
                        //   2 repeats → WARNING injected into history
                        //   3 repeats → HARD CONSTRAINT (do NOT try this again)
                        //   4 repeats → escalate to ask_user (human-in-the-loop)
                        {
                            // Fingerprint: action + element id (preferred) or value or description
                            // Fingerprint: action + element id (preferred) or value or direction
                            // NOTE: step.value stores args.id as string for click actions
                            const actionKey = `${action}:${args.id ?? args.text ?? args.direction ?? args.description ?? ''}`;
                            const allSteps = stepsRef.current;
                            
                            const WINDOW = 8; // Look at last 8 steps
                            const recent = allSteps.slice(-WINDOW);
                            const repeatCount = recent.filter(s => {
                                const sKey = `${s.action}:${s.value ?? s.description ?? ''}`;
                                return sKey === actionKey && s.action !== 'system_recovery';
                            }).length;

                            // Scrolling is a natural sequential action. If the page doesn't move, 
                            // Sonar catches it (0.0% change). We only need to prevent infinite scrolling loops.
                            const limitWarn = action === 'scroll' ? 6 : 2;
                            const limitHard = action === 'scroll' ? 8 : 3;
                            const limitAsk  = action === 'scroll' ? 10 : 4;

                            if (repeatCount >= limitAsk) {
                                // Escalate to Ask-Boss — human must intervene
                                debug.log(`🔄 [LoopDetector] ESCALATE after ${repeatCount} repeats of "${actionKey}" → ask_user`);
                                const askStep: AgentStep = {
                                    action: 'system_recovery',
                                    description: `🚨 [LOOP ESCALATION] "${action}" has been attempted ${repeatCount} times without progress. The agent cannot proceed autonomously. Calling ask_user to get human guidance.`,
                                    result: 'ESCALATED: Same action repeated 4+ times. Human input required.',
                                };
                                stepsRef.current = [...stepsRef.current, askStep];
                                setAgentState(prev => ({
                                    ...prev,
                                    steps: stepsRef.current,
                                    status: 'paused',
                                    currentAction: '🚨 Agent feststeckend — Strategie unklar',
                                    pauseQuestion: `Der Agent hat "${action}" ${repeatCount}× versucht ohne Erfolg. Was soll er als Nächstes tun?`,
                                }));
                                return false; // Pause the loop
                            } else if (repeatCount >= limitHard) {
                                // Hard constraint
                                debug.log(`🔄 [LoopDetector] HARD CONSTRAINT after ${repeatCount} repeats of "${actionKey}"`);
                                const constraintStep: AgentStep = {
                                    action: 'system_recovery',
                                    description: `⛔ [LOOP DETECTOR] "${action}" on this target has been attempted ${repeatCount} times. This approach is NOT working.\n⛔ DO NOT attempt "${action}" on this target again.\n⛔ REQUIRED: Choose a COMPLETELY different approach. Options:\n   - Try a DIFFERENT element (different ID)\n   - Use press_key(Enter) instead of clicking\n   - Scroll to find the element in a different position\n   - Use type_text with submit_after=true instead of clicking a button\n   - Call ask_user if you are unsure what to do next`,
                                    result: `HARD CONSTRAINT: ${action} blocked after ${repeatCount} repeats.`,
                                };
                                stepsRef.current = [...stepsRef.current, constraintStep];
                                setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: '⛔ Loop blockiert — andere Strategie erzwungen' }));
                            } else if (repeatCount >= limitWarn) {
                                // Soft warning
                                debug.log(`🔄 [LoopDetector] WARNING: ${repeatCount} repeats of "${actionKey}"`);
                                const warnStep: AgentStep = {
                                    action: 'system_recovery',
                                    description: `⚠️ [LOOP WARNING] You have done "${action}" on this target ${repeatCount} times. If it is not working, CHANGE your approach:\n   - For search bars: use type_text with submit_after=true instead of clicking the search button\n   - For input fields: check if you need to click the field FIRST, then type\n   - For buttons: check if a modal or overlay is blocking the click`,
                                    result: `WARNING: ${action} repeated ${repeatCount} times — consider different strategy.`,
                                };
                                stepsRef.current = [...stepsRef.current, warnStep];
                                setAgentState(prev => ({ ...prev, steps: stepsRef.current }));
                            }
                        }

                        // ── Post-Click Form Detection (Simplified/Removed) ──────────────────
                        // Previous complex DOM snapshot diffing removed.
                        // The Agent will naturally see new input fields in its NEXT standard SoM 
                        // snapshot loop. Mid-step system_recovery injections for form detection 
                        // caused false positives and unnecessary latency (150ms + snapshot cost).

                        // _autoTerminate removed (Fix B removed — always null now).

                        // AutoLearn removed — was firing even during loops.

                        return true;

                    }

                    if (event.type === 'error') {
                        setAgentState(prev => ({ ...prev, status: 'error', currentAction: `❌ ${event.message}` }));
                        return false;
                    }
                    } catch { /* skip malformed SSE */ }
                }
                if (done) break; // LOGIC-4: break AFTER processing flushed buffer
            }
        } finally {
            reader.cancel().catch(() => {}); // BUG-2: always release SSE stream
        }
    } catch (err: any) {
        // ── Pre-flight Fix 1: AbortError = user pressed Stop — NOT a crash ──
        if (err?.name === 'AbortError' || abortRef.current) {
            debug.log('⏹️ Agent fetch safely aborted by user.');
            return false; // Clean exit — no error state!
        }
        debug.log('🤖 [Agent] Step error:', err);
        setAgentState(prev => ({ ...prev, status: 'error', currentAction: '❌ Connection failed' }));
        return false;
    }

    return false;
}

// runMemoryReplay removed — was never called. Memory system is handled by backend prompt injection.
// Stub export preserved to avoid potential import errors in other files.
export async function runMemoryReplay(_task: string, _muscleMemory: AgentStep[], _ctx: EngineContext): Promise<boolean> {
    return false;
}
