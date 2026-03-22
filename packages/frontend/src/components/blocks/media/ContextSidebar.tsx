// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Sidebar
// ============================================================
// Renders the context suggestions sidebar with hint cards,
// drag-to-resize, and inline data expansion.
// ============================================================

import React from "react";
import { Box, Typography, IconButton } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ArticleIcon from "@mui/icons-material/Article";
import {
    renderMarkdown,
    HintBlockRenderer,
    HintSkeleton,
    SourceBadge,
    MarkdownContent,
    CopyableMarkdown,
    ResearchProgressBubble,
    AgentStepBubble,
} from "./ContextSidebarParts.js";
import { getChatTokens } from "../../ui/SharedUI";

const tokens = getChatTokens("dark");

// ─── Types ──────────────────────────────────────────────────

export interface ContextHint {
    query: string;
    reason: string;
    data?: any;
    loading?: boolean;
    expanded?: boolean;
    timestamp?: number;
}

interface ContextSidebarProps {
    hints: ContextHint[];
    setHints: React.Dispatch<React.SetStateAction<ContextHint[]>>;
    open: boolean;
    setOpen: (open: boolean) => void;
    width: number;
    setWidth: (width: number) => void;
    isAnalyzing?: boolean;
    onTriggerAnalysis?: () => void;
    onManualQuery?: (query: string) => void;
    isPrivacyBlocked?: boolean;
    onShowPageContext?: () => void;
    agentStatus?: "idle" | "running" | "paused" | "done" | "error";
    /** The question the agent is waiting on (set when status === 'paused') */
    pauseQuestion?: string | null;
    /** Called when the user clicks ✅ Yes — resumes the agent */
    onAgentConfirm?: () => void;
    /** Called when the user clicks ❌ Cancel — stops the agent */
    onAgentCancel?: () => void;
}

// ─── Main Sidebar Component ─────────────────────────────────

export const ContextSidebar = React.memo(function ContextSidebar({
    hints,
    setHints,
    open,
    setOpen,
    width,
    setWidth,
    isAnalyzing,
    onTriggerAnalysis,
    onManualQuery,
    isPrivacyBlocked,
    onShowPageContext,
    agentStatus,
    pauseQuestion,
    onAgentConfirm,
    onAgentCancel,
}: ContextSidebarProps) {
    const [isDragging, setIsDragging] = React.useState(false);
    const hasHints = hints.length > 0;
    const chatContainerRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when chat messages change
    React.useEffect(() => {
        const el = chatContainerRef.current;
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    }, [hints]);


    const handleHintClick = React.useCallback(async (index: number) => {
        const hint = hints[index];
        // Toggle collapse
        if (hint.expanded) {
            setHints(prev => prev.map((h, j) => j === index ? { ...h, expanded: false } : h));
            return;
        }
        // If data already loaded, just re-expand
        if (hint.data) {
            setHints(prev => prev.map((h, j) => j === index ? { ...h, expanded: true } : h));
            return;
        }
        // Send to Context Chat instead of Intent Pipeline
        if (onManualQuery) {
            const chatQuery = hint.reason
                ? `${hint.query}: ${hint.reason}`
                : hint.query;
            onManualQuery(chatQuery);
        }
    }, [hints, setHints, onManualQuery]);

    return (
        <Box
            sx={{
                width: open ? width : 32,
                minWidth: open ? 0 : 32,
                transition: isDragging
                    ? "none"
                    : "width 0.35s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.35s ease",
                borderLeft: tokens.border,
                bgcolor: tokens.sidebarBg,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative",
            }}
        >
            {/* Full-screen overlay during sidebar drag */}
            {isDragging && (
                <Box sx={{ position: "fixed", inset: 0, zIndex: 9999, cursor: "col-resize" }} />
            )}

            {/* Drag handle */}
            {open && (
                <Box
                    sx={{
                        position: "absolute", left: -4, top: 0, bottom: 0, width: 8,
                        cursor: "col-resize", zIndex: 20,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        "&:hover > div": { bgcolor: tokens.secondaryText },
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(true);
                        const startX = e.clientX;
                        const startW = width;
                        const onMove = (me: MouseEvent) => {
                            me.preventDefault();
                            const delta = startX - me.clientX;
                            const newW = Math.max(180, Math.min(startW + delta, window.innerWidth * 0.5));
                            setWidth(newW);
                        };
                        const onUp = () => {
                            setIsDragging(false);
                            document.removeEventListener("mousemove", onMove);
                            document.removeEventListener("mouseup", onUp);
                        };
                        document.addEventListener("mousemove", onMove);
                        document.addEventListener("mouseup", onUp);
                    }}
                >
                    <Box sx={{ width: 2, height: 24, borderRadius: 1, bgcolor: tokens.border, transition: "background-color 0.15s" }} />
                </Box>
            )}

            {/* Sidebar header */}
            <Box
                sx={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    px: open ? 1.5 : 0.5, py: 0.8,
                    borderBottom: tokens.border,
                    cursor: "pointer",
                }}
                onClick={() => setOpen(!open)}
            >
                {open && (
                    <Typography
                        variant="caption"
                        sx={{
                            color: "#00d4ff",
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                        }}
                    >
                        🧠 Context
                    </Typography>
                )}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                    {open && onShowPageContext && (
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onShowPageContext(); }}
                            title="Show page context"
                            sx={{ color: "#00d4ff", p: 0.3 }}
                        >
                            <ArticleIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    )}
                    {open && onTriggerAnalysis && (
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onTriggerAnalysis(); }}
                            sx={{
                                color: isAnalyzing ? tokens.secondaryText : tokens.statusActive,
                                p: 0.3,
                                animation: isAnalyzing ? "spin 1s linear infinite" : "none",
                                "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
                            }}
                            disabled={!!isAnalyzing}
                        >
                            <RefreshIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    )}
                    <IconButton size="small" sx={{ color: tokens.secondaryText, p: 0.3 }}>
                        {open ? <ChevronRightIcon sx={{ fontSize: 16 }} /> : <ChevronLeftIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                </Box>
            </Box>

            {/* Hint cards + Chat messages */}
            {open && (
                <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", wordBreak: "break-word" }}>
                    {/* Context Hints section (top area) */}
                    {(isAnalyzing || hasHints || isPrivacyBlocked) && (
                        <Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                            {/* Skeleton loaders while LLM is analyzing */}
                            {isAnalyzing && hints.filter(h => h.reason !== "Manual query").length === 0 && (
                                <>
                                    <HintSkeleton />
                                    <HintSkeleton />
                                </>
                            )}

                            {/* Privacy blocked state */}
                            {!isAnalyzing && hints.length === 0 && isPrivacyBlocked && (
                                <Box sx={{
                                    display: "flex", flexDirection: "column", alignItems: "center",
                                    justifyContent: "center", gap: 1, py: 2, px: 1,
                                }}>
                                    <VisibilityOffIcon sx={{ fontSize: "1.8rem", color: "rgba(255, 190, 60, 0.5)" }} />
                                    <Typography sx={{
                                        color: "rgba(255, 190, 60, 0.7)",
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        textAlign: "center",
                                        lineHeight: 1.4,
                                    }}>
                                        Auto-analysis paused
                                    </Typography>
                                    <Typography sx={{
                                        color: "rgba(255, 255, 255, 0.3)",
                                        fontSize: "0.55rem",
                                        textAlign: "center",
                                        lineHeight: 1.3,
                                    }}>
                                        This domain is on the privacy list — BiamOS won't analyze it automatically.
                                        You can still ask questions below. Page content is only sent to the AI when you ask.
                                    </Typography>
                                </Box>
                            )}


                        </Box>
                    )}

                    {/* Divider + Clear chat */}
                    {hints.some(h => h.reason === "Manual query" || h.reason === "Context question") && (
                        <Box sx={{ display: "flex", alignItems: "center", mx: 1, gap: 0.5 }}>
                            <Box sx={{ flex: 1, borderBottom: tokens.border }} />
                            <Box
                                component="button"
                                onClick={() => setHints(prev => prev.filter(h => h.reason !== "Manual query" && h.reason !== "Context question"))}
                                sx={{
                                    fontSize: "0.5rem", fontWeight: 600,
                                    color: "rgba(255, 255, 255, 0.25)",
                                    bgcolor: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    px: 0.5, py: 0.2,
                                    transition: "color 0.15s",
                                    "&:hover": { color: "rgba(255, 100, 100, 0.6)" },
                                }}
                                title="Clear chat history"
                            >
                                ✕ Clear
                            </Box>
                        </Box>
                    )}

                    {/* Chat messages area — WhatsApp-style: messages at bottom, scroll up */}
                    <Box ref={chatContainerRef} sx={{
                        flex: 1, display: "flex", flexDirection: "column",
                        overflow: "auto", p: 1, gap: 1,
                        "&::-webkit-scrollbar": { width: 4 },
                        "&::-webkit-scrollbar-thumb": { background: tokens.border, borderRadius: 2 },
                    }}>
                        {/* Spacer pushes messages to bottom — shrinks when messages overflow */}
                        <Box sx={{ flex: 1 }} />
                        {/* Chat messages — oldest at top, newest at bottom */}
                        {(() => {
                            // Show both CONTEXT_QUESTION hints + agent/omnibar manual queries
                            const chatHints = hints.filter(h => h.reason === "Manual query" || h.reason === "Context question");
                            if (chatHints.length === 0) return (
                                <Box sx={{
                                    display: "flex", flexDirection: "column", alignItems: "center",
                                    justifyContent: "center", flex: 1, gap: 1, py: 2,
                                }}>
                                    <Typography sx={{ fontSize: "1.5rem" }}>🤖</Typography>
                                    <Typography sx={{
                                        color: tokens.secondaryText,
                                        fontSize: "0.7rem",
                                        fontWeight: 500,
                                        textAlign: "center",
                                        lineHeight: 1.5,
                                    }}>
                                        Ask me anything or give me a task
                                    </Typography>
                                    {!hasHints && !isAnalyzing && !isPrivacyBlocked && onTriggerAnalysis && (
                                        <Box
                                            component="button"
                                            onClick={onTriggerAnalysis}
                                            sx={{
                                                mt: 0.5, px: 1.5, py: 0.5,
                                                fontSize: "0.65rem", fontWeight: 600,
                                                color: tokens.secondaryText,
                                                bgcolor: tokens.aiBubbleBg,
                                                border: tokens.border,
                                                borderRadius: 1.5,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                                "&:hover": {
                                                    bgcolor: tokens.cardBg,
                                                    borderColor: tokens.secondaryText,
                                                },
                                            }}
                                        >
                                            🔄 Analyze this page
                                        </Box>
                                    )}
                                </Box>
                            );
                            return chatHints.map((hint, ri) => {
                                const originalIndex = hints.indexOf(hint);
                                return (
                                    <React.Fragment key={`chat-${hint.query}-${ri}`}>
                                        {/* User question bubble (right-aligned) */}
                                        <Box
                                            onClick={() => !hint.data && handleHintClick(originalIndex)}
                                            sx={{
                                                display: "flex", justifyContent: "flex-end",
                                                cursor: !hint.data ? "pointer" : "default",
                                            }}
                                        >
                                            <Box sx={{
                                                px: 1.5, py: 0.8,
                                                borderRadius: tokens.userBubbleRadius,
                                                bgcolor: tokens.userBubbleBg,
                                                maxWidth: "85%",
                                            }}>
                                                <Typography sx={{
                                                    color: tokens.userBubbleText,
                                                    fontSize: tokens.chatFontSize,
                                                    fontWeight: tokens.chatFontWeight,
                                                    lineHeight: tokens.chatLineHeight,
                                                }}>
                                                    {hint.query}
                                                </Typography>
                                                {hint.timestamp && (
                                                    <Typography sx={{
                                                        color: "rgba(255, 255, 255, 0.5)",
                                                        fontSize: tokens.secondaryFontSize,
                                                        textAlign: "right",
                                                        mt: 0.3,
                                                    }}>
                                                        {new Date(hint.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                        {/* Assistant answer (left-aligned) */}
                                        {(hint.expanded || hint.data) && (
                                            <Box sx={{
                                                display: "flex", justifyContent: "flex-start",
                                                maxWidth: "92%", alignSelf: "flex-start",
                                                w: '100%'
                                            }}>
                                                {/* V2 Bubbles for Agent/Research or V1 for Chat */}
                                                {hint.query.startsWith('📊 Research:') && hint.data?.summary ? (
                                                    <Box sx={{ width: '100%' }}>
                                                        <ResearchProgressBubble
                                                            query={hint.query.replace('📊 Research: ', '')}
                                                            steps={hint.data._steps || []}
                                                            status={hint.data._status || (hint.loading ? 'running' : 'done')}
                                                            phase={hint.data._phase || (hint.loading ? 'search' : 'done')}
                                                        />
                                                    </Box>
                                                ) : hint.query.startsWith('🤖 Agent:') && hint.data?.summary ? (
                                                    <Box sx={{ width: '100%' }}>
                                                        <AgentStepBubble
                                                            task={hint.data._task || hint.query.replace('🤖 Agent: ', '')}
                                                            steps={hint.data._steps || []}
                                                            status={hint.data._status || (hint.loading ? 'running' : 'done')}
                                                            currentAction={hint.data._currentAction || (hint.loading ? 'Working...' : 'Done')}
                                                            pauseQuestion={(hint.data._status === 'paused') ? pauseQuestion : null}
                                                            onConfirm={onAgentConfirm}
                                                            onCancel={onAgentCancel}
                                                        />
                                                    </Box>
                                                ) : (
                                                    <Box sx={{
                                                        px: 1.5, py: 1,
                                                        borderRadius: tokens.aiBubbleRadius,
                                                        bgcolor: tokens.aiBubbleBg,
                                                        position: "relative",
                                                        "&:hover .copy-btn": { opacity: 1 },
                                                        width: '100%'
                                                    }}>
                                                        {hint.loading && !hint.data?.summary ? (
                                                            <Box sx={{
                                                                display: "flex", gap: 0.5, alignItems: "center",
                                                                py: 0.5,
                                                            }}>
                                                                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tokens.secondaryText, animation: "typingDot 1.4s ease-in-out infinite" }} />
                                                                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tokens.secondaryText, animation: "typingDot 1.4s ease-in-out infinite 0.2s" }} />
                                                                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: tokens.secondaryText, animation: "typingDot 1.4s ease-in-out infinite 0.4s" }} />
                                                            </Box>
                                                        ) : hint.data?.summary ? (
                                                            <>
                                                                <CopyableMarkdown markdown={hint.data.summary} />
                                                                {/* Blinking cursor while streaming */}
                                                                {hint.loading && (
                                                                    <Box component="span" sx={{
                                                                        display: "inline", color: tokens.statusActive, fontWeight: 700,
                                                                        animation: "blink 1s step-end infinite"
                                                                    }}>▌</Box>
                                                                )}
                                                                {hint.data._source && (
                                                                    <Typography sx={{
                                                                        color: hint.data._source === "page_context" ? tokens.statusSuccess : hint.data._source === "web_search" ? tokens.statusWarning : tokens.secondaryText,
                                                                        fontSize: "0.55rem", fontWeight: 600, mt: 0.5,
                                                                    }}>
                                                                        {hint.data._source === "page_context" ? "📄 From page" : hint.data._source === "web_search" ? "🔍 Web search" : "🧠 General knowledge"}
                                                                    </Typography>
                                                                )}
                                                            {/* 👍/👎 Agent workflow feedback */}
                                                            {hint.data._workflowId && hint.data._sendFeedback && (
                                                                <Box sx={{
                                                                    display: "flex", gap: 0.8, mt: 0.8, pt: 0.6,
                                                                    borderTop: tokens.border,
                                                                    alignItems: "center",
                                                                }}>
                                                                    <Typography sx={{
                                                                        color: tokens.secondaryText,
                                                                        fontSize: "0.55rem",
                                                                        fontWeight: 500,
                                                                    }}>
                                                                        Was this correct?
                                                                    </Typography>
                                                                    <Box
                                                                        component="button"
                                                                        onClick={() => hint.data._sendFeedback(true)}
                                                                        sx={{
                                                                            display: "inline-flex", alignItems: "center", gap: 0.3,
                                                                            px: 1, py: 0.3,
                                                                            fontSize: "0.6rem", fontWeight: 600,
                                                                            color: "rgba(0, 200, 100, 0.8)",
                                                                            bgcolor: "rgba(0, 200, 100, 0.08)",
                                                                            border: "1px solid rgba(0, 200, 100, 0.2)",
                                                                            borderRadius: 1.5,
                                                                            cursor: "pointer",
                                                                            transition: "all 0.15s ease",
                                                                            "&:hover": {
                                                                                bgcolor: "rgba(0, 200, 100, 0.2)",
                                                                                borderColor: "rgba(0, 200, 100, 0.4)",
                                                                            },
                                                                        }}
                                                                    >
                                                                        👍 Yes, remember!
                                                                    </Box>
                                                                    <Box
                                                                        component="button"
                                                                        onClick={() => hint.data._sendFeedback(false)}
                                                                        sx={{
                                                                            display: "inline-flex", alignItems: "center", gap: 0.3,
                                                                            px: 1, py: 0.3,
                                                                            fontSize: "0.6rem", fontWeight: 600,
                                                                            color: "rgba(255, 80, 80, 0.6)",
                                                                            bgcolor: "transparent",
                                                                            border: "1px solid rgba(255, 80, 80, 0.15)",
                                                                            borderRadius: 1.5,
                                                                            cursor: "pointer",
                                                                            transition: "all 0.15s ease",
                                                                            "&:hover": {
                                                                                bgcolor: "rgba(255, 80, 80, 0.1)",
                                                                                borderColor: "rgba(255, 80, 80, 0.3)",
                                                                            },
                                                                        }}
                                                                    >
                                                                        👎 No
                                                                    </Box>
                                                                </Box>
                                                            )}
                                                        </>
                                                    ) : hint.data?.error ? (
                                                        <Typography sx={{ color: "rgba(255,100,100,0.7)", fontSize: "0.7rem" }}>
                                                            ⚠️ {hint.data.error}
                                                        </Typography>
                                                    ) : null}
                                                </Box>
                                                )}
                                            </Box>
                                        )}
                                        {/* Follow-up suggestion chips */}
                                        {hint.data?._follow_ups && hint.data._follow_ups.length > 0 && (
                                            <Box sx={{
                                                display: "flex", flexWrap: "wrap", gap: 0.5,
                                                justifyContent: "flex-start", pl: 0.5,
                                            }}>
                                                {hint.data._follow_ups.map((fq: string, fi: number) => (
                                                    <Box
                                                        key={fi}
                                                        onClick={() => onManualQuery?.(fq)}
                                                        sx={{
                                                            px: 1.2, py: 0.4,
                                                            borderRadius: "12px",
                                                            bgcolor: tokens.aiBubbleBg,
                                                            border: tokens.border,
                                                            cursor: "pointer",
                                                            transition: "all 0.15s ease",
                                                            "&:hover": {
                                                                bgcolor: tokens.cardBg,
                                                                borderColor: tokens.secondaryText,
                                                            },
                                                        }}
                                                    >
                                                        <Typography sx={{
                                                            color: tokens.secondaryText,
                                                            fontSize: "0.65rem",
                                                            fontWeight: 500,
                                                            whiteSpace: "nowrap",
                                                        }}>
                                                            {fq}
                                                        </Typography>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </React.Fragment>
                                );
                            });
                        })()}
                    </Box>
                </Box>
            )}

            {/* AI Disclaimer */}
            {open && (
                <Typography sx={{
                    textAlign: "center",
                    color: "rgba(255, 255, 255, 0.2)",
                    fontSize: "0.5rem",
                    py: 0.4,
                    px: 1,
                    flexShrink: 0,
                }}>
                    AI can make mistakes. Verify important information.
                </Typography>
            )}
        </Box >
    );
});
