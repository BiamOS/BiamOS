// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Misc Actions ───────────────────────────────────────────
// search_web, take_notes, wait, press_key

import type { ActionContext, ActionResult } from "../types";

export async function search_web(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const query = args.query || '';
    const totalSearches = ctx.getSteps().filter(s => s.action === 'search_web').length;
    if (totalSearches >= 4) {
        console.log(`🔍 Agent has searched ${totalSearches}x — forcing progression`);
        return { logMessage: `⚠️ SEARCH LIMIT REACHED: You have already searched ${totalSearches} times. STOP searching immediately. Call genui or done.` };
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

        if (structured.length > 0) {
            ctx.addStructuredData(structured);
        }
        return { logMessage: `✓ Search results for "${query}":\n${results}` };
    } catch (e) {
        return { logMessage: `Search failed: ${e}` };
    }
}

export async function take_notes(args: Record<string, any>, _ctx: ActionContext): Promise<ActionResult> {
    const context = args.context || '';
    const items = args.items || [];
    console.log(`📝 Agent notes: ${context} (${items.length} items)`);
    return { logMessage: `📝 Notes saved: ${JSON.stringify({ context, items })}` };
}

export async function wait(args: Record<string, any>, _ctx: ActionContext): Promise<ActionResult> {
    const ms = Math.min(Math.max(args.ms ?? 500, 100), 3000);
    await new Promise(r => setTimeout(r, ms));
    return { logMessage: `⏳ Waited ${ms}ms — ${args.reason || 'page settling'}` };
}

export async function press_key(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const { wv } = ctx;
    const key = args.key || 'Escape';
    const keyMap: Record<string, string> = {
        escape: 'Escape', Escape: 'Escape',
        enter: 'Return', Enter: 'Return',
        tab: 'Tab', Tab: 'Tab',
        arrowup: 'Up', arrowdown: 'Down',
        arrowleft: 'Left', arrowright: 'Right',
    };
    const keyCode = keyMap[key] || key;
    wv.sendInputEvent({ type: 'keyDown', keyCode });
    await new Promise(r => setTimeout(r, 50));
    wv.sendInputEvent({ type: 'keyUp', keyCode });
    await new Promise(r => setTimeout(r, 300));
    return { logMessage: `⌨️ Pressed key: ${keyCode} — ${args.reason || 'dismiss overlay'}` };
}
