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
import {
    checkMaxSteps,
    checkRepetition,
    checkSelfHealing,
    checkStuckDetection,
    checkActionTypeRepetition,
    checkActionFingerprint,
} from "../safety";
import { waitForPageReady, captureDomSnapshot, captureVisionFrame, captureScreenshot } from "./webviewUtils";
import { takeDomState, buildDomDiffSuffix } from "./domDiff";
import { useContextStore } from "../../../../../stores/useContextStore";
import { StateEngine } from "../wormhole/StateEngine";
import { PerceptionEngine } from "../wormhole/PerceptionEngine";

// ─── runStep ─────────────────────────────────────────────────
// Executes one complete step: page-state → LLM call → action → record.
// Returns true to continue the loop, false to stop.

export async function runStep(task: string, ctx: EngineContext): Promise<boolean> {
    const { wv, stepSomRef, abortRef, stepsRef, crudPlanRef, currentTaskRef, cardId, setAgentState, trajectoryRef, lastFailedIdRef } = ctx;

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

    // Quick CDP test at step start to confirm bridge is working
    if (wcId > 0 && electronAPI?.cdpSend) {
        try {
            const versionResp = await electronAPI.cdpSend(wcId, 'Browser.getVersion', {});
            console.log(`✅ [CDP] Bridge OK — chromium: ${versionResp?.result?.product ?? 'unknown'} ok=${versionResp?.ok}`);
        } catch (e) {
            console.error(`❌ [CDP] Bridge FAILED at step start:`, e);
        }
    } else {
        console.warn(`⚠️ [CDP] SKIPPED health check — wcId=${wcId} cdpSend=${!!electronAPI?.cdpSend}`);
    }

    const ready = await waitForPageReady(wv, 'step-start');
    if (!ready) {
        setAgentState(prev => ({ ...prev, status: 'error', currentAction: '❌ Webview not available' }));
        return false;
    }

    // ── Gather page state ──
    let pageUrl = '', pageTitle = '';
    try {
        const pageData = await wv?.executeJavaScript(`JSON.stringify({ url: location.href, title: document.title })`, true);
        const parsed = JSON.parse(pageData);
        pageUrl = parsed.url || '';
        pageTitle = parsed.title || '';
    } catch { /* */ }

    console.log(`🔍 [ENGINE] Page: ${pageUrl} | title: ${pageTitle}`);

    // NOTE: Zeno-Freeze (Debugger.pause) is NOT used here.
    // DOMSnapshot.captureSnapshot hangs when JS is paused via Debugger.pause
    // because Chromium's snapshot pipeline awaits a JS evaluation callback
    // that never fires. This caused 90s delays per step.
    // StateEngine is retained for Muscle Memory trajectory replay.
    const stateEngine: StateEngine | null = null; // Zeno-Freeze disabled (see above)

    let domSnapshot = await captureDomSnapshot(wv, wcId, stepSomRef, lastFailedIdRef.current);
    let screenshot = await captureVisionFrame(wv, stepSomRef.current, lastFailedIdRef.current);

    // Blank DOM on search engines to force search_web usage
    const isSearchEngine = /google\.com|bing\.com|duckduckgo\.com|search\.yahoo/i.test(pageUrl);
    if (isSearchEngine && stepsRef.current.length === 0) {
        domSnapshot = '[Page: Search engine homepage. Use the search_web tool to search — do NOT type into the search box.]';
        screenshot = await captureScreenshot(wv); // plain screenshot without SoM for search page
    }

    setAgentState(prev => ({ ...prev, currentAction: '🧠 Analyzing page...' }));

    // ── LLM call ──
    try {
        // Note: AbortController is owned by the hook. We receive the signal via ctx.
        // ── Build Trajectory context ──
        const trajectoryContext = trajectoryRef.current.slice(-7).map(t => 
            `Step ${t.stepIndex}: [${t.result}] ${t.action} on ID ${t.targetId || 'N/A'} - Result: ${t.message}`
        ).join('\n');

        const fetchOpts: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task,
                page_url: pageUrl,
                page_title: pageTitle,
                dom_snapshot: domSnapshot,
                screenshot,
                history: stepsRef.current,
                trajectory: trajectoryContext,
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

        const response = await fetch('http://localhost:3001/api/agents/act', fetchOpts);

        if (!response.ok || !response.body) {
            setAgentState(prev => ({ ...prev, status: 'error', currentAction: '❌ Backend error' }));
            return false;
        }

        // ── Read SSE response ──
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Abort check inside the reading loop
            if (abortRef.current) {
                reader.cancel().catch(() => { });
                return false;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

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
                        const { action, args } = event;
                        const stepNum = stepsRef.current.length + 1;
                        debug.log(`\n🎯 ════════════ STEP ${stepNum}/${MAX_STEPS} ════════════`);
                        debug.log(`🎯 [Action] ${action}`, JSON.stringify(args, null, 2));

                        // ── Terminal: done ──
                        if (action === 'done') {
                            const summary = args.summary || 'Task complete';
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

                            // Auto-save workflow
                            const isLoopAbort = summary.includes('got stuck') || summary.includes('maximum step limit') || summary.includes('different approach');
                            if (!isLoopAbort) {
                                try {
                                    const pageUrlFinal = await wv?.executeJavaScript?.('location.href', true) ?? '';
                                    const domain = pageUrlFinal ? new URL(pageUrlFinal).hostname.replace(/^www\./, '') : '';
                                    if (domain && currentTaskRef.current) {
                                        // Count recovery steps so Librarian knows if it struggled
                                        const recoverySteps = stepsRef.current.filter(
                                            (s: AgentStep) => s.action === 'system_recovery'
                                        ).length;

                                        const controller = new AbortController();
                                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                                        const resp = await fetch('/api/agents/memory/save', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                domain,
                                                task: currentTaskRef.current,
                                                steps: stepsRef.current,
                                                url: pageUrlFinal,          // V3: full URL for path-scoping
                                                recoverySteps,              // V3: triggers Librarian if > 0
                                            }),
                                            signal: controller.signal
                                        }).finally(() => clearTimeout(timeoutId));
                                        
                                        const data = await resp.json();
                                        if (data.workflow_id > 0) {
                                            setAgentState(prev => ({ ...prev, lastWorkflowId: data.workflow_id }));
                                            debug.log(`🧠 [Memory] Saved workflow #${data.workflow_id} (recovery=${recoverySteps})`);
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

                        // ── DOM state BEFORE action ──
                        const domStateBefore = await takeDomState(wv);

                        // ── Safety checks ──
                        const prevSteps = stepsRef.current;

                        const maxCheck = checkMaxSteps(prevSteps);
                        if (maxCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: maxCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: maxCheck.statusMessage, pauseQuestion: null, cursorPos: null }));
                            return false;
                        }

                        const repeatCheck = checkRepetition(prevSteps, action, args.description || '');
                        if (repeatCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: repeatCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: repeatCheck.statusMessage, pauseQuestion: null, cursorPos: null }));
                            return false;
                        }
                        // repeatCheck 're_observe' handled below alongside actionTypeCheck

                        const fingerprintCheck = checkActionFingerprint(prevSteps, action, args);
                        if (fingerprintCheck.action === 'recover') {
                            debug.log(`🔴 [FingerprintGuard] Injecting recovery step`);
                            setAgentState(prev => ({ ...prev, currentAction: fingerprintCheck.statusMessage }));
                            stepsRef.current = [...prevSteps, fingerprintCheck.recoveryStep];
                            setAgentState(prev => ({ ...prev, steps: stepsRef.current }));
                            return true;
                        }

                        const actionTypeCheck = checkActionTypeRepetition(prevSteps, action);
                        if (actionTypeCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: actionTypeCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: actionTypeCheck.statusMessage, pauseQuestion: null }));
                            return false;
                        }
                        if (actionTypeCheck.action === 're_observe' || repeatCheck.action === 're_observe') {
                            const triggeredCheck = (actionTypeCheck.action === 're_observe' ? actionTypeCheck : repeatCheck) as { action: 're_observe', blacklistedAction: string, statusMessage: string };
                            debug.log(`🔄 [ReObserve] Triggered by ${triggeredCheck.blacklistedAction} loop`);
                            setAgentState(prev => ({ ...prev, currentAction: '🔄 Re-observing page...' }));

                            const freshScreenshot = await captureScreenshot(wv);
                            const freshDom = await captureDomSnapshot(wv, wcId, stepSomRef, lastFailedIdRef.current);
                            void freshDom;

                            let consoleErrors = '';
                            try {
                                await wv?.executeJavaScript?.(`
                                    if (!window.__biamos_errors) {
                                        window.__biamos_errors = [];
                                        var origErr = console.error.bind(console);
                                        console.error = function() {
                                            window.__biamos_errors.push(Array.from(arguments).join(' '));
                                            if (window.__biamos_errors.length > 10) window.__biamos_errors.shift();
                                            origErr.apply(console, arguments);
                                        };
                                    }
                                `, true);
                                const errs = await wv?.executeJavaScript?.('JSON.stringify(window.__biamos_errors.slice(-3))', true);
                                const errList = JSON.parse(errs || '[]') as string[];
                                if (errList.length > 0) consoleErrors = `\n[SYSTEM LOGS] Console errors detected:\n${errList.map((e: string) => `• ${e}`).join('\n')}`;
                            } catch { /* */ }

                            const blacklistedDesc = args.description || `id:${args.id}`;
                            const recoveryStep: AgentStep = {
                                action: 'system_recovery',
                                description: `[CRITICAL RECOVERY] You just failed ${triggeredCheck.blacklistedAction.replace('_', ' ')} (${blacklistedDesc}) multiple times. Fresh page state captured. DO NOT attempt '${triggeredCheck.blacklistedAction}' on element id:${args.id ?? 'same'} again.\n\nRequired: Choose a DIFFERENT strategy:\n• press_key("Escape") to close modals/popups\n• click somewhere else to drop focus\n• scroll to find the element\n• try vision_click at different coordinates\n• use navigate() if wrong page${consoleErrors}`,
                                result: `Fresh observation taken. Blacklisted: ${triggeredCheck.blacklistedAction}(${blacklistedDesc}).`,
                                screenshot: freshScreenshot,
                            };
                            stepsRef.current = [...stepsRef.current, recoveryStep];
                            setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: triggeredCheck.statusMessage }));
                            return true;
                        }
                        if (actionTypeCheck.action === 'recover') {
                            stepsRef.current = [...stepsRef.current, actionTypeCheck.recoveryStep];
                            setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: actionTypeCheck.statusMessage }));
                            return true;
                        }

                        const recoveryCount = prevSteps.filter((s: AgentStep) => s.action === 'system_recovery').length;
                        const healCheck = checkSelfHealing(prevSteps, action, args.description || '', recoveryCount);
                        if (healCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: healCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: healCheck.statusMessage, pauseQuestion: null }));
                            return false;
                        }
                        if (healCheck.action === 'recover') {
                            try { await wv?.executeJavaScript?.('window.scrollBy(0, 300)', true); await new Promise(r => setTimeout(r, 500)); } catch { /* */ }
                            stepsRef.current = [...stepsRef.current, healCheck.recoveryStep];
                            setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: healCheck.statusMessage }));
                            return true;
                        }

                        const stuckCheck = checkStuckDetection(prevSteps);
                        if (stuckCheck.action === 'stop') {
                            const doneStep: AgentStep = { action: 'done', description: stuckCheck.reason };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({ ...prev, status: 'done', steps: stepsRef.current, currentAction: stuckCheck.statusMessage, pauseQuestion: null }));
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

                        // ── Execute action ──
                        console.log(`🚀 [ENGINE] Dispatching action="${action}" with wcId=${wcId} somSize=${stepSomRef.current.size} cdpSend=${!!electronAPI?.cdpSend} args=`, JSON.stringify(args));
                        debug.log(`▶️ [Exec] Dispatching ${action}...`);
                        const actionResult = await executeAction(action, args, actionCtx);
                        console.log(`◀️ [ENGINE] Action result: ${actionResult.logMessage}`);
                        debug.log(`◀️ [Exec] Result: ${actionResult.logMessage.substring(0, 120)}`);

                        // ── Record trajectory step ──
                        const isFailed = actionResult.logMessage.includes('❌') || actionResult.logMessage.includes('failed');
                        const tResult = isFailed ? 'FAILED' : 'SUCCESS';
                        trajectoryRef.current.push({
                            stepIndex: stepNum,
                            action: action,
                            targetId: args.id !== undefined && args.id !== null ? Number(args.id) : undefined,
                            result: tResult,
                            message: actionResult.logMessage,
                        });

                        // Record exact failed ID to flag in future SoM
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

                        // ── DOM diff after action ──
                        const domDiffSuffix = await buildDomDiffSuffix(wv, domStateBefore, action, actionResult);

                        // ── Record step ──
                        let cleanResult = actionResult.logMessage + domDiffSuffix;
                        const structIdx = cleanResult.indexOf('__STRUCTURED__');
                        if (structIdx >= 0) cleanResult = cleanResult.substring(0, structIdx).trim();

                        let cssSelector = args.selector;
                        if (!cssSelector && args.id !== undefined && args.id !== null) {
                            const entry = stepSomRef.current.get(Number(args.id));
                            if (entry) cssSelector = entry.name || entry.role;
                        }

                        const step: AgentStep = {
                            action,
                            selector: cssSelector,
                            value: args.text,
                            description: args.description || action,
                            result: cleanResult,
                            didNavigate: actionResult.didNavigate === true ? true : undefined,
                        };
                        stepsRef.current = [...stepsRef.current, step];
                        debug.log(`📝 [Step ${stepNum}] ${action}: ${cleanResult.substring(0, 100)}`);
                        debug.log(`🎯 ════════════ END STEP ${stepNum} ════════════\n`);
                        setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

                        await waitForPageReady(wv, 'post-action');
                        return true;
                    }

                    if (event.type === 'error') {
                        setAgentState(prev => ({ ...prev, status: 'error', currentAction: `❌ ${event.message}` }));
                        return false;
                    }
                } catch { /* skip malformed SSE */ }
            }
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

// ─── runMemoryReplay ─────────────────────────────────────────
// Bypasses the LLM entirely and executes a known good trajectory.
// Matches elements by their accessible name or role, not ID.
// Returns true if the entire sequence was successfully executed.

export async function runMemoryReplay(task: string, muscleMemory: AgentStep[], ctx: EngineContext): Promise<boolean> {
    const { wv, stepSomRef, abortRef, stepsRef, setAgentState } = ctx;
    debug.log(`🧠 [MemoryReplay] Starting replay of ${muscleMemory.length} steps for task: "${task}"`);

    for (let i = 0; i < muscleMemory.length; i++) {
        const step = muscleMemory[i];
        if (abortRef.current) return false;

        let wcId = ctx.wcId;
        try {
            if (wv?.getWebContentsId) {
                const freshId = wv.getWebContentsId();
                if (typeof freshId === 'number' && freshId > 0) wcId = freshId;
            }
        } catch {}

        setAgentState(prev => ({ ...prev, currentAction: `🧠 Replaying: ${step.description}` }));

        // Wait for page to settle and grab a fresh DOM snapshot
        const ready = await waitForPageReady(wv, `replay-step-${i}`);
        if (!ready) {
            debug.log(`🧠 [MemoryReplay] Page not ready at step ${i}, aborting replay`);
            return false; 
        }

        await captureDomSnapshot(wv, wcId, stepSomRef, null);

        // Map the step properties to action arguments
        const args: Record<string, any> = { description: step.description };
        if (step.value) args.text = step.value;
        
        // Find the target element ID based on the saved 'selector' (which we mapped to entry.name or role)
        if (step.selector) {
            let matchedId: number | null = null;
            // 1. Exact match on name
            for (const [id, entry] of stepSomRef.current.entries()) {
                if (entry.name === step.selector) { matchedId = id; break; }
            }
            // 2. Fallback to exact match on role if name wasn't found (risky, but sometimes the only option)
            if (matchedId === null) {
                for (const [id, entry] of stepSomRef.current.entries()) {
                    if (entry.role === step.selector) { matchedId = id; break; }
                }
            }
            // 3. Partial match as final fallback
            if (matchedId === null) {
                for (const [id, entry] of stepSomRef.current.entries()) {
                    if (entry.name && entry.name.includes(step.selector)) { matchedId = id; break; }
                }
            }

            if (matchedId !== null) {
                args.id = matchedId;
            } else if (['click', 'type_text', 'scroll'].includes(step.action)) {
                debug.log(`🧠 [MemoryReplay] Element "${step.selector}" not found on page! Aborting replay.`);
                return false; // Fast fail: the trajectory is broken, fallback to LLM
            }
        }

        // Build the action context
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
        };

        // Execute step
        debug.log(`🧠 [MemoryReplay] Executing action: ${step.action}`);
        const actionResult = await executeAction(step.action, args, actionCtx);
        if (actionResult.isAborted || abortRef.current) return false;

        // Record it in the live history so it looks exactly like a normal run
        const replayStep: AgentStep = {
            action: step.action,
            selector: step.selector,
            value: step.value,
            description: `[Replay] ${step.description}`,
            result: actionResult.logMessage,
            didNavigate: actionResult.didNavigate,
        };
        stepsRef.current = [...stepsRef.current, replayStep];
        setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

        await waitForPageReady(wv, `post-replay-${i}`);
    }

    // Wrap up: push a 'done' step
    const doneStep: AgentStep = { action: 'done', description: 'Muscle Memory Replay complete' };
    stepsRef.current = [...stepsRef.current, doneStep];
    setAgentState(prev => ({
        ...prev,
        status: 'done',
        steps: stepsRef.current,
        currentAction: `✅ Quick Replay Complete!`,
        pauseQuestion: null,
    }));
    return true; // Replay completely successful
}
