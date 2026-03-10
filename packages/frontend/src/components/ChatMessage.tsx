// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Chat Message Bubble
// ============================================================
// Single chat message — user (right, purple), BiamOS \(left, glass),
// or thinking (left, animated pipeline steps).
// ============================================================

import React, { useCallback, useState, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import { SmartToy as BotIcon } from "@mui/icons-material";
import { useTypewriter } from "../hooks/useTypewriter";
import { useLanguage } from "../hooks/useLanguage";
import { accentAlpha } from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

export interface ChatMsg {
    id: string;
    role: "user" | "lura" | "thinking";
    text: string;
    suggestions?: string[];
    timestamp: number;
}

interface ChatMessageProps {
    message: ChatMsg;
    onSuggestionClick?: (suggestion: string) => void;
    isLatest?: boolean;
}

// ─── Pipeline Steps ─────────────────────────────────────────

// Steps are built dynamically per-render using translations

const userBubbleSx = {
    alignSelf: "flex-end",
    maxWidth: "80%",
    px: 1.8,
    py: 0.9,
    borderRadius: "16px 16px 4px 16px",
    bgcolor: accentAlpha(0.2),
    border: `1px solid ${accentAlpha(0.3)}`,
};

const luraBubbleSx = {
    alignSelf: "flex-start",
    maxWidth: "85%",
    display: "flex",
    gap: 1,
    alignItems: "flex-start",
};

const luraContentSx = {
    px: 1.8,
    py: 0.9,
    borderRadius: "16px 16px 16px 4px",
    bgcolor: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(8px)",
};

const pillSx = {
    display: "inline-flex",
    alignItems: "center",
    px: 1.2,
    py: 0.4,
    borderRadius: "16px",
    bgcolor: accentAlpha(0.08),
    border: `1px solid ${accentAlpha(0.2)}`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
        bgcolor: accentAlpha(0.18),
        borderColor: accentAlpha(0.45),
        transform: "translateY(-1px)",
    },
};

// ─── Thinking Bubble ────────────────────────────────────────

const ThinkingBubble = React.memo(function ThinkingBubble() {
    const [activeStep, setActiveStep] = useState(0);
    const { tr } = useLanguage();

    const steps = [
        { icon: "🌐", text: tr.thinkingTranslate },
        { icon: "🤔", text: tr.thinkingAnalyze },
        { icon: "🔍", text: tr.thinkingRoute },
        { icon: "⚙️", text: tr.thinkingParams },
        { icon: "📡", text: tr.thinkingFetch },
        { icon: "🎨", text: tr.thinkingLayout },
    ];
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));

        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, alignSelf: "flex-start", maxWidth: "85%" }}>
            <Box sx={luraBubbleSx}>
                <Box
                    sx={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        bgcolor: accentAlpha(0.15),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        mt: 0.3,
                        animation: "pulse 1.5s ease-in-out infinite",
                        "@keyframes pulse": {
                            "0%, 100%": { opacity: 0.6 },
                            "50%": { opacity: 1 },
                        },
                    }}
                >
                    <BotIcon sx={{ fontSize: 15, color: accentAlpha(0.7) }} />
                </Box>
                <Box sx={{ ...luraContentSx, minWidth: 200 }}>
                    {steps.map((step, i) => (
                        <Box
                            key={i}
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.8,
                                py: 0.25,
                                opacity: i < activeStep ? 0.4 : i === activeStep ? 1 : 0.15,
                                transition: "opacity 0.4s ease",
                            }}
                        >
                            <Typography
                                component="span"
                                sx={{
                                    fontSize: "0.82rem",
                                    width: 20,
                                    textAlign: "center",
                                    filter: i <= activeStep ? "none" : "grayscale(1)",
                                    transition: "filter 0.3s ease",
                                }}
                            >
                                {i < activeStep ? "✓" : step.icon}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: "0.78rem",
                                    color: i < activeStep
                                        ? "rgba(100, 255, 150, 0.6)"
                                        : i === activeStep
                                            ? "rgba(255, 255, 255, 0.9)"
                                            : "rgba(255, 255, 255, 0.25)",
                                    fontWeight: i === activeStep ? 600 : 400,
                                    fontStyle: i < activeStep ? "normal" : "normal",
                                    transition: "all 0.3s ease",
                                }}
                            >
                                {step.text}
                                {i === activeStep && (
                                    <Box
                                        component="span"
                                        sx={{
                                            display: "inline-block",
                                            width: "2px",
                                            height: "0.85em",
                                            bgcolor: accentAlpha(0.8),
                                            ml: 0.3,
                                            verticalAlign: "text-bottom",
                                            animation: "blink 0.8s step-end infinite",
                                            "@keyframes blink": {
                                                "0%, 50%": { opacity: 1 },
                                                "51%, 100%": { opacity: 0 },
                                            },
                                        }}
                                    />
                                )}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Box>
        </Box>
    );
});

// ─── Sub-components ─────────────────────────────────────────

const AssistantText = React.memo(function AssistantText({
    text,
    animate,
}: {
    text: string;
    animate: boolean;
}) {
    const { displayText, isTyping } = useTypewriter(text, animate ? 20 : 0);
    const shown = animate ? displayText : text;

    return (
        <Typography
            sx={{
                color: "rgba(255, 255, 255, 0.88)",
                fontSize: "0.88rem",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
            }}
        >
            {shown}
            {isTyping && (
                <Box
                    component="span"
                    sx={{
                        display: "inline-block",
                        width: "2px",
                        height: "1em",
                        bgcolor: accentAlpha(0.8),
                        ml: 0.3,
                        verticalAlign: "text-bottom",
                        animation: "blink 0.8s step-end infinite",
                        "@keyframes blink": {
                            "0%, 50%": { opacity: 1 },
                            "51%, 100%": { opacity: 0 },
                        },
                    }}
                />
            )}
        </Typography>
    );
});

// ─── Component ──────────────────────────────────────────────

export const ChatMessage = React.memo(function ChatMessage({
    message,
    onSuggestionClick,
    isLatest = false,
}: ChatMessageProps) {
    const handlePill = useCallback(
        (s: string) => onSuggestionClick?.(s),
        [onSuggestionClick]
    );

    // ── Thinking bubble ──
    if (message.role === "thinking") {
        return <ThinkingBubble />;
    }

    // ── User bubble ──
    if (message.role === "user") {
        return (
            <Box sx={userBubbleSx}>
                <Typography
                    sx={{
                        color: "rgba(200, 170, 255, 0.95)",
                        fontSize: "0.88rem",
                        lineHeight: 1.5,
                    }}
                >
                    {message.text}
                </Typography>
            </Box>
        );
    }

    // ── Lura bubble ──
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, alignSelf: "flex-start", maxWidth: "85%" }}>
            <Box sx={luraBubbleSx}>
                <Box
                    sx={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        bgcolor: accentAlpha(0.15),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        mt: 0.3,
                    }}
                >
                    <BotIcon sx={{ fontSize: 15, color: accentAlpha(0.7) }} />
                </Box>
                <Box sx={luraContentSx}>
                    <AssistantText text={message.text} animate={isLatest} />
                </Box>
            </Box>

            {/* Suggestion pills */}
            {message.suggestions && message.suggestions.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.6, pl: 4.5 }}>
                    {message.suggestions.map((s, i) => (
                        <Box key={i} onClick={() => handlePill(s)} sx={pillSx}>
                            <Typography
                                sx={{
                                    fontSize: "0.75rem",
                                    fontWeight: 500,
                                    color: "rgba(140, 100, 255, 0.85)",
                                }}
                            >
                                {s}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
});
