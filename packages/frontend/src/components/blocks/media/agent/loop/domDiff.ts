// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── DOM Diff Critic ─────────────────────────────────────────
// Pure functions — compare DOM state before/after an action.
// Uses ActionResult.didNavigate (hard flag) — NOT string matching.

import { debug } from "../../../../../utils/debug";
import type { ActionResult } from "../types";

// ─── DOM State Snapshot ──────────────────────────────────────

export interface DomState {
    count: number;
    interactive: number;
    title: string;
    url: string;
    modals: number;
}

export async function takeDomState(wv: any): Promise<DomState | null> {
    try {
        const raw = await wv?.executeJavaScript?.(`JSON.stringify({
            count: document.querySelectorAll('*').length,
            interactive: document.querySelectorAll('button:not([disabled]),input:not([disabled]),select,[role=button],[role=dialog],[role=tab],[role=menuitem]').length,
            title: document.title,
            url: location.href,
            modals: document.querySelectorAll('[role=dialog],[role=alertdialog],.modal,.overlay,[class*=popup]').length,
        })`, true) ?? 'null';
        return JSON.parse(raw);
    } catch { return null; }
}

// ─── Build DOM Diff Suffix ───────────────────────────────────
// Called AFTER executeAction returns. Appends context to the step result.
//
// CRITICAL: If actionResult.didNavigate is true, we trust the action's own
// verdict and skip the diff — this prevents false "NO VISIBLE UI CHANGE"
// warnings for SPA navigations (YouTube, Next.js, etc.).

export async function buildDomDiffSuffix(
    wv: any,
    before: DomState | null,
    action: string,
    actionResult: ActionResult,
): Promise<string> {
    if (!before) return '';
    if (!['click', 'click_at', 'type_text', 'scroll'].includes(action)) return '';

    // Guard: if the action already confirmed navigation/success, don't second-guess it
    if (actionResult.didNavigate) {
        debug.log('🔍 [Critic] didNavigate=true — skipping DOM diff (navigation confirmed by action)');
        return '';
    }

    try {
        const rawAfter = await wv?.executeJavaScript?.(`JSON.stringify({
            count: document.querySelectorAll('*').length,
            title: document.title,
            url: location.href,
            modals: document.querySelectorAll('[role=dialog],[role=alertdialog],.modal:not(.hidden)').length,
            newModal: (function(){ var m = document.querySelector('[role=dialog],[role=alertdialog],.modal:not(.hidden)'); return m ? (m.getAttribute('aria-label') || m.textContent?.trim().substring(0,50) || 'unnamed') : ''; })(),
            interactive: document.querySelectorAll('button:not([disabled]),input:not([disabled]),select,[role=button],[role=dialog],[role=tab],[role=menuitem]').length,
        })`, true) ?? 'null';
        const after = JSON.parse(rawAfter);
        if (!after) return '';

        const changes: string[] = [];
        if (after.url !== before.url) changes.push('URL changed to ' + after.url);
        if (after.title !== before.title) changes.push('Title: "' + after.title + '"');
        if (after.modals > before.modals && after.newModal) changes.push('New modal: "' + after.newModal + '"');

        const interactiveDelta = Math.abs((after.interactive ?? 0) - (before.interactive ?? 0));
        const rawDelta = Math.abs(after.count - before.count);
        if (interactiveDelta > 2) changes.push((after.interactive - before.interactive > 0 ? '+' : '') + interactiveDelta + ' interactive elements changed');
        else if (rawDelta > 20) changes.push('+' + (after.count - before.count) + ' DOM nodes changed (background activity)');

        if (changes.length > 0) {
            debug.log('🔍 [Critic] DOM changes detected: ' + changes.join(', '));
            return ' ✓ [DOM CHANGED] ' + changes.join('. ') + '.';
        }

        // ── Special case: input/searchbox focused ──
        // A click on a search bar opens a dropdown but doesn't change URL or add many DOM nodes.
        // Without this check, the critic fires "NO VISIBLE UI CHANGE" and the LLM clicks again.
        try {
            const focusedInfo = await wv?.executeJavaScript?.(`(function(){
                var el = document.activeElement;
                if (!el) return null;
                var tag = el.tagName.toLowerCase();
                var isInput = tag === 'input' || tag === 'textarea' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'searchbox' || el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'combobox';
                if (!isInput) return null;
                var lbl = (el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.getAttribute('name') || tag).substring(0, 40);
                return JSON.stringify({ tag, lbl });
            })()`, true);
            if (focusedInfo && focusedInfo !== 'null') {
                const fi = JSON.parse(focusedInfo);
                debug.log(`🔍 [Critic] Input focused after click: ${fi.tag} "${fi.lbl}"`);
                return ` ✓ [INPUT FOCUSED] "${fi.lbl}" is now active. Use type_text(id: <same_id>, text: "your query") to type. Do NOT click again.`;
            }
        } catch { /* */ }

        debug.log(`🔍 [Critic] DOM unchanged after action: ${action}`);
        if (action === 'click') {
            // "No navigation triggered" = agent clicked a nav/tab element it was already on.
            // This is the #1 cause of click loops (Gmail inbox, YouTube sidebar, etc.).
            // Give the LLM a hard stop — it is ALREADY at the destination.
            const isNavLoop = actionResult.logMessage?.includes('No navigation triggered');
            if (isNavLoop) {
                const currentUrl = before?.url ? ` Current URL: ${before.url}` : '';
                return ` ⛔ [ALREADY THERE]${currentUrl} — You clicked a navigation element but you are ALREADY viewing its destination. ` +
                    'Clicking it again will NEVER change the page. ' +
                    'DO NOT click this element again. ' +
                    'The content you need is ALREADY on screen. Proceed directly: read it, extract data, use read_page, take_notes, genui, or call done().';
            }
            return ' ℹ️ [DOM STABLE] No major layout shift. For toggles/tabs/buttons check [PRESSED]/[SELECTED]/[CHECKED] badges in next DOM snapshot.';
        }
        return ' ⚠️ [NO VISIBLE UI CHANGE] — The click may have missed. Please verify the next screenshot: did the expected UI change happen? If not, try click_at with different coordinates or a different element.';
    } catch { return ''; }
}
