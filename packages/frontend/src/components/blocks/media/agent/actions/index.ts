// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Action Dispatcher ────────────────────────────────
// Dictionary-based routing replaces the monolithic switch block.
// Each handler is a focused module in agent/actions/*.
// ALL handlers return Promise<ActionResult> — no state mutation.

import type { ActionContext, ActionResult } from "../types";
import { click, click_at, vision_click, vision_drag, vision_hover } from "./click";
import { type_text } from "./type";
import { navigate, go_back } from "./navigation";
import { scroll } from "./scroll";
import { genui } from "./genui";
import { search_web, take_notes, wait, press_key } from "./misc";

type ActionHandler = (args: Record<string, any>, ctx: ActionContext) => Promise<ActionResult>;

const handlers: Record<string, ActionHandler> = {
    click,
    click_at,
    vision_click,
    vision_drag,
    vision_hover,
    type_text,
    navigate,
    go_back,
    scroll,
    genui,
    search_web,
    take_notes,
    wait,
    press_key,
};

export async function executeAction(
    action: string,
    args: Record<string, any>,
    ctx: ActionContext,
): Promise<ActionResult> {
    const { wv, waitForPageReady } = ctx;
    if (!wv?.executeJavaScript) return { logMessage: 'No webview available' };

    const ready = await waitForPageReady('pre-action');
    if (!ready) return { logMessage: 'Action failed: webview not ready after waiting' };

    const handler = handlers[action];
    if (!handler) return { logMessage: `Unknown action: ${action}` };

    let attempt = 0;
    while (attempt < 3) {
        try {
            return await handler(args, ctx);
        } catch (err) {
            attempt++;
            if (attempt < 3) {
                const ok = await waitForPageReady(`retry-${attempt}`);
                if (!ok) break;
                await new Promise(r => setTimeout(r, 2000));
            } else {
                return { logMessage: `Action failed: ${String(err).substring(0, 100)}` };
            }
        }
    }
    return { logMessage: `Action failed after 3 attempts` };
}

// Re-export ActionContext type for consumers who need it
export type { ActionContext };
