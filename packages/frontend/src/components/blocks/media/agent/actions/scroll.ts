// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Scroll Action ──────────────────────────────────────────

import type { ActionContext, ActionResult } from "../types";
import { buildScrollScript } from "../scripts";

async function getScrollHash(wv: any): Promise<number> {
    try {
        return await wv.executeJavaScript(`
            (function() {
                var total = window.scrollY + window.scrollX;
                var els = document.querySelectorAll('*');
                for (var i = 0; i < els.length; i++) {
                    if (els[i].scrollTop > 0) total += els[i].scrollTop;
                    if (els[i].scrollLeft > 0) total += els[i].scrollLeft;
                }
                return total;
            })()
        `, true);
    } catch { return 0; }
}

export async function scroll(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const { wv } = ctx;
    const beforeHash = await getScrollHash(wv);
    const scrollExecResult = await wv.executeJavaScript(
        buildScrollScript(args.direction || 'down', args.amount || 400), true
    );
    const scrollExecParsed = JSON.parse(scrollExecResult);
    if (!scrollExecParsed.success) return { logMessage: 'Scroll failed' };

    await new Promise(r => setTimeout(r, 400));
    const afterHash = await getScrollHash(wv);

    if (beforeHash === afterHash) {
        return { logMessage: `STUCK: Scroll executed but absolutely NO element on page moved (checked window + all inner containers). Physical bottom reached or popup is blocking. DO NOT scroll again. Change strategy.` };
    }
    return { logMessage: `✓ Scrolled ${args.direction}. New content may be visible — check next screenshot.` };
}
