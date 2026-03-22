// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — OmnibarInput (Text Field + Send + Voice Mock)
// ============================================================
// The input field component of the FloatingOmnibar.
// Handles text input, submit, voice button (Phase 2 mock).
// Takes snapshot on focus for race condition prevention.
// ============================================================

import React, { useCallback, type FormEvent } from "react";
import { Box, TextField, IconButton, InputAdornment, Tooltip, CircularProgress } from "@mui/material";
import {
    Send as SendIcon,
    Mic as MicIcon,
} from "@mui/icons-material";
import { ContextChip } from "./ContextChip";
import { useFocusStore } from "../../stores/useFocusStore";
import { COLORS, accentAlpha } from "../../theme/theme";

// ─── Styles (Design Tokens) ────────────────────────────────

const inputFieldSx = {
    "& .MuiOutlinedInput-root": {
        borderRadius: "16px",
        bgcolor: COLORS.bgPaper,
        border: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(24px)",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
        transition: "all 0.3s ease",
        fontSize: "0.95rem",
        "&:hover": {
            borderColor: COLORS.borderHover,
        },
        "&.Mui-focused": {
            borderColor: accentAlpha(0.5),
            boxShadow: `0 4px 24px rgba(0, 0, 0, 0.15), 0 0 0 2px ${accentAlpha(0.15)}`,
        },
        "& fieldset": { border: "none" },
    },
    "& .MuiInputBase-input": {
        color: COLORS.textPrimary,
        py: 1.5,
        px: 1.5,
        "&::placeholder": {
            color: COLORS.textMuted,
            opacity: 1,
        },
    },
};

// ─── Props ──────────────────────────────────────────────────

interface OmnibarInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (text: string) => void;
    isLoading: boolean;
    /** Pipeline feedback text (e.g. "Suche...", "Generating dashboard...") */
    statusText?: string;
    placeholder?: string;
    onFocus?: () => void;
    onBlur?: () => void;
}

// ─── Component ──────────────────────────────────────────────

export const OmnibarInput = React.memo(function OmnibarInput({
    value,
    onChange,
    onSubmit,
    isLoading,
    statusText,
    placeholder = "Ask Lura or type a command...",
    onFocus,
    onBlur,
}: OmnibarInputProps) {
    const takeSnapshot = useFocusStore((s) => s.takeSnapshot);

    const handleFormSubmit = useCallback(
        (e: FormEvent) => {
            e.preventDefault();
            const trimmed = value.trim();
            if (!trimmed || isLoading) return;
            onSubmit(trimmed);
        },
        [value, isLoading, onSubmit]
    );

    const handleFocus = useCallback(() => {
        takeSnapshot();
        onFocus?.();
    }, [takeSnapshot, onFocus]);

    return (
        <Box component="form" onSubmit={handleFormSubmit} sx={{ display: "flex", alignItems: "center", flex: 1, gap: 0 }}>
            <TextField
                fullWidth
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={onBlur}
                placeholder={isLoading ? (statusText || "Processing...") : placeholder}
                disabled={isLoading}
                autoComplete="off"
                id="omnibar-input"
                sx={{
                    ...inputFieldSx,
                    ...(isLoading && statusText ? {
                        "& .MuiInputBase-input::placeholder": {
                            color: accentAlpha(0.6),
                            opacity: 1,
                            animation: "omnibarPulse 1.5s ease-in-out infinite",
                        },
                        "@keyframes omnibarPulse": {
                            "0%, 100%": { opacity: 0.5 },
                            "50%": { opacity: 1 },
                        },
                    } : {}),
                }}
                slotProps={{
                    input: {
                        startAdornment: (
                            <InputAdornment position="start" sx={{ ml: 0.5 }}>
                                <ContextChip />
                            </InputAdornment>
                        ),
                        endAdornment: (
                            <InputAdornment position="end">
                                {isLoading ? (
                                    <CircularProgress
                                        size={20}
                                        sx={{ color: accentAlpha(0.7), mr: 0.5 }}
                                    />
                                ) : (
                                    <>
                                        <IconButton
                                            type="submit"
                                            disabled={!value.trim()}
                                            id="omnibar-submit"
                                            sx={{
                                                color: value.trim()
                                                    ? "#007AFF"
                                                    : COLORS.textFaint,
                                                transition: "all 0.2s ease",
                                                "&:hover": {
                                                    color: "#fff",
                                                    bgcolor: "rgba(0, 122, 255, 0.15)",
                                                },
                                            }}
                                        >
                                            <SendIcon sx={{ fontSize: 20 }} />
                                        </IconButton>
                                        <Tooltip title="Voice input (coming soon)" placement="top">
                                            <span>
                                                <IconButton
                                                    disabled
                                                    id="omnibar-voice"
                                                    sx={{
                                                        color: COLORS.textFaint,
                                                        opacity: 0.4,
                                                    }}
                                                >
                                                    <MicIcon sx={{ fontSize: 20 }} />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </>
                                )}
                            </InputAdornment>
                        ),
                    },
                }}
            />
        </Box>
    );
});
