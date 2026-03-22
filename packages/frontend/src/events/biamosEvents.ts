// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Typed Event Bus (Discriminated Unions)
// ============================================================
// The Omnibar dispatches events without importing execution
// hooks. Each IframeBlock filters by targetCard === myCardId.
// ============================================================

// ─── Event Types (Discriminated Union) ─────────────────────

export type BiamosEvent =
    | { type: 'BIAMOS_RESEARCH'; query: string; targetCard?: string }
    | {
        type: 'BIAMOS_AGENT_ACTION';
        targetCard: string;
        task: string;
        method: string;
        tools: { allowed: string[]; forbidden: string[] };
    }
    | { type: 'BIAMOS_CONTEXT_CHAT'; targetCard: string; query: string }
    | { type: 'BIAMOS_GLOBAL_INTENT'; query: string }
    | { type: 'BIAMOS_CREATE_EMPTY_CARD'; cardId: string; title: string };

// ─── Custom Event Name ─────────────────────────────────────

const EVENT_NAME = 'biamos:event' as const;

// ─── Dispatch ──────────────────────────────────────────────

export function dispatchBiamosEvent(event: BiamosEvent): void {
    window.dispatchEvent(
        new CustomEvent<BiamosEvent>(EVENT_NAME, { detail: event })
    );
}

// ─── Subscribe / Unsubscribe ───────────────────────────────

export type BiamosEventHandler = (event: BiamosEvent) => void;

export function onBiamosEvent(handler: BiamosEventHandler): void {
    const listener = (e: Event) => {
        const detail = (e as CustomEvent<BiamosEvent>).detail;
        if (detail) handler(detail);
    };
    // Store the raw listener on the handler for cleanup
    (handler as any).__biamosListener = listener;
    window.addEventListener(EVENT_NAME, listener);
}

export function offBiamosEvent(handler: BiamosEventHandler): void {
    const listener = (handler as any).__biamosListener;
    if (listener) {
        window.removeEventListener(EVENT_NAME, listener);
        delete (handler as any).__biamosListener;
    }
}
