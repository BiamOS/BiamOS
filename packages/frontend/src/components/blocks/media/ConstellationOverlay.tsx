// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Constellation View (Deep Research Visualization)
// ============================================================
// Renders a spatial "mind map" overlay during agent research.
// Multi-tentacle layout with glassmorphism cards, step counters,
// type badges, and rich preview content.
// ============================================================

import React, { useMemo, useState, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import type { AgentState } from "./useAgentActions";

// ─── Types ──────────────────────────────────────────────────

interface ConstellationNode {
    id: string;
    type: "nucleus" | "search" | "note" | "navigate" | "genui";
    label: string;        // Short type label (e.g., "Web Search")
    text: string;         // Main content
    preview?: string;     // Extended preview for search/notes
    x: number;
    y: number;
    delay: number;
    stepNumber: number;   // Global step number for badge
}

// ─── Multi-Tentacle Position Generator ──────────────────────

const ARM_ANGLES: Record<string, number> = {
    search:   -60,   // upper-left
    note:     150,   // bottom-left
    navigate: 30,    // upper-right
    genui:    -30,   // top-right
};

function generateTentaclePosition(
    type: string,
    indexInArm: number,
): { x: number; y: number } {
    const baseAngle = (ARM_ANGLES[type] ?? 0) * (Math.PI / 180);
    const spreadAngle = (indexInArm - 0.5) * 0.3;
    const angle = baseAngle + spreadAngle;
    const radius = 18 + indexInArm * 11;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
    };
}

// ─── Node Theme Config ──────────────────────────────────────

const NODE_THEME: Record<string, {
    icon: string;
    label: string;
    borderColor: string;
    glowColor: string;
    bgGradient: string;
    accentColor: string;
    badgeBg: string;
}> = {
    nucleus: {
        icon: "🎯",
        label: "Task",
        borderColor: "rgba(0, 212, 255, 0.7)",
        glowColor: "0 0 30px rgba(0, 212, 255, 0.35), 0 0 60px rgba(0, 212, 255, 0.12)",
        bgGradient: "linear-gradient(135deg, rgba(0, 20, 40, 0.97), rgba(0, 30, 50, 0.95))",
        accentColor: "#00d4ff",
        badgeBg: "rgba(0, 212, 255, 0.15)",
    },
    search: {
        icon: "🔍",
        label: "Web Search",
        borderColor: "rgba(100, 180, 255, 0.5)",
        glowColor: "0 0 20px rgba(100, 180, 255, 0.18)",
        bgGradient: "linear-gradient(135deg, rgba(8, 14, 35, 0.96), rgba(12, 22, 45, 0.94))",
        accentColor: "#64b4ff",
        badgeBg: "rgba(100, 180, 255, 0.12)",
    },
    note: {
        icon: "📝",
        label: "Extracted Data",
        borderColor: "rgba(0, 230, 140, 0.5)",
        glowColor: "0 0 18px rgba(0, 230, 140, 0.15)",
        bgGradient: "linear-gradient(135deg, rgba(4, 22, 14, 0.96), rgba(6, 30, 20, 0.94))",
        accentColor: "#00e68c",
        badgeBg: "rgba(0, 230, 140, 0.12)",
    },
    navigate: {
        icon: "🌐",
        label: "Navigation",
        borderColor: "rgba(255, 190, 60, 0.5)",
        glowColor: "0 0 18px rgba(255, 190, 60, 0.15)",
        bgGradient: "linear-gradient(135deg, rgba(25, 18, 5, 0.96), rgba(30, 22, 8, 0.94))",
        accentColor: "#ffbe3c",
        badgeBg: "rgba(255, 190, 60, 0.12)",
    },
    genui: {
        icon: "✨",
        label: "Dashboard",
        borderColor: "rgba(180, 100, 255, 0.6)",
        glowColor: "0 0 25px rgba(180, 100, 255, 0.25), 0 0 50px rgba(180, 100, 255, 0.08)",
        bgGradient: "linear-gradient(135deg, rgba(18, 5, 30, 0.97), rgba(25, 8, 40, 0.95))",
        accentColor: "#b464ff",
        badgeBg: "rgba(180, 100, 255, 0.15)",
    },
};

// ─── Component ──────────────────────────────────────────────

interface ConstellationOverlayProps {
    state: AgentState;
    task: string;
}

export const ConstellationOverlay = React.memo(function ConstellationOverlay({
    state,
    task,
}: ConstellationOverlayProps) {
    const nodes = useMemo<ConstellationNode[]>(() => {
        const result: ConstellationNode[] = [];
        const researchActions = ["search_web", "take_notes", "navigate", "genui"];

        const hasResearch = state.steps.some(s =>
            s.action === "search_web" || s.action === "genui" || s.action === "take_notes"
        );
        if (!hasResearch) return [];

        // Nucleus
        result.push({
            id: "nucleus",
            type: "nucleus",
            label: "Task",
            text: task.length > 80 ? task.substring(0, 77) + "..." : task,
            x: 0,
            y: 0,
            delay: 0,
            stepNumber: 0,
        });

        const armCounters: Record<string, number> = {};
        let globalIndex = 0;

        state.steps.forEach((step, i) => {
            if (!researchActions.includes(step.action)) return;

            const type = step.action === "search_web" ? "search"
                : step.action === "take_notes" ? "note"
                : step.action === "genui" ? "genui"
                : "navigate";

            armCounters[type] = (armCounters[type] || 0) + 1;
            globalIndex++;
            const pos = generateTentaclePosition(type, armCounters[type]);

            let text = "";
            let preview: string | undefined;

            if (step.action === "search_web") {
                const queryMatch = step.result?.match(/results for "([^"]+)"/);
                text = queryMatch ? queryMatch[1] : (step.description || "Web Search");
                // Richer preview — show top 3 results
                const resultLines = step.result?.split('\n').filter(l => /^\d+\./.test(l.trim()));
                if (resultLines && resultLines.length > 0) {
                    preview = resultLines.slice(0, 3).map(l => l.trim()).join('\n');
                    if (preview.length > 200) preview = preview.substring(0, 197) + "...";
                }
            } else if (step.action === "take_notes") {
                const notesText = step.result?.replace('📝 Notes saved: ', '') || step.description;
                // Show more of the notes content
                text = notesText ? (notesText.length > 60 ? notesText.substring(0, 57) + "..." : notesText) : "Notes";
                // Rest as preview
                if (notesText && notesText.length > 60) {
                    preview = notesText.substring(57, 300);
                    if (notesText.length > 300) preview += "...";
                }
            } else if (step.action === "genui") {
                text = "Dashboard wird generiert...";
            } else {
                text = step.description || step.action;
                if (text.length > 60) text = text.substring(0, 57) + "...";
            }

            result.push({
                id: `step-${i}`,
                type,
                label: NODE_THEME[type]?.label || type,
                text,
                preview,
                x: pos.x,
                y: pos.y,
                delay: globalIndex * 250,
                stepNumber: globalIndex,
            });
        });

        return result;
    }, [state.steps, task]);

    const hasResearchNodes = nodes.length > 1;
    // Hide overlay when agent pauses (ask_user) so user can see the page
    const isAgentActive = state.status === "running";
    const isCollapsing = state.steps.some(s => s.action === "genui");

    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (isAgentActive && hasResearchNodes) {
            setVisible(true);
        } else if (!isAgentActive && visible) {
            const timer = setTimeout(() => setVisible(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [isAgentActive, hasResearchNodes, visible]);

    useEffect(() => {
        if (state.status === "idle") setVisible(false);
    }, [state.status]);

    if (!visible) return null;

    return (
        <>
            {/* ─── Backdrop ─── */}
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 45,
                    pointerEvents: "none",
                    backdropFilter: isCollapsing ? "blur(0px)" : "blur(10px) brightness(0.35)",
                    background: isCollapsing
                        ? "transparent"
                        : "radial-gradient(ellipse at center, rgba(0,10,20,0.25) 0%, rgba(0,4,12,0.75) 100%)",
                    opacity: isAgentActive ? 1 : 0,
                    transition: "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
            />

            {/* ─── Node Container ─── */}
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 46,
                    pointerEvents: "none",
                    overflow: "hidden",
                    opacity: (isCollapsing || !isAgentActive) ? 0 : 1,
                    transition: "opacity 0.6s ease-out",
                }}
            >
                {/* SVG Connection Lines */}
                <svg
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                    }}
                >
                    {nodes.slice(1).map((node) => {
                        const theme = NODE_THEME[node.type];
                        return (
                            <line
                                key={`line-${node.id}`}
                                x1="50%"
                                y1="50%"
                                x2={`${50 + node.x}%`}
                                y2={`${50 + node.y}%`}
                                stroke={theme?.borderColor || "rgba(0,212,255,0.3)"}
                                strokeWidth="1.5"
                                strokeDasharray="6 4"
                                opacity={0.35}
                                style={{
                                    animation: `lineGrow 0.6s ease-out ${node.delay}ms both`,
                                }}
                            />
                        );
                    })}
                </svg>

                {/* Render Nodes */}
                {nodes.map((node) => {
                    const theme = NODE_THEME[node.type] || NODE_THEME.search;
                    const isCenter = node.type === "nucleus";
                    const hasPreview = !!node.preview;

                    return (
                        <Box
                            key={node.id}
                            sx={{
                                position: "absolute",
                                left: `${50 + node.x}%`,
                                top: `${50 + node.y}%`,
                                transform: isCollapsing && !isCenter
                                    ? "translate(-50%, -50%) scale(0)"
                                    : "translate(-50%, -50%) scale(1)",
                                width: isCenter ? 320 : hasPreview ? 300 : 260,
                                borderRadius: "12px",
                                background: theme.bgGradient,
                                border: `1px solid ${theme.borderColor}`,
                                boxShadow: theme.glowColor,
                                backdropFilter: "blur(16px) saturate(1.2)",
                                overflow: "hidden",
                                transition: isCollapsing
                                    ? `all 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${node.delay * 0.3}ms`
                                    : "none",
                                animation: isCollapsing
                                    ? undefined
                                    : `nodePopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${node.delay}ms both`,
                                ...(isCenter && isCollapsing ? {
                                    animation: "nucleusPulse 1.2s ease-in-out infinite",
                                    "@keyframes nucleusPulse": {
                                        "0%, 100%": { boxShadow: "0 0 30px rgba(0, 212, 255, 0.4)" },
                                        "50%": { boxShadow: "0 0 60px rgba(0, 212, 255, 0.7)" },
                                    },
                                } : {}),
                                "@keyframes nodePopIn": {
                                    "0%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.3)" },
                                    "100%": { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
                                },
                                "@keyframes lineGrow": {
                                    "0%": { strokeDashoffset: 100, opacity: 0 },
                                    "100%": { strokeDashoffset: 0, opacity: 0.35 },
                                },
                            }}
                        >
                            {/* Card Header — type badge + step number */}
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    px: 1.5,
                                    py: 0.7,
                                    borderBottom: `1px solid ${theme.borderColor.replace(/[\d.]+\)$/, '0.15)')}`,
                                    background: theme.badgeBg,
                                }}
                            >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                                    <Typography sx={{ fontSize: "0.85rem", lineHeight: 1 }}>
                                        {theme.icon}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: theme.accentColor,
                                            fontSize: "0.65rem",
                                            fontWeight: 700,
                                            fontFamily: "'Inter', system-ui, sans-serif",
                                            letterSpacing: "0.03em",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {node.label}
                                    </Typography>
                                </Box>
                                {node.stepNumber > 0 && (
                                    <Box
                                        sx={{
                                            width: 20,
                                            height: 20,
                                            borderRadius: "50%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            bgcolor: theme.badgeBg,
                                            border: `1px solid ${theme.borderColor.replace(/[\d.]+\)$/, '0.3)')}`,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: theme.accentColor,
                                                fontSize: "0.55rem",
                                                fontWeight: 700,
                                                fontFamily: "'Inter', system-ui, sans-serif",
                                            }}
                                        >
                                            {node.stepNumber}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            {/* Card Content */}
                            <Box sx={{ px: 1.5, py: 1 }}>
                                <Typography
                                    sx={{
                                        color: "rgba(255, 255, 255, 0.92)",
                                        fontSize: isCenter ? "0.85rem" : "0.78rem",
                                        fontWeight: isCenter ? 600 : 500,
                                        lineHeight: 1.45,
                                        fontFamily: "'Inter', system-ui, sans-serif",
                                    }}
                                >
                                    {node.text}
                                </Typography>

                                {/* Preview content */}
                                {hasPreview && (
                                    <Box
                                        sx={{
                                            mt: 0.8,
                                            pt: 0.8,
                                            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: "rgba(255, 255, 255, 0.45)",
                                                fontSize: "0.68rem",
                                                fontWeight: 400,
                                                lineHeight: 1.45,
                                                fontFamily: "'Inter', system-ui, sans-serif",
                                                whiteSpace: "pre-line",
                                            }}
                                        >
                                            {node.preview}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    );
                })}

                {/* ─── Status Bar (top) ─── */}
                <Box
                    sx={{
                        position: "absolute",
                        top: 16,
                        left: "50%",
                        transform: "translateX(-50%)",
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 2.5,
                        py: 0.8,
                        borderRadius: "20px",
                        background: "linear-gradient(135deg, rgba(0, 12, 24, 0.95), rgba(0, 18, 35, 0.92))",
                        border: "1px solid rgba(0, 212, 255, 0.25)",
                        backdropFilter: "blur(16px)",
                        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
                        animation: "nodePopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
                    }}
                >
                    {/* Animated pulse dot */}
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: isCollapsing ? "#b464ff" : "#00d4ff",
                            animation: "pulseGlow 1.5s ease-in-out infinite",
                            "@keyframes pulseGlow": {
                                "0%, 100%": { opacity: 1, boxShadow: `0 0 4px ${isCollapsing ? "#b464ff" : "#00d4ff"}` },
                                "50%": { opacity: 0.5, boxShadow: `0 0 12px ${isCollapsing ? "#b464ff" : "#00d4ff"}` },
                            },
                        }}
                    />
                    <Typography
                        sx={{
                            color: "rgba(255, 255, 255, 0.85)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            fontFamily: "'Inter', system-ui, sans-serif",
                        }}
                    >
                        {isCollapsing
                            ? "✨ Generating Dashboard..."
                            : `Deep Research — ${nodes.length - 1} ${nodes.length - 1 === 1 ? 'Quelle' : 'Quellen'}`}
                    </Typography>
                    {/* Step counter badges */}
                    {!isCollapsing && (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                            {Object.entries(
                                nodes.slice(1).reduce((acc, n) => {
                                    acc[n.type] = (acc[n.type] || 0) + 1;
                                    return acc;
                                }, {} as Record<string, number>)
                            ).map(([type, count]) => {
                                const t = NODE_THEME[type];
                                return (
                                    <Box
                                        key={type}
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.3,
                                            px: 0.8,
                                            py: 0.2,
                                            borderRadius: "8px",
                                            bgcolor: t?.badgeBg || "rgba(255,255,255,0.05)",
                                            border: `1px solid ${(t?.borderColor || "rgba(255,255,255,0.1)").replace(/[\d.]+\)$/, '0.2)')}`,
                                        }}
                                    >
                                        <Typography sx={{ fontSize: "0.6rem", lineHeight: 1 }}>
                                            {t?.icon || "·"}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: t?.accentColor || "#fff",
                                                fontSize: "0.55rem",
                                                fontWeight: 700,
                                                fontFamily: "'Inter', system-ui, sans-serif",
                                            }}
                                        >
                                            {count}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            </Box>
        </>
    );
});
