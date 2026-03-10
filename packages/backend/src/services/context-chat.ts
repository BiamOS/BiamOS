// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Chat Agent (Page Q&A + Web Search)
// ============================================================
// Intelligent agent that answers user questions about the
// currently viewed page. Uses extracted page content as the
// primary context source, with automatic web search fallback.
//
// Implementation split into:
//   - context-chat-utils.ts  (types, rate limiting, prompts)
//   - page-commands.ts       (/summarize, /translate, /extract)
// ============================================================

import { getChatUrl, getHeaders } from "./llm-provider.js";
import { log } from "../utils/logger.js";
import { MODEL_THINKING } from "../config/models.js";
import { logTokenUsage, incrementAgentUsage } from "../server-utils.js";
import { searchWeb, formatSearchResults } from "./web-search.js";
import {
    isRateLimited,
    parseFollowUps,
    shouldForceSearch,
    buildSystemPrompt,
    buildMessages,
    SEARCH_TOOL,
    type ChatAnswer,
    type PageQuestion,
} from "./context-chat-utils.js";
import { handlePageCommand } from "./page-commands.js";

// Re-export types for external consumers
export type { ChatMessage, PageQuestion, ChatAnswer } from "./context-chat-utils.js";

// ─── Main Q&A Function ─────────────────────────────────────

export async function answerPageQuestion(ctx: PageQuestion): Promise<ChatAnswer> {
    if (isRateLimited(ctx.question, ctx.page_url)) {
        log.debug(`  💬 Context Chat: rate-limited for "${ctx.question.substring(0, 60)}"`);
        return { answer: "Please wait a moment before asking the same question again.", source: "general" };
    }

    if (ctx.question.trim().startsWith("/")) {
        return handlePageCommand(ctx);
    }

    const hasPageContent = ctx.page_text.trim().length > 50;
    const systemPrompt = buildSystemPrompt(ctx, hasPageContent, false);
    const messages = buildMessages(ctx, systemPrompt);
    const forceSearch = shouldForceSearch(ctx.question, ctx.history);

    if (forceSearch) {
        log.debug(`  🔍 Context Chat: forcing web search (keyword detected in "${ctx.question.substring(0, 50)}")`);
    }

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("context-chat");

        const firstResponse = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages,
                tools: [SEARCH_TOOL],
                tool_choice: forceSearch
                    ? { type: "function", function: { name: "search_web" } }
                    : "auto",
                temperature: 0.3,
                max_tokens: 3000,
            }),
        });

        if (!firstResponse.ok) {
            log.error(`  ❌ Context Chat LLM error: ${firstResponse.status}`);
            return { answer: "Sorry, I couldn't process that question right now.", source: "general" };
        }

        const firstResult = await firstResponse.json();
        await logTokenUsage("agent:context-chat", MODEL_THINKING, firstResult.usage ?? {});
        await incrementAgentUsage("web-copilot", firstResult.usage ?? {});

        const firstMessage = firstResult.choices?.[0]?.message;

        // Handle tool call (web search)
        if (firstMessage?.tool_calls?.length > 0) {
            const toolCall = firstMessage.tool_calls[0];
            if (toolCall.function?.name === "search_web") {
                let searchQuery = ctx.question;
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    searchQuery = args.query || ctx.question;
                } catch { }

                log.debug(`  🔍 Context Chat: LLM requested search: "${searchQuery}"`);

                const searchResults = await searchWeb(searchQuery);
                const formattedResults = formatSearchResults(searchResults);

                messages.push({
                    role: "assistant",
                    content: null,
                    ...({ tool_calls: firstMessage.tool_calls } as any),
                });
                messages.push({
                    role: "tool" as any,
                    content: formattedResults,
                    ...({ tool_call_id: toolCall.id } as any),
                });

                const secondResponse = await fetch(chatUrl, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        model: MODEL_THINKING,
                        messages,
                        temperature: 0.3,
                        max_tokens: 1500,
                    }),
                });

                if (!secondResponse.ok) {
                    return {
                        answer: searchResults.length > 0
                            ? searchResults.map(r => `**${r.title}**: ${r.snippet}`).join("\n\n")
                            : "Sorry, I couldn't find that information.",
                        source: "web_search",
                    };
                }

                const secondResult = await secondResponse.json();
                await logTokenUsage("agent:context-chat", MODEL_THINKING, secondResult.usage ?? {});
                await incrementAgentUsage("web-copilot", secondResult.usage ?? {});

                const rawAnswer = secondResult.choices?.[0]?.message?.content?.trim() || "";
                const { answer, follow_ups } = parseFollowUps(rawAnswer);
                log.debug(`  💬 Context Chat (with search): "${ctx.question.substring(0, 50)}" → ${answer.substring(0, 80)}... [web_search] (${follow_ups.length} follow-ups)`);
                return { answer, source: "web_search", follow_ups };
            }
        }

        // Direct answer (no tool call)
        const rawAnswer = firstMessage?.content?.trim() || "";
        const { answer, follow_ups } = parseFollowUps(rawAnswer);
        const source: ChatAnswer["source"] = hasPageContent ? "page_context" : "general";

        log.debug(`  💬 Context Chat: "${ctx.question.substring(0, 50)}" → ${answer.substring(0, 80)}... [${source}] (${follow_ups.length} follow-ups)`);
        return { answer, source, follow_ups };
    } catch (err) {
        log.error("  💥 Context Chat error:", err);
        return { answer: "Sorry, something went wrong. Please try again.", source: "general" };
    }
}

// ─── Streaming Chat Function ────────────────────────────────

export async function streamPageQuestion(
    ctx: PageQuestion,
    onEvent: (event: string) => void,
): Promise<void> {
    if (isRateLimited(ctx.question, ctx.page_url)) {
        onEvent(`data: ${JSON.stringify({ type: "token", content: "Please wait a moment before asking the same question again." })}\n\n`);
        onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
        return;
    }

    if (ctx.question.trim().toLowerCase().startsWith("/")) {
        const result = await handlePageCommand(ctx);
        onEvent(`data: ${JSON.stringify({ type: "token", content: result.answer })}\n\n`);
        onEvent(`data: ${JSON.stringify({ type: "done", source: result.source, follow_ups: result.follow_ups || [] })}\n\n`);
        return;
    }

    const hasPageContent = ctx.page_text.trim().length > 50;
    const systemPrompt = buildSystemPrompt(ctx, hasPageContent, true);
    const messages = buildMessages(ctx, systemPrompt);
    const forceSearch = shouldForceSearch(ctx.question, ctx.history);

    try {
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("context-chat-stream");

        // First call: check for tool use (non-streaming)
        const firstResponse = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages,
                tools: [SEARCH_TOOL],
                tool_choice: forceSearch
                    ? { type: "function", function: { name: "search_web" } }
                    : "auto",
                temperature: 0.3,
                max_tokens: 1500,
            }),
        });

        if (!firstResponse.ok) {
            onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, I couldn't process that right now." })}\n\n`);
            onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
            return;
        }

        const firstResult = await firstResponse.json();
        await logTokenUsage("agent:context-chat-stream", MODEL_THINKING, firstResult.usage ?? {});
        await incrementAgentUsage("web-copilot", firstResult.usage ?? {});

        const firstMessage = firstResult.choices?.[0]?.message;

        // Handle tool call (web search)
        if (firstMessage?.tool_calls?.length > 0) {
            const toolCall = firstMessage.tool_calls[0];
            if (toolCall.function?.name === "search_web") {
                let searchQuery = ctx.question;
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    searchQuery = args.query || ctx.question;
                } catch { }

                onEvent(`data: ${JSON.stringify({ type: "search", query: searchQuery })}\n\n`);
                log.debug(`  🔍 Stream: searching "${searchQuery}"`);

                const searchResults = await searchWeb(searchQuery);
                const formattedResults = formatSearchResults(searchResults);

                messages.push({
                    role: "assistant",
                    content: null,
                    ...({ tool_calls: firstMessage.tool_calls } as any),
                });
                messages.push({
                    role: "tool" as any,
                    content: formattedResults,
                    ...({ tool_call_id: toolCall.id } as any),
                });

                await streamLLMResponse(chatUrl, headers, messages, "web_search", onEvent);
                return;
            }
        }

        // No tool call — simulate streaming from direct answer
        if (firstMessage?.content) {
            const rawAnswer = firstMessage.content.trim();
            const { answer, follow_ups } = parseFollowUps(rawAnswer);
            const source: ChatAnswer["source"] = hasPageContent ? "page_context" : "general";

            const words = answer.split(/(\s+)/);
            let chunk = "";
            for (let i = 0; i < words.length; i++) {
                chunk += words[i];
                if ((i > 0 && i % 8 === 0) || i === words.length - 1) {
                    onEvent(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
                    chunk = "";
                    await new Promise(r => setTimeout(r, 15));
                }
            }

            onEvent(`data: ${JSON.stringify({ type: "done", source, follow_ups })}\n\n`);
            return;
        }

        onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, I couldn't generate an answer." })}\n\n`);
        onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
    } catch (err) {
        log.error("  💥 Stream error:", err);
        onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, something went wrong." })}\n\n`);
        onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
    }
}

// ─── Stream LLM Response Helper ─────────────────────────────

async function streamLLMResponse(
    chatUrl: string,
    headers: Record<string, string>,
    messages: any[],
    source: ChatAnswer["source"],
    onEvent: (event: string) => void,
): Promise<void> {
    const response = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: MODEL_THINKING,
            messages,
            temperature: 0.3,
            max_tokens: 1500,
            stream: true,
        }),
    });

    if (!response.ok || !response.body) {
        onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, streaming failed." })}\n\n`);
        onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
        return;
    }

    let fullContent = "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
                const chunk = JSON.parse(dataStr);
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                    fullContent += delta;
                    onEvent(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
                }
            } catch { }
        }
    }

    const { answer, follow_ups } = parseFollowUps(fullContent);
    onEvent(`data: ${JSON.stringify({ type: "done", source, follow_ups })}\n\n`);
    log.debug(`  💬 Stream complete: ${answer.substring(0, 80)}... [${source}] (${follow_ups.length} follow-ups)`);
}
