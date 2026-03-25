// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Type Action — Runtime.callFunctionOn (backendNodeId) ────
// Root cause of all previous failures: elementFromPoint(x,y)
// returns the TOPMOST element at pixel coords, which may be an
// overlapping button/icon, not the input we want.
//
// Fix: use CDP DOM.resolveNode(backendNodeId) to get a JS objectId
// for the EXACT node from the SoM, then Runtime.callFunctionOn to
// run the React Native Setter directly on that node.
// Works on: YouTube, Google, React, Vue, Angular, all overlapping UIs.

import { debug } from '../../../../../utils/debug';
import type { ActionContext, ActionResult } from '../types';
import { delay } from './cdpUtils';

export async function type_text(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    debug.log(`[TYPE v4] CALLED text="${args.text}" id=${args.id} wcId=${ctx.wcId}`);

    const entry = ctx.getSomEntry(Number(args.id));
    if (!entry) {
        return { logMessage: `❌ SoM ID [${args.id}] not found. Use current screenshot IDs only.` };
    }

    const text: string = args.text ?? '';
    const submitAfter = args.submit_after === true;
    const clearFirst = args.clear_first === true;

    debug.log(`[TYPE] "${text}" into [${args.id}] "${entry.name}" nodeId=${entry.nodeId}`);

    // ── Strategy A: CDP Runtime.callFunctionOn (uses backendNodeId) ──
    // This is the ONLY reliable method when overlapping elements exist.
    // We get a JS object reference to the exact DOM node and call
    // the React Native Setter directly on it.
    if (entry.nodeId && ctx.wcId) {
        try {
            // Step 1: Resolve backendNodeId → JS objectId
            const resolveResp = await ctx.cdpSend('DOM.resolveNode', { backendNodeId: entry.nodeId });
            console.log(`🔍 [TYPE] DOM.resolveNode:`, JSON.stringify(resolveResp));
            const objectId = resolveResp?.result?.object?.objectId;

            if (objectId) {
                // Step 2: Focus the element
                await ctx.cdpSend('Runtime.callFunctionOn', {
                    objectId,
                    functionDeclaration: 'function() { try { this.focus(); } catch(e) {} }',
                    silent: true,
                });
                await delay(200);

                // Step 3: Clear if needed
                if (clearFirst) {
                    await ctx.cdpSend('Runtime.callFunctionOn', {
                        objectId,
                        functionDeclaration: `function() {
                            try {
                                var proto = this.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
                                var s = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
                                if (s && s.set) s.set.call(this, '');
                                else this.value = '';
                                this.dispatchEvent(new Event('input', { bubbles: true }));
                            } catch(e) {}
                        }`,
                        silent: true,
                    });
                    await delay(50);
                }

                // Step 4: Set value with React Native Setter + dispatch events
                const typeResp = await ctx.cdpSend('Runtime.callFunctionOn', {
                    objectId,
                    functionDeclaration: `function(text) {
                        try {
                            // React Native Setter — the ONLY way to set value on React controlled inputs
                            if (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA') {
                                var proto = this.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
                                var nativeSetter = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
                                var current = this.value || '';
                                if (nativeSetter && nativeSetter.set) {
                                    nativeSetter.set.call(this, current + text);
                                } else {
                                    this.value = current + text;
                                }
                                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                                return { ok: true, val: this.value, tag: this.tagName };
                            } else if (this.getAttribute('contenteditable') === 'true') {
                                this.focus();
                                if (window.getSelection && document.createRange) {
                                    var range = document.createRange();
                                    range.selectNodeContents(this);
                                    range.collapse(false);
                                    var sel = window.getSelection();
                                    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
                                }
                                document.execCommand('insertText', false, text);
                                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                return { ok: true, val: this.textContent, tag: 'contenteditable' };
                            }
                            return { ok: false, reason: 'not input/textarea/contenteditable', tag: this.tagName };
                        } catch(e) { return { ok: false, reason: String(e) }; }
                    }`,
                    arguments: [{ value: text }],
                    returnByValue: true,
                    silent: false,
                });

                const typeResult = typeResp?.result?.result?.value;
                console.log(`✅ [TYPE] Runtime.callFunctionOn result:`, JSON.stringify(typeResult));

                // Step 5: Submit
                if (submitAfter) {
                    await delay(300);
                    // Dispatch Enter keydown on the element
                    const urlBefore = ctx.wv.getURL?.() ?? '';
                    await ctx.cdpSend('Runtime.callFunctionOn', {
                        objectId,
                        functionDeclaration: `function() {
                            this.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            this.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                            // Also try form submit
                            var form = this.closest('form');
                            if (form) {
                                var btn = form.querySelector('[type=submit]');
                                if (btn) btn.click();
                            }
                        }`,
                        silent: true,
                    });
                    console.log(`🔍 [TYPE] Enter dispatched via Runtime.callFunctionOn`);
                    await ctx.waitForPageReady('post-submit');
                    const urlAfter = ctx.wv.getURL?.() ?? '';
                    console.log(`🔍 [TYPE] URL after submit: ${urlBefore} → ${urlAfter}`);
                }

                const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
                const val = typeResult?.val ?? '';
                if (!typeResult?.ok) {
                    // Fall through to Strategy B
                    throw new Error(`callFunctionOn returned not-ok: ${typeResult?.reason ?? 'unknown'}`);
                }
                return {
                    logMessage: `✅ SUCCESS: Typed "${preview}"${submitAfter ? ' + ⏎' : ''} into [${args.id}] "${entry.name}" (confirmed val="${val}")`,
                };
            }
        } catch (e) {
            console.warn(`⚠️ [TYPE] Strategy A (callFunctionOn) failed: ${e} — falling back to Strategy B`);
        }
    }

    // ── Strategy B: executeJavaScript fallback ─────────────────
    // When nodeId is not available or callFunctionOn failed.
    // Use aria-label / name / placeholder to find the correct element.
    console.log(`🔍 [TYPE] Strategy B: executeJavaScript with aria-label/name matching`);
    const { wv } = ctx;
    const fallbackScript = `(function() {
        // First try by aria-label or placeholder matching the entry name
        var name = ${JSON.stringify(entry.name || '')};
        var el = null;
        if (name) {
            el = document.querySelector('input[aria-label="' + name + '"], textarea[aria-label="' + name + '"]');
            if (!el) el = document.querySelector('input[placeholder="' + name + '"], textarea[placeholder="' + name + '"]');
        }
        // Fallback: search input near the coordinates
        if (!el) {
            var all = Array.from(document.querySelectorAll('input, textarea'));
            el = all.find(function(i) {
                var r = i.getBoundingClientRect();
                return Math.abs(r.left + r.width/2 - ${entry.x}) < 100 && Math.abs(r.top + r.height/2 - ${entry.y}) < 100;
            });
        }
        if (!el) return JSON.stringify({ ok: false, reason: 'element not found' });
        try { el.focus(); } catch(e) {}
        var proto = el.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
        var nativeSetter = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
        var current = el.value || '';
        var t = ${JSON.stringify(text)};
        if (nativeSetter && nativeSetter.set) nativeSetter.set.call(el, current + t);
        else el.value = current + t;
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        ${submitAfter ? `
        setTimeout(function() {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            var form = el.closest('form');
            if (form) { var btn = form.querySelector('[type=submit]'); if (btn) btn.click(); }
        }, 200);
        ` : ''}
        return JSON.stringify({ ok: true, val: el.value, tag: el.tagName });
    })()`;

    try {
        const raw = await wv.executeJavaScript(fallbackScript, true);
        const result = JSON.parse(raw);
        if (!result.ok) {
            console.log(`❌ [TYPE] Strategy B failed:`, JSON.stringify(result));
            return { logMessage: `❌ type_text failed: ${result.reason} (Element ID ${args.id} might not be a valid text input. Click the correct field first.)` };
        }
        console.log(`✅ [TYPE] Strategy B result:`, JSON.stringify(result));
        if (submitAfter) await ctx.waitForPageReady('post-submit-b');
        const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
        return { logMessage: `✅ SUCCESS (B): Typed "${preview}" into [${args.id}] "${entry.name}" val="${result.val}"` };
    } catch (e) {
        return { logMessage: `❌ type_text: both strategies failed — ${e}` };
    }
}
