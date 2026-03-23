// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Action Dispatcher ────────────────────────────────
// Executes individual agent actions via the webview.
//
// ARCHITECTURE NOTE (Gemini CTO Review):
// This module receives React dependencies via ActionContext — it does NOT
// import React or call setAgentState directly. All state updates flow
// back to the hook via return values or the context callbacks.
// Only genui uses setAgentState (via context) because it's a terminal action.

import { debug } from "../../../../utils/debug";
import type { AgentStep } from "./types";
import { buildClickAtScript, buildFocusScript, buildScrollScript } from "./scripts";

// ─── Action Context ─────────────────────────────────────────
// Passed by the hook — provides controlled access to React deps.

export interface ActionContext {
    /** The webview element ref */
    wv: any;
    /** Wait for page to be ready (DOM silence + not loading) */
    waitForPageReady: (label: string) => Promise<boolean>;
    /** Read current step history (for search limits, genui data collection) */
    getSteps: () => AgentStep[];
    /** Read structured search data (OG metadata etc.) — separate from step history */
    getStructuredData: () => any[];
    /** Add structured search data (called by search_web) */
    addStructuredData: (data: any[]) => void;
    /** Update steps + state (ONLY for terminal actions like genui) */
    setTerminalState: (step: AgentStep, status: string) => void;
}

// ─── Execute a single action ────────────────────────────────
// Returns a result string. The hook interprets this and updates React state.
// Special return: '__GENUI_DONE__' = terminal action, agent should stop.

export async function executeAction(
    action: string,
    args: Record<string, any>,
    ctx: ActionContext,
): Promise<string> {
    const { wv, waitForPageReady } = ctx;
    if (!wv?.executeJavaScript) return "No webview available";

    const ready = await waitForPageReady("pre-action");
    if (!ready) return "Action failed: webview not ready after waiting";

    const tryExecute = async (attempt: number): Promise<string> => {
        try {
            switch (action) {
                // ─── Click at coordinates ───────────────
                case "click_at": {
                    const cx = args.x ?? 0;
                    const cy = args.y ?? 0;
                    let urlBefore = '';
                    try { urlBefore = await wv.executeJavaScript('location.href', true); } catch { /* */ }

                    const result = await wv.executeJavaScript(buildClickAtScript(cx, cy), true);
                    const parsed = JSON.parse(result);
                    if (!parsed.success) return parsed.error;

                    await waitForPageReady('post-click');
                    let urlAfter = '';
                    try { urlAfter = await wv.executeJavaScript('location.href', true); } catch { urlAfter = ''; }
                    if (urlAfter && urlBefore && urlAfter !== urlBefore) {
                        debug.log(`🤖 [Agent] Click caused navigation: ${urlBefore} → ${urlAfter}`);
                        await waitForPageReady('post-click-nav');
                    }

                    return `✓ ${args.description || parsed.tag}`;
                }

                // ─── Click by SoM ID ────────────────────
                case "click": {
                    const somId = args.id;
                    if (somId === undefined || somId === null) {
                        return 'Action failed: click requires an "id" parameter';
                    }

                    let coords: { x: number; y: number } | null = null;
                    let clickSel: string | null = null;
                    try {
                        const somResult = await wv.executeJavaScript(
                            `JSON.stringify(window.__biamos_som && window.__biamos_som[${somId}] || null)`, true
                        );
                        const somData = JSON.parse(somResult);
                        if (somData) {
                            coords = { x: somData.x, y: somData.y };
                            clickSel = somData.sel || null;

                            // If we have a selector, get FRESH coordinates from element's current position
                            if (clickSel) {
                                try {
                                    const safeClickSel = JSON.stringify(clickSel);
                                    const freshResult = await wv.executeJavaScript(`
                                        (function() {
                                            var el = document.querySelector(${safeClickSel});
                                            if (!el) return 'null';
                                            el.scrollIntoView({ block: 'nearest' });
                                            var r = el.getBoundingClientRect();
                                            return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
                                        })()
                                    `, true);
                                    const fc = JSON.parse(freshResult);
                                    if (fc) {
                                        coords = fc;
                                        debug.log(`🎯 [Agent] SoM click [${somId}]: selector "${clickSel}" → fresh coords (${fc.x}, ${fc.y})`);
                                    }
                                } catch { /* use snapshot coords */ }
                            }
                        }
                    } catch { /* */ }

                    if (!coords) {
                        return `Action failed: SoM ID [${somId}] not found — element may have changed`;
                    }

                    debug.log(`🤖 [Agent] SoM click: [${somId}] → (${coords.x}, ${coords.y})${clickSel ? ` sel="${clickSel}"` : ''}`);

                    let somUrlBefore = '';
                    try { somUrlBefore = await wv.executeJavaScript('location.href', true); } catch { /* */ }

                    const somResult = await wv.executeJavaScript(buildClickAtScript(coords.x, coords.y), true);
                    const somParsed = JSON.parse(somResult);
                    if (!somParsed.success) return somParsed.error;

                    await waitForPageReady('post-som-click');
                    let somUrlAfter = '';
                    try { somUrlAfter = await wv.executeJavaScript('location.href', true); } catch { somUrlAfter = ''; }
                    if (somUrlAfter && somUrlBefore && somUrlAfter !== somUrlBefore) {
                        debug.log(`🤖 [Agent] SoM click caused navigation: ${somUrlBefore} → ${somUrlAfter}`);
                        await waitForPageReady('post-click-nav');
                    }

                    return `✓ ${args.description || somParsed.tag}`;
                }

                // ─── Type text (native) ─────────────────
                case "type_text": {
                    let tx = args.x ?? 0;
                    let ty = args.y ?? 0;
                    let selectorFocusWorked = false;

                    const hasId = args.id !== undefined && args.id !== null;
                    const hasCoords = tx > 0 || ty > 0;
                    if (!hasId && !hasCoords) {
                        debug.log(`🚫 [type_text] REJECTED: no id and no x,y provided`);
                        return `⚠️ type_text requires a target. Use type_text(id=N) with the SoM ID from the DOM snapshot.`;
                    }

                    // ── Step 1: Resolve SoM ID + try selector focus ──
                    if (hasId) {
                        try {
                            const somResult = await wv.executeJavaScript(
                                `JSON.stringify(window.__biamos_som && window.__biamos_som[${args.id}] || null)`, true
                            );
                            const somData = JSON.parse(somResult);
                            if (somData) {
                                tx = somData.x;
                                ty = somData.y;
                                if (somData.sel) {
                                    try {
                                        const safeSel = JSON.stringify(somData.sel);  // handles ALL escaping
                                        const sfRes = await wv.executeJavaScript(`(function(){var el=document.querySelector(${safeSel});if(!el)return JSON.stringify({ok:false});el.scrollIntoView({block:'nearest'});el.click();el.focus();return JSON.stringify({ok:true,tag:el.tagName,name:el.getAttribute('name')||'',role:el.getAttribute('role')||''});})()`, true);
                                        const sf = JSON.parse(sfRes);
                                        if (sf.ok) {
                                            selectorFocusWorked = true;
                                            debug.log(`🎯 [type_text] Selector OK: "${somData.sel}" → ${sf.tag} name=${sf.name} role=${sf.role}`);
                                        } else {
                                            debug.log(`⚠️ [type_text] Selector "${somData.sel}" not found, using coords`);
                                        }
                                    } catch (e) {
                                        debug.log(`⚠️ [type_text] Selector error: ${e}`);
                                    }
                                }
                                debug.log(`🧠 [type_text] SoM [${args.id}] (${tx},${ty}) sel="${somData.sel||'none'}" selectorOk=${selectorFocusWorked}`);
                            } else {
                                debug.log(`⚠️ [type_text] SoM [${args.id}] not found`);
                            }
                        } catch { /* */ }
                    }

                    const text = args.text || '';
                    const clearFirst = args.clear_first === true;
                    const submitAfter = args.submit_after === true;

                    // ── Step 2: Focus (ONLY via coords when selector didn't work) ──
                    // CRITICAL: When selector worked, DO NOT re-focus via coords!
                    // Native mouseDown + buildFocusScript use pixel coords that can
                    // hit the WRONG element (Gmail body instead of subject)
                    if (!selectorFocusWorked) {
                        if (wv.sendInputEvent) {
                            wv.sendInputEvent({ type: 'mouseDown', x: Math.round(tx), y: Math.round(ty), button: 'left', clickCount: 1 });
                            await new Promise(r => setTimeout(r, 50));
                            wv.sendInputEvent({ type: 'mouseUp', x: Math.round(tx), y: Math.round(ty), button: 'left', clickCount: 1 });
                            await new Promise(r => setTimeout(r, 500));
                        }
                        for (let att = 0; att < 3; att++) {
                            const fr = await wv.executeJavaScript(buildFocusScript(tx, ty), true);
                            const fp = JSON.parse(fr);
                            if (!fp.success) {
                                if (att < 2 && fp.error?.includes('editable')) {
                                    await new Promise(r => setTimeout(r, 1500));
                                    continue;
                                }
                                return fp.error;
                            }
                            break;
                        }
                    } else {
                        await new Promise(r => setTimeout(r, 200));
                    }

                    // ── Step 3: Type text ──
                    if (!wv.sendInputEvent) return 'type_text failed: sendInputEvent not available';

                    // ── Smart character limit for social media ──
                    const currentUrl = wv.getURL?.() || '';
                    let typingText = text;
                    const charLimits: Record<string, number> = {
                        'twitter.com': 270, 'x.com': 270,
                    };
                    for (const [domain, limit] of Object.entries(charLimits)) {
                        if (currentUrl.includes(domain) && typingText.length > limit) {
                            const cutAt = typingText.lastIndexOf(' ', limit - 2);
                            typingText = (cutAt > 100 ? typingText.substring(0, cutAt) : typingText.substring(0, limit - 2)) + '…';
                            debug.log(`✂️ [type_text] Auto-trimmed from ${text.length} to ${typingText.length} chars for ${domain}`);
                            break;
                        }
                    }

                    try {
                        const ac = await wv.executeJavaScript(`JSON.stringify({tag:document.activeElement?.tagName,name:document.activeElement?.getAttribute('name')||'',role:document.activeElement?.getAttribute('role')||''})`, true);
                        debug.log(`🔍 [Focus Verify] ${ac}`);
                    } catch { /* */ }

                    if (clearFirst) {
                        wv.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
                        wv.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
                        await new Promise(r => setTimeout(r, 50));
                        wv.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
                        wv.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
                        await new Promise(r => setTimeout(r, 150));
                    }

                    await new Promise(r => setTimeout(r, 300));

                    // ── Duplicate detection: skip if text is already in the field ──
                    // Prevents the LLM from re-typing content across multiple steps
                    if (!clearFirst) {
                        try {
                            const currentContent = await wv.executeJavaScript(`(function(){
                                var el = document.activeElement;
                                if (!el) return '';
                                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
                                if (el.isContentEditable) return el.innerText || el.textContent || '';
                                return '';
                            })()`, true);
                            if (currentContent && typeof currentContent === 'string' && currentContent.length > 10) {
                                // Check if the text we want to type is already present
                                const normalCurrent = currentContent.replace(/\s+/g, ' ').trim();
                                const normalNew = typingText.replace(/\s+/g, ' ').trim();
                                if (normalCurrent.includes(normalNew) || normalNew.length > 20 && normalCurrent.includes(normalNew.substring(0, Math.floor(normalNew.length * 0.7)))) {
                                    debug.log(`⏭️ [type_text] Skipping — text already present in field (${currentContent.length} chars)`);
                                    return `✓ Text already present in field — skipped duplicate typing`;
                                }
                            }
                        } catch { /* continue to type */ }
                    }


                    // For long texts: JS-based insertion (instant, no lag)
                    // For short texts: char-by-char input (reliable for search bars)
                    if (typingText.length > 80) {
                        try {
                            const insertResult = await wv.executeJavaScript(`
                                (function() {
                                    var el = document.activeElement;
                                    if (!el) return 'no-active';
                                    // INPUT/TEXTAREA: direct value assignment
                                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                                        var start = el.selectionStart || el.value.length;
                                        el.value = el.value.substring(0, start) + ${JSON.stringify(typingText)} + el.value.substring(el.selectionEnd || start);
                                        el.dispatchEvent(new Event('input', { bubbles: true }));
                                        return 'value-set';
                                    }
                                    // Contenteditable: execCommand insertText
                                    if (el.isContentEditable || document.designMode === 'on') {
                                        document.execCommand('insertText', false, ${JSON.stringify(typingText)});
                                        return 'exec-insert';
                                    }
                                    // Iframe: try inside
                                    if (el.tagName === 'IFRAME' && el.contentDocument) {
                                        el.contentDocument.execCommand('insertText', false, ${JSON.stringify(typingText)});
                                        return 'iframe-insert';
                                    }
                                    return 'unknown-type';
                                })()
                            `, true);
                            debug.log(`📋 [type_text] Fast-inserted ${typingText.length} chars via ${insertResult}`);
                        } catch (insertErr) {
                            debug.log(`⚠️ [type_text] Fast-insert failed (${insertErr}), char-by-char fallback`);
                            for (const char of typingText) {
                                if (char === '\n') {
                                    wv.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
                                    wv.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
                                } else {
                                    wv.sendInputEvent({ type: 'char', keyCode: char });
                                }
                            }
                        }
                    } else {
                        for (const char of typingText) {
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
                    }
                    await new Promise(r => setTimeout(r, 300));

                    // Show beginning + end so LLM knows ALL text was typed (prevents re-typing)
                    const wasTrimmed = typingText.length < text.length;
                    const preview = typingText.length > 60
                        ? `${typingText.substring(0, 30).replace(/\n/g, '↵')}…${typingText.substring(typingText.length - 20).replace(/\n/g, '↵')}`
                        : typingText.replace(/\n/g, '↵');
                    if (submitAfter) {
                        await new Promise(r => setTimeout(r, 200));
                        wv.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
                        wv.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
                        await new Promise(r => setTimeout(r, 2500));
                    }

                    let fieldInfo = '';
                    try {
                        const ai = await wv.executeJavaScript(`(function(){var el=document.activeElement;if(!el)return'';var t=el.tagName;var n=el.getAttribute('name')||'';var r=el.getAttribute('role')||'';var c=el.isContentEditable?'contenteditable':'';return t+(n?'[name='+n+']':'')+(r?'[role='+r+']':'')+(c?'['+c+']':'');})()`, true);
                        fieldInfo = ai ? ` → field: ${ai}` : '';
                    } catch { /* */ }

                    if (!submitAfter) {
                        try {
                            const snippet = text.substring(0, 20).replace(/['"\\]/g, '');
                            const vr = await wv.executeJavaScript(`(function(){var el=document.activeElement;if(!el)return'';if(el.tagName==='IFRAME'&&el.contentDocument){el=el.contentDocument.activeElement||el;}if(el.tagName==='INPUT'||el.tagName==='TEXTAREA')return el.value||'';if(el.isContentEditable)return'__CE_SKIP__';return el.innerText||el.textContent||'';})()`, true);
                            if (vr !== '__CE_SKIP__' && snippet.length > 3 && vr && !vr.includes(snippet)) {
                                debug.log(`⚠️ [Verify] Expected "${snippet}" got "${(vr as string).substring(0,60)}"${fieldInfo}`);
                                return `⚠️ Text did not appear${fieldInfo}. Expected "${snippet}..."`;
                            }
                        } catch { /* */ }
                    }

                    const somDiag = hasId ? ` [SoM:${args.id}${selectorFocusWorked ? ' ✓sel' : ''}]` : ' [coords]';
                    const trimNote = wasTrimmed ? ` ✂️ trimmed from ${text.length}` : '';
                    return `✓ COMPLETE (${typingText.length} chars${trimNote}) "${preview}"${submitAfter ? ' + ⏎' : ''}${fieldInfo}${somDiag}`;
                }

                // ─── Scroll ─────────────────────────────
                case "scroll": {
                    const result = await wv.executeJavaScript(
                        buildScrollScript(args.direction || "down", args.amount || 400), true
                    );
                    const parsed = JSON.parse(result);
                    return parsed.success ? `Scrolled ${args.direction}` : "Scroll failed";
                }

                // ─── Navigate ───────────────────────────
                case "navigate": {
                    const url = args.url || '';
                    try {
                        await wv.executeJavaScript(
                            'window.onbeforeunload=null;window.location.href=' + JSON.stringify(url) + ';'
                        , true);
                    } catch {
                        wv.loadURL(url).catch(() => {});
                    }
                    await waitForPageReady('navigate');
                    const actualUrl = wv.getURL?.() || 'unknown';
                    console.log(`🧭 Navigate: wanted=${url} → actual=${actualUrl}`);

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

                // ─── Go back ────────────────────────────
                case "go_back": {
                    wv.goBack();
                    await waitForPageReady('go_back');
                    const backUrl = wv.getURL?.() || 'unknown';
                    console.log(`🧭 Go back: now at ${backUrl}`);
                    return `✓ Went back to previous page`;
                }

                // ─── Search web ─────────────────────────
                case "search_web": {
                    const query = args.query || '';
                    const totalSearches = ctx.getSteps().filter(s => s.action === "search_web").length;
                    if (totalSearches >= 4) {
                        console.log(`🔍 Agent has searched ${totalSearches}x — forcing progression`);
                        return `⚠️ SEARCH LIMIT REACHED: You have already searched ${totalSearches} times. STOP searching immediately. Call genui or done.`;
                    }

                    console.log(`🔍 Agent searching: "${query}"`);
                    try {
                        const resp = await fetch('http://localhost:3001/api/agents/search', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query }),
                        });
                        const data = await resp.json();
                        const results = data.results || 'No results';
                        const structured = data.structured || [];
                        console.log(`🔍 Search results: ${data.count} found`);

                        // Store structured OG metadata in separate ref (NOT in step history)
                        if (structured.length > 0) {
                            ctx.addStructuredData(structured);
                        }

                        // Return clean text results only — no __STRUCTURED__ blob
                        return `✓ Search results for "${query}":\n${results}`;
                    } catch (e) {
                        return `Search failed: ${e}`;
                    }
                }

                // ─── Take notes ─────────────────────────
                case "take_notes": {
                    const context = args.context || '';
                    const items = args.items || [];
                    console.log(`📝 Agent notes: ${context} (${items.length} items)`);
                    return `📝 Notes saved: ${JSON.stringify({ context, items })}`;
                }

                // ─── GenUI (terminal action) ────────────
                case "genui": {
                    const prompt = args.prompt || args.description || '';

                    // Auto-collect all structured notes and search results
                    const allItems: any[] = [];
                    const searchResults: string[] = [];
                    for (const s of ctx.getSteps()) {
                        if (s.action === "take_notes" && s.result) {
                            try {
                                const raw = s.result.replace('📝 Notes saved: ', '');
                                const parsed = JSON.parse(raw);
                                if (parsed.items) allItems.push(...parsed.items);
                            } catch {
                                searchResults.push(s.result.replace('📝 Notes saved: ', ''));
                            }
                        }
                        if (s.action === "search_web" && s.result) {
                            searchResults.push(s.result);
                        }
                    }
                    // OG metadata from separate structured data store (not from step history)
                    const structuredSources = ctx.getStructuredData();
                    const data = {
                        items: allItems,
                        search_context: searchResults.length > 0 ? searchResults.join('\n\n') : undefined,
                        sources: structuredSources.length > 0 ? structuredSources : undefined,
                        ...(args.data || {}),
                    };

                    console.log(`🎨 GenUI: generating dashboard with ${allItems.length} items + ${searchResults.length} search sources...`);

                    try {
                        const resp = await fetch('http://localhost:3001/api/agents/genui', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt, data }),
                        });
                        const result = await resp.json();
                        if (!result.blocks || !Array.isArray(result.blocks)) {
                            return `GenUI failed: ${result.error || 'No blocks returned'}`;
                        }

                        // Terminal action — set "done" FIRST (before tab switch unmounts this IframeBlock)
                        ctx.setTerminalState(
                            {
                                action: "genui",
                                description: prompt || "Dashboard generated",
                                result: `✓ GenUI dashboard loaded (${result.blocks.length} blocks)`,
                            },
                            `✅ Dashboard rendered`,
                        );

                        // Dispatch blocks to Canvas for rendering (triggers tab switch)
                        window.dispatchEvent(new CustomEvent('biamos:genui-blocks', {
                            detail: { blocks: result.blocks, prompt },
                        }));
                        return '__GENUI_DONE__';
                    } catch (e) {
                        return `GenUI error: ${e}`;
                    }
                }

                // ─── Wait (for async renders) ─────────────────
                case "wait": {
                    const ms = Math.min(Math.max(args.ms ?? 500, 100), 3000); // clamp 100-3000ms
                    await new Promise(r => setTimeout(r, ms));
                    return `⏳ Waited ${ms}ms — ${args.reason || 'page settling'}`;
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
}
