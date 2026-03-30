// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Misc Actions ───────────────────────────────────────────
// search_web, take_notes, wait, press_key

import type { ActionContext, ActionResult } from "../types";

export async function search_web(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const query = args.query || '';
    const allSteps = ctx.getSteps();
    const totalSearches = allSteps.filter(s => s.action === 'search_web').length;

    // ── Self-healing: block repeat search if previous result already had a NEXT ACTION ──
    // If the last search_web returned results with a navigate directive, another search is a loop.
    const lastSearchStep = [...allSteps].reverse().find(s => s.action === 'search_web');
    if (lastSearchStep?.result?.includes('NEXT ACTION:')) {
        console.log(`🛑 [search_web] Blocked — previous search already returned NEXT ACTION directive`);
        return { logMessage: `🛑 SEARCH BLOCKED: Your previous search already returned results.\nYou MUST execute the \'navigate(url: ...)\'  from that result NOW.\nSearching again is FORBIDDEN until you navigate.` };
    }

    if (totalSearches >= 4) {
        console.log(`🔍 Agent has searched ${totalSearches}x — forcing progression`);
        return { logMessage: `⚠️ SEARCH LIMIT REACHED: You have already searched ${totalSearches} times. STOP searching immediately. Call genui or done.` };
    }

    console.log(`🔍 Agent searching: "${query}"`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // Fix #2: 8s timeout
        const resp = await fetch('http://localhost:3001/api/agents/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
        const data = await resp.json();
        const results = data.results || 'No results';
        const structured = data.structured || [];
        console.log(`🔍 Search results: ${data.count} found`);

        if (structured.length > 0) {
            ctx.addStructuredData(structured);
        }

        // ── Auto-extract best URL and inject next-step directive ──
        // Parse the first valid http URL from results to give LLM a clear action.
        const urlMatches = results.match(/\(https?:\/\/[^\s\)]+\)/g) || [];
        const bestUrl = urlMatches
            .map((m: string) => m.slice(1, -1)) // strip parens
            .find((u: string) => !u.includes('facebook.com') && !u.includes('apple.com') && !u.includes('twitter.com') && !u.includes('x.com'));

        const nextStepHint = bestUrl
            ? `\n\n→ NEXT ACTION: Call navigate(url: "${bestUrl}") to open the top result. Do NOT search again.`
            : '';

        return { logMessage: `✓ Search results for "${query}":\n${results}${nextStepHint}` };

    } catch (e: any) {
        if (e?.name === 'AbortError') {
            return { logMessage: `⚠️ Search timed out after 8s for "${query}" — try a different approach or use navigate() to go directly to the source.` };
        }
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
