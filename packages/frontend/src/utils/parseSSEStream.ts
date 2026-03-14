// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — SSE Stream Parser
// ============================================================
// Extracted from useIntentHandler.ts — pure utility for parsing
// Server-Sent Events from a fetch Response.
// ============================================================

export interface SSEStepData {
    step: string;
    label: string;
    count?: number;
    stepIndex?: number;
    totalSteps?: number;
    [key: string]: unknown;
}

/** Yield to the browser event loop so React can flush a render */
const yieldToRenderer = () => new Promise<void>((r) => {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => setTimeout(r, 0));
    } else {
        setTimeout(r, 16);
    }
});

/**
 * Parse an SSE stream from a fetch Response.
 * Calls `onStep` for each "step" event with the full step data,
 * calls `onBlock` for each progressive "block" event,
 * calls `onGroupHint` when the backend signals which group/integration owns this result,
 * and returns the final "result" event data.
 */
export async function parseSSEStream<T = any>(
    response: Response,
    onStep?: (label: string, stepData?: SSEStepData) => void,
    onBlock?: (block: any, index: number, intentIndex?: number) => void,
    onGroupHint?: (groupName: string, integrationId?: string) => void,
): Promise<T | null> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let data: T | null = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        // Process events one at a time — must be sequential for blocks
        for (const line of lines) {
            if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
                try {
                    const parsed = JSON.parse(line.slice(6));
                    if (currentEvent === "step") {
                        onStep?.(parsed.label || parsed.step, parsed as SSEStepData);
                    } else if (currentEvent === "group_hint") {
                        onGroupHint?.(parsed.group_name, parsed.integration_id);
                    } else if (currentEvent === "block") {
                        onBlock?.(parsed.block, parsed.index, parsed.intentIndex);
                        // Yield to event loop so React flushes the render
                        // before processing the next block or result event.
                        // Without this, React 18 batches all setItems() calls
                        // into one render, making streaming invisible.
                        await yieldToRenderer();
                    } else if (currentEvent === "result") {
                        data = parsed;
                    }
                } catch { /* skip malformed JSON */ }
            }
        }
    }

    return data;
}
