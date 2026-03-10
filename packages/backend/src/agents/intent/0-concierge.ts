// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 0: Concierge (Triage)
// ============================================================
// Runs BEFORE the intent pipeline. Decides:
//   EXECUTE  → query is specific, proceed with pipeline
//   CLARIFY  → query is vague, ask the user a follow-up
//   ANSWER   → meta-question about BiamOS, respond directly
// ============================================================

import { runAgentJSON } from "../agent-runner.js";
import { getConciergeContext, invalidateIntegrationContextCache } from "../../services/integration-context.js";
import { log } from "../../utils/logger.js";

// ─── Conversation Memory ─────────────────────────────────────

interface MemoryTurn { role: "user" | "assistant"; text: string; }
const memory: MemoryTurn[] = [];
const MAX_MEMORY = 6;

function pushMemory(role: MemoryTurn["role"], text: string) {
    memory.push({ role, text });
    while (memory.length > MAX_MEMORY) memory.shift();
}

function buildMemoryContext(): string {
    if (memory.length === 0) return "";
    const lines = memory.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`);
    return `Recent conversation:\n${lines.join("\n")}`;
}

export function clearConciergeMemory() {
    memory.length = 0;
}

/** Invalidate the integration context cache (call after install/create/delete) */
export function invalidateConciergeCache() {
    invalidateIntegrationContextCache();
}

// ─── Types ──────────────────────────────────────────────────

export interface ConciergeResult {
    decision: "EXECUTE" | "CLARIFY" | "ANSWER" | "NAVIGATE" | "UPDATE" | "WEB_SEARCH" | "SCRAPE" | "AUTOPILOT";
    refined_query?: string;
    question?: string;
    suggestions?: string[];
    answer?: string;
    url?: string;
    title?: string;
    /** For SCRAPE: what to extract from the page */
    instruction?: string;
    /** For UPDATE: which group to target */
    target_group?: string;
}

// ─── URL/Domain Detection (fast-path) ───────────────────────

const DOMAIN_REGEX = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z0-9][-a-zA-Z0-9]*)*\.(?:com|org|net|io|dev|app|ai|de|at|ch|co|me|tv|info|biz|edu|gov|uk|fr|es|it|nl|be|se|no|fi|dk|jp|kr|cn|ru|br|au|in|ca|us|xyz|tech|site|online|store|shop|cloud|page|link|pro|world|live|design|studio|gg|ly|to|cc|wiki)(?:\/[^\s]*)?)/i;

/**
 * Detect navigation intent from URL/domain patterns in the query.
 * Returns a ConciergeResult if a domain is found, null otherwise.
 */
function detectNavigateIntent(query: string): ConciergeResult | null {
    const domainMatch = query.match(DOMAIN_REGEX);
    if (!domainMatch) return null;

    const rawUrl = domainMatch[0];
    const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

    // Extract a clean title from the domain
    const domain = domainMatch[1] || rawUrl;
    const siteName = domain.split(".")[0];
    const title = siteName.charAt(0).toUpperCase() + siteName.slice(1);

    return {
        decision: "NAVIGATE",
        url,
        title,
    };
}

// ─── Main Function ──────────────────────────────────────────

/**
 * Triage the user's query before it enters the intent pipeline.
 * Returns EXECUTE/CLARIFY/ANSWER/NAVIGATE decision with relevant data.
 */
export async function triageQuery(
    englishText: string,
    existingCards?: Array<{ id: string; group_name?: string; integration_id?: string; query?: string }>,
    allowedGroups?: string[]
): Promise<ConciergeResult> {
    // ─── Fast path: detect URLs/domains without LLM ─────
    const navigateResult = detectNavigateIntent(englishText);
    if (navigateResult) {
        return navigateResult;
    }

    const context = await getConciergeContext(allowedGroups);
    const memoryCtx = buildMemoryContext();

    // Build existing cards context for block targeting
    let cardsCtx = "";
    if (existingCards && existingCards.length > 0) {
        const cardLines = existingCards
            .filter(c => c.group_name)
            .map(c => `  • [${c.group_name}] "${c.query || "unknown"}"`)
            .join("\n");
        if (cardLines) {
            cardsCtx = `\n\nCards currently on user's canvas:\n${cardLines}\n` +
                `If the user's query targets content that belongs to one of these existing card groups, ` +
                `return UPDATE with target_group set to the group name. Otherwise use EXECUTE for new content.`;
        }
    }

    const fullContext = [context, memoryCtx, cardsCtx].filter(Boolean).join("\n\n");

    const result = await runAgentJSON<ConciergeResult>(
        "concierge",
        englishText,
        fullContext
    );

    if (result.skipped) {
        // Concierge disabled → always execute
        return { decision: "EXECUTE", refined_query: englishText };
    }

    const output = result.output;
    log.debug(`  🎩 [Concierge] Decision: ${output.decision} | refined_query: "${output.refined_query || "-"}" | url: "${output.url || "-"}" | query was: "${englishText}"`);

    // Validate decision
    if (!output.decision || !["EXECUTE", "CLARIFY", "ANSWER", "NAVIGATE", "UPDATE", "WEB_SEARCH", "SCRAPE", "AUTOPILOT"].includes(output.decision)) {
        return { decision: "EXECUTE", refined_query: englishText };
    }

    // Ensure required fields based on decision
    if (output.decision === "EXECUTE") {
        output.refined_query = output.refined_query || englishText;
    }
    if (output.decision === "CLARIFY") {
        output.question = output.question || "What exactly would you like to do?";
        output.suggestions = Array.isArray(output.suggestions) ? output.suggestions.slice(0, 4) : [];
    }
    if (output.decision === "ANSWER") {
        output.answer = output.answer || "I can help you with your configured integrations.";
    }
    if (output.decision === "NAVIGATE") {
        // ─── NAVIGATE Guard: block internal features + non-URL queries ─
        const queryLower = englishText.toLowerCase();
        const INTERNAL_KEYWORDS = ["shop", "integration", "settings", "einstellungen", "hilfe", "help", "dashboard", "template"];
        const isInternalQuery = INTERNAL_KEYWORDS.some(kw => queryLower.includes(kw));
        const hasNavigationIntent =
            /https?:\/\//.test(queryLower) ||
            /\.(com|org|net|io|de|at|ch|co|app|dev)\b/.test(queryLower) ||
            /\b(open|go to|visit|browse|öffne|google)\b/i.test(queryLower);

        if (isInternalQuery || (!hasNavigationIntent && !output.url?.startsWith("https://"))) {
            log.debug(`  🛡️ Concierge Validator: NAVIGATE blocked → ANSWER (internal/no-URL)`);
            return {
                decision: "ANSWER",
                answer: output.answer || "I can help you with API integrations, open any website, and use the AI copilot to research pages for you!",
            };
        }

        if (!output.url) {
            return { decision: "EXECUTE", refined_query: englishText };
        }
        if (!/^https?:\/\//i.test(output.url)) {
            output.url = "https://" + output.url;
        }
        output.title = output.title || output.url;
    }
    if (output.decision === "UPDATE") {
        output.refined_query = output.refined_query || englishText;
        if (!output.target_group) {
            return { decision: "EXECUTE", refined_query: englishText };
        }
    }
    if (output.decision === "SCRAPE") {
        if (!output.url) {
            // SCRAPE without URL → fallback to EXECUTE
            return { decision: "EXECUTE", refined_query: englishText };
        }
        if (!/^https?:\/\//i.test(output.url)) {
            output.url = "https://" + output.url;
        }
        output.instruction = output.instruction || englishText;
    }
    if (output.decision === "AUTOPILOT") {
        if (!output.url) {
            return { decision: "EXECUTE", refined_query: englishText };
        }
        if (!/^https?:\/\//i.test(output.url)) {
            output.url = "https://" + output.url;
        }
        output.instruction = output.instruction || englishText;
    }



    // Store in memory for follow-up context
    pushMemory("user", englishText);
    const assistantSummary = output.decision === "ANSWER"
        ? output.answer || "answered"
        : output.decision === "CLARIFY"
            ? output.question || "asked for clarification"
            : output.decision === "NAVIGATE"
                ? `navigate to ${output.url}`
                : `execute: ${output.refined_query || englishText}`;
    pushMemory("assistant", `[${output.decision}] ${assistantSummary}`);

    return output;
}
