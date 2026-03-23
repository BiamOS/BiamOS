// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — CommandCenter (Unified Right Panel)
// ============================================================
// The ONE AND ONLY sidebar in BiamOS. Replaces the per-card
// ContextSidebar. Reads from useContextStore (written by the
// focused IframeBlock). Shows hints, agent bubbles, research
// progress, chat messages, and a pinned Omnibar input.
//
// Data flow:
//   IframeBlock (focused) → useContextStore → CommandCenter
// ============================================================

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Box, Typography, LinearProgress, Collapse } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import WarningIcon from '@mui/icons-material/Warning';
import { useContextStore } from '../stores/useContextStore';
import { useFocusStore } from '../stores/useFocusStore';
import { dispatchBiamosEvent } from '../events/biamosEvents';
import { useTaskStore } from '../stores/useTaskStore';
import { COLORS, accentAlpha } from '../theme/theme';

// ─── Design Tokens (routed via COLORS — no hardcoded hex!) ──

const PANEL_WIDTH = 310;

const tokens = {
    panelBg: COLORS.bgPaper,
    headerBg: COLORS.surfaceSubtle,
    border: `1px solid ${COLORS.border}`,
    text: COLORS.textPrimary,
    muted: COLORS.textSecondary,
    accent: COLORS.accent,
    userBubble: COLORS.surface,
    aiBubble: COLORS.surfaceGlass,
    researchAccent: COLORS.textPrimary,
    agentAccent: COLORS.textPrimary,
    fontSize: '0.78rem',
    lineHeight: 1.6,
};

// ─── PauseCard: 30-second auto-confirm countdown ────────────

const AUTO_CONFIRM_SECS = 30;

function PauseCard({ pauseQuestion, onConfirm, onCancel }: { pauseQuestion: string; onConfirm: () => void; onCancel: () => void }) {
    const [secsLeft, setSecsLeft] = useState(AUTO_CONFIRM_SECS);
    const confirmedRef = useRef(false);

    useEffect(() => {
        setSecsLeft(AUTO_CONFIRM_SECS);
        confirmedRef.current = false;
        const iv = setInterval(() => {
            setSecsLeft(s => {
                if (s <= 1) {
                    clearInterval(iv);
                    if (!confirmedRef.current) {
                        confirmedRef.current = true;
                        onConfirm();
                    }
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(iv);
    }, [pauseQuestion]); // reset when question changes

    const pct = (secsLeft / AUTO_CONFIRM_SECS) * 100;
    const urgent = secsLeft <= 8;

    return (
        <Box sx={{ px: 1.5, pb: 1.2, pt: 0.4 }}>
            {/* Question box */}
            <Box sx={{ bgcolor: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: 1.5, p: 1.2, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
                    <Typography sx={{ fontSize: '0.7rem', color: '#FFD60A', fontWeight: 700 }}>⏸ Waiting for input</Typography>
                    <Typography sx={{ fontSize: '0.62rem', color: urgent ? '#FF453A' : '#FFD60A', fontWeight: 700, fontVariantNumeric: 'tabular-nums', animation: urgent ? 'pulse 0.8s infinite' : 'none', '@keyframes pulse': {'0%,100%': {opacity:1},'50%':{opacity:0.4}} }}>
                        {secsLeft}s
                    </Typography>
                </Box>
                {/* Countdown bar */}
                <Box sx={{ width: '100%', height: 3, bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2, mb: 0.8, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', borderRadius: 2, bgcolor: urgent ? '#FF453A' : '#FFD60A', width: `${pct}%`, transition: 'width 1s linear, background-color 0.5s ease' }} />
                </Box>
                <Typography sx={{ fontSize: '0.68rem', color: tokens.text, lineHeight: 1.5 }}>{pauseQuestion}</Typography>
            </Box>
            {/* Buttons */}
            <Box sx={{ display: 'flex', gap: 0.8 }}>
                <Box component="button" onClick={() => { confirmedRef.current = true; onConfirm(); }} sx={{ flex: 1, px: 1, py: 0.6, fontSize: '0.68rem', fontWeight: 700, bgcolor: '#30D158', color: '#000', border: 'none', borderRadius: 1.5, cursor: 'pointer', '&:hover': { opacity: 0.85 } }}>✓ Yes</Box>
                <Box component="button" onClick={() => { confirmedRef.current = true; onCancel(); }} sx={{ flex: 1, px: 1, py: 0.6, fontSize: '0.68rem', fontWeight: 700, bgcolor: 'rgba(255,69,58,0.15)', color: '#FF453A', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,69,58,0.25)' } }}>✕ No</Box>
            </Box>
        </Box>
    );
}

// ─── Mini AgentStepBubble ────────────────────────────────────

function AgentBubble({
    task, steps, status, pauseQuestion,
    onConfirm, onCancel, currentAction,
}: {
    task: string; steps: any[]; status: string;
    pauseQuestion: string | null; onConfirm: () => void;
    onCancel: () => void; currentAction: string;
}) {
    const isDone = status === 'done' || status === 'error';
    const isPaused = status === 'paused';
    const isRunning = status === 'running';
    // Auto-collapse when done so the list reads as a clean activity log
    const [expanded, setExpanded] = useState(!isDone);

    return (
        <Box sx={{ mb: 0.5, bgcolor: tokens.aiBubble, borderRadius: 2, border: tokens.border, overflow: 'hidden' }}>
            {/* Header */}
            <Box
                onClick={() => setExpanded(e => !e)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.5, py: 1.2, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
            >
                {isRunning && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tokens.agentAccent, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } }, flexShrink: 0 }} />}
                {isDone && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#30D158', flexShrink: 0 }} />}
                {isPaused && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FFD60A', animation: 'pulse 1s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } }, flexShrink: 0 }} />}
                <Typography sx={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🤖 {task.replace('🤖 Agent: ', '')}
                </Typography>
                {steps.length > 0 && (
                    <Typography sx={{ fontSize: '0.58rem', color: tokens.muted, flexShrink: 0 }}>
                        {steps.length} step{steps.length !== 1 ? 's' : ''}
                    </Typography>
                )}
                <ChevronRightIcon sx={{ fontSize: 14, color: tokens.muted, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }} />
            </Box>

            {/* Pause confirmation card — with 30s auto-confirm countdown */}
            {isPaused && pauseQuestion && (
                <PauseCard pauseQuestion={pauseQuestion} onConfirm={onConfirm} onCancel={onCancel} />
            )}

            {/* Steps */}
            <Collapse in={expanded}>
                <Box sx={{ px: 1.5, pb: 1.2 }}>
                    {steps.map((step: any, i: number) => {
                        const isLast = i === steps.length - 1;
                        return (
                            <Box key={i} sx={{ display: 'flex', gap: 0.8, mb: 0.5, opacity: isLast && isRunning ? 1 : 0.6 }}>
                                <Typography sx={{ fontSize: '0.65rem', color: isLast && isRunning ? tokens.agentAccent : '#30D158', flexShrink: 0, mt: 0.1 }}>
                                    {isLast && isRunning ? '▶' : '✓'}
                                </Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: tokens.text, lineHeight: 1.4 }}>
                                    {step.description || step.action}
                                </Typography>
                            </Box>
                        );
                    })}
                    {(isRunning || isPaused) && currentAction && (
                        <Box sx={{ display: 'flex', gap: 0.8, mt: 0.5, opacity: 0.7 }}>
                            <Typography sx={{ fontSize: '0.65rem', color: tokens.agentAccent, flexShrink: 0, mt: 0.1 }}>⟳</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: tokens.muted, fontStyle: 'italic', lineHeight: 1.4 }}>{currentAction}</Typography>
                        </Box>
                    )}
                    {steps.length === 0 && !currentAction && isRunning && (
                        <Typography sx={{ fontSize: '0.68rem', color: tokens.muted, fontStyle: 'italic' }}>Starting up…</Typography>
                    )}
                </Box>
            </Collapse>

            {/* Cancel button when running */}
            {isRunning && (
                <Box sx={{ px: 1.2, pb: 0.8 }}>
                    <Box component="button" onClick={onCancel} sx={{ width: '100%', px: 1, py: 0.4, fontSize: '0.62rem', fontWeight: 600, bgcolor: 'rgba(255,69,58,0.1)', color: '#FF453A', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,69,58,0.2)' } }}>
                        ✕ Cancel Agent
                    </Box>
                </Box>
            )}
        </Box>
    );
}

// ─── Mini ResearchBubble ─────────────────────────────────────

const PHASE_PROGRESS: Record<string, number> = { search: 20, fetch: 55, synthesize: 80, genui: 92, done: 100 };

function ResearchBubble({ query, steps, status, phase }: { query: string; steps: any[]; status: string; phase: string }) {
    const [expanded, setExpanded] = useState(true);
    const progress = status === 'done' ? 100 : (PHASE_PROGRESS[phase] ?? 10);

    return (
        <Box sx={{ mb: 0.5, bgcolor: tokens.aiBubble, borderRadius: 2, border: '1px solid rgba(0,212,255,0.15)', overflow: 'hidden' }}>
            <Box onClick={() => setExpanded(e => !e)} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, px: 1.2, py: 0.8, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,212,255,0.04)' } }}>
                <Typography sx={{ flex: 1, fontSize: '0.72rem', fontWeight: 700, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📊 {query}
                </Typography>
                <Typography sx={{ fontSize: '0.58rem', color: tokens.researchAccent }}>{status === 'done' ? '✓' : `${progress}%`}</Typography>
                <ChevronRightIcon sx={{ fontSize: 14, color: tokens.muted, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }} />
            </Box>
            {/* Progress bar */}
            {status !== 'done' && (
                <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{ mx: 1.2, mb: 0.8, height: 3, borderRadius: 2, bgcolor: 'rgba(0,212,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: tokens.researchAccent, borderRadius: 2 } }}
                />
            )}
            <Collapse in={expanded}>
                {steps.length > 0 && (
                    <Box sx={{ px: 1.2, pb: 0.8 }}>
                        {steps.map((s: any, i: number) => {
                            const icon = s.phase === 'search' ? '🔍' : s.phase === 'fetch' ? '📄' : s.phase === 'synthesize' ? '🧠' : '✓';
                            let text = s.status;
                            if (s.data?.query) text += `: "${s.data.query}"`;
                            else if (s.data?.queries) text += ` (${s.data.queries.length} queries)`;
                            else if (s.status === 'results' && s.data?.resultCount !== undefined) text = `Found ${s.data.resultCount} results`;
                            else if (s.status === 'reading' && s.data?.urls) text = `Reading ${s.data.urls.length} sources...`;
                            else if (s.status === 'extracted') text = `Extracted ${s.data.totalWords} words`;
                            else if (s.data?.message) text = s.data.message;
                            
                            return (
                                <Typography key={i} sx={{ fontSize: '0.62rem', color: tokens.muted, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {icon} <span style={{ textTransform: 'capitalize' }}>{text}</span>
                                </Typography>
                            );
                        })}
                    </Box>
                )}
            </Collapse>
        </Box>
    );
}

// ─── Chat Bubble ─────────────────────────────────────────────

function ChatBubble({ hint, isNew }: { hint: any; isNew?: boolean }) {
    const isUser = !hint.query.startsWith('🤖') && !hint.query.startsWith('📊') && !hint.query.startsWith('📋') && !hint.query.startsWith('⏳') && !hint.query.startsWith('📊');
    const isLoading = hint.loading;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, animation: isNew ? 'slideUp 0.2s ease' : undefined, '@keyframes slideUp': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
            {/* User question */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Box sx={{ px: 1.4, py: 0.8, borderRadius: '14px 14px 4px 14px', bgcolor: tokens.userBubble, maxWidth: '85%' }}>
                    <Typography sx={{ fontSize: tokens.fontSize, color: '#fff', fontWeight: 600, lineHeight: tokens.lineHeight }}>
                        {hint.query}
                    </Typography>
                    {hint.timestamp && (
                        <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', textAlign: 'right', mt: 0.2 }}>
                            {new Date(hint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                    )}
                </Box>
            </Box>
            {/* AI response */}
            {(hint.data?.summary || isLoading) && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-start', maxWidth: '92%' }}>
                    <Box sx={{ px: 1.4, py: 0.8, borderRadius: '14px 14px 14px 4px', bgcolor: tokens.aiBubble, border: tokens.border }}>
                        {isLoading && !hint.data?.summary ? (
                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                                {[0, 1, 2].map(i => (
                                    <Box key={i} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.4)', animation: `bounce 1.2s ${i * 0.2}s infinite`, '@keyframes bounce': { '0%,80%,100%': { transform: 'scale(0.8)', opacity: 0.5 }, '40%': { transform: 'scale(1.1)', opacity: 1 } } }} />
                                ))}
                            </Box>
                        ) : (
                            <Typography sx={{ fontSize: tokens.fontSize, color: tokens.text, lineHeight: tokens.lineHeight, whiteSpace: 'pre-wrap' }}>
                                {hint.data?.summary}
                            </Typography>
                        )}
                    </Box>
                </Box>
            )}
        </Box>
    );
}

// ─── CommandCenter ───────────────────────────────────────────

export const CommandCenter = React.memo(function CommandCenter({ onOpenSettings }: { onOpenSettings?: () => void }) {
    const [llmMissing, setLlmMissing] = useState(false);

    useEffect(() => {
        const checkLlm = () => {
            fetch("/api/system/provider")
                .then(r => r.json())
                .then(data => {
                    const hasLLM = data.hasApiKey === true;
                    setLlmMissing(!hasLLM);
                })
                .catch(() => setLlmMissing(true));
        };
        
        checkLlm();
        window.addEventListener('biamos:llm-configured', checkLlm);
        return () => window.removeEventListener('biamos:llm-configured', checkLlm);
    }, []);

    const hints = useContextStore(s => s.hints);
    const agentStatus = useContextStore(s => s.agentStatus);
    const agentSteps = useContextStore(s => s.agentSteps);
    const pauseQuestion = useContextStore(s => s.pauseQuestion);
    const currentAction = useContextStore(s => s.currentAction);
    const confirmAgent = useContextStore(s => s.confirmAgent);
    const cancelAgent = useContextStore(s => s.cancelAgent);
    const activeCardId = useContextStore(s => s.activeCardId);
    const tasksMap = useTaskStore(s => s.tasks);
    const allTasks = Object.values(tasksMap);

    const focusedMeta = useFocusStore(s => s.activeCardMeta);
    const snapshotCardId = useFocusStore(s => s.snapshotCardId);
    const snapshotCardMeta = useFocusStore(s => s.snapshotCardMeta);
    const takeSnapshot = useFocusStore(s => s.takeSnapshot);

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = localStorage.getItem('biamos_cc_width');
        return saved ? parseInt(saved, 10) : PANEL_WIDTH;
    });
    const isDragging = useRef(false);
    const dragStartX = useRef(0);
    const dragStartWidth = useRef(0);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevHintsLen = useRef(0);

    // ─── Resize drag handler ────────────────────────────────────
    const onDragMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragStartX.current = e.clientX;
        dragStartWidth.current = panelWidth;

        const onMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = dragStartX.current - ev.clientX; // drag left = grow
            const newWidth = Math.max(260, Math.min(600, dragStartWidth.current + delta));
            setPanelWidth(newWidth);
        };
        const onMouseUp = () => {
            isDragging.current = false;
            setPanelWidth(w => { localStorage.setItem('biamos_cc_width', String(w)); return w; });
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [panelWidth]);

    // Auto-scroll to bottom on new hints
    useEffect(() => {
        if (hints.length !== prevHintsLen.current) {
            prevHintsLen.current = hints.length;
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [hints]);

    // ─── Submit handler (mirrors FloatingOmnibar logic) ────────
    const handleSubmit = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading) return;
        setInput('');
        // Reset textarea height back to one line
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // NEW: Always record the user's raw message in the chat history
        useContextStore.getState().setHints(prev => [
            ...prev,
            { query: trimmed, reason: 'user', timestamp: Date.now() }
        ]);

        // Synchronous intercept if we already know the LLM is missing
        if (llmMissing) {
            useContextStore.getState().setHints(prev => [
                ...prev,
                { 
                    query: '🤖 Lura', 
                    reason: 'system',
                    loading: false, 
                    data: { summary: "Welcome to BiamOS! 🚀 Please click on the Settings gear above and make the LLM ready. Once configured, we can start working!" }, 
                    timestamp: Date.now() 
                }
            ]);
            return;
        }

        setIsLoading(true);

        try {
            const classifyResp = await fetch('/api/intent/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: trimmed,
                    hasDashboard: snapshotCardMeta?.hasDashboard || false,
                    hasWebview: snapshotCardMeta?.hasWebview || false,
                    currentUrl: snapshotCardMeta?.url || '',
                }),
            });

            if (!classifyResp.ok) {
                // If the backend router returns a 401 because the OpenRouter token is invalid/missing
                if (classifyResp.status === 401 || classifyResp.status === 400) {
                     const errData = await classifyResp.json().catch(() => ({}));
                     if (errData?.action === 'no_api_key') {
                         useContextStore.getState().setHints(prev => [
                             ...prev,
                             { 
                                 query: '🤖 Lura', 
                                 reason: 'system',
                                 loading: false, 
                                 data: { summary: "Welcome to BiamOS! 🚀 Please click on the Settings gear above and make the LLM ready. Once configured, we can start working!" }, 
                                 timestamp: Date.now() 
                             }
                         ]);
                         return;
                     }
                }
                throw new Error('Router failed');
            }
            const tasks = await classifyResp.json();

            let delayMultiplier = 0;
            let usedSnapshot = false;

            // ── CHAT fast-path: answer inline without spawning any card ──
            const chatTasks = tasks.filter((t: any) => t.mode === 'CHAT');
            const actionTasks = tasks.filter((t: any) => t.mode !== 'CHAT');

            for (const ct of chatTasks) {
                // Show loading bubble immediately
                const loadingHintId = Date.now();
                useContextStore.getState().setHints(prev => [
                    ...prev,
                    { query: '🧠 Lura', reason: 'system', loading: true, timestamp: loadingHintId }
                ]);
                // Call /api/chat backend
                try {
                    const chatResp = await fetch('/api/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: ct.task }),
                    });
                    if (!chatResp.ok) throw new Error(`Chat API ${chatResp.status}`);
                    const chatData = await chatResp.json();
                    const answer = chatData.answer || '...';
                    // Replace loading bubble with real answer
                    useContextStore.getState().setHints(prev =>
                        prev.map(h => h.timestamp === loadingHintId
                            ? { ...h, loading: false, data: { summary: answer } }
                            : h
                        )
                    );
                } catch (chatErr) {
                    useContextStore.getState().setHints(prev =>
                        prev.map(h => h.timestamp === loadingHintId
                            ? { ...h, loading: false, data: { summary: '⚠️ Chat response failed. Try again.' } }
                            : h
                        )
                    );
                }
            }

            for (const t of actionTasks) {
                let targetCardId = snapshotCardId || '';

                // If we have multiple tasks, only the FIRST action should use the focused webview.
                // Subsequent tasks, or any RESEARCH tasks that shouldn't hijack a webview if we want them parallel, get their own card.
                // Context questions always use the target card regardless.
                if (targetCardId && t.mode !== 'CONTEXT_QUESTION') {
                    if (usedSnapshot || t.mode === 'RESEARCH') {
                        targetCardId = ''; // Force a new card
                    }
                }

                const needsNewCard = !targetCardId;

                if (needsNewCard) {
                    // Generate a stable card ID for this task
                    targetCardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const tid = targetCardId;
                    const spawnAt = delayMultiplier * 800;
                    const fireAt = spawnAt + 200; // give the card 200ms to mount before firing the agent
                    // Step 1: spawn the card
                    setTimeout(() => {
                        dispatchBiamosEvent({ type: 'BIAMOS_CREATE_EMPTY_CARD', cardId: tid, title: t.task.slice(0, 30) + '...' });
                        useFocusStore.getState().setFocus(tid, { label: t.task.slice(0, 30), icon: '✨', hasWebview: false, hasDashboard: true });
                        useContextStore.getState().setActiveCardId(tid);
                    }, spawnAt);
                    // Step 2: register task in store + fire agent event (card is now mounted)
                    setTimeout(() => {
                        useTaskStore.getState().upsertTask({ id: tid, cardId: tid, label: t.task, type: t.mode === 'RESEARCH' ? 'research' : 'agent', status: 'running', startTime: Date.now() });
                        const mode = t.mode || 'ACTION';
                        if (mode === 'RESEARCH') {
                            dispatchBiamosEvent({ type: 'BIAMOS_RESEARCH', query: t.task, targetCard: tid });
                        } else if (mode === 'CONTEXT_QUESTION') {
                            dispatchBiamosEvent({ type: 'BIAMOS_CONTEXT_CHAT', query: t.task, targetCard: tid });
                        } else {
                            dispatchBiamosEvent({ type: 'BIAMOS_AGENT_ACTION', task: t.task, targetCard: tid, method: t.method || 'GET', tools: { allowed: t.allowed_tools || [], forbidden: t.forbidden || [] } });
                        }
                    }, fireAt);
                    delayMultiplier++;
                } else {
                    // For existing cards: register immediately + fire with no delay
                    const tid = targetCardId;
                    useTaskStore.getState().upsertTask({ id: tid, cardId: tid, label: t.task, type: t.mode === 'RESEARCH' ? 'research' : 'agent', status: 'running', startTime: Date.now() });
                    if (t.mode !== 'CONTEXT_QUESTION') usedSnapshot = true;
                    const mode = t.mode || 'ACTION';
                    if (mode === 'RESEARCH') {
                        dispatchBiamosEvent({ type: 'BIAMOS_RESEARCH', query: t.task, targetCard: tid });
                    } else if (mode === 'CONTEXT_QUESTION') {
                        dispatchBiamosEvent({ type: 'BIAMOS_CONTEXT_CHAT', query: t.task, targetCard: tid });
                    } else {
                        dispatchBiamosEvent({ type: 'BIAMOS_AGENT_ACTION', task: t.task, targetCard: tid, method: t.method || 'GET', tools: { allowed: t.allowed_tools || [], forbidden: t.forbidden || [] } });
                    }
                }
            }
        } catch (err) {
            console.error('[CommandCenter] Submit error', err);
        } finally {
            setIsLoading(false);
        }
    }, [snapshotCardId, snapshotCardMeta, isLoading]);

    return (
        <Box sx={{
            width: panelWidth, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            bgcolor: tokens.panelBg,
            borderLeft: tokens.border,
            position: 'relative',
        }}>
            {/* ── Drag handle (left edge) ── */}
            <Box
                onMouseDown={onDragMouseDown}
                sx={{
                    position: 'absolute', left: -2, top: 0, bottom: 0,
                    width: 6, zIndex: 10, cursor: 'col-resize',
                    '&:hover > div, &:active > div': { opacity: 1 },
                }}
            >
                <Box sx={{ position: 'absolute', left: 2, top: 0, bottom: 0, width: 2, bgcolor: tokens.accent, opacity: 0, transition: 'opacity 0.15s', borderRadius: 1 }} />
            </Box>

            {/* ── Header ── */}
            <Box sx={{ px: 1.5, py: 1, bgcolor: tokens.headerBg, borderBottom: tokens.border, display: 'flex', alignItems: 'center', gap: 0.8, flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: tokens.text, letterSpacing: '0.06em', textTransform: 'uppercase', flex: 1 }}>
                    🧠 Lura AI
                </Typography>
                {allTasks.filter(t => t.status === 'running').length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#30D158', animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                        <Typography sx={{ fontSize: '0.58rem', color: '#30D158', fontWeight: 700 }}>
                            {allTasks.filter(t => t.status === 'running').length} active
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* ── Page Context Pill (mit X zum Un-Fokussieren) ── */}
            {focusedMeta && activeCardId && (
                <Box sx={{ px: 1.2, py: 0.8, borderBottom: tokens.border, flexShrink: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, px: 1.2, py: 0.6, border: tokens.border }}>
                        <Typography sx={{ fontSize: '1rem', flexShrink: 0 }}>{focusedMeta.icon || '🌐'}</Typography>
                        <Box sx={{ flex: 1, overflow: 'hidden' }}>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {focusedMeta.label}
                            </Typography>
                            {focusedMeta.url && focusedMeta.url !== 'about:blank' && (
                                <Typography sx={{ fontSize: '0.55rem', color: tokens.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {focusedMeta.url}
                                </Typography>
                            )}
                        </Box>
                        {focusedMeta.hasWebview && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#30D158', flexShrink: 0 }} title="Live page" />}
                        <Box
                            component="button"
                            onClick={() => useFocusStore.getState().clearFocus?.()}
                            title="Un-focus card"
                            sx={{ width: 22, height: 22, borderRadius: 1, border: 'none', bgcolor: 'transparent', color: tokens.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' }, transition: 'all 0.2s', ml: 'auto', flexShrink: 0 }}
                        >
                            <CloseIcon sx={{ fontSize: 14 }} />
                        </Box>
                    </Box>
                </Box>
            )}

            {/* ── Scrollable parallel task feed ── */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1.5, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2 } }}>

                {/* Empty state */}
                {allTasks.length === 0 && !llmMissing && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, flex: 1, py: 4, opacity: 0.5 }}>
                        <Typography sx={{ fontSize: '2rem' }}>🧠</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.muted, textAlign: 'center', lineHeight: 1.6 }}>
                            No active tasks yet.<br />Type a command to get started.
                        </Typography>
                    </Box>
                )}

                {/* ── Parallel task cards (sorted newest-first) ── */}
                {allTasks.slice().sort((a, b) => b.startTime - a.startTime).map(task => {
                    if (task.type === 'agent') {
                        return (
                            <AgentBubble
                                key={task.id}
                                task={task.label}
                                steps={task.agentSteps || []}
                                status={task.agentStatus || task.status}
                                pauseQuestion={task.agentStatus === 'paused' ? (task.pauseQuestion ?? null) : null}
                                currentAction={task.currentAction || ''}
                                onConfirm={() => window.dispatchEvent(new CustomEvent('biamos:agent-confirm', { detail: { cardId: task.cardId } }))}
                                onCancel={() => window.dispatchEvent(new CustomEvent('biamos:agent-cancel', { detail: { cardId: task.cardId } }))}
                            />
                        );
                    }
                    if (task.type === 'research') {
                        return (
                            <ResearchBubble
                                key={task.id}
                                query={task.researchQuery || task.label}
                                steps={task.researchSteps || []}
                                status={task.researchStatus || task.status}
                                phase={task.researchPhase || 'search'}
                            />
                        );
                    }
                    return null;
                })}

                {/* Chat messages (user input + context replies) — persisted separately */}
                {hints.filter(h => !h.query.startsWith('🤖 Agent:') && !h.query.startsWith('📊 Research:')).map((hint, i, arr) => (
                    <ChatBubble key={`chat-${i}`} hint={hint} isNew={i === arr.length - 1} />
                ))}

                {/* LLM Warning */}
                {llmMissing && (
                    <Box
                        onClick={onOpenSettings}
                        sx={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 1,
                            mx: "auto", maxWidth: '90%', my: 1, py: 0.8, px: 2, borderRadius: 2,
                            bgcolor: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
                            cursor: "pointer", transition: "all 0.2s ease",
                            "&:hover": { bgcolor: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.35)" },
                        }}
                    >
                        <WarningIcon sx={{ fontSize: 16, color: "#ef4444" }} />
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "#ef4444" }}>
                            No AI provider configured — Set up LLM
                        </Typography>
                    </Box>
                )}

                <div ref={chatEndRef} />
            </Box>

            {/* ── Pinned input ── */}
            <Box sx={{ flexShrink: 0, borderTop: tokens.border, p: 1.5 }}>
                <Box
                    sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.8, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 2.5, border: `1px solid rgba(255,255,255,0.08)`, px: 1.5, py: 1, transition: 'border-color 0.2s', '&:focus-within': { borderColor: accentAlpha(0.4) } }}
                >
                    <Box
                        ref={textareaRef}
                        component="textarea"
                        value={input}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                            setInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                        onFocus={takeSnapshot}
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(input);
                            }
                        }}
                        placeholder="Type a command… (Enter to send, Shift+Enter for newline)"
                        disabled={isLoading}
                        rows={1}
                        sx={{
                            flex: 1, background: 'none', border: 'none', outline: 'none',
                            color: tokens.text, fontSize: '0.8rem', fontFamily: 'inherit',
                            resize: 'none', lineHeight: 1.5, minHeight: '22px', maxHeight: '120px', overflowY: 'auto',
                            '&::placeholder': { color: tokens.muted },
                            '&::-webkit-scrollbar': { width: 3 },
                            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
                        }}
                    />
                    <Box
                        component="button"
                        onClick={() => handleSubmit(input)}
                        disabled={!input.trim() || isLoading}
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 1.5, bgcolor: input.trim() ? tokens.accent : 'rgba(255,255,255,0.08)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', transition: 'all 0.15s', flexShrink: 0, mb: 0.1, '&:hover': input.trim() ? { opacity: 0.85 } : {} }}
                    >
                        <SendIcon sx={{ fontSize: 14, color: input.trim() ? '#fff' : tokens.muted }} />
                    </Box>
                </Box>
                <Box sx={{ mt: 0.5, textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>
                        Enter ↵ send · Shift+Enter newline
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
});
