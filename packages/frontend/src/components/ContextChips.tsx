// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Chips (Floating Quick-Action Suggestions)
// ============================================================
// Renders context-aware AI suggestions as clickable chips above
// the input bar. Listens for "biamos:context-hints" events from
// any active webview's useContextWatcher hook.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

// ─── Types ──────────────────────────────────────────────────

interface ContextChipHint {
    query: string;
    reason: string;
}

interface ContextChipsProps {
    onChipClick: (query: string) => void;
}

// ─── Component ──────────────────────────────────────────────

export const ContextChips = React.memo(function ContextChips({
    onChipClick,
}: ContextChipsProps) {
    const [hints, setHints] = useState<ContextChipHint[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    // Listen for context-hints events from webviews
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail?.hints || !Array.isArray(detail.hints)) return;
            const newHints: ContextChipHint[] = detail.hints
                .filter((h: any) => h.query && h.reason)
                .slice(0, 3);
            setHints(newHints);
            // Reset dismissed set when new hints come in from a new page
            setDismissed(new Set());
        };

        window.addEventListener("biamos:context-hints", handler);
        return () => window.removeEventListener("biamos:context-hints", handler);
    }, []);

    // Clear hints on navigation events (new webview card)
    useEffect(() => {
        const clearHandler = () => {
            setHints([]);
            setDismissed(new Set());
        };
        window.addEventListener("biamos:context-hints-clear", clearHandler);
        return () => window.removeEventListener("biamos:context-hints-clear", clearHandler);
    }, []);

    const handleClick = useCallback((query: string) => {
        onChipClick(query);
        setDismissed((prev) => new Set(prev).add(query));
    }, [onChipClick]);

    const visibleHints = hints.filter((h) => !dismissed.has(h.query));
    if (visibleHints.length === 0) return null;

    return (
        <Box
            sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.8,
                mb: 1,
                px: 0.5,
                alignItems: "center",
            }}
        >
            {/* Label */}
            <Box sx={{
                display: "flex", alignItems: "center", gap: 0.4,
                opacity: 0.5,
            }}>
                <AutoAwesomeIcon sx={{ fontSize: 12, color: "#00d4ff" }} />
                <Typography sx={{
                    fontSize: "0.58rem", fontWeight: 600,
                    color: "rgba(0, 212, 255, 0.6)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                }}>
                    Suggestions
                </Typography>
            </Box>

            {/* Chips */}
            {visibleHints.map((hint, i) => (
                <Tooltip
                    key={hint.query}
                    title={`💡 ${hint.reason}`}
                    arrow
                    placement="top"
                >
                    <Box
                        onClick={() => handleClick(hint.query)}
                        sx={{
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 3,
                            bgcolor: "rgba(0, 212, 255, 0.08)",
                            border: "1px solid rgba(0, 212, 255, 0.18)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            animation: `chipFadeIn 0.4s ease-out ${i * 0.12}s both`,
                            "@keyframes chipFadeIn": {
                                "0%": { opacity: 0, transform: "translateY(8px) scale(0.95)" },
                                "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
                            },
                            "&:hover": {
                                bgcolor: "rgba(0, 212, 255, 0.16)",
                                borderColor: "rgba(0, 212, 255, 0.35)",
                                transform: "translateY(-1px)",
                                boxShadow: "0 2px 8px rgba(0, 212, 255, 0.15)",
                            },
                            "&:active": {
                                transform: "scale(0.97)",
                            },
                        }}
                    >
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "#e0f0ff",
                                whiteSpace: "nowrap",
                                lineHeight: 1.2,
                            }}
                        >
                            {hint.query}
                        </Typography>
                    </Box>
                </Tooltip>
            ))}
        </Box>
    );
});
