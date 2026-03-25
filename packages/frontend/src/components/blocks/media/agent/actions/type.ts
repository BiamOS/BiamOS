// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Type Action — Universal CDP Edition (V5) ────────────────
// Typing Strategy Priority (applies globally to all sites):
//
// For INPUT / TEXTAREA:
//   → React Native Setter + input/change events (handles all React/Vue/Angular)
//
// For CONTENTEDITABLE (YouTube, Notion, Quill, n8n, rich text):
//   Tier 1: CDP Input.insertText  — browser native composition pipeline
//            YouTube/Polymer/LitElement/Quill accept this as real typing
//   Tier 2: CDP Input.dispatchKeyEvent per-char — for apps that filter insertText
//   Tier 3: execCommand fallback — last resort, visual-only but better than nothing
//
// Root cause of the YouTube Polymer/LitElement failure:
//   execCommand('insertText') updates DOM but NOT the framework's VDOM state.
//   Polymer checks its own state → "box is empty" → Kommentieren button ignored.
//   Input.insertText goes through the browser's NATIVE key composition pipe,
//   so Polymer/LitElement see it as a real keystroke and update their state ✅

import { debug } from '../../../../../utils/debug';
import type { ActionContext, ActionResult } from '../types';
import { delay } from './cdpUtils';

// ── CDP Input.insertText — The universal contenteditable solution ──
// Goes through the browser's native input composition pipeline.
// Polymer, LitElement, Quill, Slate, ProseMirror, Lexical, TipTap all accept it.
async function typeViaInsertText(text: string, ctx: ActionContext): Promise<boolean> {
    try {
        const resp = await ctx.cdpSend('Input.insertText', { text });
        return resp?.ok !== false;
    } catch {
        return false;
    }
}

// ── CDP Input.dispatchKeyEvent char-by-char — Tier 2 fallback ──
// Used when a framework ignores Input.insertText but responds to raw keyEvents.
async function typeViaKeyEvents(text: string, ctx: ActionContext): Promise<boolean> {
    try {
        for (const char of text) {
            const base = {
                text: char,
                unmodifiedText: char,
                key: char,
                code: `Key${char.toUpperCase()}`,
                windowsVirtualKeyCode: char.charCodeAt(0),
                nativeVirtualKeyCode: char.charCodeAt(0),
            };
            await ctx.cdpSend('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' });
            await ctx.cdpSend('Input.dispatchKeyEvent', { ...base, type: 'char' });
            await ctx.cdpSend('Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
        }
        return true;
    } catch {
        return false;
    }
}

// ── Force React/Vue/Polymer state sync after insertion ──
async function forceFrameworkSync(objectId: string, ctx: ActionContext): Promise<void> {
    await ctx.cdpSend('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: `function() {
            try {
                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: this.textContent }));
            } catch(e) {}
        }`,
        silent: true,
    });
}

export async function type_text(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    debug.log(`[TYPE v5] text="${args.text}" id=${args.id} wcId=${ctx.wcId}`);

    const entry = ctx.getSomEntry(Number(args.id));
    if (!entry) {
        return { logMessage: `❌ SoM ID [${args.id}] not found. Use current screenshot IDs only.` };
    }

    const text: string = args.text ?? '';
    const submitAfter = args.submit_after === true;
    const clearFirst = args.clear_first === true;

    // ── Strategy A: CDP Runtime.callFunctionOn ──────────────────
    if (entry.nodeId && ctx.wcId) {
        try {
            const resolveResp = await ctx.cdpSend('DOM.resolveNode', { backendNodeId: entry.nodeId });
            const objectId = resolveResp?.result?.object?.objectId;

            if (objectId) {
                // Detect element type
                const tagResp = await ctx.cdpSend('Runtime.callFunctionOn', {
                    objectId,
                    functionDeclaration: 'function() { return JSON.stringify({ tag: this.tagName, ce: this.getAttribute("contenteditable") }); }',
                    returnByValue: true, silent: true,
                });
                const info = (() => { try { return JSON.parse(tagResp?.result?.result?.value ?? '{}'); } catch { return {}; } })();
                const tag: string = (info.tag ?? '').toUpperCase();
                const isContentEditable = info.ce !== null && info.ce !== 'false';

                // Focus + move caret to end
                await ctx.cdpSend('Runtime.callFunctionOn', {
                    objectId,
                    functionDeclaration: `function() {
                        try { this.focus(); } catch(e) {}
                        if (this.getAttribute('contenteditable')) {
                            try {
                                var r = document.createRange();
                                r.selectNodeContents(this); r.collapse(false);
                                var s = window.getSelection();
                                if (s) { s.removeAllRanges(); s.addRange(r); }
                            } catch(e) {}
                        }
                    }`,
                    silent: true,
                });
                await delay(150);

                // ── INPUT / TEXTAREA path ──────────────────────────
                if (tag === 'INPUT' || tag === 'TEXTAREA') {
                    if (clearFirst) {
                        await ctx.cdpSend('Runtime.callFunctionOn', {
                            objectId,
                            functionDeclaration: `function() {
                                try {
                                    var p = this.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
                                    var s = Object.getOwnPropertyDescriptor(p.prototype, 'value');
                                    if (s && s.set) s.set.call(this, ''); else this.value = '';
                                    this.dispatchEvent(new Event('input', { bubbles: true }));
                                } catch(e) {}
                            }`,
                            silent: true,
                        });
                        await delay(50);
                    }

                    const setResp = await ctx.cdpSend('Runtime.callFunctionOn', {
                        objectId,
                        functionDeclaration: `function(t) {
                            try {
                                var p = this.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
                                var ns = Object.getOwnPropertyDescriptor(p.prototype, 'value');
                                var cur = this.value || '';
                                if (ns && ns.set) ns.set.call(this, cur + t); else this.value = cur + t;
                                this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                                return { ok: true, val: this.value };
                            } catch(e) { return { ok: false, reason: String(e) }; }
                        }`,
                        arguments: [{ value: text }],
                        returnByValue: true, silent: false,
                    });

                    const r = setResp?.result?.result?.value;
                    if (!r?.ok) throw new Error(`INPUT set failed: ${r?.reason}`);

                    if (submitAfter) {
                        await delay(300);
                        await ctx.cdpSend('Runtime.callFunctionOn', {
                            objectId,
                            functionDeclaration: `function() {
                                this.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                                this.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                                var f = this.closest('form');
                                if (f) { var b = f.querySelector('[type=submit]'); if (b) b.click(); }
                            }`,
                            silent: true,
                        });
                        await ctx.waitForPageReady('post-submit-input');
                    }

                    const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
                    return { logMessage: `✅ Typed "${preview}"${submitAfter ? ' + ⏎' : ''} into [${args.id}] "${entry.name}"` };
                }

                // ── CONTENTEDITABLE path ── 3-tier universal approach ─
                if (isContentEditable) {
                    if (clearFirst) {
                        await ctx.cdpSend('Runtime.callFunctionOn', {
                            objectId,
                            functionDeclaration: `function() {
                                try {
                                    document.execCommand('selectAll', false, null);
                                    document.execCommand('delete', false, null);
                                    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                } catch(e) {}
                            }`,
                            silent: true,
                        });
                        await delay(100);
                    }

                    // Tier 1: Input.insertText — browser native pipeline
                    debug.log(`[TYPE v5] Contenteditable → Tier 1: Input.insertText`);
                    const t1ok = await typeViaInsertText(text, ctx);
                    await delay(100);
                    if (t1ok) await forceFrameworkSync(objectId, ctx);
                    await delay(150);

                    // Verify insertion
                    const verResp = await ctx.cdpSend('Runtime.callFunctionOn', {
                        objectId,
                        functionDeclaration: 'function() { return this.textContent || this.innerText || ""; }',
                        returnByValue: true, silent: true,
                    });
                    const content: string = verResp?.result?.result?.value ?? '';
                    const confirmed = content.includes(text.substring(0, Math.min(text.length, 20)));
                    debug.log(`[TYPE v5] Tier 1 verify: confirmed=${confirmed} content="${content.substring(0, 60)}"`);

                    if (!confirmed) {
                        // Tier 2: char-by-char keyEvents
                        debug.log(`[TYPE v5] Tier 1 failed → Tier 2: dispatchKeyEvent char-by-char`);
                        await ctx.cdpSend('Runtime.callFunctionOn', {
                            objectId,
                            functionDeclaration: `function() { try { document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch(e) {} }`,
                            silent: true,
                        });
                        await delay(50);
                        await typeViaKeyEvents(text, ctx);
                        await delay(100);
                        await forceFrameworkSync(objectId, ctx);
                    }

                    if (submitAfter) {
                        await delay(400);
                        await ctx.cdpSend('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', keyCode: 13, windowsVirtualKeyCode: 13 });
                        await ctx.cdpSend('Input.dispatchKeyEvent', { type: 'char', key: '\r', text: '\r' });
                        await ctx.cdpSend('Input.dispatchKeyEvent', { type: 'keyUp',   key: 'Enter', code: 'Enter', keyCode: 13, windowsVirtualKeyCode: 13 });
                        await ctx.waitForPageReady('post-submit-ce');
                    }

                    const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
                    return { logMessage: `✅ Typed "${preview}"${submitAfter ? ' + ⏎' : ''} into [${args.id}] "${entry.name}" (contenteditable, CDP native pipeline)` };
                }

                // Tier 3: execCommand for unknown elements
                await ctx.cdpSend('Runtime.callFunctionOn', {
                    objectId,
                    functionDeclaration: `function(t) {
                        try { this.focus(); document.execCommand('insertText', false, t); this.dispatchEvent(new Event('input', { bubbles: true })); } catch(e) {}
                    }`,
                    arguments: [{ value: text }],
                    returnByValue: false, silent: true,
                });
                const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
                return { logMessage: `✅ Typed "${preview}" into [${args.id}] "${entry.name}" (execCommand fallback)` };
            }
        } catch (e) {
            debug.log(`⚠️ [TYPE] Strategy A failed: ${e} → Strategy B`);
        }
    }

    // ── Strategy B: executeJavaScript fallback (no nodeId) ────
    const { wv } = ctx;
    const fallbackScript = `(function() {
        var name = ${JSON.stringify(entry.name || '')};
        var el = null;
        if (name) {
            el = document.querySelector('input[aria-label="' + name + '"], textarea[aria-label="' + name + '"]')
              || document.querySelector('input[placeholder="' + name + '"], textarea[placeholder="' + name + '"]');
            if (!el) {
                var ces = Array.from(document.querySelectorAll('[contenteditable="true"]'));
                el = ces.find(function(e) { return e.getAttribute('aria-label') === name; }) || null;
            }
        }
        if (!el) {
            var all = Array.from(document.querySelectorAll('input, textarea, [contenteditable]'));
            el = all.find(function(i) {
                var r = i.getBoundingClientRect();
                return Math.abs(r.left + r.width/2 - ${entry.x}) < 100 && Math.abs(r.top + r.height/2 - ${entry.y}) < 100;
            }) || null;
        }
        if (!el) return JSON.stringify({ ok: false, reason: 'element not found' });
        try { el.focus(); } catch(e) {}
        var t = ${JSON.stringify(text)};
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            var proto = el.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
            var ns = Object.getOwnPropertyDescriptor(proto.prototype, 'value');
            var cur = el.value || '';
            if (ns && ns.set) ns.set.call(el, cur + t); else el.value = cur + t;
        } else {
            document.execCommand('insertText', false, t);
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        ${submitAfter ? `
        setTimeout(function() {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            var f = el.closest('form'); if (f) { var b = f.querySelector('[type=submit]'); if (b) b.click(); }
        }, 200);` : ''}
        return JSON.stringify({ ok: true, val: el.value || el.textContent, tag: el.tagName });
    })()`;

    try {
        const raw = await wv.executeJavaScript(fallbackScript, true);
        const r = JSON.parse(raw);
        if (!r.ok) return { logMessage: `❌ type_text: element not found (ID ${args.id}). Click the correct field first.` };
        if (submitAfter) await ctx.waitForPageReady('post-submit-b');
        const preview = text.length > 40 ? text.substring(0, 30) + '…' : text;
        return { logMessage: `✅ Typed "${preview}" into [${args.id}] "${entry.name}" (fallback strategy)` };
    } catch (e) {
        return { logMessage: `❌ type_text: all strategies failed — ${e}` };
    }
}
