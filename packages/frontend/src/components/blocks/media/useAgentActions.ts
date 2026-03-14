// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Agent Actions Hook
// ============================================================
// Manages the action loop: screenshot → DOM snapshot → LLM →
// execute action via webview.executeJavaScript() → repeat.
// ============================================================

import { useState, useRef, useCallback } from "react";
import { debug } from "../../../utils/debug";

// ─── Types ──────────────────────────────────────────────────

export interface AgentStep {
    action: string;
    selector?: string;
    value?: string;
    description: string;
    result?: string;
}

export type AgentStatus = "idle" | "running" | "paused" | "done" | "error";

export interface AgentState {
    status: AgentStatus;
    steps: AgentStep[];
    currentAction: string;
    pauseQuestion: string | null;
    cursorPos: { x: number; y: number } | null;
}

// ─── DOM Snapshot Script ────────────────────────────────────
// Injected into the webview to extract interactive elements with selectors.

const DOM_SNAPSHOT_SCRIPT = `
(function() {
    const MAX_ELEMENTS = 80;
    const result = [];
    
    // Find all interactive elements
    const selectors = [
        'a[href]',
        'button',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[onclick]',
        '[contenteditable="true"]',
    ];
    
    const seen = new Set();
    for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el) || result.length >= MAX_ELEMENTS) continue;
            seen.add(el);
            
            const rect = el.getBoundingClientRect();
            // Skip invisible elements
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
            
            // Build a unique CSS selector
            let cssSelector = '';
            if (el.id) {
                cssSelector = '#' + CSS.escape(el.id);
            } else if (el.getAttribute('data-testid')) {
                cssSelector = '[data-testid="' + el.getAttribute('data-testid') + '"]';
            } else if (el.getAttribute('aria-label')) {
                cssSelector = '[aria-label="' + el.getAttribute('aria-label').replace(/"/g, '\\\\"') + '"]';
            } else {
                // Generate nth-child path
                const path = [];
                let current = el;
                while (current && current !== document.body && path.length < 4) {
                    const tag = current.tagName.toLowerCase();
                    const parent = current.parentElement;
                    if (parent) {
                        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                        if (siblings.length > 1) {
                            const idx = siblings.indexOf(current) + 1;
                            path.unshift(tag + ':nth-of-type(' + idx + ')');
                        } else {
                            path.unshift(tag);
                        }
                    } else {
                        path.unshift(tag);
                    }
                    current = parent;
                }
                cssSelector = path.join(' > ');
            }
            
            // Get visible text
            const text = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || '').trim().substring(0, 60);
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type') || '';
            const href = el.getAttribute('href') || '';
            const role = el.getAttribute('role') || '';
            
            result.push({
                selector: cssSelector,
                tag,
                type,
                role,
                text,
                href: href.substring(0, 80),
                rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            });
        }
    }
    
    return JSON.stringify(result);
})()`;

// ─── Action Execution Scripts ───────────────────────────────

function buildClickAtScript(x: number, y: number): string {
    return `
    (function() {
        const el = document.elementFromPoint(${Math.round(x)}, ${Math.round(y)});
        if (!el) return JSON.stringify({ success: false, error: 'No element at (${Math.round(x)}, ${Math.round(y)})' });
        el.scrollIntoView({ block: 'nearest' });
        const opts = { bubbles: true, cancelable: true, view: window, clientX: ${Math.round(x)}, clientY: ${Math.round(y)} };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        return JSON.stringify({ success: true, x: ${Math.round(x)}, y: ${Math.round(y)}, tag: el.tagName.toLowerCase() });
    })()`;
}

function buildTypeAtScript(x: number, y: number, text: string, clearFirst: boolean): string {
    const endsWithTab = text.endsWith('\t');
    const endsWithEnter = text.endsWith('\n');
    let cleanText = text;
    if (endsWithTab) cleanText = text.slice(0, -1);
    if (endsWithEnter) cleanText = text.replace(/\n+$/, '');

    // JSON.stringify for safe embedding, then escape backticks for template literal safety
    const safeText = JSON.stringify(cleanText);

    // Build script via string concatenation — no template literals = no backtick issues
    const parts: string[] = [];
    parts.push('(function(){try{');
    parts.push('var el=document.elementFromPoint(' + Math.round(x) + ',' + Math.round(y) + ');');
    parts.push('if(!el)return JSON.stringify({success:false,error:"No element"});');

    // Smart editable element finding
    parts.push('function isEd(e){return e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.isContentEditable;}');
    parts.push('if(!isEd(el)){');
    // Prefer input/textarea (specific fields) over contenteditable (large body areas)
    parts.push('var c=el.querySelector("input,textarea");');
    parts.push('if(!c)c=el.querySelector("[contenteditable=true]");');
    parts.push('if(c){el=c;}else{var p=el.closest("input,textarea,[contenteditable=true],[contenteditable]");if(p)el=p;}');
    parts.push('}');

    parts.push('el.focus();');

    // Clear if needed
    if (clearFirst) {
        parts.push('if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){el.value="";}');
        parts.push('else{el.textContent="";}');
    }

    // Type text — use execCommand for contenteditable (simulates real typing)
    parts.push('if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){');
    parts.push('el.value=' + safeText + ';');
    parts.push('el.dispatchEvent(new Event("input",{bubbles:true}));');
    parts.push('el.dispatchEvent(new Event("change",{bubbles:true}));');
    parts.push('}else{');
    // innerText: works on contenteditable, converts \n to <br>, NOT blocked by Trusted Types CSP
    parts.push('el.innerText=' + safeText + ';');
    parts.push('el.dispatchEvent(new Event("input",{bubbles:true}));');
    parts.push('}');

    // Tab/Enter key events
    if (endsWithEnter) {
        parts.push('el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true}));');
    }
    if (endsWithTab) {
        parts.push('el.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",code:"Tab",keyCode:9,bubbles:true}));');
    }

    parts.push('return JSON.stringify({success:true,x:' + Math.round(x) + ',y:' + Math.round(y) + ',tag:el.tagName.toLowerCase()});');
    parts.push('}catch(e){return JSON.stringify({success:false,error:e.message});}})()');

    return parts.join('');
}

function buildScrollScript(direction: "up" | "down", amount: number): string {
    const pixels = direction === "down" ? amount : -amount;
    return `
    (function() {
        window.scrollBy({ top: ${pixels}, behavior: 'smooth' });
        return JSON.stringify({ success: true });
    })()`;
}

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
    });

    const abortRef = useRef(false);
    const stepsRef = useRef<AgentStep[]>([]);
    const MAX_STEPS = 15;

    // ─── Capture DOM snapshot ───────────────────────────────
    const captureDomSnapshot = useCallback(async (): Promise<string> => {
        if (!isElectron || !webviewRef.current?.executeJavaScript) return "[]";
        try {
            const raw = await webviewRef.current.executeJavaScript(DOM_SNAPSHOT_SCRIPT);
            return typeof raw === "string" ? raw : JSON.stringify(raw);
        } catch (err) {
            debug.log("🤖 [Agent] DOM snapshot failed:", err);
            return "[]";
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

    // ─── Wait until webview is ready ────────────────────────
    const waitUntilReady = useCallback(async (label: string): Promise<boolean> => {
        const wv = webviewRef.current;
        if (!wv?.executeJavaScript) return false;

        for (let i = 0; i < 8; i++) {
            // Wait if the webview is still loading
            if (wv.isLoading?.()) {
                debug.log(`🤖 [Agent] ${label}: webview loading, waiting... (${i + 1}/8)`);
                setAgentState(prev => ({ ...prev, currentAction: "⏳ Page loading..." }));
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            // Test if executeJavaScript works
            try {
                await wv.executeJavaScript("1", true);
                return true;
            } catch {
                debug.log(`🤖 [Agent] ${label}: script injection blocked, waiting... (${i + 1}/8)`);
                setAgentState(prev => ({ ...prev, currentAction: "⏳ Waiting for page..." }));
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        debug.log(`🤖 [Agent] ${label}: webview never became ready after 8 attempts`);
        return false;
    }, [webviewRef]);

    // ─── Execute a single action ────────────────────────────
    const executeAction = useCallback(async (action: string, args: Record<string, any>): Promise<string> => {
        const wv = webviewRef.current;
        if (!wv?.executeJavaScript) return "No webview available";

        // Ensure webview is ready before executing
        const ready = await waitUntilReady("pre-action");
        if (!ready) return "Action failed: webview not ready after waiting";

        const tryExecute = async (attempt: number): Promise<string> => {
            try {
                switch (action) {
                    case "click_at":
                    case "click": {
                        const cx = args.x ?? 0;
                        const cy = args.y ?? 0;
                        const result = await wv.executeJavaScript(buildClickAtScript(cx, cy), true);
                        const parsed = JSON.parse(result);
                        return parsed.success ? `✓ ${args.description || parsed.tag}` : parsed.error;
                    }
                    case "type_text": {
                        const tx = args.x ?? 0;
                        const ty = args.y ?? 0;
                        const result = await wv.executeJavaScript(
                            buildTypeAtScript(tx, ty, args.text, args.clear_first !== false), true
                        );
                        const parsed = JSON.parse(result);
                        const preview = args.text.length > 50 ? args.text.substring(0, 50) + '…' : args.text;
                        return parsed.success ? `✓ "${preview}"` : parsed.error;
                    }
                    case "scroll": {
                        const result = await wv.executeJavaScript(
                            buildScrollScript(args.direction || "down", args.amount || 400), true
                        );
                        const parsed = JSON.parse(result);
                        return parsed.success ? `Scrolled ${args.direction}` : "Scroll failed";
                    }
                    case "navigate": {
                        const url = args.url || '';
                        wv.loadURL(url);
                        await new Promise(r => setTimeout(r, 3000)); // Wait for page load
                        await waitUntilReady('navigate');
                        return `✓ Navigated to ${url}`;
                    }
                    default:
                        return `Unknown action: ${action}`;
                }
            } catch (err) {
                const errStr = String(err);
                if (attempt < 3) {
                    debug.log(`🤖 [Agent] Action failed (attempt ${attempt + 1}), re-checking readiness...`);
                    await new Promise(r => setTimeout(r, 2000));
                    const ok = await waitUntilReady(`retry-${attempt + 1}`);
                    if (ok) return tryExecute(attempt + 1);
                }
                return `Action failed: ${errStr.substring(0, 100)}`;
            }
        };

        return tryExecute(0);
    }, [webviewRef, waitUntilReady]);

    // ─── Run one step of the agent loop ─────────────────────
    const runStep = useCallback(async (task: string): Promise<boolean> => {
        if (abortRef.current) return false;

        // Wait for webview to be ready
        const ready = await waitUntilReady("step-start");
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

        const domSnapshot = await captureDomSnapshot();
        const screenshot = await captureScreenshot();

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
                            setAgentState(prev => ({ ...prev, currentAction: `🧠 ${event.content}` }));
                        }

                        if (event.type === "action") {
                            const { action, args } = event;
                            debug.log(`🤖 [Agent] Action: ${action}`, args);

                            // Check for terminal actions
                            if (action === "done") {
                                const step: AgentStep = {
                                    action: "done",
                                    description: args.summary || "Task complete",
                                };
                                stepsRef.current = [...stepsRef.current, step];
                                setAgentState(prev => ({
                                    ...prev,
                                    status: "done",
                                    steps: stepsRef.current,
                                    currentAction: `✅ ${args.summary || "Done"}`,
                                    pauseQuestion: null,
                                }));
                                return false; // Stop loop
                            }

                            if (action === "ask_user") {
                                const step: AgentStep = {
                                    action: "ask_user",
                                    description: args.question || "Waiting for user input",
                                };
                                stepsRef.current = [...stepsRef.current, step];
                                setAgentState(prev => ({
                                    ...prev,
                                    status: "paused",
                                    steps: stepsRef.current,
                                    currentAction: `⏸️ ${args.question}`,
                                    pauseQuestion: args.question || "Continue?",
                                }));
                                return false; // Stop loop — user decides
                            }

                            // Execute the action
                            setAgentState(prev => ({
                                ...prev,
                                currentAction: `🖱️ ${args.description || action}`,
                            }));

                            const result = await executeAction(action, args);

                            // Extract cursor position from result
                            try {
                                const match = result.match(/\((\d+),\s*(\d+)\)/);
                                if (match) {
                                    const cx = parseInt(match[1]);
                                    const cy = parseInt(match[2]);
                                    setAgentState(prev => ({ ...prev, cursorPos: { x: cx, y: cy } }));
                                }
                            } catch { /* */ }

                            const step: AgentStep = {
                                action,
                                selector: args.selector,
                                value: args.text,
                                description: args.description || action,
                                result,
                            };
                            stepsRef.current = [...stepsRef.current, step];
                            setAgentState(prev => ({
                                ...prev,
                                steps: stepsRef.current,
                            }));

                            // Wait for page to settle (extra time for SPA transitions)
                            await new Promise(r => setTimeout(r, 2000));
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
    }, [webviewRef, captureDomSnapshot, captureScreenshot, executeAction]);

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
        });

        let stepCount = 0;
        let shouldContinue = true;
        let consecutiveFailures = 0;

        while (shouldContinue && !abortRef.current && stepCount < MAX_STEPS) {
            stepCount++;
            shouldContinue = await runStep(task);

            // Check for consecutive failures
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
                currentAction: "⚠️ Max steps reached",
            }));
        }

        // Auto-dismiss status bar after 5 seconds
        setTimeout(() => {
            setAgentState(prev => {
                if (prev.status === "done" || prev.status === "error") {
                    return { ...prev, status: "idle", currentAction: "", pauseQuestion: null };
                }
                return prev;
            });
        }, 5000);
    }, [runStep]);

    // ─── Continue after pause ───────────────────────────────
    const continueAgent = useCallback(async (task: string) => {
        // Mark ask_user step as confirmed
        const lastStep = stepsRef.current[stepsRef.current.length - 1];
        if (lastStep?.action === "ask_user") {
            lastStep.result = "User confirmed — continue";
        }

        setAgentState(prev => ({
            ...prev,
            status: "running",
            pauseQuestion: null,
            currentAction: "▶️ Continuing...",
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

    return {
        agentState,
        startAgent,
        continueAgent,
        stopAgent,
    };
}
