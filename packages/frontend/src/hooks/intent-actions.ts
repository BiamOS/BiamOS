// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Action Handlers
// ============================================================
// Extracted from useIntentHandler.ts for single-responsibility.
// Pure functions that handle specific intent actions:
//   - handleScrapeAction:   Ghost-Auth cookie-based page scraping
//   - handleAutopilotAction: Automated web actions via Electron
// ============================================================

import type { BiamPayload, CanvasItem } from "../types/canvas";
import { smartCardSize, findNextSlot } from "../types/canvas";

/** Shared deps injected into action handlers */
export interface ActionContext {
    text: string;
    pushAssistantMsg: (text: string, suggestions?: string[]) => void;
    speak?: (text: string) => void;
    canvas: {
        itemsRef: React.MutableRefObject<CanvasItem[]>;
        setItems: React.Dispatch<React.SetStateAction<CanvasItem[]>>;
    };
}

/** Extended payload with action-specific fields (url, instruction) */
type IntentActionData = BiamPayload & {
    url: string;
    instruction?: string;
};

// ─── SCRAPE → Ghost-Auth cookie-based scraping ───────────────

export async function handleScrapeAction(
    data: IntentActionData,
    ctx: ActionContext,
): Promise<null> {
    if (!window.electronAPI?.scrapeUrl) {
        ctx.pushAssistantMsg("⚠️ Scraping is only available in the Electron desktop app.");
        return null;
    }

    ctx.pushAssistantMsg(`👻 Scraping ${data.url}...`);
    ctx.speak?.(`Scraping ${new URL(data.url!).hostname}`);

    try {
        // Stage 1: Extract DOM text via hidden BrowserWindow (Electron IPC)
        const scraped = await window.electronAPI.scrapeUrl(data.url!);
        if (!scraped.text || scraped.text.length < 10) {
            ctx.pushAssistantMsg("⚠️ Could not extract content from this page. The page may require interaction.");
            return null;
        }

        // Stage 2: Send to backend for LLM summarization
        const res = await fetch("http://localhost:3001/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: data.url,
                raw_text: scraped.text,
                instruction: data.instruction || ctx.text,
            }),
        });

        if (!res.ok) {
            ctx.pushAssistantMsg("⚠️ Scrape summarization failed.");
            return null;
        }

        const result = await res.json();

        // Render as canvas card
        const cardPayload: BiamPayload = {
            action: "render_layout",
            integration_id: "ghost-auth-scraper",
            layout: result.layout,
            _query: ctx.text,
        };
        const id = `scrape-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const size = smartCardSize(cardPayload);
        const pos = findNextSlot(ctx.canvas.itemsRef.current, size.w, size.h);
        ctx.canvas.setItems((prev) => [...prev, {
            _id: id,
            _query: ctx.text,
            payload: cardPayload,
            layout: { ...pos, ...size },
            _loading: false,
        }]);

        ctx.pushAssistantMsg(`✅ Scraped and summarized ${new URL(data.url!).hostname}`);
    } catch (err) {
        ctx.pushAssistantMsg(`⚠️ Scrape failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    return null;
}

// ─── AUTOPILOT → automated web actions ───────────────────────

export async function handleAutopilotAction(
    data: IntentActionData,
    ctx: ActionContext,
): Promise<null> {
    if (!window.electronAPI?.executeAutopilotStep || !window.electronAPI?.getPageSnapshot) {
        ctx.pushAssistantMsg("⚠️ Autopilot is only available in the Electron desktop app.");
        return null;
    }

    ctx.pushAssistantMsg(`🤖 Autopilot: Analyzing ${new URL(data.url!).hostname}...`);

    try {
        // Step 1: Get DOM snapshot for planning
        const snapshot = await window.electronAPI.getPageSnapshot(data.url!);

        // Step 2: Generate plan via backend LLM
        const planRes = await fetch("http://localhost:3001/api/autopilot/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                instruction: data.instruction || ctx.text,
                url: data.url,
                dom_snapshot: snapshot.text,
            }),
        });

        if (!planRes.ok) {
            ctx.pushAssistantMsg("⚠️ Could not generate automation plan.");
            return null;
        }

        const plan = await planRes.json();
        if (!plan.steps || plan.steps.length === 0) {
            ctx.pushAssistantMsg(`⚠️ ${plan.summary || "Could not create an automation plan."}`);
            return null;
        }

        // Show plan summary
        const stepList = plan.steps
            .map((s: any) => `${s.step}. **${s.action}** — ${s.description}`)
            .join("\n");
        ctx.pushAssistantMsg(`🤖 **Autopilot Plan** (${plan.steps.length} steps):\n${stepList}\n\nExecuting...`);

        // Step 3: Execute each step
        let lastExtracted = "";
        for (const step of plan.steps) {
            const stepRes = await fetch("http://localhost:3001/api/autopilot/step", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(step),
            });
            if (!stepRes.ok) continue;

            const { script } = await stepRes.json();
            const result = await window.electronAPI.executeAutopilotStep(data.url!, script);

            if (!result.success) {
                ctx.pushAssistantMsg(`⚠️ Step ${step.step} failed: ${result.error}`);
                break;
            }

            if (step.action === "extract" && result.text) {
                lastExtracted = result.text;
            }
        }

        // Show result
        if (lastExtracted) {
            const cardPayload: BiamPayload = {
                action: "render_layout",
                integration_id: "autopilot",
                layout: {
                    blocks: [
                        { type: "title", text: `🤖 Autopilot: ${plan.summary}`, subtitle: new URL(data.url!).hostname },
                        { type: "text", content: lastExtracted.substring(0, 1000) },
                    ],
                },
                _query: ctx.text,
            };
            const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const size = smartCardSize(cardPayload);
            const pos = findNextSlot(ctx.canvas.itemsRef.current, size.w, size.h);
            ctx.canvas.setItems((prev) => [...prev, {
                _id: id, _query: ctx.text, payload: cardPayload,
                layout: { ...pos, ...size }, _loading: false,
            }]);
        }

        ctx.pushAssistantMsg(`✅ Autopilot completed: ${plan.summary}`);
    } catch (err) {
        ctx.pushAssistantMsg(`⚠️ Autopilot failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    return null;
}
