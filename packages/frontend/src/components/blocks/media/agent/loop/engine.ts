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

// Fix #4 — CDP Health-Check Cache
// Once the CDP bridge is confirmed for a given wcId, no need to re-check every step.
// This avoids a full round-trip CDP call per step (saves 50-200ms on each).
const _cdpHealthyIds = new Set<number>();

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

    // Step PF-2: Session-Aware Intent Resolver — BEFORE DOM capture
    // Maps known apps to their AUTHENTICATED deep URLs.
    // If logged in → lands in the app directly.
    // If not logged in → app redirects to login (handled by ACCESS-WALL protocol).
    // This eliminates the "Kostenlos loslegen" / marketing-page trap entirely.
    if (stepsRef.current.length === 0) {
        // Known app → authenticated entry point mapping
        // Key: regex to match in task text | Value: deep authenticated URL
        const SESSION_APP_URLS: Array<[RegExp, string, string]> = [
            // [matchPattern, deepUrl, displayName]
            [/\btodoist\b/i,  'https://app.todoist.com/app/inbox',          'Todoist'],
            [/\bgmail\b/i,    'https://mail.google.com/mail/u/0/#inbox',    'Gmail'],
            [/\byoutube\b/i,  'https://www.youtube.com',                    'YouTube'],
            [/\bnotion\b/i,   'https://www.notion.so',                      'Notion'],
            [/\blinear\b/i,   'https://linear.app',                         'Linear'],
            [/\bgithub\b/i,   'https://github.com/dashboard',               'GitHub'],
            [/\bslack\b/i,    'https://app.slack.com',                      'Slack'],
            [/\bfigma\b/i,    'https://www.figma.com/files/recent',         'Figma'],
            [/\btrello\b/i,   'https://trello.com/u/me/boards',             'Trello'],
            [/\bjira\b/i,     'https://jira.atlassian.com',                 'Jira'],
            [/\bairtable\b/i, 'https://airtable.com',                       'Airtable'],
            [/\bvercel\b/i,   'https://vercel.com/dashboard',               'Vercel'],
        ];

        // ⚡ DOMAIN PRIORITY: If task contains a direct domain (e.g. "youtube.com"),
        // ALWAYS navigate — even if task also contains "search", "find", etc.
        // Research-only guard only applies when there is NO direct domain target.
        // LOGIC-2 Fix: app names like "YouTube" count as a domain target
        // so "Suche auf YouTube nach X" correctly navigates → doesn't fall into research-only mode
        const hasKnownApp = /\b(?:youtube|gmail|todoist|notion|github|slack|figma|trello|jira|airtable|vercel|linear|google)\b/i.test(task);
        const hasDomainInTask = hasKnownApp || /\b[a-zA-Z0-9-]+\.(?:com|de|io|org|net|app|co|ai|at|ch|fr|uk)\b/i.test(task);
        const isResearchTask = !hasDomainInTask &&
            /suche|search|news|dashboard|research|finde|zeig|\u00fcberblick|aktuell|latest|zusammenfass/i.test(task);

        // Try session-aware deep URL first
        let resolvedTarget: string | null = null;
        let resolvedName = '';

        if (!isResearchTask) {
            for (const [pattern, deepUrl, name] of SESSION_APP_URLS) {
                if (pattern.test(task) && !pageUrl.includes(name.toLowerCase())) {
                    resolvedTarget = deepUrl;
                    resolvedName = name;
                    break;
                }
            }

            // Fallback: raw domain match (for URLs not in the known-app list)
            if (!resolvedTarget) {
                const urlMatch = task.match(/\b([a-zA-Z0-9-]+\.(?:com|de|io|org|net|app|co|ai|at|ch|fr|uk))\b/i);
                if (urlMatch && !pageUrl.includes(urlMatch[1].toLowerCase())) {
                    resolvedTarget = `https://${urlMatch[1].toLowerCase()}`;
                    resolvedName = urlMatch[1];
                }
            }
        }


        if (resolvedTarget) {
            debug.log(`⚡ [PreFlight] Session-Aware navigate → ${resolvedTarget} (${resolvedName})`);
            setAgentState(prev => ({ ...prev, currentAction: `⚡ → ${resolvedName}` }));

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

            const navResult = await executeAction('navigate', {
                url: resolvedTarget,
                description: `⚡ Session-Aware: navigating to ${resolvedName} authenticated entry`,
            }, fastCtx);

            if (!navResult.isAborted && !abortRef.current) {
                stepsRef.current = [{
                    action: 'navigate',
                    description: `Navigate to ${resolvedTarget}`,
                    result: navResult.logMessage,
                    didNavigate: true,
                }];
                setAgentState(prev => ({ ...prev, steps: stepsRef.current, currentAction: `🌐 ${resolvedName} — checking session...` }));
                await waitForPageReady(wv, 'post-session-navigate', 1200);
                return true; // next step: DOM capture on wherever we landed (app or login page)
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
    const stateEngine: StateEngine | null = null; // Zeno-Freeze disabled (see above)

    let domSnapshot = await captureDomSnapshot(wv, wcId, stepSomRef, lastFailedIdRef.current);
    let screenshot = await captureVisionFrame(wv, stepSomRef.current, lastFailedIdRef.current);

    // Blank DOM on search engines to force search_web usage
    const isSearchEngine = /google\.com|bing\.com|duckduckgo\.com|search\.yahoo/i.test(pageUrl);
    if (isSearchEngine && stepsRef.current.length === 0) {
        domSnapshot = '[Page: Search engine homepage. Use the search_web tool to search — do NOT type into the search box.]';
        screenshot = await captureScreenshot(wv);
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

        // ── Phase 3A: Neuro-Symbolic Compiled Execution ─────────────────────────
    // If a verified workflow exists for this domain+task (verified by Assertion Engine
    // 3+ times) → replay it DIRECTLY without an LLM call.
    // "Teach-In" robotics: first 3 runs teach, subsequent runs execute from memory.
    // If a step fails (stale selector) → fall through to LLM (exception handler).
    if (stepsRef.current.length > 0 && stepsRef.current.length < 3) {
        // Only attempt compiled replay for steps 2-3 (after navigation already happened)
        // Step 1 is always navigation (handled by Pre-Flight Router).
        try {
            const memoryResp = await fetch('http://localhost:3001/api/agents/memory/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: new URL(pageUrl).hostname.replace(/^www\./, ''), task }),
            });

            if (memoryResp.ok) {
                const memData = await memoryResp.json();
                const compiledWorkflow = memData?.workflow;

                // Only use compiled execution if: verified=true AND sufficient steps
                if (compiledWorkflow?.verified && compiledWorkflow.steps?.length >= 2) {
                    const stepIndex = stepsRef.current.length; // 0-based index into compiled steps
                    const compiledStep = compiledWorkflow.steps[stepIndex];

                    if (compiledStep) {
                        debug.log(`⚡ [NeuroSymbolic] Compiled replay — step ${stepIndex + 1}/${compiledWorkflow.steps.length}: ${compiledStep.action}`);
                        setAgentState(prev => ({ ...prev, currentAction: `⚡ Compiled: ${compiledStep.description?.substring(0, 40)}...` }));

                        const eAPI = (window as any).electronAPI;
                        const compiledCtx = {
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

                        try {
                            const compiledResult = await executeAction(
                                compiledStep.action,
                                {
                                    // Remap stored step args to action format
                                    ...(compiledStep.selector ? { id: compiledStep.selector } : {}),
                                    ...(compiledStep.value ? { text: compiledStep.value } : {}),
                                    // BUG-4 Fix: extract real URL from description (e.g. "Navigate to https://..."),
                                    // never pass human-readable description text as URL
                                    ...(compiledStep.action === 'navigate' ? {
                                        url: compiledStep.description?.match(/https?:\/\/[^\s]+/)?.[0] ?? compiledStep.description
                                    } : {}),
                                    description: compiledStep.description,
                                },
                                compiledCtx
                            );

                            if (!compiledResult.isAborted && !compiledResult.logMessage?.toLowerCase().includes('error')) {
                                // Compiled step succeeded
                                const compiledAgentStep: AgentStep = {
                                    action: compiledStep.action,
                                    description: `⚡ [Compiled] ${compiledStep.description}`,
                                    result: compiledResult.logMessage,
                                    value: compiledStep.value,
                                };
                                stepsRef.current = [...stepsRef.current, compiledAgentStep];
                                setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

                                // Last step in compiled workflow? Check if done
                                if (stepIndex + 1 >= compiledWorkflow.steps.length) {
                                    debug.log(`✅ [NeuroSymbolic] Compiled workflow COMPLETE — all ${compiledWorkflow.steps.length} steps executed`);
                                    // Let the next runStep() run normally — it will see the task is done context
                                }
                                return true; // continue loop
                            }
                            // Compiled step failed → fall through to LLM
                            debug.log(`⚠️ [NeuroSymbolic] Compiled step failed — falling through to LLM (script may be stale)`);
                        } catch (compiledErr) {
                            debug.log(`⚠️ [NeuroSymbolic] Compiled execution error — falling through to LLM: ${compiledErr}`);
                        }
                    }
                }
            }
        } catch (memErr) {
            // Memory lookup failure is always non-fatal
            debug.log(`⚠️ [NeuroSymbolic] Memory lookup failed (non-fatal): ${memErr}`);
        }
    }
    // ── End Compiled Execution — falling through to LLM ─────────────────────

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
                        const { action, args } = event;
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
                                // BUG-5: cap at 3 rejections — prevents done() loop
                                const priorRejections = stepsRef.current.filter(
                                    (s: AgentStep) => s.action === 'system_recovery' && s.result?.includes('ASSERTION FAILED')
                                ).length;

                                if (priorRejections >= 3) {
                                    debug.log(`⚠️ [AssertionEngine] 3 prior rejections — force-accepting done() to prevent infinite loop`);
                                    assertionFailed = false; // fall through to the accepted block below
                                } else {
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
                            const isAddCreateBtn = /hinzuf[uü]gen|add.*task|create.*task|neue.*aufgabe|new.*task|submit|confirm/i.test(blacklistedDesc);
                            const addCreateHint = isAddCreateBtn
                                ? `\n\n🎯 FORM DETECTION: You clicked an "add/create" button multiple times. The task creation form has ALMOST CERTAINLY appeared. DO NOT click again.\nInstead: 1) SCAN the current DOM for text input fields (input, textarea, contenteditable) 2) TYPE the task name into the first visible input 3) Then submit.`
                                : '';
                            const recoveryStep: AgentStep = {
                                action: 'system_recovery',
                                description: `[CRITICAL RECOVERY] You just failed ${triggeredCheck.blacklistedAction.replace('_', ' ')} (${blacklistedDesc}) multiple times. Fresh page state captured. DO NOT attempt '${triggeredCheck.blacklistedAction}' on element id:${args.id ?? 'same'} again.\n\nRequired: Choose a DIFFERENT strategy:\n• press_key("Escape") to close modals/popups\n• click somewhere else to drop focus\n• scroll to find the element\n• try vision_click at different coordinates\n• use navigate() if wrong page${addCreateHint}${consoleErrors}`,
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

                        // ── Adaptive post-action wait (BEFORE diff so React has time to render) ──
                        // navigate/go_back: 1200ms, click: 300ms, scroll: 150ms, type: 200ms
                        const postSilenceMs = (action === 'navigate' || action === 'go_back') ? 1200
                            : action === 'scroll' ? 150
                            : action === 'type_text' ? 200
                            : 300;
                        await waitForPageReady(wv, 'post-action', postSilenceMs);

                        // ── DOM diff AFTER wait — React/SPA has settled by now ──
                        const domDiffSuffix = await buildDomDiffSuffix(wv, domStateBefore, action, actionResult);

                        // ── Record step ──
                        let cleanResult = actionResult.logMessage + domDiffSuffix;
                        const structIdx = cleanResult.indexOf('__STRUCTURED__');
                        if (structIdx >= 0) cleanResult = cleanResult.substring(0, structIdx).trim();

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
                            const prevWasSameClick = prevStep?.action === 'click' && (prevStep as any)?._args?.id === args.id;
                            if (!prevWasSameClick) {
                                // First click on this element — give it one more chance
                                cleanResult = actionResult.logMessage +
                                    ' ℹ️ [DOM STABLE] Click registered, no immediate page navigation. ' +
                                    'If this is a submit/send button, try clicking once more to confirm it was received. ' +
                                    'If you are already on the target page (e.g. sidebar link), proceed with the actual task directly.';
                            }
                        }

                        // ── Fix B: Post-navigation success pattern detection ─────────────────────
                        // Detect known "task complete" URL signatures.
                        // Sets _autoTerminate flag — engine terminates BEFORE next LLM call
                        // so muscle-memory injected steps cannot override the done() signal.
                        if (actionResult.didNavigate) {
                            try {
                                const nowUrl: string = await wv?.executeJavaScript?.('location.href', true) ?? '';
                                // YouTube: lc= parameter = comment anchored by YouTube = comment posted
                                if (/[?&]lc=[a-zA-Z0-9_-]+/.test(nowUrl)) {
                                    _autoTerminate = `YouTube comment successfully posted — confirmed by URL anchor (lc=).`;
                                    cleanResult += ' 🎉 [COMMENT POSTED] Comment confirmed in URL.';
                                }
                                // Gmail: URL fragment #sent or navigated to sent folder
                                if (nowUrl.includes('#sent') || nowUrl.includes('/sent')) {
                                    _autoTerminate = `Gmail email sent — confirmed by URL (#sent).`;
                                    cleanResult += ' 🎉 [EMAIL SENT] Email sent confirmed in URL.';
                                }
                            } catch { /* non-fatal */ }
                        }


                        // ── Micro-Recovery: Stage 1 + 2 (deterministic, no LLM) ───────────────
                        // Trigger: click/click_at → DOM STABLE or NO VISIBLE UI CHANGE
                        // Stage 1: 300ms timing retry (solves lazy-load & React hydration lags)
                        // Stage 2: Re-fire sendInputEvent at SOM element coordinates
                        // Stage 3 (LLM): enriched error message if both fail
                        // ─────────────────────────────────────────────────────────────────────
                        const _domFailed = domDiffSuffix.includes('[DOM STABLE]') || domDiffSuffix.includes('[NO VISIBLE UI CHANGE]');
                        const _microCandidate = _domFailed && (action === 'click' || action === 'click_at') && !abortRef.current;

                        if (_microCandidate) {
                            debug.log(`🔧 [MicroRecover] Triggered for ${action}(id=${args.id ?? '?'})`);
                            setAgentState(prev => ({ ...prev, currentAction: '⚡ Micro-recovering (Stage 1)...' }));

                            // ── Stage 1: 300ms wait + same-coord re-click ──────────────────
                            let _s1ok = false;
                            try {
                                await new Promise(r => setTimeout(r, 300));
                                const _s1before = await takeDomState(wv);
                                const _entry = args.id !== undefined && args.id !== null
                                    ? stepSomRef.current.get(Number(args.id))
                                    : null;
                                if (_entry && _entry.x !== undefined) {
                                    wv.sendInputEvent({ type: 'mouseDown', x: _entry.x, y: _entry.y, button: 'left', clickCount: 1 });
                                    await new Promise(r => setTimeout(r, 60));
                                    wv.sendInputEvent({ type: 'mouseUp',   x: _entry.x, y: _entry.y, button: 'left', clickCount: 1 });
                                } else if (action === 'click_at') {
                                    // click_at: retry at same visual coordinates
                                    wv.sendInputEvent({ type: 'mouseDown', x: args.x ?? 0, y: args.y ?? 0, button: 'left', clickCount: 1 });
                                    await new Promise(r => setTimeout(r, 60));
                                    wv.sendInputEvent({ type: 'mouseUp',   x: args.x ?? 0, y: args.y ?? 0, button: 'left', clickCount: 1 });
                                }
                                await new Promise(r => setTimeout(r, 400));
                                const _s1after = await takeDomState(wv);
                                if (_s1before && _s1after && (
                                    _s1after.count !== _s1before.count ||
                                    _s1after.url   !== _s1before.url   ||
                                    _s1after.interactive !== _s1before.interactive ||
                                    _s1after.title !== _s1before.title
                                )) {
                                    _s1ok = true;
                                    cleanResult = actionResult.logMessage + ' ⚡ [MICRO-RECOVERY ✓ Stage 1: 300ms timing retry — DOM responded]';
                                    debug.log('🔧 [MicroRecover] Stage 1 SUCCESS');
                                }
                            } catch { /* never throw */ }

                            // ── Stage 2: SOM coordinate re-fire at element center ──────────
                            if (!_s1ok && !abortRef.current) {
                                debug.log(`🔧 [MicroRecover] Stage 2: coord re-fire at element center`);
                                setAgentState(prev => ({ ...prev, currentAction: '⚡ Micro-recovering (Stage 2)...' }));
                                let _s2ok = false;
                                try {
                                    const _e2 = args.id !== undefined && args.id !== null
                                        ? stepSomRef.current.get(Number(args.id))
                                        : null;
                                    if (_e2 && _e2.x !== undefined) {
                                        const _s2before = await takeDomState(wv);
                                        // Slightly offset toward center to avoid border-click misses
                                        const _tx = Math.round(_e2.x + (_e2.w ?? 0) * 0.1);
                                        const _ty = Math.round(_e2.y + (_e2.h ?? 0) * 0.1);
                                        wv.sendInputEvent({ type: 'mouseMove', x: _tx, y: _ty });
                                        await new Promise(r => setTimeout(r, 80));
                                        wv.sendInputEvent({ type: 'mouseDown', x: _tx, y: _ty, button: 'left', clickCount: 1 });
                                        await new Promise(r => setTimeout(r, 60));
                                        wv.sendInputEvent({ type: 'mouseUp',   x: _tx, y: _ty, button: 'left', clickCount: 1 });
                                        await new Promise(r => setTimeout(r, 500));
                                        const _s2after = await takeDomState(wv);
                                        if (_s2before && _s2after && (
                                            _s2after.count !== _s2before.count ||
                                            _s2after.url   !== _s2before.url   ||
                                            _s2after.interactive !== _s2before.interactive
                                        )) {
                                            _s2ok = true;
                                            cleanResult = actionResult.logMessage + ` ⚡ [MICRO-RECOVERY ✓ Stage 2: coord-click at (${_tx},${_ty}) — DOM responded]`;
                                            debug.log(`🔧 [MicroRecover] Stage 2 SUCCESS at (${_tx},${_ty})`);
                                        }
                                    }
                                } catch { /* never throw */ }

                                // ── Stage 3: Escalate to LLM with enriched error ───────────
                                if (!_s2ok) {
                                    debug.log('🔧 [MicroRecover] Stage 1+2 failed — Stage 3: escalating to LLM');
                                    cleanResult = actionResult.logMessage +
                                        ` ⚠️ [MICRO-RECOVERY FAILED] Auto-tried: (1) 300ms timing retry, (2) coord re-click at element center. Both triggered no DOM change. ` +
                                        `Escalate now: scroll to element first → try again, or use navigate() with a direct URL, or use vision_click() at a slightly different position.`;
                                }
                            }
                        }

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
                            _args: args, // BUG-1 Fix: preserve original args for checkActionFingerprint
                        };
                        stepsRef.current = [...stepsRef.current, step];
                        debug.log(`📝 [Step ${stepNum}] ${action}: ${cleanResult.substring(0, 100)}`);
                        debug.log(`🎯 ════════════ END STEP ${stepNum} ════════════\n`);
                        setAgentState(prev => ({ ...prev, steps: stepsRef.current }));

                        // ── Auto-Terminate: engine-side task completion ───────────────────
                        // When Fix B set _autoTerminate, we stop HERE — BEFORE the next LLM call.
                        // This is the only reliable way: injected muscle-memory steps would
                        // otherwise override any text hint we give to the LLM.
                        if (_autoTerminate) {
                            debug.log(`✅ [AutoTerminate] ${_autoTerminate}`);
                            const doneStep: AgentStep = { action: 'done', description: `✅ ${_autoTerminate}` };
                            stepsRef.current = [...stepsRef.current, doneStep];
                            setAgentState(prev => ({
                                ...prev,
                                status: 'done',
                                steps: stepsRef.current,
                                currentAction: `✅ ${_autoTerminate}`,
                                pauseQuestion: null,
                                cursorPos: null,
                            }));
                            return false; // ← STOP LOOP — no LLM call, no muscle-memory override
                        }

                        // If the PREVIOUS step failed (DOM STABLE / Action failed) and THIS
                        // step succeeded: extract the contrast as a pending avoid_rule.
                        // Fire-and-forget — never blocks the agent loop.
                        (() => {
                            try {
                                const allSteps = stepsRef.current;
                                if (allSteps.length < 2) return;
                                const prev = allSteps[allSteps.length - 2];
                                const curr = allSteps[allSteps.length - 1];
                                const prevFailed = prev.result &&
                                    (prev.result.includes('DOM STABLE') ||
                                     prev.result.includes('Action failed') ||
                                     prev.result.includes('[CRITICAL RECOVERY]'));
                                const currSucceeded = curr.result &&
                                    !curr.result.includes('DOM STABLE') &&
                                    !curr.result.includes('Action failed') &&
                                    !curr.result.includes('[CRITICAL RECOVERY]') &&
                                    curr.action !== 're_observe' &&
                                    curr.action !== 'system_recovery';

                                if (!prevFailed || !currSucceeded) return;

                                // Extract domain and path from current URL
                                const currentUrl = (() => { try { return wv?.getURL?.() || ''; } catch { return ''; } })();
                                const urlObj = (() => { try { return new URL(currentUrl); } catch { return null; } })();
                                const domain = urlObj?.hostname || '';
                                const pathPattern = urlObj?.pathname?.split('/').slice(0, 3).join('/') || null;

                                if (!domain || domain === 'about:blank') return;

                                const payload = {
                                    domain,
                                    path_pattern: pathPattern,
                                    what_failed: `${prev.action}: ${prev.description}`,
                                    what_worked: `${curr.action}: ${curr.description}`,
                                    url: currentUrl,
                                };

                                fetch('/api/knowledge/auto-pattern', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload),
                                }).catch(() => {}); // Never throw — always silent

                                debug.log(`🧠 [AutoLearn] Pattern captured: ${payload.what_failed} → ${payload.what_worked}`);
                            } catch { /* always silent */ }
                        })();

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
            updateCursorPos: (x: number, y: number) => { // BUG-3: was missing — caused TypeError when replay actions use cursor
                setAgentState(prev => ({ ...prev, cursorPos: { x, y } }));
            },
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
