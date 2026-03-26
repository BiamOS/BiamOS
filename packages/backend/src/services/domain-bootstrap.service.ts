// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Domain Bootstrap Service (V4)
// ============================================================
// Automatically writes a base prompt for a new domain on first
// visit. Fires once, in the background, when the KB Hub loads
// a domain that has no base_rule entry in the database.
//
// SAFETY RULES:
//   - Only runs if NO existing base_rule or auto_bootstrap entry exists
//   - Never blocks the UI — always fire-and-forget
//   - Writes source=auto_bootstrap so the UI shows 🤖 auto badge
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { ingestKnowledge } from "./domain-knowledge.service.js";
import { log } from "../utils/logger.js";

// ─── Bootstrap ───────────────────────────────────────────────

/**
 * Called when a domain profile is loaded for the first time.
 * Generates a smart base prompt via LLM and saves it as a
 * base_rule with source=auto_bootstrap.
 *
 * @param domain  Root domain, e.g. "haloitsm.com"
 * @param pageTitle  Page title captured from the webview (optional)
 */
export async function bootstrapDomainPrompt(
    domain: string,
    pageTitle?: string
): Promise<void> {
    log.info(`  🌱 [Bootstrap] Generating base prompt for: ${domain}`);

    const titleHint = pageTitle
        ? `The page title observed was: "${pageTitle}".`
        : "";

    const prompt = `You are an expert in browser automation and AI agent engineering.

Your task: Write a precise, actionable system prompt for an autonomous AI browser agent that will operate on: "${domain}".
${titleHint}

Think deeply about this domain. Consider:
1. What TYPE of platform is this? (SPA, MPA, auth-gated, e-commerce, media, SaaS, social, etc.)
2. What are the KNOWN AUTOMATION PROBLEMS for this type of platform?
   - React/Vue controlled inputs that ignore synthetic events?
   - Lazy-loaded content that requires scrolling before it's interactive?
   - Login walls or cookie consent dialogs that block first interaction?
   - Modals/popups (upsells, notifications, cookie banners) that intercept clicks?
   - Dynamic routing (SPA) where URL doesn't change after navigation?
   - Hidden/disabled buttons that only activate after some state change?
   - Shadow DOM elements or iframes that break standard selectors?
3. What SPECIFIC ACTIONS does a user typically perform here?

Write a base prompt with these sections:
- PLATFORM TYPE (1 sentence)
- KNOWN PROBLEMS (2-4 bullet points — the most critical failure modes)
- ACTION RULES (3-5 imperative rules the agent MUST follow)

Requirements:
- Max 800 characters total
- Write ONLY the prompt content, no meta-commentary
- Every rule must be specific and actionable, not generic

Respond ONLY with valid JSON:
{"content": "<your prompt here>"}`;

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("Bootstrap");

        const res = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: "google/gemini-2.0-flash-001",
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.3,
            }),
        });

        if (!res.ok) {
            log.warn(`  🌱 [Bootstrap] LLM call failed: ${res.status}`);
            return;
        }

        const data = await res.json() as any;
        const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            log.warn(`  🌱 [Bootstrap] Could not parse response for ${domain}`);
            return;
        }

        const parsed = JSON.parse(jsonMatch[0]) as { content: string };
        if (!parsed.content?.trim()) return;

        const content = parsed.content.trim().substring(0, 800);

        const id = await ingestKnowledge({
            domain,
            type: "user_instruction",
            content,
            source: "auto_bootstrap",
        });

        if (id) {
            log.info(`  ✅ [Bootstrap] Base prompt saved for ${domain} (id=${id}): "${content.substring(0, 80)}..."`);
        }
    } catch (err) {
        log.warn(`  🌱 [Bootstrap] Error (non-critical):`, err);
    }
}

