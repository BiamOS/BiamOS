// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Sidebar
// ============================================================
// Renders the context suggestions sidebar with hint cards,
// drag-to-resize, and inline data expansion.
// ============================================================

import React from "react";
import { Box, Typography, IconButton, InputBase } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { TOOL_REGISTRY } from "../../../tools/registry";
import RefreshIcon from "@mui/icons-material/Refresh";
import SendIcon from "@mui/icons-material/Send";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ArticleIcon from "@mui/icons-material/Article";
import {
    renderMarkdown,
    HintBlockRenderer,
    HintSkeleton,
    SourceBadge,
    MarkdownContent,
    CopyableMarkdown,
} from "./ContextSidebarParts.js";

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
}: ContextSidebarProps) {
    const [isDragging, setIsDragging] = React.useState(false);
    const [manualInput, setManualInput] = React.useState("");
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

    // ── GenUI Prefill Bridge: dashboard buttons pre-fill chat input ──
    React.useEffect(() => {
        const handler = (e: Event) => {
            const command = (e as CustomEvent).detail?.command;
            if (command && typeof command === 'string') {
                setManualInput(command);
                if (!open) setOpen(true);
            }
        };
        window.addEventListener('biamos:prefill-command', handler);
        return () => window.removeEventListener('biamos:prefill-command', handler);
    }, [open, setOpen]);

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
                borderLeft: "2px solid rgba(0, 212, 255, 0.25)",
                bgcolor: "rgba(0, 12, 24, 0.6)",
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
                        "&:hover > div": { bgcolor: "rgba(0, 212, 255, 0.5)" },
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
                    <Box sx={{ width: 2, height: 24, borderRadius: 1, bgcolor: "rgba(0, 212, 255, 0.2)", transition: "background-color 0.15s" }} />
                </Box>
            )}

            {/* Sidebar header */}
            <Box
                sx={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    px: open ? 1.5 : 0.5, py: 0.8,
                    borderBottom: "1px solid rgba(0, 212, 255, 0.1)",
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
                                color: isAnalyzing ? "rgba(0, 212, 255, 0.4)" : "#00d4ff",
                                p: 0.3,
                                animation: isAnalyzing ? "spin 1s linear infinite" : "none",
                                "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
                            }}
                            disabled={!!isAnalyzing}
                        >
                            <RefreshIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    )}
                    <IconButton size="small" sx={{ color: "#00d4ff", p: 0.3 }}>
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

                            {/* Auto-detected suggestions as compact chips */}
                            {(() => {
                                const autoHints = hints.filter(h => h.reason !== "Manual query" && h.reason !== "low_confidence");
                                if (autoHints.length === 0) return null;
                                return (
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                        <Typography sx={{ color: "rgba(0, 212, 255, 0.35)", fontSize: "0.55rem", fontWeight: 600, width: "100%", mb: 0.2 }}>
                                            ✨ Suggestions
                                        </Typography>
                                        {autoHints.map((hint, i) => (
                                            <Box
                                                key={`${hint.query}-${i}`}
                                                component="button"
                                                title={hint.reason || hint.query}
                                                onClick={() => {
                                                    const idx = hints.indexOf(hint);
                                                    handleHintClick(idx);
                                                }}
                                                sx={{
                                                    display: "inline-flex", alignItems: "center", gap: 0.4,
                                                    px: 1, py: 0.4,
                                                    fontSize: "0.62rem", fontWeight: 500,
                                                    color: "rgba(0, 212, 255, 0.8)",
                                                    bgcolor: "rgba(0, 212, 255, 0.06)",
                                                    border: "1px solid rgba(0, 212, 255, 0.12)",
                                                    borderRadius: 3,
                                                    cursor: "pointer",
                                                    transition: "all 0.15s ease",
                                                    whiteSpace: "nowrap",
                                                    "&:hover": {
                                                        bgcolor: "rgba(0, 212, 255, 0.14)",
                                                        borderColor: "rgba(0, 212, 255, 0.3)",
                                                        color: "#00d4ff",
                                                    },
                                                }}
                                            >
                                                ✨ {hint.query}
                                            </Box>
                                        ))}
                                    </Box>
                                );
                            })()}
                        </Box>
                    )}

                    {/* Divider + Clear chat */}
                    {hints.some(h => h.reason === "Manual query") && (
                        <Box sx={{ display: "flex", alignItems: "center", mx: 1, gap: 0.5 }}>
                            <Box sx={{ flex: 1, borderBottom: "1px solid rgba(0, 212, 255, 0.08)" }} />
                            <Box
                                component="button"
                                onClick={() => setHints(prev => prev.filter(h => h.reason !== "Manual query"))}
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
                        "&::-webkit-scrollbar-thumb": { background: "rgba(0,212,255,0.15)", borderRadius: 2 },
                    }}>
                        {/* Spacer pushes messages to bottom — shrinks when messages overflow */}
                        <Box sx={{ flex: 1 }} />
                        {/* Chat messages — oldest at top, newest at bottom */}
                        {(() => {
                            const chatHints = hints.filter(h => h.reason === "Manual query");
                            if (chatHints.length === 0) return (
                                <Box sx={{
                                    display: "flex", flexDirection: "column", alignItems: "center",
                                    justifyContent: "center", flex: 1, gap: 1, py: 2,
                                }}>
                                    <Typography sx={{ fontSize: "1.5rem" }}>🤖</Typography>
                                    <Typography sx={{
                                        color: "rgba(0, 212, 255, 0.3)",
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
                                                color: "#00d4ff",
                                                bgcolor: "rgba(0, 212, 255, 0.08)",
                                                border: "1px solid rgba(0, 212, 255, 0.15)",
                                                borderRadius: 1.5,
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                                "&:hover": {
                                                    bgcolor: "rgba(0, 212, 255, 0.15)",
                                                    borderColor: "rgba(0, 212, 255, 0.3)",
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
                                                borderRadius: "12px 12px 4px 12px",
                                                bgcolor: "rgba(0, 212, 255, 0.15)",
                                                border: "1px solid rgba(0, 212, 255, 0.25)",
                                                maxWidth: "85%",
                                            }}>
                                                <Typography sx={{
                                                    color: "#e0f0ff",
                                                    fontSize: "0.75rem",
                                                    fontWeight: 500,
                                                    lineHeight: 1.4,
                                                }}>
                                                    {hint.query}
                                                </Typography>
                                                {hint.timestamp && (
                                                    <Typography sx={{
                                                        color: "rgba(0, 212, 255, 0.3)",
                                                        fontSize: "0.5rem",
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
                                            }}>
                                                <Box sx={{
                                                    px: 1.5, py: 1,
                                                    borderRadius: "12px 12px 12px 4px",
                                                    bgcolor: "rgba(0, 212, 255, 0.08)",
                                                    border: "1px solid rgba(0, 212, 255, 0.12)",
                                                    position: "relative",
                                                    "&:hover .copy-btn": { opacity: 1 },
                                                }}>

                                                    {hint.loading && !hint.data?.summary ? (
                                                        <Box sx={{
                                                            display: "flex", gap: 0.5, alignItems: "center",
                                                            py: 0.5,
                                                        }}>
                                                            <Box sx={{
                                                                width: 6, height: 6, borderRadius: "50%",
                                                                bgcolor: "#00d4ff",
                                                                animation: "typingDot 1.4s ease-in-out infinite",
                                                                "@keyframes typingDot": {
                                                                    "0%, 100%": { opacity: 0.2, transform: "scale(0.8)" },
                                                                    "50%": { opacity: 1, transform: "scale(1)" },
                                                                },
                                                            }} />
                                                            <Box sx={{
                                                                width: 6, height: 6, borderRadius: "50%",
                                                                bgcolor: "#00d4ff",
                                                                animation: "typingDot 1.4s ease-in-out infinite 0.2s",
                                                            }} />
                                                            <Box sx={{
                                                                width: 6, height: 6, borderRadius: "50%",
                                                                bgcolor: "#00d4ff",
                                                                animation: "typingDot 1.4s ease-in-out infinite 0.4s",
                                                            }} />
                                                        </Box>
                                                    ) : hint.data?.summary ? (
                                                        <>
                                                            <CopyableMarkdown markdown={hint.data.summary} />
                                                            {/* Blinking cursor while streaming */}
                                                            {hint.loading && (
                                                                <Box component="span" sx={{
                                                                    display: "inline",
                                                                    color: "#00d4ff",
                                                                    fontWeight: 700,
                                                                    animation: "blink 1s step-end infinite",
                                                                    "@keyframes blink": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0 } },
                                                                }}>▌</Box>
                                                            )}
                                                            {hint.data._source && (
                                                                <Typography sx={{
                                                                    color: hint.data._source === "page_context"
                                                                        ? "rgba(0, 200, 100, 0.5)"
                                                                        : hint.data._source === "web_search"
                                                                            ? "rgba(255, 180, 0, 0.6)"
                                                                            : "rgba(0, 212, 255, 0.4)",
                                                                    fontSize: "0.55rem",
                                                                    fontWeight: 600,
                                                                    mt: 0.5,
                                                                }}>
                                                                    {hint.data._source === "page_context" ? "📄 From page" : hint.data._source === "web_search" ? "🔍 Web search" : "🧠 General knowledge"}
                                                                </Typography>
                                                            )}
                                                            {/* 👍/👎 Agent workflow feedback */}
                                                            {hint.data._workflowId && hint.data._sendFeedback && (
                                                                <Box sx={{
                                                                    display: "flex", gap: 0.8, mt: 0.8, pt: 0.6,
                                                                    borderTop: "1px solid rgba(0, 212, 255, 0.08)",
                                                                    alignItems: "center",
                                                                }}>
                                                                    <Typography sx={{
                                                                        color: "rgba(0, 212, 255, 0.4)",
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
                                                            bgcolor: "rgba(0, 212, 255, 0.06)",
                                                            border: "1px solid rgba(0, 212, 255, 0.2)",
                                                            cursor: "pointer",
                                                            transition: "all 0.15s ease",
                                                            "&:hover": {
                                                                bgcolor: "rgba(0, 212, 255, 0.15)",
                                                                borderColor: "rgba(0, 212, 255, 0.4)",
                                                            },
                                                        }}
                                                    >
                                                        <Typography sx={{
                                                            color: "rgba(0, 212, 255, 0.7)",
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

            {/* Chat input */}
            {
                open && onManualQuery && (
                    <Box
                        component="form"
                        onSubmit={(e: React.FormEvent) => {
                            e.preventDefault();
                            const q = manualInput.trim();
                            if (!q) return;
                            onManualQuery(q);
                            setManualInput("");
                        }}
                        sx={{
                            display: "flex", alignItems: "center", gap: 1,
                            px: 1.5, py: 1,
                            borderTop: "1px solid rgba(0, 212, 255, 0.15)",
                            bgcolor: "rgba(0, 12, 24, 0.4)",
                            flexShrink: 0,
                            position: "relative",
                        }}
                    >
                        {/* Slash command autocomplete */}
                        {manualInput.trim().startsWith("/") && (
                            <Box sx={{
                                position: "absolute", bottom: "100%", left: 0, right: 0,
                                bgcolor: "rgba(8, 18, 30, 0.95)",
                                borderTop: "1px solid rgba(0, 212, 255, 0.2)",
                                borderBottom: "1px solid rgba(0, 212, 255, 0.1)",
                                backdropFilter: "blur(8px)",
                                py: 0.5,
                            }}>
                                {TOOL_REGISTRY
                                    .map(t => ({ cmd: t.slashCommand, emoji: t.emoji, desc: `${t.name} — ${t.description}` }))
                                    .filter(c => c.cmd.startsWith(manualInput.trim().split(" ")[0].toLowerCase()))
                                    .map(c => (
                                        <Box
                                            key={c.cmd}
                                            onClick={() => {
                                                setManualInput(c.cmd + " ");
                                            }}
                                            sx={{
                                                px: 1.5, py: 0.6,
                                                display: "flex", alignItems: "center", gap: 1,
                                                cursor: "pointer",
                                                transition: "all 0.1s",
                                                "&:hover": { bgcolor: "rgba(0, 212, 255, 0.1)" },
                                            }}
                                        >
                                            <Typography sx={{ fontSize: "0.85rem" }}>{c.emoji}</Typography>
                                            <Box>
                                                <Typography sx={{ color: "#00d4ff", fontSize: "0.7rem", fontWeight: 600 }}>
                                                    {c.cmd}
                                                </Typography>
                                                <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.6rem" }}>
                                                    {c.desc}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))}
                            </Box>
                        )}
                        <InputBase
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    const q = manualInput.trim();
                                    if (!q || !onManualQuery) return;
                                    onManualQuery(q);
                                    setManualInput("");
                                }
                            }}
                            placeholder={agentStatus === "paused"
                                ? "💬 Gib dem Agenten Feedback... (Enter)"
                                : agentStatus === "running"
                                    ? "🤖 Agent läuft..."
                                    : "Ask something... (Enter to send)"}
                            multiline
                            maxRows={3}
                            sx={{
                                flex: 1,
                                fontSize: "0.8rem",
                                color: "rgba(255,255,255,0.9)",
                                "& .MuiInputBase-input": { p: 0, py: 0.5 },
                                "& .MuiInputBase-input::placeholder": {
                                    color: "rgba(0, 212, 255, 0.35)",
                                    fontSize: "0.8rem",
                                },
                            }}
                            inputProps={{ spellCheck: false }}
                            disabled={agentStatus === "running"}
                        />
                        <IconButton
                            type="submit"
                            disabled={!manualInput.trim()}
                            sx={{
                                width: 32, height: 32, borderRadius: "50%",
                                bgcolor: manualInput.trim()
                                    ? "rgba(0, 212, 255, 0.2)"
                                    : "transparent",
                                color: manualInput.trim() ? "#00d4ff" : "rgba(0, 212, 255, 0.2)",
                                transition: "all 0.2s ease",
                                "&:hover": {
                                    bgcolor: "rgba(0, 212, 255, 0.3)",
                                },
                            }}
                        >
                            <SendIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                )
            }
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
