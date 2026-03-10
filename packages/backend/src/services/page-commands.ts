// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Page Commands (/summarize, /translate, /extract)
// ============================================================
// Slash commands for quick page operations: summarize,
// translate, and structured data extraction.
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { MODEL_THINKING } from "../config/models.js";
import { logTokenUsage, incrementAgentUsage } from "../server-utils.js";
import { parseFollowUps, type PageQuestion, type ChatAnswer } from "./context-chat-utils.js";
import { log } from "../utils/logger.js";

// ─── Command Definitions ────────────────────────────────────

const PAGE_COMMANDS: Record<string, (ctx: PageQuestion, arg: string) => string> = {
    "/summarize": (ctx) => `Summarize the following web page in a clear, well-structured way. Use bullet points for key facts. Write in the SAME language as the page content.

PAGE: ${ctx.page_title} (${ctx.page_url})
--- Content ---
${ctx.page_text.substring(0, 6000)}
--- End ---

Provide a comprehensive summary with: main topic, key points, and conclusions.`,

    "/translate": (ctx, arg) => {
        const lang = arg || "English";
        return `Translate the following page content into ${lang}. Maintain formatting and structure.

PAGE: ${ctx.page_title} (${ctx.page_url})
--- Content ---
${ctx.page_text.substring(0, 6000)}
--- End ---

Translate naturally, not word-by-word. Keep any technical terms or proper nouns as-is.`;
    },

    "/extract": (ctx) => `Extract structured data from the following page. Look for: names, email addresses, phone numbers, prices, dates, addresses, product specs, company info, or any other structured information.

PAGE: ${ctx.page_title} (${ctx.page_url})
--- Content ---
${ctx.page_text.substring(0, 6000)}
--- End ---

Format the extracted data clearly in categories using bold headers and bullet points.`,
};

// ─── Command Handler ────────────────────────────────────────

export async function handlePageCommand(ctx: PageQuestion): Promise<ChatAnswer> {
    const parts = ctx.question.trim().split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const cmdArg = parts.slice(1).join(" ");

    const promptBuilder = PAGE_COMMANDS[cmdName];
    if (!promptBuilder) {
        const validCmds = Object.keys(PAGE_COMMANDS).join(", ");
        return {
            answer: `Unknown command: \`${cmdName}\`. Available commands: ${validCmds}`,
            source: "general",
            follow_ups: ["/summarize", "/translate English", "/extract"],
        };
    }

    if (ctx.page_text.trim().length < 50) {
        return {
            answer: "This page doesn't have enough content to process. Try on a page with more text.",
            source: "general",
        };
    }

    log.debug(`  ⚡ Page Command: ${cmdName}${cmdArg ? ` (${cmdArg})` : ""}`);

    const prompt = promptBuilder(ctx, cmdArg);

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("context-chat-cmd");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: `Execute the ${cmdName} command on this page.` },
                ],
                temperature: 0.2,
                max_tokens: 1500,
            }),
        });

        if (!response.ok) {
            return { answer: `Command failed (HTTP ${response.status}). Please try again.`, source: "general" };
        }

        const result = await response.json();
        const usage = result.usage ?? {};
        await logTokenUsage("agent:context-chat-cmd", MODEL_THINKING, usage);
        await incrementAgentUsage("web-copilot", usage);

        const rawAnswer = result.choices?.[0]?.message?.content?.trim() || "No result.";
        const { answer, follow_ups } = parseFollowUps(rawAnswer);

        log.debug(`  ⚡ ${cmdName}: ${answer.substring(0, 100)}...`);
        return { answer, source: "page_context", follow_ups };
    } catch (err) {
        log.error(`  💥 Page Command error (${cmdName}):`, err);
        return { answer: "Command failed. Please try again.", source: "general" };
    }
}
