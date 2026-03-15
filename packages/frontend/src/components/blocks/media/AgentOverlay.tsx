// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Visual Overlay
// ============================================================
// Renders the glowing border, animated AI cursor, and status
// bar when the browser agent is active.
// ============================================================

import React from "react";
import { Box, Typography, IconButton } from "@mui/material";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { AgentState } from "./useAgentActions";

interface AgentOverlayProps {
    state: AgentState;
    task: string;
    onStop: () => void;
    onContinue: () => void;
}

export const AgentOverlay = React.memo(function AgentOverlay({
    state,
    task,
    onStop,
    onContinue,
}: AgentOverlayProps) {
    if (state.status === "idle") return null;

    const isActive = state.status === "running";
    const isPaused = state.status === "paused";
    const isDone = state.status === "done";
    const isError = state.status === "error";
    const isFinished = isDone || isError;

    return (
        <>
            {/* ─── Glowing Border ─── */}
            {(isActive || isPaused) && (
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        zIndex: 50,
                        border: isPaused
                            ? "2px solid rgba(255, 190, 60, 0.6)"
                            : "2px solid rgba(0, 212, 255, 0.5)",
                        borderRadius: 1,
                        animation: isActive ? "agentGlow 2s ease-in-out infinite" : "none",
                        "@keyframes agentGlow": {
                            "0%, 100%": {
                                boxShadow: `inset 0 0 15px rgba(0, 212, 255, 0.15), 0 0 20px rgba(0, 212, 255, 0.1)`,
                                borderColor: "rgba(0, 212, 255, 0.4)",
                            },
                            "50%": {
                                boxShadow: `inset 0 0 25px rgba(0, 212, 255, 0.25), 0 0 35px rgba(0, 212, 255, 0.2)`,
                                borderColor: "rgba(0, 212, 255, 0.7)",
                            },
                        },
                    }}
                />
            )}

            {/* ─── Animated AI Cursor ─── */}
            {state.cursorPos && isActive && (
                <Box
                    key={`${state.cursorPos.x}-${state.cursorPos.y}`}
                    sx={{
                        position: "absolute",
                        left: state.cursorPos.x,
                        top: state.cursorPos.y,
                        zIndex: 55,
                        pointerEvents: "none",
                        transform: "translate(-50%, -50%)",
                        transition: "left 0.4s ease-out, top 0.4s ease-out",
                    }}
                >
                    {/* Outer ripple ring */}
                    <Box
                        sx={{
                            position: "absolute",
                            inset: -12,
                            borderRadius: "50%",
                            border: "2px solid rgba(0, 212, 255, 0.4)",
                            animation: "cursorRipple 1s ease-out forwards",
                            "@keyframes cursorRipple": {
                                "0%": { transform: "scale(0.5)", opacity: 1 },
                                "100%": { transform: "scale(2.5)", opacity: 0 },
                            },
                        }}
                    />
                    {/* Main cursor dot */}
                    <Box
                        sx={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            bgcolor: "rgba(0, 212, 255, 0.9)",
                            boxShadow: "0 0 12px rgba(0, 212, 255, 0.6), 0 0 24px rgba(0, 212, 255, 0.3)",
                            animation: "cursorGlow 1.2s ease-in-out infinite",
                            "@keyframes cursorGlow": {
                                "0%, 100%": {
                                    boxShadow: "0 0 8px rgba(0, 212, 255, 0.5), 0 0 16px rgba(0, 212, 255, 0.2)",
                                    transform: "scale(1)",
                                },
                                "50%": {
                                    boxShadow: "0 0 16px rgba(0, 212, 255, 0.8), 0 0 32px rgba(0, 212, 255, 0.4)",
                                    transform: "scale(1.15)",
                                },
                            },
                        }}
                    />
                </Box>
            )}

            {/* ─── Status Bar ─── */}
            <Box
                sx={{
                    position: "absolute",
                    bottom: 8,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 60,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 0.8,
                    borderRadius: 3,
                    bgcolor: isPaused
                        ? "rgba(40, 30, 0, 0.92)"
                        : isDone
                            ? "rgba(0, 30, 10, 0.92)"
                            : isError
                                ? "rgba(40, 0, 0, 0.92)"
                                : "rgba(0, 12, 24, 0.92)",
                    border: `1px solid ${
                        isPaused
                            ? "rgba(255, 190, 60, 0.3)"
                            : isDone
                                ? "rgba(0, 200, 100, 0.3)"
                                : isError
                                    ? "rgba(255, 80, 80, 0.3)"
                                    : "rgba(0, 212, 255, 0.3)"
                    }`,
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
                    maxWidth: "80%",
                    animation: isFinished
                        ? "slideUp 0.3s ease-out, fadeOut 1s ease-out 4s forwards"
                        : "slideUp 0.3s ease-out",
                    cursor: isFinished ? "pointer" : "default",
                    "@keyframes slideUp": {
                        from: { opacity: 0, transform: "translateX(-50%) translateY(10px)" },
                        to: { opacity: 1, transform: "translateX(-50%) translateY(0)" },
                    },
                    "@keyframes fadeOut": {
                        from: { opacity: 1 },
                        to: { opacity: 0, pointerEvents: "none" },
                    },
                }}
                onClick={isFinished ? onStop : undefined}
            >
                {/* Pulsing dot */}
                {isActive && (
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: "#00d4ff",
                            flexShrink: 0,
                            animation: "agentPulse 1.5s ease-in-out infinite",
                            "@keyframes agentPulse": {
                                "0%, 100%": { opacity: 0.4, transform: "scale(0.8)" },
                                "50%": { opacity: 1, transform: "scale(1.2)" },
                            },
                        }}
                    />
                )}

                {/* Action text */}
                <Typography
                    sx={{
                        color: isPaused
                            ? "rgba(255, 190, 60, 0.9)"
                            : isDone
                                ? "rgba(0, 200, 100, 0.9)"
                                : isError
                                    ? "rgba(255, 100, 100, 0.9)"
                                    : "rgba(0, 212, 255, 0.9)",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 350,
                    }}
                >
                    {state.currentAction || "🤖 AI Agent"}
                </Typography>

                {/* Step counter */}
                {state.steps.length > 0 && (
                    <Typography
                        sx={{
                            color: "rgba(255, 255, 255, 0.3)",
                            fontSize: "0.6rem",
                            fontWeight: 500,
                            flexShrink: 0,
                        }}
                    >
                        {state.steps.length} steps
                    </Typography>
                )}

                {/* Continue button (when paused) */}
                {isPaused && (
                    <IconButton
                        onClick={onContinue}
                        size="small"
                        sx={{
                            color: "rgba(0, 200, 100, 0.9)",
                            bgcolor: "rgba(0, 200, 100, 0.15)",
                            p: 0.5,
                            "&:hover": { bgcolor: "rgba(0, 200, 100, 0.25)" },
                        }}
                    >
                        <PlayArrowIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}

                {/* Stop button */}
                {(isActive || isPaused) && (
                    <IconButton
                        onClick={onStop}
                        size="small"
                        sx={{
                            color: "rgba(255, 80, 80, 0.7)",
                            p: 0.5,
                            "&:hover": {
                                color: "rgba(255, 80, 80, 1)",
                                bgcolor: "rgba(255, 80, 80, 0.1)",
                            },
                        }}
                    >
                        <StopIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}
            </Box>
        </>
    );
});
