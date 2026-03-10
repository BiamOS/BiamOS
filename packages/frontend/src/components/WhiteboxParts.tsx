// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Whitebox Sub-Components
// ============================================================
// Extracted from Whitebox.tsx for maintainability:
//   - DebugPanel          — Pipeline debug trace viewer
//   - Shared card styles  — reusable style constants
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { accentAlpha, COLORS } from "./ui/SharedUI";

// ============================================================
// Shared Styles
// ============================================================

export const alertBaseSx = {
    borderRadius: 2,
    "& .MuiAlert-icon": {} as Record<string, string>,
};

export const alertStyles = {
    warning: {
        ...alertBaseSx,
        bgcolor: "rgba(255, 180, 0, 0.08)",
        color: "#ffb400",
        border: "1px solid rgba(255, 180, 0, 0.2)",
        "& .MuiAlert-icon": { color: "#ffb400" },
    },
    success: {
        ...alertBaseSx,
        bgcolor: "rgba(0, 220, 100, 0.08)",
        color: "#00dc64",
        border: "1px solid rgba(0, 220, 100, 0.2)",
        "& .MuiAlert-icon": { color: "#00dc64" },
    },
    info: {
        ...alertBaseSx,
        bgcolor: "rgba(33, 150, 243, 0.08)",
        color: "#64b5f6",
        border: "1px solid rgba(33, 150, 243, 0.2)",
    },
} as const;

export const cardSx = {
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
    bgcolor: "rgba(14, 14, 28, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: 2,
    overflow: "hidden",
    transition: "border-color 0.2s",
    "&:hover": { borderColor: accentAlpha(0.2) },
};

export const dragHandleSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    px: 1.5,
    py: 0.5,
    cursor: "grab",
    bgcolor: "rgba(255, 255, 255, 0.02)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
    minHeight: 32,
    "&:active": { cursor: "grabbing" },
    userSelect: "none" as const,
};

export const scrollContentSx = {
    flex: 1,
    overflow: "auto",
    px: 1.2,
    pt: 0.5,
    pb: 1,
    position: "relative" as const,
    zIndex: 2,
    pointerEvents: "auto" as const,
    "&:last-child": { pb: 1 },
    "&::-webkit-scrollbar": { width: 3 },
    "&::-webkit-scrollbar-thumb": {
        bgcolor: accentAlpha(0.15),
        borderRadius: 2,
    },
};

// ============================================================
// Types
// ============================================================

export interface DebugStep {
    agent: string;
    icon: string;
    duration_ms: number;
    input: string;
    output: string;
    detail?: Record<string, unknown>;
}

// ============================================================
// DebugPanel — Pipeline Trace Viewer
// ============================================================

export function DebugPanel({ steps }: { steps: DebugStep[] }) {
    const maxDuration = Math.max(...steps.map(s => s.duration_ms), 1);
    return (
        <Box sx={{
            p: 1.5, pt: 1,
            bgcolor: "rgba(0, 0, 0, 0.4)",
            borderTop: "1px solid rgba(255, 255, 255, 0.06)",
            fontSize: "0.7rem",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            maxHeight: 300,
            overflow: "auto",
            "&::-webkit-scrollbar": { width: 3 },
            "&::-webkit-scrollbar-thumb": { bgcolor: accentAlpha(0.15), borderRadius: 2 },
        }}>
            <Typography sx={{ fontSize: "0.65rem", fontWeight: 700, color: accentAlpha(0.7), mb: 1, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                🔍 Pipeline Debug Trace
            </Typography>
            {steps.map((step, i) => {
                const barWidth = Math.max(4, (step.duration_ms / maxDuration) * 100);
                const isTotal = step.agent === "Total";
                const durationColor = step.duration_ms < 200 ? "#00dc64" : step.duration_ms < 1000 ? "#ffb400" : "#ff5050";
                return (
                    <Box key={i} sx={{ mb: 0.8, opacity: isTotal ? 1 : 0.9 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.3 }}>
                            <Typography sx={{ fontSize: "0.85rem", lineHeight: 1, minWidth: 18, textAlign: "center" }}>
                                {step.icon}
                            </Typography>
                            <Typography sx={{
                                fontSize: "0.65rem",
                                fontWeight: isTotal ? 800 : 600,
                                color: isTotal ? "#fff" : accentAlpha(0.9),
                                minWidth: 100,
                            }}>
                                {step.agent}
                            </Typography>
                            <Box sx={{
                                flex: 1, height: 4, borderRadius: 2,
                                bgcolor: "rgba(255,255,255,0.04)",
                                overflow: "hidden",
                            }}>
                                <Box sx={{
                                    width: `${barWidth}%`, height: "100%",
                                    borderRadius: 2,
                                    bgcolor: durationColor,
                                    transition: "width 0.3s ease",
                                }} />
                            </Box>
                            <Typography sx={{
                                fontSize: "0.6rem", fontWeight: 700,
                                color: durationColor,
                                minWidth: 50, textAlign: "right",
                                fontFamily: "'JetBrains Mono', monospace",
                            }}>
                                {step.duration_ms >= 1000 ? `${(step.duration_ms / 1000).toFixed(1)}s` : `${step.duration_ms}ms`}
                            </Typography>
                        </Box>
                        {!isTotal && (
                            <Box sx={{ pl: 3.5, display: "flex", flexDirection: "column", gap: 0.2 }}>
                                <Typography sx={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.35)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <span style={{ color: "rgba(0,200,255,0.5)" }}>in:</span> {step.input}
                                </Typography>
                                <Typography sx={{ fontSize: "0.58rem", color: "rgba(0,220,100,0.6)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <span style={{ color: "rgba(0,200,255,0.5)" }}>out:</span> {step.output}
                                </Typography>
                                {/* Show scoring breakdown for Router */}
                                {step.agent === "Router" && step.detail?.scores && Array.isArray(step.detail.scores) ? (
                                    <Box sx={{ mt: 0.3, display: "flex", flexDirection: "column", gap: 0.3 }}>
                                        {(step.detail.scores as string[]).map((scoreStr: string, si: number) => {
                                            const match = scoreStr.match(/^(.+?):\s*(\d+)pts\s*\((.+)\)$/);
                                            if (!match) return <Typography key={si} sx={{ fontSize: "0.54rem", color: "rgba(255,255,255,0.25)" }}>{scoreStr}</Typography>;
                                            const name = match[1];
                                            const pts = match[2];
                                            const breakdown = match[3];
                                            const isWinner = si === 0;
                                            return (
                                                <Box key={si} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                                    <Typography sx={{
                                                        fontSize: "0.54rem", fontWeight: isWinner ? 700 : 400,
                                                        color: isWinner ? "#00dc64" : "rgba(255,255,255,0.3)",
                                                        minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                    }}>
                                                        {isWinner ? "✅" : "  "} {name}
                                                    </Typography>
                                                    <Box sx={{
                                                        px: 0.5, py: 0.1, borderRadius: 0.5,
                                                        bgcolor: isWinner ? "rgba(0,220,100,0.15)" : "rgba(255,255,255,0.05)",
                                                        border: `1px solid ${isWinner ? "rgba(0,220,100,0.3)" : "rgba(255,255,255,0.08)"}`,
                                                    }}>
                                                        <Typography sx={{ fontSize: "0.52rem", fontWeight: 700, color: isWinner ? "#00dc64" : "rgba(255,255,255,0.4)" }}>
                                                            {pts}pts
                                                        </Typography>
                                                    </Box>
                                                    <Typography sx={{ fontSize: "0.48rem", color: "rgba(255,255,255,0.2)" }}>
                                                        {breakdown}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                ) : null}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
