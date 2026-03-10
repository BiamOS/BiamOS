// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Clarification Popup (Micro-Chat)
// ============================================================
// Glassmorphic popup that appears when the Concierge agent
// needs more information from the user before processing.
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
    Box,
    Typography,
    TextField,
    IconButton,
    InputAdornment,
    Slide,
} from "@mui/material";
import {
    Send as SendIcon,
    Close as CloseIcon,
    SmartToy as BotIcon,
} from "@mui/icons-material";
import { accentAlpha } from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

export interface ClarificationData {
    question: string;
    suggestions: string[];
    originalQuery: string;
    matchedGroup?: string;
}

interface ClarificationPopupProps {
    data: ClarificationData;
    onSubmit: (answer: string) => void;
    onDismiss: () => void;
}

// ─── Styles ─────────────────────────────────────────────────

const popupContainerSx = {
    position: "absolute" as const,
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 580,
    mb: 1.5,
    zIndex: 1300,
};

const popupCardSx = {
    bgcolor: "rgba(18, 18, 32, 0.95)",
    backdropFilter: "blur(24px)",
    border: `1px solid ${accentAlpha(0.25)}`,
    borderRadius: "16px",
    boxShadow: `0 8px 40px rgba(0, 0, 0, 0.6), 0 0 30px ${accentAlpha(0.08)}`,
    p: 2,
    display: "flex",
    flexDirection: "column",
    gap: 1.5,
};

const pillSx = {
    display: "inline-flex",
    alignItems: "center",
    px: 1.5,
    py: 0.6,
    borderRadius: "20px",
    bgcolor: accentAlpha(0.1),
    border: `1px solid ${accentAlpha(0.25)}`,
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
        bgcolor: accentAlpha(0.2),
        borderColor: accentAlpha(0.5),
        transform: "translateY(-1px)",
    },
    "&:active": {
        transform: "translateY(0)",
    },
};

const inputSx = {
    "& .MuiOutlinedInput-root": {
        borderRadius: "12px",
        bgcolor: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        fontSize: "0.9rem",
        "& fieldset": { border: "none" },
        "&:hover": {
            borderColor: accentAlpha(0.3),
        },
        "&.Mui-focused": {
            borderColor: accentAlpha(0.5),
        },
    },
    "& .MuiInputBase-input": {
        color: "#fff",
        py: 1.2,
        px: 1.5,
        "&::placeholder": {
            color: "rgba(255, 255, 255, 0.35)",
            opacity: 1,
        },
    },
};

// ─── Component ──────────────────────────────────────────────

export const ClarificationPopup = React.memo(function ClarificationPopup({
    data,
    onSubmit,
    onDismiss,
}: ClarificationPopupProps) {
    const [answer, setAnswer] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input
    useEffect(() => {
        const timer = setTimeout(() => inputRef.current?.focus(), 200);
        return () => clearTimeout(timer);
    }, []);

    const handleSubmitAnswer = useCallback(() => {
        const trimmed = answer.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
    }, [answer, onSubmit]);

    const handlePillClick = useCallback(
        (suggestion: string) => {
            onSubmit(suggestion);
        },
        [onSubmit]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmitAnswer();
            }
            if (e.key === "Escape") {
                onDismiss();
            }
        },
        [handleSubmitAnswer, onDismiss]
    );

    return (
        <Slide direction="up" in mountOnEnter unmountOnExit timeout={250}>
            <Box sx={popupContainerSx}>
                <Box sx={popupCardSx}>
                    {/* Header */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <BotIcon
                            sx={{
                                fontSize: 20,
                                color: accentAlpha(0.8),
                            }}
                        />
                        <Typography
                            sx={{
                                flexGrow: 1,
                                color: "rgba(255, 255, 255, 0.9)",
                                fontSize: "0.92rem",
                                fontWeight: 500,
                                lineHeight: 1.4,
                            }}
                        >
                            {data.question}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={onDismiss}
                            sx={{
                                color: "rgba(255, 255, 255, 0.3)",
                                p: 0.5,
                                "&:hover": { color: "rgba(255, 255, 255, 0.7)" },
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>

                    {/* Suggestion pills */}
                    {data.suggestions.length > 0 && (
                        <Box
                            sx={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 0.8,
                            }}
                        >
                            {data.suggestions.map((suggestion, i) => (
                                <Box
                                    key={i}
                                    onClick={() => handlePillClick(suggestion)}
                                    sx={pillSx}
                                >
                                    <Typography
                                        sx={{
                                            fontSize: "0.78rem",
                                            fontWeight: 500,
                                            color: "rgba(140, 100, 255, 0.9)",
                                            letterSpacing: "0.01em",
                                        }}
                                    >
                                        {suggestion}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}

                    {/* Free-text input */}
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Or type your own answer..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={handleKeyDown}
                        inputRef={inputRef}
                        sx={inputSx}
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={handleSubmitAnswer}
                                            disabled={!answer.trim()}
                                            sx={{
                                                color: answer.trim()
                                                    ? accentAlpha(0.8)
                                                    : "rgba(255, 255, 255, 0.15)",
                                                transition: "all 0.2s",
                                                "&:hover": {
                                                    color: "#fff",
                                                    bgcolor: accentAlpha(0.2),
                                                },
                                            }}
                                        >
                                            <SendIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Box>
            </Box>
        </Slide>
    );
});
