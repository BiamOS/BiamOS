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

                let rawAnswer = secondResult.choices?.[0]?.message?.content?.trim() || "";

                // Fallback: if LLM returned empty content, use raw search results
                if (!rawAnswer && searchResults.length > 0) {
                    log.warn(`  ⚠️ Context Chat: LLM returned empty content after search, using raw results`);
                    rawAnswer = searchResults.map(r => `**${r.title}**\n${r.snippet}\n[Source](${r.url})`).join("\n\n");
                }

                const { answer, follow_ups } = parseFollowUps(rawAnswer);
                log.debug(`  💬 Context Chat (with search): "${ctx.question.substring(0, 50)}" → ${answer.substring(0, 80)}... [web_search] (${follow_ups.length} follow-ups)`);
                return { answer: answer || "Sorry, I couldn't find that information.", source: "web_search", follow_ups };
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

        // ⚡ Streaming first call — gives instant feedback instead of blocking
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
                stream: true,
            }),
        });

        if (!firstResponse.ok) {
            onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, I couldn't process that right now." })}\n\n`);
            onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
            return;
        }

        if (!firstResponse.body) {
            onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, streaming is not available." })}\n\n`);
            onEvent(`data: ${JSON.stringify({ type: "done", source: "general", follow_ups: [] })}\n\n`);
            return;
        }

        // Read the streaming response, collecting both content and tool calls
        let fullContent = "";
        const toolCalls: any[] = [];
        const reader = firstResponse.body.getReader();
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
                    const delta = chunk.choices?.[0]?.delta;

                    // Collect content tokens → stream to frontend immediately
                    if (delta?.content) {
                        fullContent += delta.content;
                        onEvent(`data: ${JSON.stringify({ type: "token", content: delta.content })}\n\n`);
                    }

                    // Collect tool call fragments
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const idx = tc.index ?? 0;
                            if (!toolCalls[idx]) {
                                toolCalls[idx] = { id: tc.id || "", function: { name: "", arguments: "" } };
                            }
                            if (tc.id) toolCalls[idx].id = tc.id;
                            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                        }
                    }
                } catch { }
            }
        }

        // Handle tool call (web search) detected from stream
        if (toolCalls.length > 0 && toolCalls[0]?.function?.name === "search_web") {
            const toolCall = toolCalls[0];
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
                ...({ tool_calls: toolCalls } as any),
            });
            messages.push({
                role: "tool" as any,
                content: formattedResults,
                ...({ tool_call_id: toolCall.id } as any),
            });

            await streamLLMResponse(chatUrl, headers, messages, "web_search", onEvent);
            return;
        }

        // Direct answer from stream
        if (fullContent.trim()) {
            const { answer, follow_ups } = parseFollowUps(fullContent);
            const source: ChatAnswer["source"] = hasPageContent ? "page_context" : "general";
            onEvent(`data: ${JSON.stringify({ type: "done", source, follow_ups })}\n\n`);
            return;
        }

        // Empty content — retry once non-streaming as fallback
        log.warn(`  ⚠️ Stream: first call returned no content, retrying non-streaming...`);
        const retryResponse = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_THINKING,
                messages,
                temperature: 0.3,
                max_tokens: 1500,
            }),
        });

        if (retryResponse.ok) {
            const retryResult = await retryResponse.json();
            const retryContent = retryResult.choices?.[0]?.message?.content?.trim() || "";
            if (retryContent) {
                const { answer, follow_ups } = parseFollowUps(retryContent);
                const source: ChatAnswer["source"] = hasPageContent ? "page_context" : "general";
                onEvent(`data: ${JSON.stringify({ type: "token", content: answer })}\n\n`);
                onEvent(`data: ${JSON.stringify({ type: "done", source, follow_ups })}\n\n`);
                return;
            }
        }

        onEvent(`data: ${JSON.stringify({ type: "token", content: "Sorry, I couldn't generate an answer. Please try again." })}\n\n`);
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

    // If streaming produced no content, retry with a non-streaming call
    if (!fullContent.trim()) {
        log.warn(`  ⚠️ Stream: empty content, retrying non-streaming...`);
        try {
            const retryResponse = await fetch(chatUrl, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: MODEL_THINKING,
                    messages,
                    temperature: 0.3,
                    max_tokens: 1500,
                }),
            });

            if (retryResponse.ok) {
                const retryResult = await retryResponse.json();
                fullContent = retryResult.choices?.[0]?.message?.content?.trim() || "";
                if (fullContent) {
                    log.debug(`  ✅ Stream retry succeeded: ${fullContent.substring(0, 60)}...`);
                    onEvent(`data: ${JSON.stringify({ type: "token", content: fullContent })}\n\n`);
                }
            }
        } catch (retryErr) {
            log.error(`  ❌ Stream retry failed:`, retryErr);
        }
    }

    // Final fallback: if STILL empty, extract raw search results from messages
    if (!fullContent.trim()) {
        const toolMsg = messages.find((m: any) => m.role === "tool");
        if (toolMsg?.content && toolMsg.content !== "No web search results found.") {
            log.warn(`  ⚠️ Stream: using raw search results as fallback`);
            fullContent = toolMsg.content;
            onEvent(`data: ${JSON.stringify({ type: "token", content: fullContent })}\n\n`);
        }
    }

    const { answer, follow_ups } = parseFollowUps(fullContent);
    onEvent(`data: ${JSON.stringify({ type: "done", source, follow_ups })}\n\n`);
    log.debug(`  💬 Stream complete: ${answer.substring(0, 80)}... [${source}] (${follow_ups.length} follow-ups)`);
}
