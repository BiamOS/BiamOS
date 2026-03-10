// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — SSE Helpers (Server-Side)
// ============================================================
// Extracted from intent-routes.ts — reusable helpers for
// creating SSE (Server-Sent Events) streaming responses.
// ============================================================

/**
 * Create an SSE stream with a writer helper.
 * Returns the readable stream and the sendEvent function.
 */
export function createSSEStream() {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (event: string, data: unknown) => {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        await writer.write(encoder.encode(msg));
    };

    const close = async () => {
        try { await writer.close(); } catch { /* already closed */ }
    };

    return { readable, sendEvent, close };
}

/**
 * Create the standard SSE Response with proper headers.
 */
export function sseResponse(readable: ReadableStream): Response {
    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
