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
    // SoM (Set-of-Mark) map: stores center coordinates by ID for click resolution
    const somMap = {};
    
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
        '[role="textbox"]',
        '[onclick]',
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        '[data-text="true"]',
    ];
    
    const seen = new Set();
    let somId = 0;
    for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
            if (seen.has(el) || result.length >= MAX_ELEMENTS) continue;
            seen.add(el);
            
            const rect = el.getBoundingClientRect();
            // Skip invisible elements
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
            
            const id = somId++;
            const cx = Math.round(rect.x + rect.width / 2);
            const cy = Math.round(rect.y + rect.height / 2);
            
            // Store center coordinates for SoM click resolution
            somMap[id] = { x: cx, y: cy, w: Math.round(rect.width), h: Math.round(rect.height) };
            
            // Get visible text
            const text = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || '').trim().substring(0, 60);
            const tag = el.tagName.toLowerCase();
            const type = el.getAttribute('type') || '';
            const href = el.getAttribute('href') || '';
            const role = el.getAttribute('role') || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            
            // Compact text format: [ID] tag "label" (x:N y:N w:N h:N)
            let label = ariaLabel || text;
            let line = '[' + id + '] ' + tag;
            if (type) line += '[' + type + ']';
            if (role) line += '[role=' + role + ']';
            if (label) line += ' "' + label.replace(/"/g, "'") + '"';
            if (href) line += ' href="' + href.substring(0, 80) + '"';
            line += ' (x:' + cx + ' y:' + cy + ' w:' + Math.round(rect.width) + ' h:' + Math.round(rect.height) + ')';
            
            result.push(line);
        }
    }
    
    // Store SoM map globally for click resolution
    window.__biamos_som = somMap;
    
    return result.join('\\n');
})()`;

// ─── Action Execution Scripts ───────────────────────────────

function buildClickAtScript(x: number, y: number): string {
    const rx = Math.round(x);
    const ry = Math.round(y);
    return `
    (function() {
        const x = ${rx}, y = ${ry};
        const el = document.elementFromPoint(x, y);
        if (!el) return JSON.stringify({ success: false, error: 'No element at (' + x + ', ' + y + ')' });

        // ── Pre-Flight Z-Index Check ──
        // Verify the element at coordinates is actually the intended target,
        // not a cookie banner, overlay, or modal sitting on top.
        el.scrollIntoView({ block: 'nearest' });
        const topEl = document.elementFromPoint(x, y);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
            // Something is covering our target — report it
            const blocker = topEl.tagName.toLowerCase() + (topEl.className ? '.' + String(topEl.className).split(' ')[0] : '');
            return JSON.stringify({ success: false, error: 'Element blocked by overlay: ' + blocker + ' at (' + x + ', ' + y + ')' });
        }
        const clickTarget = topEl || el;

        // ── Hover Injection ──
        // Simulate realistic mouse approach: mousemove → mouseenter → mouseover
        // This activates lazy-loaded event handlers and hover-triggered menus.
        const hoverOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        clickTarget.dispatchEvent(new MouseEvent('mousemove', hoverOpts));
        clickTarget.dispatchEvent(new MouseEvent('mouseenter', { ...hoverOpts, bubbles: false }));
        clickTarget.dispatchEvent(new MouseEvent('mouseover', hoverOpts));

        // ── Click Sequence ──
        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        clickTarget.dispatchEvent(new MouseEvent('mousedown', opts));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', opts));
        clickTarget.dispatchEvent(new MouseEvent('click', opts));
        return JSON.stringify({ success: true, x: x, y: y, tag: clickTarget.tagName.toLowerCase() });
    })()`;
}

function buildTypeAtScript(x: number, y: number, text: string, clearFirst: boolean): string {
    const endsWithTab = text.endsWith('\t');
    const endsWithEnter = text.endsWith('\n');
    let cleanText = text;
    if (endsWithTab) cleanText = text.slice(0, -1);
    if (endsWithEnter) cleanText = text.replace(/\n+$/, '');

    const safeText = JSON.stringify(cleanText);
    const rx = Math.round(x);
    const ry = Math.round(y);

    const parts: string[] = [];
    parts.push('(function(){try{');
    parts.push('var el=document.elementFromPoint(' + rx + ',' + ry + ');');
    parts.push('if(!el)return JSON.stringify({success:false,error:"No element at coordinates"});');

    // If not editable, walk up to closest editable parent, then try children
    parts.push('function isEd(e){return e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.isContentEditable;}');
    parts.push('if(!isEd(el)){');
    parts.push('var p=el.closest("input,textarea,[contenteditable=true]");');
    parts.push('if(p){el=p;}else{');
    parts.push('var c=el.querySelector("input,textarea,[contenteditable=true]");');
    parts.push('if(c){el=c;}}');
    parts.push('}');

    parts.push('el.focus();');

    // Clear if needed
    if (clearFirst) {
        parts.push('if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){el.value="";}');
        parts.push('else if(el.isContentEditable){el.textContent="";}');
    }

    // Type text
    parts.push('if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){');
    parts.push('el.value=' + safeText + ';');
    parts.push('el.dispatchEvent(new Event("input",{bubbles:true}));');
    parts.push('el.dispatchEvent(new Event("change",{bubbles:true}));');
    parts.push('}else if(el.isContentEditable){');
    // Use execCommand instead of innerText — this triggers React/Draft.js
    // synthetic events so the app's internal state updates correctly.
    // Without this, Twitter's Post button stays disabled, Gmail ignores the text, etc.
    parts.push('el.focus();');
    if (clearFirst) {
        parts.push('document.execCommand("selectAll",false,null);');
    }
    parts.push('document.execCommand("insertText",false,' + safeText + ');');
    parts.push('}else{');
    parts.push('return JSON.stringify({success:false,error:"No editable element found"});');
    parts.push('}');

    // Tab/Enter key events
    if (endsWithEnter) {
        parts.push('el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true}));');
    }
    if (endsWithTab) {
        parts.push('el.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",code:"Tab",keyCode:9,bubbles:true}));');
    }

    parts.push('return JSON.stringify({success:true,x:' + rx + ',y:' + ry + ',tag:el.tagName.toLowerCase()});');
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

// ─── Focus + Detect Script (for native typing) ─────────────
// Focuses the editable element at x,y and returns whether it's
// contenteditable (for native sendInputEvent) or input/textarea.

function buildFocusScript(x: number, y: number, clearFirst: boolean): string {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const parts: string[] = [];
    parts.push('(function(){try{');
    parts.push('var el=document.elementFromPoint(' + rx + ',' + ry + ');');
    parts.push('if(!el)return JSON.stringify({success:false,error:"No element at coordinates"});');
    // Walk up / down to find editable element
    parts.push('function isEd(e){return e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.isContentEditable;}');
    parts.push('if(!isEd(el)){');
    parts.push('var p=el.closest("input,textarea,[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('if(p){el=p;}else{');
    parts.push('var c=el.querySelector("input,textarea,[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('if(c){el=c;}else{');
    // Global fallback: find the nearest visible contenteditable/textbox in the viewport
    parts.push('var allCE=document.querySelectorAll("[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('var best=null,bestDist=Infinity;');
    parts.push('for(var i=0;i<allCE.length;i++){');
    parts.push('var r=allCE[i].getBoundingClientRect();');
    parts.push('if(r.width>0&&r.height>0&&r.top>=0&&r.bottom<=window.innerHeight){');
    parts.push('var dx=(' + rx + ')-(r.x+r.width/2),dy=(' + ry + ')-(r.y+r.height/2);');
    parts.push('var dist=Math.sqrt(dx*dx+dy*dy);');
    parts.push('if(dist<bestDist){bestDist=dist;best=allCE[i];}');
    parts.push('}');
    parts.push('}');
    parts.push('if(best){el=best;}');
    parts.push('}}');
    parts.push('}');
    parts.push('if(!isEd(el))return JSON.stringify({success:false,error:"No editable element found"});');
    parts.push('el.focus();');
    parts.push('var isCE=el.isContentEditable&&el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA";');
    // Clear content if needed
    if (clearFirst) {
        parts.push('if(isCE){document.execCommand("selectAll",false,null);document.execCommand("delete",false,null);}');
        parts.push('else if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"){el.value="";el.dispatchEvent(new Event("input",{bubbles:true}));}');
    }
    parts.push('return JSON.stringify({success:true,isContentEditable:isCE,tag:el.tagName.toLowerCase()});');
    parts.push('}catch(e){return JSON.stringify({success:false,error:e.message});}})()');;
    return parts.join('');
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
    const MAX_STEPS = 40;

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

    // ─── Wait for page to be ready (DOM silence + not loading) ─
    // Replaces hardcoded setTimeout waits with intelligent detection:
    // 1. Webview must not be loading
    // 2. JS must be executable
    // 3. DOM must be "silent" (no mutations for 300ms)
    // Falls back to timeout cap of 8s.
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
                break; // JS works, proceed to Phase 2
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

            // Poll until DOM is silent for DOM_SILENCE_MS
            let silenceChecks = 0;
            while (silenceChecks < 16) {
                if (Date.now() - startTime > MAX_WAIT_MS) {
                    debug.log(`🤖 [Agent] ${label}: timeout after ${MAX_WAIT_MS}ms`);
                    break;
                }
                const elapsed = await wv.executeJavaScript(
                    `Date.now() - (window.__biamos_lastMutation || 0)`, true
                );
                if (elapsed >= DOM_SILENCE_MS) {
                    debug.log(`🤖 [Agent] ${label}: DOM silent for ${elapsed}ms ✔`);
                    return true;
                }
                silenceChecks++;
                await new Promise(r => setTimeout(r, 200));
            }
        } catch {
            debug.log(`🤖 [Agent] ${label}: MutationObserver failed, basic check`);
        }

        // Final check: can we execute JS?
        try {
            await wv.executeJavaScript("1", true);
            return true;
        } catch {
            debug.log(`🤖 [Agent] ${label}: webview never became ready`);
            return false;
        }
    }, [webviewRef]);

    // ─── Execute a single action ────────────────────────────
    const executeAction = useCallback(async (action: string, args: Record<string, any>): Promise<string> => {
        const wv = webviewRef.current;
        if (!wv?.executeJavaScript) return "No webview available";

        // Ensure webview is ready before executing
        const ready = await waitForPageReady("pre-action");
        if (!ready) return "Action failed: webview not ready after waiting";

        const tryExecute = async (attempt: number): Promise<string> => {
            try {
                switch (action) {
                    case "click_at": {
                        const cx = args.x ?? 0;
                        const cy = args.y ?? 0;
                        // Capture URL before click to detect navigation
                        let urlBefore = '';
                        try { urlBefore = await wv.executeJavaScript('location.href', true); } catch { /* */ }

                        const result = await wv.executeJavaScript(buildClickAtScript(cx, cy), true);
                        const parsed = JSON.parse(result);
                        if (!parsed.success) return parsed.error;

                        // Detect if the click caused a navigation (e.g. clicking a link)
                        await new Promise(r => setTimeout(r, 1500));
                        let urlAfter = '';
                        try { urlAfter = await wv.executeJavaScript('location.href', true); } catch { urlAfter = ''; }
                        if (urlAfter && urlBefore && urlAfter !== urlBefore) {
                            debug.log(`🤖 [Agent] Click caused navigation: ${urlBefore} → ${urlAfter}`);
                            // Wait for the new page to load
                            await waitForPageReady('post-click-nav');
                        }

                        return `✓ ${args.description || parsed.tag}`;
                    }
                    case "click": {
                        // ── SoM-ID Click ──
                        // Resolve element ID from the Set-of-Mark map,
                        // then delegate to coordinate-based click.
                        const somId = args.id;
                        if (somId === undefined || somId === null) {
                            return 'Action failed: click requires an "id" parameter';
                        }

                        // Resolve SoM ID to coordinates
                        let coords: { x: number; y: number } | null = null;
                        try {
                            const somResult = await wv.executeJavaScript(
                                `JSON.stringify(window.__biamos_som && window.__biamos_som[${somId}] || null)`, true
                            );
                            coords = JSON.parse(somResult);
                        } catch { /* */ }

                        if (!coords) {
                            return `Action failed: SoM ID [${somId}] not found — element may have changed`;
                        }

                        debug.log(`🤖 [Agent] SoM click: [${somId}] → (${coords.x}, ${coords.y})`);

                        // Ghost Mouse: emit SoM-resolved coordinates
                        setAgentState(prev => ({ ...prev, cursorPos: { x: coords.x, y: coords.y } }));

                        // Capture URL before click to detect navigation
                        let somUrlBefore = '';
                        try { somUrlBefore = await wv.executeJavaScript('location.href', true); } catch { /* */ }

                        const somResult = await wv.executeJavaScript(buildClickAtScript(coords.x, coords.y), true);
                        const somParsed = JSON.parse(somResult);
                        if (!somParsed.success) return somParsed.error;

                        // Detect navigation
                        await new Promise(r => setTimeout(r, 1500));
                        let somUrlAfter = '';
                        try { somUrlAfter = await wv.executeJavaScript('location.href', true); } catch { somUrlAfter = ''; }
                        if (somUrlAfter && somUrlBefore && somUrlAfter !== somUrlBefore) {
                            debug.log(`🤖 [Agent] SoM click caused navigation: ${somUrlBefore} → ${somUrlAfter}`);
                            await waitForPageReady('post-click-nav');
                        }

                        return `✓ ${args.description || somParsed.tag}`;
                    }
                    case "type_text": {
                        const tx = args.x ?? 0;
                        const ty = args.y ?? 0;
                        const text = args.text || '';
                        const clearFirst = args.clear_first !== false;

                        // Auto-retry if element not yet editable
                        for (let typeAttempt = 0; typeAttempt < 3; typeAttempt++) {
                            // Step 1: Focus element and detect type
                            const focusResult = await wv.executeJavaScript(
                                buildFocusScript(tx, ty, clearFirst), true
                            );
                            const focusParsed = JSON.parse(focusResult);

                            if (!focusParsed.success) {
                                if (typeAttempt < 2 && focusParsed.error?.includes('editable')) {
                                    console.log(`⏳ type_text retry ${typeAttempt + 1}/2 — waiting for element...`);
                                    await new Promise(r => setTimeout(r, 1500));
                                    continue;
                                }
                                return focusParsed.error;
                            }

                            if (focusParsed.isContentEditable && wv.sendInputEvent) {
                                // ── Native input for contenteditable ──────
                                // Uses Electron's native keyboard API — indistinguishable
                                // from real typing. Works with Twitter, Gmail, Notion, etc.

                                // Let the editor settle after focus (prevents lost input)
                                await new Promise(r => setTimeout(r, 500));

                                for (const char of text) {
                                    if (char === '\n') {
                                        wv.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
                                        wv.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
                                    } else if (char === '\t') {
                                        wv.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
                                        wv.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
                                    } else {
                                        wv.sendInputEvent({ type: 'char', keyCode: char });
                                    }
                                }

                                // Give time for the editor to process all input events
                                await new Promise(r => setTimeout(r, 300));

                                const preview = text.length > 50 ? text.substring(0, 50) + '…' : text;
                                return `✓ "${preview}"`;
                            } else {
                                // ── Standard input/textarea (value assignment works fine) ──
                                const result = await wv.executeJavaScript(
                                    buildTypeAtScript(tx, ty, text, clearFirst), true
                                );
                                const parsed = JSON.parse(result);
                                if (parsed.success) {
                                    const preview = text.length > 50 ? text.substring(0, 50) + '…' : text;
                                    return `✓ "${preview}"`;
                                }
                                if (typeAttempt < 2 && parsed.error?.includes('editable')) {
                                    console.log(`⏳ type_text retry ${typeAttempt + 1}/2 — waiting for element...`);
                                    await new Promise(r => setTimeout(r, 1500));
                                    continue;
                                }
                                return parsed.error;
                            }
                        }
                        return 'type_text failed after 3 attempts';
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
                        // Navigate from INSIDE the page (bypasses Gmail's beforeunload)
                        try {
                            await wv.executeJavaScript(
                                'window.onbeforeunload=null;window.location.href=' + JSON.stringify(url) + ';'
                            , true);
                        } catch {
                            // Fallback if executeJavaScript fails
                            wv.loadURL(url).catch(() => {});
                        }
                        await waitForPageReady('navigate');
                        const actualUrl = wv.getURL?.() || 'unknown';
                        console.log(`🧭 Navigate: wanted=${url} → actual=${actualUrl}`);
                        // Detect navigation failure by checking page content
                        // Electron sets the URL even when the page fails to load,
                        // so we check the actual body text for error indicators.
                        let pageContent = '';
                        try {
                            pageContent = await wv.executeJavaScript(
                                '(document.title + " " + (document.body?.innerText?.substring(0, 300) || "")).toLowerCase()', true
                            );
                        } catch { /* */ }
                        const errorPatterns = [
                            'can\'t be reached', 'cannot be reached', 'not be reached',
                            'err_name_not_resolved', 'err_connection_refused', 'err_connection_timed_out',
                            'dns_probe', 'took too long to respond', 'no internet',
                            'refused to connect', 'is not available', 'nxdomain',
                        ];
                        const isNavError = errorPatterns.some(p => pageContent.includes(p));
                        if (isNavError) {
                            console.log(`🧭 Navigate FAILED: ${url} → error page detected`);
                            return `Navigation FAILED: "${url}" could not be loaded — the site cannot be reached. The URL may be MISSPELLED. Use search_web to find the correct URL.`;
                        }
                        return `✓ Navigated to ${url}`;
                    }
                    case "go_back": {
                        wv.goBack();
                        await waitForPageReady('go_back');
                        const backUrl = wv.getURL?.() || 'unknown';
                        console.log(`🧭 Go back: now at ${backUrl}`);
                        return `✓ Went back to previous page`;
                    }
                    case "search_web": {
                        const query = args.query || '';
                        console.log(`🔍 Agent searching: "${query}"`);
                        try {
                            const resp = await fetch('http://localhost:3001/api/agents/search', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ query }),
                            });
                            const data = await resp.json();
                            const results = data.results || 'No results';
                            console.log(`🔍 Search results: ${data.count} found`);
                            return `✓ Search results for "${query}":\n${results}`;
                        } catch (e) {
                            return `Search failed: ${e}`;
                        }
                    }
                    case "take_notes": {
                        // Notes are stored in the action history (result field)
                        // and persist across page navigations. The LLM sees them
                        // in the "ACTIONS TAKEN SO FAR" section of subsequent steps.
                        const notes = args.notes || '';
                        console.log(`📝 Agent notes: ${notes.substring(0, 100)}...`);
                        return `📝 Notes saved: ${notes}`;
                    }
                    default:
                        return `Unknown action: ${action}`;
                }
            } catch (err) {
                const errStr = String(err);
                if (attempt < 3) {
                    debug.log(`🤖 [Agent] Action failed (attempt ${attempt + 1}), re-checking readiness...`);
                    await new Promise(r => setTimeout(r, 2000));
                    const ok = await waitForPageReady(`retry-${attempt + 1}`);
                    if (ok) return tryExecute(attempt + 1);
                }
                return `Action failed: ${errStr.substring(0, 100)}`;
            }
        };

        return tryExecute(0);
    }, [webviewRef, waitForPageReady]);

    // ─── Run one step of the agent loop ─────────────────────
    const runStep = useCallback(async (task: string): Promise<boolean> => {
        if (abortRef.current) return false;

        // Wait for webview to be ready
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

                            // ── Ghost Mouse: emit cursor position BEFORE executing ──
                            // This makes the AI cursor visible for every action type.
                            if (action === "click_at" || action === "type_text") {
                                const gx = args.x ?? 0;
                                const gy = args.y ?? 0;
                                if (gx > 0 || gy > 0) {
                                    setAgentState(prev => ({ ...prev, cursorPos: { x: gx, y: gy } }));
                                }
                            } else if (action === "scroll" || action === "navigate" || action === "go_back") {
                                // Move cursor to viewport center for non-positional actions
                                try {
                                    const wv = webviewRef.current;
                                    const bounds = wv?.getBoundingClientRect?.();
                                    if (bounds) {
                                        setAgentState(prev => ({
                                            ...prev,
                                            cursorPos: {
                                                x: Math.round(bounds.width / 2),
                                                y: Math.round(bounds.height / 2),
                                            },
                                        }));
                                    }
                                } catch { /* */ }
                            }
                            // Note: "click" (SoM) cursor position is resolved during
                            // executeAction when coordinates become available.

                            // Execute the action
                            const stepNum = stepsRef.current.length + 1;
                            setAgentState(prev => ({
                                ...prev,
                                currentAction: `🖱️ [${stepNum}/${MAX_STEPS}] ${args.description || action}`,
                            }));

                            const result = await executeAction(action, args);

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

                            // Wait for page to settle (intelligent DOM silence detection)
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
                currentAction: `⚠️ Step limit reached (${MAX_STEPS}/${MAX_STEPS}). Task may be incomplete — try breaking it into smaller commands.`,
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
