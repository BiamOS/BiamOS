// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── GenUI Action (Terminal) ─────────────────────────────────
// Returns isTerminal:true + data — the orchestrator dispatches the
// CustomEvent and writes React state. This module does NOT touch state.

import type { ActionContext, ActionResult } from "../types";

export async function genui(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const prompt = args.prompt || args.description || '';

    // Auto-collect notes and search results from step history
    const allItems: any[] = [];
    const searchResults: string[] = [];
    for (const s of ctx.getSteps()) {
        if (s.action === 'take_notes' && s.result) {
            try {
                const raw = s.result.replace('📝 Notes saved: ', '');
                const parsed = JSON.parse(raw);
                if (parsed.items) allItems.push(...parsed.items);
            } catch {
                searchResults.push(s.result.replace('📝 Notes saved: ', ''));
            }
        }
        if (s.action === 'search_web' && s.result) {
            searchResults.push(s.result);
        }
    }
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
            return { logMessage: `GenUI failed: ${result.error || 'No blocks returned'}` };
        }

        // Return isTerminal + blocks — the orchestrator (not this action!) dispatches the event
        return {
            logMessage: `✓ GenUI dashboard loaded (${result.blocks.length} blocks)`,
            isTerminal: true,
            data: { blocks: result.blocks, prompt },
        };
    } catch (e) {
        return { logMessage: `GenUI error: ${e}` };
    }
}
