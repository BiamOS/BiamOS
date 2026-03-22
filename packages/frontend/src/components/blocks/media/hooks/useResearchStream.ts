// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// useResearchStream — Research Engine SSE Hook
// ============================================================
// Manages the /api/research SSE streaming pipeline.
// Self-contained: owns its own state, abort controller, and
// stream parsing logic.
// ============================================================

import { useState, useCallback, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface ResearchStep {
    phase: string;
    status: string;
    data?: Record<string, unknown>;
}

export interface ResearchState {
    status: 'idle' | 'running' | 'done' | 'error';
    phase: string;
    steps: ResearchStep[];
    query: string;
    blocks?: Array<{ type: string; [key: string]: unknown }>;
}

const INITIAL_STATE: ResearchState = { status: 'idle', phase: '', steps: [], query: '' };

// ─── Hook ───────────────────────────────────────────────────

export function useResearchStream(onStart?: () => void) {
    const [researchState, setResearchState] = useState<ResearchState>(INITIAL_STATE);
    const hasResearchDashboard = researchState.status === 'done' && !!researchState.blocks && researchState.blocks.length > 0;
    const researchAbortRef = useRef<AbortController | null>(null);

    const startResearch = useCallback(async (query: string) => {
        // Abort any running research
        researchAbortRef.current?.abort();
        const abort = new AbortController();
        researchAbortRef.current = abort;

        // Notify caller (e.g. dismiss old dashboard)
        onStart?.();

        // Reset state
        setResearchState({ status: 'running', phase: 'search', steps: [], query, blocks: undefined });

        try {
            console.log("🔥 FETCHING RESEARCH API:", query);
            const resp = await fetch('http://localhost:3001/api/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: abort.signal,
            });

            if (!resp.ok || !resp.body) {
                console.error("🔥 RESEARCH API HTTP ERROR:", resp.status, resp.statusText);
                setResearchState(prev => ({ ...prev, status: 'error', phase: 'error' }));
                return;
            }

            // Parse SSE stream
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            let currentEvent = '';
            let currentData = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        currentData = line.slice(6);
                    } else if (line === '' && currentData) {
                        // End of SSE event — process it
                        try {
                            const parsed = JSON.parse(currentData);

                            if (currentEvent === 'step') {
                                setResearchState(prev => ({
                                    ...prev,
                                    phase: parsed.phase || prev.phase,
                                    steps: [...prev.steps, parsed],
                                }));
                            } else if (currentEvent === 'done') {
                                setResearchState(prev => ({ ...prev, status: 'done', phase: 'done' }));
                            } else if (currentEvent === 'dashboard') {
                                // Store blocks directly in researchState
                                if (parsed.blocks && Array.isArray(parsed.blocks)) {
                                    setResearchState(prev => ({
                                        ...prev,
                                        status: 'done',
                                        phase: 'done',
                                        blocks: parsed.blocks,
                                    }));
                                }
                            } else if (currentEvent === 'error') {
                                setResearchState(prev => ({ ...prev, status: 'error', phase: 'error' }));
                            }
                        } catch { /* ignore parse errors */ }
                        currentEvent = '';
                        currentData = '';
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                setResearchState(prev => ({ ...prev, status: 'error', phase: 'error' }));
            }
        }
    }, [onStart]);

    const abortResearch = useCallback(() => {
        if (researchAbortRef.current) {
            researchAbortRef.current.abort();
            researchAbortRef.current = null;
        }
    }, []);

    return { researchState, setResearchState, startResearch, hasResearchDashboard, abortResearch };
}
