// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Research Progress Panel
// ============================================================
// Shown instead of the webview during research/dashboard tasks.
// Displays live agent steps with animated entries, progress bar,
// and a hacker-style aesthetic.
// ============================================================

import React, { useEffect, useRef } from "react";
import { Box, Typography, LinearProgress } from "@mui/material";
import { COLORS, accentAlpha } from "../../ui/SharedUI";
import type { AgentStep, AgentStatus } from "./agent/types";

// ─── Step Icon Map ──────────────────────────────────────────

function getStepIcon(action: string, isDone: boolean): string {
    if (!isDone) return "⏳";
    switch (action) {
        case "search_web": return "🔍";
        case "navigate": return "🌐";
        case "scroll": return "📜";
        case "take_notes": return "📝";
        case "click":
        case "click_at": return "🖱️";
        case "type_text": return "⌨️";
        case "genui": return "🎨";
        case "done": return "✅";
        case "ask_user": return "⏸️";
        case "go_back": return "↩️";
        case "system_recovery": return "🔄";
        default: return "✅";
    }
}

function getStepColor(action: string): string {
    switch (action) {
        case "search_web": return "rgba(0, 200, 255, 0.8)";
        case "navigate": return "rgba(130, 100, 255, 0.8)";
        case "take_notes": return "rgba(0, 220, 100, 0.8)";
        case "genui": return "rgba(255, 180, 0, 0.8)";
        case "done": return "rgba(0, 255, 150, 0.8)";
        default: return "rgba(150, 150, 180, 0.7)";
    }
}

// ─── Props ──────────────────────────────────────────────────

interface ResearchProgressPanelProps {
    steps: AgentStep[];
    status: AgentStatus;
    currentAction: string;
    task: string;
    maxSteps: number;
}

// ─── Component ──────────────────────────────────────────────

export const ResearchProgressPanel = React.memo(function ResearchProgressPanel({
    steps,
    status,
    currentAction,
    task,
    maxSteps,
}: ResearchProgressPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new steps appear
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [steps.length]);

    const progress = Math.min((steps.length / maxSteps) * 100, 100);
    const isRunning = status === "running";
    const filteredSteps = steps.filter(s => s.action !== "system_recovery");

    return (
        <Box
            sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                bgcolor: "#060a10",
                overflow: "hidden",
                position: "relative",
            }}
        >
            {/* ── Header ────────────────────────────────────── */}
            <Box
                sx={{
                    px: 3,
                    pt: 2.5,
                    pb: 1.5,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: "linear-gradient(180deg, rgba(0,200,255,0.03) 0%, transparent 100%)",
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                    {isRunning && (
                        <Box
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                bgcolor: "rgba(0, 220, 100, 0.9)",
                                boxShadow: "0 0 8px rgba(0, 220, 100, 0.5)",
                                animation: "pulse 1.5s ease-in-out infinite",
                                "@keyframes pulse": {
                                    "0%, 100%": { opacity: 1 },
                                    "50%": { opacity: 0.4 },
                                },
                            }}
                        />
                    )}
                    <Typography
                        sx={{
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: accentAlpha(0.9),
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}
                    >
                        {isRunning ? "Researching" : status === "done" ? "Research Complete" : "Research"}
                    </Typography>
                    <Typography
                        sx={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "0.6rem",
                            color: COLORS.textMuted,
                            ml: "auto",
                        }}
                    >
                        {filteredSteps.length} steps
                    </Typography>
                </Box>

                {/* Task label */}
                <Typography
                    sx={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: COLORS.textSecondary,
                        mb: 1,
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {task}
                </Typography>

                {/* Progress bar */}
                <LinearProgress
                    variant={isRunning ? "buffer" : "determinate"}
                    value={progress}
                    valueBuffer={progress + 10}
                    sx={{
                        height: 3,
                        borderRadius: 2,
                        bgcolor: "rgba(255,255,255,0.04)",
                        "& .MuiLinearProgress-bar": {
                            bgcolor: accentAlpha(0.7),
                            borderRadius: 2,
                        },
                        "& .MuiLinearProgress-bar2Buffer": {
                            bgcolor: accentAlpha(0.15),
                        },
                        "& .MuiLinearProgress-dashed": {
                            display: "none",
                        },
                    }}
                />
            </Box>

            {/* ── Steps Timeline ─────────────────────────────── */}
            <Box
                ref={scrollRef}
                sx={{
                    flex: 1,
                    overflowY: "auto",
                    px: 3,
                    py: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.5,
                    "&::-webkit-scrollbar": { width: 4 },
                    "&::-webkit-scrollbar-thumb": {
                        bgcolor: "rgba(255,255,255,0.08)",
                        borderRadius: 2,
                    },
                }}
            >
                {filteredSteps.map((step, i) => {
                    const icon = getStepIcon(step.action, true);
                    const color = getStepColor(step.action);
                    const resultSnippet = step.result
                        ? step.result.split("\n")[0].substring(0, 120)
                        : "";

                    return (
                        <Box
                            key={i}
                            sx={{
                                display: "flex",
                                gap: 1.5,
                                py: 1,
                                px: 1.5,
                                borderRadius: 2,
                                animation: "fadeSlideIn 0.3s ease-out",
                                "@keyframes fadeSlideIn": {
                                    from: { opacity: 0, transform: "translateY(8px)" },
                                    to: { opacity: 1, transform: "translateY(0)" },
                                },
                                "&:hover": {
                                    bgcolor: "rgba(255,255,255,0.02)",
                                },
                            }}
                        >
                            {/* Step number + icon */}
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 0.3,
                                    pt: 0.2,
                                    minWidth: 28,
                                }}
                            >
                                <Typography sx={{ fontSize: "0.9rem", lineHeight: 1 }}>
                                    {icon}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: "0.5rem",
                                        color: COLORS.textMuted,
                                    }}
                                >
                                    {i + 1}
                                </Typography>
                            </Box>

                            {/* Content */}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    sx={{
                                        fontSize: "0.78rem",
                                        fontWeight: 600,
                                        color: COLORS.textPrimary,
                                        lineHeight: 1.4,
                                    }}
                                >
                                    {step.description}
                                </Typography>
                                {resultSnippet && (
                                    <Typography
                                        sx={{
                                            fontSize: "0.68rem",
                                            color,
                                            fontFamily: "'JetBrains Mono', monospace",
                                            lineHeight: 1.4,
                                            mt: 0.2,
                                            opacity: 0.85,
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                        }}
                                    >
                                        → {resultSnippet}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                })}

                {/* Current action (loading state) */}
                {isRunning && currentAction && (
                    <Box
                        sx={{
                            display: "flex",
                            gap: 1.5,
                            py: 1,
                            px: 1.5,
                            borderRadius: 2,
                            bgcolor: "rgba(0,200,255,0.03)",
                            border: "1px solid rgba(0,200,255,0.08)",
                            animation: "fadeSlideIn 0.3s ease-out",
                        }}
                    >
                        <Box sx={{ pt: 0.2, minWidth: 28, textAlign: "center" }}>
                            <Typography
                                sx={{
                                    fontSize: "0.9rem",
                                    lineHeight: 1,
                                    animation: "pulse 1.2s ease-in-out infinite",
                                }}
                            >
                                ⏳
                            </Typography>
                        </Box>
                        <Typography
                            sx={{
                                fontSize: "0.75rem",
                                fontWeight: 500,
                                color: accentAlpha(0.8),
                                fontFamily: "'JetBrains Mono', monospace",
                            }}
                        >
                            {currentAction}
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* ── Footer status ──────────────────────────────── */}
            <Box
                sx={{
                    px: 3,
                    py: 1,
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                }}
            >
                <Typography
                    sx={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.58rem",
                        color: COLORS.textMuted,
                        letterSpacing: "0.04em",
                    }}
                >
                    {isRunning
                        ? "⚡ Agent is browsing in background..."
                        : status === "done"
                            ? "Dashboard ready — loading..."
                            : "Waiting"}
                </Typography>
            </Box>
        </Box>
    );
});
