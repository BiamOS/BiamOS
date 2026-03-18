// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Chat Types & Utilities
// ============================================================
// Shared types, rate limiting, and parsing used by context chat.
// ============================================================

import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export interface PageQuestion {
    question: string;
    page_url: string;
    page_title: string;
    page_text: string;
    history?: ChatMessage[];
    page_screenshot?: string;
}

export interface ChatAnswer {
    answer: string;
    source: "page_context" | "web_search" | "general";
    follow_ups?: string[];
}

// ─── Rate Limiting ──────────────────────────────────────────

const recentQuestions = new Map<string, number>();
const COOLDOWN_MS = 5_000;

function getQuestionKey(q: string, url: string): string {
    return `${url}::${q.toLowerCase().trim()}`;
}

export function isRateLimited(question: string, url: string): boolean {
    const key = getQuestionKey(question, url);
    const last = recentQuestions.get(key);
    if (last && Date.now() - last < COOLDOWN_MS) return true;
    recentQuestions.set(key, Date.now());
    return false;
}

// ─── Follow-up Parser ───────────────────────────────────────

export function parseFollowUps(rawAnswer: string): { answer: string; follow_ups: string[] } {
    const marker = "---FOLLOWUPS---";
    const idx = rawAnswer.indexOf(marker);
    if (idx === -1) return { answer: rawAnswer.trim(), follow_ups: [] };

    const answer = rawAnswer.substring(0, idx).trim();
    const followUpBlock = rawAnswer.substring(idx + marker.length).trim();
    const follow_ups = followUpBlock
        .split("\n")
        .map(l => l.replace(/^\d+\.\s*/, "").replace(/^-\s*/, "").trim())
        .filter(l => l.length > 0 && l.length < 80 && l.endsWith("?"));

    return { answer, follow_ups: follow_ups.slice(0, 3) };
}

// ─── Search Tool Definition ─────────────────────────────────

export const SEARCH_TOOL = {
    type: "function" as const,
    function: {
        name: "search_web",
        description: "Search the web for information that is NOT available on the current page. Use this when the user asks about something the page content doesn't cover, like comparisons, alternatives, documentation, tutorials, prices, or facts not mentioned on the page.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query. Be specific and concise.",
                },
            },
            required: ["query"],
        },
    },
};

// ─── Search Detection ───────────────────────────────────────

const SEARCH_KEYWORDS = /\b(such|suche|suchen|raussuchen|finde|finden|search|find|look up|top\s+\d|best\s+\d|most popular|beliebteste|meistgesehen)\b/i;

export function shouldForceSearch(question: string, history?: ChatMessage[]): boolean {
    if (SEARCH_KEYWORDS.test(question)) return true;

    // Short follow-up after web search → also force search
    if (history && history.length >= 2 && question.length < 60) {
        const lastAssistant = history[history.length - 1];
        if (lastAssistant?.role === "assistant" && lastAssistant.content?.includes("http")) {
            log.debug(`  🔍 Context Chat: forcing search (short follow-up after web search)`);
            return true;
        }
    }
    return false;
}

// ─── Prompt Builder ─────────────────────────────────────────

export function buildSystemPrompt(ctx: PageQuestion, hasPageContent: boolean, streaming: boolean): string {
    const pageSnippet = ctx.page_text.substring(0, 6000);
    const followUpBlock = `After your answer, add on a new line:
---FOLLOWUPS---
1-2 short follow-up suggestions (NOT clarifying questions). Same language as the user. Under 50 chars each.`;

    const coreRules = `
PERSONALITY:
You are a smart, friendly research buddy. Think of yourself as the user's personal assistant who always goes the extra mile. Be warm, direct, and thorough — like a colleague who happens to know everything.

CORE RULES:
1. **LANGUAGE**: ALWAYS answer in the same language the user writes in. German → German. English → English.
2. **BE DIRECT**: Give the answer immediately. NEVER ask clarifying questions back. The user expects answers, not questions.
3. **NEVER say you can't answer** — use the search_web tool to find the information instead!
4. **MEMORY**: You have conversation memory. Reference earlier messages naturally like a real conversation.

QUANTITY & COMPLETENESS:
- If the user specifies a number (e.g. "top 10", "5 best", "3 examples"), you MUST provide EXACTLY that many items. NEVER fewer.
- For lists, use numbered format: "1.", "2.", "3." etc.
- For simple factual questions, keep it concise (2-4 sentences).
- For complex topics, be thorough but structured.

FORMATTING (use Markdown):
- **Bold** for key terms, names, and important facts
- Numbered lists for rankings, steps, and ordered items
- Bullet points for unordered information
- ### Headings to organize longer answers into sections
- \`code\` for technical terms when relevant

COPYABLE CONTENT:
When your response contains text the user would likely want to copy-paste (email drafts, message templates, summaries, code snippets, formatted replies, etc.), wrap that specific portion in a \`\`\`copy block:
\`\`\`copy
Hi Gabor,
Thanks for the heads-up. I'm looking into it right now...
\`\`\`
Only the content meant for copying goes inside the block. Your explanation stays outside.

SOURCES & LINKS — THIS IS CRITICAL:
- **ALWAYS include source links** when you use web search results. Format: [source name](url)
- For each fact or claim from search results, add the link inline or at the end of the item.
- For lists (e.g. "top 10 X"), include a relevant link for EACH item when available (e.g. link to official website, Wikipedia article, or profile page).
- When citing statistics or data, mention where the data comes from (e.g. "laut Wikipedia", "according to Forbes").
- Do NOT just dump raw URLs — always use descriptive markdown links: [YouTube: MrBeast](https://youtube.com/@MrBeast)
- If search results contain URLs, USE THEM. Never strip or ignore available links.`;

    if (hasPageContent) {
        return `You are BiamOS, an intelligent browsing copilot. The user is viewing a web page and has a question.

PAGE CONTEXT:
URL: ${ctx.page_url}
Title: ${ctx.page_title}
--- Page Content ---
${pageSnippet}
--- End of Page Content ---
${coreRules}

PAGE-SPECIFIC RULES:
- First check if the page content contains the answer. If yes, answer from the page.
- **CRITICAL: If the page does NOT contain the answer, you MUST use the search_web tool.** NEVER say "the page doesn't mention this" — search instead!
- When the user asks to "search", "find", "look up", or "list" something → ALWAYS use search_web.
- You may receive a **screenshot** of the page. Use visual context to understand layouts, charts, dashboards.
- When incorporating search results, do so naturally — don't say "I searched for..."

**At the very end of your response**, add this block:
${followUpBlock}`;
    }

    return `You are BiamOS, an intelligent browsing copilot. The user is asking a question while browsing.

Current page: ${ctx.page_url} (${ctx.page_title})
${coreRules}

SEARCH RULES:
- Use the search_web tool whenever you need current, specific, or factual information.
- **NEVER say you can't answer something — search first!**
- When incorporating search results, do so naturally — don't say "I searched for..."

**At the very end of your response**, add this block:
${followUpBlock}`;
}

// ─── Message Builder ────────────────────────────────────────

export function buildMessages(ctx: PageQuestion, systemPrompt: string): { role: string; content: any }[] {
    const messages: { role: string; content: any }[] = [
        { role: "system", content: systemPrompt },
    ];

    if (ctx.history && ctx.history.length > 0) {
        const recentHistory = ctx.history.slice(-10);
        for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
        log.debug(`  💬 Context Chat: ${recentHistory.length} history messages included`);
    }

    if (ctx.page_screenshot) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: ctx.question },
                { type: "image_url", image_url: { url: `data:image/png;base64,${ctx.page_screenshot}` } },
            ],
        });
        log.debug(`  📸 Context Chat: screenshot included (${Math.round(ctx.page_screenshot.length / 1024)}KB)`);
    } else {
        messages.push({ role: "user", content: ctx.question });
    }

    return messages;
}
