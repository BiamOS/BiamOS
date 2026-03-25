// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Chat Message Bubble
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

// ─── Styles ─────────────────────────────────────────────────

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

// ─── Message Segment Parser ──────────────────────────────────
// Splits LLM output into: plain text | ```copy blocks | ``` code blocks

type Segment =
    | { type: 'text'; content: string }
    | { type: 'copy'; content: string }
    | { type: 'code'; lang: string; content: string };

function parseSegments(text: string): Segment[] {
    const segments: Segment[] = [];
    const re = /```([a-zA-Z0-9_+\-#]*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
        }
        const lang = (match[1] || '').toLowerCase();
        const content = match[2] || '';
        segments.push(lang === 'copy'
            ? { type: 'copy', content }
            : { type: 'code', lang, content }
        );
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        segments.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return segments;
}

// ─── Copy Block ──────────────────────────────────────────────

function CopyBlock({ content }: { content: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const text = content.trim();
        navigator.clipboard.writeText(text).catch(() => {
            // Electron fallback
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Box sx={{
            my: 1,
            borderRadius: '10px',
            border: '1px solid rgba(140, 100, 255, 0.25)',
            overflow: 'hidden',
            bgcolor: 'rgba(140, 100, 255, 0.06)',
        }}>
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 0.5,
                bgcolor: 'rgba(140, 100, 255, 0.1)',
                borderBottom: '1px solid rgba(140, 100, 255, 0.15)',
            }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(180, 150, 255, 0.7)', fontWeight: 600 }}>
                    📋 Kopiervorlage
                </Typography>
                <Box
                    onClick={handleCopy}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1,
                        py: 0.3,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        bgcolor: copied ? 'rgba(100, 220, 140, 0.15)' : 'rgba(140, 100, 255, 0.15)',
                        border: copied ? '1px solid rgba(100, 220, 140, 0.4)' : '1px solid rgba(140, 100, 255, 0.3)',
                        transition: 'all 0.2s ease',
                        '&:hover': { bgcolor: copied ? 'rgba(100, 220, 140, 0.25)' : 'rgba(140, 100, 255, 0.3)' },
                        userSelect: 'none',
                    }}
                >
                    <Typography sx={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: copied ? 'rgba(100, 220, 140, 0.9)' : 'rgba(180, 150, 255, 0.9)',
                    }}>
                        {copied ? '✓ Kopiert!' : '⎘ Kopieren'}
                    </Typography>
                </Box>
            </Box>
            <Typography
                component="pre"
                sx={{
                    m: 0, px: 1.5, py: 1,
                    fontSize: '0.83rem',
                    lineHeight: 1.6,
                    color: 'rgba(255, 255, 255, 0.88)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                }}
            >
                {content.trim()}
            </Typography>
        </Box>
    );
}

// ─── Code Block ──────────────────────────────────────────────

function CodeBlock({ lang, content }: { lang: string; content: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(content.trim()).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <Box sx={{ my: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 0.4, bgcolor: 'rgba(255,255,255,0.05)' }}>
                <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    {lang || 'code'}
                </Typography>
                <Box onClick={handleCopy} sx={{ cursor: 'pointer', fontSize: '0.82rem', color: copied ? 'rgba(100,220,140,0.8)' : 'rgba(255,255,255,0.4)', userSelect: 'none', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}>
                    {copied ? '✓' : '⎘'}
                </Box>
            </Box>
            <Typography component="pre" sx={{ m: 0, px: 1.5, py: 0.8, fontSize: '0.78rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.25)' }}>
                {content.trim()}
            </Typography>
        </Box>
    );
}

// ─── AssistantText ───────────────────────────────────────────

const AssistantText = React.memo(function AssistantText({
    text,
    animate,
}: {
    text: string;
    animate: boolean;
}) {
    const { displayText, isTyping } = useTypewriter(text, animate ? 20 : 0);
    const shown = animate ? displayText : text;
    const segments = parseSegments(shown);

    return (
        <Box>
            {segments.map((seg, i) => {
                if (seg.type === 'copy') return <CopyBlock key={i} content={seg.content} />;
                if (seg.type === 'code') return <CodeBlock key={i} lang={seg.lang} content={seg.content} />;

                // Plain text — render **bold** inline
                const parts = seg.content.split(/(\*\*[^*]+\*\*)/g);
                return (
                    <Typography
                        key={i}
                        component="span"
                        sx={{
                            display: 'block',
                            color: 'rgba(255, 255, 255, 0.88)',
                            fontSize: '0.88rem',
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {parts.map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                                ? <strong key={j}>{part.slice(2, -2)}</strong>
                                : part
                        )}
                        {isTyping && i === segments.length - 1 && (
                            <Box
                                component="span"
                                sx={{
                                    display: 'inline-block',
                                    width: '2px',
                                    height: '1em',
                                    bgcolor: accentAlpha(0.8),
                                    ml: 0.3,
                                    verticalAlign: 'text-bottom',
                                    animation: 'blink 0.8s step-end infinite',
                                    '@keyframes blink': { '0%, 50%': { opacity: 1 }, '51%, 100%': { opacity: 0 } },
                                }}
                            />
                        )}
                    </Typography>
                );
            })}
        </Box>
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

    if (message.role === "thinking") return <ThinkingBubble />;

    if (message.role === "user") {
        return (
            <Box sx={userBubbleSx}>
                <Typography sx={{ color: "rgba(200, 170, 255, 0.95)", fontSize: "0.88rem", lineHeight: 1.5 }}>
                    {message.text}
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8, alignSelf: "flex-start", maxWidth: "85%" }}>
            <Box sx={luraBubbleSx}>
                <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: accentAlpha(0.15), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: 0.3 }}>
                    <BotIcon sx={{ fontSize: 15, color: accentAlpha(0.7) }} />
                </Box>
                <Box sx={luraContentSx}>
                    <AssistantText text={message.text} animate={isLatest} />
                </Box>
            </Box>

            {message.suggestions && message.suggestions.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.6, pl: 4.5 }}>
                    {message.suggestions.map((s, i) => (
                        <Box key={i} onClick={() => handlePill(s)} sx={pillSx}>
                            <Typography sx={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(140, 100, 255, 0.85)" }}>
                                {s}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
});
