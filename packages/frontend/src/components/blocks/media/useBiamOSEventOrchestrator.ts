// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — useBiamOSEventOrchestrator
// ============================================================
// Handles the BiamOS Event Bus for a single IframeBlock card.
//
// Architecture:
// - useLatest pattern: callbacksRef is synced on every render
//   so the handler always calls the freshest agent/ctx/etc.
//   without the effect ever needing to re-register.
// - The effect is STABLE: it registers once per cardId and
//   never tears down due to agent state changes.
//
// Supported events:
//   BIAMOS_AGENT_ACTION  → agent.startAgent(...)
//   BIAMOS_RESEARCH      → startResearch(...)
//   BIAMOS_CONTEXT_CHAT  → startContextChat(...)
// ============================================================

import { useRef, useEffect, type MutableRefObject } from "react";
import { onBiamosEvent, offBiamosEvent, type BiamosEventHandler } from "../../../events/biamosEvents";

// ─── Types ──────────────────────────────────────────────────

interface OrchestratorCallbacks {
    agent: {
        startAgent: (task: string, opts: any) => void;
    };
    startResearch: (query: string) => void;
    startContextChat: (query: string) => void;
    ctx: {
        setContextHints: (updater: any) => void;
    };
    /** Mutable ref that tracks the current agent task string */
    agentTaskRef: MutableRefObject<string>;
}

// ─── Hook ───────────────────────────────────────────────────

/**
 * Registers a BiamOS event bus listener for this card.
 * Uses the useLatest pattern: `callbacks` is read from a ref,
 * so the handler always has fresh closures without re-registering.
 *
 * @param cardId   - The card's unique ID (from useCardContext)
 * @param callbacks - Live callbacks (agent, startResearch, etc.)
 */
export function useBiamOSEventOrchestrator(
    cardId: string | undefined,
    callbacks: OrchestratorCallbacks,
): void {
    // useLatest: sync all callbacks into a ref on every render
    const callbacksRef = useRef<OrchestratorCallbacks>(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }); // intentionally no deps — syncs on every render

    // Register the event handler ONCE per cardId
    useEffect(() => {
        if (!cardId) return;

        const handler: BiamosEventHandler = (event) => {
            const cb = callbacksRef.current;

            // 🔍 DIAGNOSTIC — remove after debugging
            if (event.type === 'BIAMOS_CONTEXT_CHAT' || event.type === 'BIAMOS_RESEARCH' || event.type === 'BIAMOS_AGENT_ACTION') {
                console.log(`🔍 [Orchestrator:${cardId}] Got ${event.type} → targetCard="${(event as any).targetCard}" match=${String((event as any).targetCard === cardId)}`);
            }

            switch (event.type) {
                case 'BIAMOS_AGENT_ACTION':
                    if (event.targetCard !== cardId) return;
                    cb.agentTaskRef.current = event.task;
                    cb.ctx.setContextHints((prev: any[]) => [
                        ...prev,
                        {
                            query: `🤖 Agent: ${event.task}`,
                            reason: "Manual query",
                            expanded: true,
                            loading: true,
                            timestamp: Date.now(),
                            data: { summary: `Starting browser action...` },
                        },
                    ]);
                    cb.agent.startAgent(event.task, {
                        method: event.method,
                        allowed_tools: event.tools.allowed,
                        forbidden: event.tools.forbidden,
                    });
                    break;

                case 'BIAMOS_RESEARCH':
                    if (event.targetCard && event.targetCard !== cardId) return;
                    cb.agentTaskRef.current = event.query;
                    cb.ctx.setContextHints((prev: any[]) => [
                        ...prev,
                        {
                            query: `📊 Research: ${event.query}`,
                            reason: "Research Engine",
                            expanded: true,
                            loading: true,
                            timestamp: Date.now(),
                            data: { summary: `🔬 Starting research...` },
                        },
                    ]);
                    cb.startResearch(event.query);
                    break;

                case 'BIAMOS_CONTEXT_CHAT':
                    if (event.targetCard !== cardId) return;
                    console.log(`🔍 [Orchestrator:${cardId}] ✅ Calling startContextChat("${event.query}")`);
                    cb.startContextChat(event.query);
                    break;
            }
        };

        onBiamosEvent(handler);
        return () => offBiamosEvent(handler);
    }, [cardId]); // ← STABLE: registers once per card
}
