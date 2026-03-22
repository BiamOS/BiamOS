// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// useWebviewLifecycle — Webview Lifecycle Effects Hook
// ============================================================
// Consolidates all useEffect hooks that manage the webview's
// lifecycle: dashboard dismissal, agent→sidebar sync, tab title
// sync, GenUI intent bridge, and zoom/keyboard handling.
// ============================================================

import { useRef, useEffect, useCallback, useState, type RefObject } from "react";
import type { ContextHint } from "../ContextSidebar";

// ─── Types ──────────────────────────────────────────────────

interface AgentState {
    status: string;
    currentAction: string;
    steps: Array<{ action: string; description: string; result?: string }>;
    taskType?: string;
    lastWorkflowId?: number | null;
}

interface AgentActions {
    agentState: AgentState;
    startAgent: (task: string) => void;
    sendFeedback: (positive: boolean) => Promise<void>;
}

type SetContextHints = React.Dispatch<React.SetStateAction<ContextHint[]>>;

export interface LifecycleConfig {
    webviewRef: RefObject<any>;
    isElectron: boolean;
    initialUrl: string;
    agent: AgentActions;
    agentTaskRef: RefObject<string>;
    setContextHints: SetContextHints;
    genuiBlocks?: any[];
}

// ─── Agent ↔ Sidebar Sync Effect ────────────────────────────

function useAgentSidebarSync(
    agentState: AgentState,
    agentTaskRef: RefObject<string>,
    setContextHints: SetContextHints,
    sendFeedback: (positive: boolean) => Promise<void>,
    lastWorkflowId?: number | null,
) {
    useEffect(() => {
        const { status, currentAction, steps } = agentState;
        const taskLabel = agentTaskRef.current;
        if (!taskLabel) return;
        const queryKey = `🤖 Agent: ${taskLabel}`;

        // When agent stops/resets → mark chat hint as done
        if (status === "idle") {
            setContextHints(prev => prev.map(h =>
                h.query === queryKey && h.loading
                    ? { ...h, loading: false, data: { ...h.data, summary: (h.data?.summary || "") + "\n\n⏹️ Stopped" } }
                    : h
            ));
            return;
        }

        // Build summary from steps with readable formatting
        const stepIcon = (action: string) => {
            switch (action) {
                case 'search_web': return '🔍';
                case 'navigate': return '🌐';
                case 'scroll': return '📜';
                case 'take_notes': return '📝';
                case 'click': case 'click_at': return '🖱️';
                case 'type_text': return '⌨️';
                case 'genui': return '🎨';
                case 'ask_user': return '💬';
                case 'go_back': return '↩️';
                case 'done': return '✅';
                default: return '▸';
            }
        };

        const stepsSummary = steps
            .map((s, i) => {
                const icon = stepIcon(s.action);
                let result = s.result || '';
                const firstLine = result.split('\n')[0];
                // Truncate at word boundary for clean display
                let truncated = firstLine;
                if (truncated.length > 150) {
                    truncated = truncated.substring(0, 147);
                    const lastSpace = truncated.lastIndexOf(' ');
                    if (lastSpace > 100) truncated = truncated.substring(0, lastSpace);
                    truncated += '…';
                }
                return `${i + 1}. ${icon} ${s.description}${truncated ? `\n   → ${truncated}` : ''}`;
            })
            .join("\n");
        const statusEmoji = status === "done" ? "✅" : status === "error" ? "❌" : status === "paused" ? "⏸️" : "🔄";
        const stepCount = steps.length;
        const stepBadge = stepCount > 0 ? ` ${stepCount} steps` : "";
        const summary = stepsSummary
            ? `${statusEmoji}${stepBadge} ${currentAction}\n\n**Steps:**\n${stepsSummary}`
            : `${statusEmoji} ${currentAction}`;

        const isDone = status === "done" || status === "error";

        setContextHints(prev => prev.map(h =>
            h.query === queryKey
                ? {
                    ...h,
                    loading: !isDone,
                    data: {
                        summary,
                        _source: "page_context",
                        _task: taskLabel,
                        _steps: steps,
                        _status: status,
                        _currentAction: currentAction,
                        ...(isDone && lastWorkflowId ? {
                            _workflowId: lastWorkflowId,
                            _sendFeedback: sendFeedback,
                        } : {}),
                    },
                }
                : h
        ));
    }, [agentState, agentTaskRef, setContextHints, sendFeedback, lastWorkflowId]);
}

// ─── Tab Title Sync Effect ──────────────────────────────────

function useTabTitleSync(
    webviewRef: RefObject<any>,
    isElectron: boolean,
    initialUrl: string,
) {
    useEffect(() => {
        const wv = webviewRef.current;
        if (!wv || !isElectron) return;

        const handleTitle = (e: any) => {
            const newTitle = e.title || '';
            if (!newTitle || newTitle === 'about:blank') return;
            window.dispatchEvent(new CustomEvent('biamos:webview-title-updated', {
                detail: { title: newTitle, url: initialUrl, currentUrl: wv.getURL?.() || '' },
            }));
        };

        try {
            wv.addEventListener('page-title-updated', handleTitle);
        } catch { /* webview not ready yet */ }

        return () => {
            try {
                wv.removeEventListener('page-title-updated', handleTitle);
            } catch { /* */ }
        };
    }, [webviewRef.current, isElectron, initialUrl]);
}

// ─── GenUI Intent Bridge Effect ─────────────────────────────

function useGenUIIntentBridge(
    webviewRef: RefObject<any>,
    agent: AgentActions,
    agentTaskRef: RefObject<string>,
    setContextHints: SetContextHints,
) {
    useEffect(() => {
        const handler = async (e: Event) => {
            const intent = (e as CustomEvent).detail?.intent;
            if (!intent) return;

            console.log(`🎯 [GenUI] Intent received: "${intent}"`);

            // Show agent activity in sidebar
            setContextHints(prev => [
                ...prev.filter(h => !h.query.startsWith('🤖 Agent:')),
                {
                    query: `🤖 Agent: ${intent}`,
                    reason: "GenUI intent",
                    expanded: true,
                    loading: true,
                    timestamp: Date.now(),
                    data: { summary: "Processing intent..." },
                },
            ]);

            const wv = webviewRef.current;

            // Extract URL from intent
            const urlMatch = intent.match(/(?:navigate(?:\s+directly)?\s+to|open|go\s+to)\s+(https?:\/\/\S+|[\w.-]+\.\w{2,}(?:\/\S*)?)/i);
            let targetUrl = urlMatch?.[1] || '';
            if (targetUrl && !targetUrl.startsWith('http')) {
                targetUrl = 'https://' + targetUrl;
            }

            // Check if intent is PURE navigation
            const isPureNav = targetUrl && /^(navigate\s+(directly\s+)?to|open)\s+\S+$/i.test(intent.trim());
            const isSearch = /^search\s/i.test(intent.trim());

            if (isPureNav && wv?.loadURL) {
                console.log(`🎯 [GenUI] Direct navigation to ${targetUrl}`);
                try { await wv.loadURL(targetUrl); } catch { /* handled by did-fail-load */ }
            } else if (isSearch) {
                console.log(`🎯 [GenUI] Search intent, starting agent`);
                (agentTaskRef as any).current = intent;
                agent.startAgent(intent);
            } else if (targetUrl && wv?.loadURL) {
                console.log(`🎯 [GenUI] Complex intent: nav to ${targetUrl}, then agent`);
                try {
                    await wv.loadURL(targetUrl);
                    await new Promise(r => setTimeout(r, 2500));
                } catch { /* navigation abort is normal */ }
                const taskOnly = intent.replace(/^(navigate\s+(directly\s+)?to|open|go\s+to)\s+\S+\s*(and\s+)?/i, '').trim();
                (agentTaskRef as any).current = taskOnly || intent;
                agent.startAgent(taskOnly || intent);
            } else {
                (agentTaskRef as any).current = intent;
                agent.startAgent(intent);
            }
        };

        window.addEventListener('biamos:genui-intent', handler);
        return () => window.removeEventListener('biamos:genui-intent', handler);
    }, [webviewRef, agent, agentTaskRef, setContextHints]);
}

// ─── Zoom + Keyboard Effect ─────────────────────────────────

export function useWebviewZoom(webviewRef: RefObject<any>) {
    const [zoomPercent, setZoomPercent] = useState(100);
    const [ctrlHeld, setCtrlHeld] = useState(false);
    const ctrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const applyZoom = useCallback((newPercent: number) => {
        const clamped = Math.max(25, Math.min(200, newPercent));
        setZoomPercent(clamped);
        const wv = webviewRef.current;
        if (wv?.setZoomFactor) {
            wv.setZoomFactor(clamped / 100);
        }
    }, [webviewRef]);

    useEffect(() => {
        const resetCtrl = () => setCtrlHeld(false);
        const startCtrlTimer = () => {
            if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
            ctrlTimerRef.current = setTimeout(resetCtrl, 3000);
        };

        const down = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setCtrlHeld(true);
                startCtrlTimer();
            }
            if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
                e.preventDefault();
                setZoomPercent(prev => { const next = Math.min(200, prev + 10); applyZoom(next); return next; });
            }
            if (e.ctrlKey && e.key === "-") {
                e.preventDefault();
                setZoomPercent(prev => { const next = Math.max(25, prev - 10); applyZoom(next); return next; });
            }
            if (e.ctrlKey && e.key === "0") {
                e.preventDefault();
                applyZoom(100);
            }
        };
        const up = (e: KeyboardEvent) => {
            if (e.key === "Control") {
                setCtrlHeld(false);
                if (ctrlTimerRef.current) { clearTimeout(ctrlTimerRef.current); ctrlTimerRef.current = null; }
            }
        };
        const blur = () => {
            setCtrlHeld(false);
            if (ctrlTimerRef.current) { clearTimeout(ctrlTimerRef.current); ctrlTimerRef.current = null; }
        };

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setZoomPercent(prev => {
                const delta = e.deltaY > 0 ? -10 : 10;
                const next = Math.max(25, Math.min(200, prev + delta));
                const wv = webviewRef.current;
                if (wv?.setZoomFactor) wv.setZoomFactor(next / 100);
                return next;
            });
        };

        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        window.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", blur);
            window.removeEventListener("wheel", onWheel);
            if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
        };
    }, [applyZoom, webviewRef]);

    return { zoomPercent, ctrlHeld, applyZoom };
}

// ─── Main Orchestrator Hook ─────────────────────────────────

export function useWebviewLifecycle(config: LifecycleConfig) {
    const {
        webviewRef, isElectron, initialUrl,
        agent, agentTaskRef, setContextHints,
    } = config;

    // Agent state → sidebar chat hint sync
    useAgentSidebarSync(
        agent.agentState,
        agentTaskRef,
        setContextHints,
        agent.sendFeedback,
        agent.agentState.lastWorkflowId,
    );

    // Tab title sync (Chrome-like)
    useTabTitleSync(webviewRef, isElectron, initialUrl);

    // GenUI intent bridge
    useGenUIIntentBridge(webviewRef, agent, agentTaskRef, setContextHints);
}
