// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — ContextChip (Focus Indicator)
// ============================================================
// Shows which card is currently focused in the Omnibar.
// Data comes from useFocusStore — never hardcodes card info.
// ============================================================

import React from "react";
import { Box, Typography, IconButton } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useFocusStore } from "../../stores/useFocusStore";
import { accentAlpha } from "../ui/SharedUI";

// ─── Styles (Design Tokens only) ───────────────────────────

const chipSx = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    px: 1.2,
    py: 0.4,
    borderRadius: "10px",
    bgcolor: "rgba(0, 122, 255, 0.12)",
    border: "1px solid rgba(0, 122, 255, 0.25)",
    transition: "all 0.2s ease",
    animation: "fadeInScale 0.2s ease-out",
    "@keyframes fadeInScale": {
        "0%": { opacity: 0, transform: "scale(0.9)" },
        "100%": { opacity: 1, transform: "scale(1)" },
    },
};

const closeBtnSx = {
    p: 0.2,
    ml: 0.2,
    color: "rgba(0, 122, 255, 0.5)",
    "&:hover": {
        color: "rgba(0, 122, 255, 0.9)",
        bgcolor: "rgba(0, 122, 255, 0.1)",
    },
};

// ─── Component ──────────────────────────────────────────────

export const ContextChip = React.memo(function ContextChip() {
    const activeCardMeta = useFocusStore((s) => s.activeCardMeta);
    const clearFocus = useFocusStore((s) => s.clearFocus);

    if (!activeCardMeta) return null;

    return (
        <Box sx={chipSx}>
            <Typography sx={{ fontSize: "0.85rem", lineHeight: 1 }}>
                🎯
            </Typography>
            <Typography
                sx={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "rgba(0, 122, 255, 0.9)",
                    whiteSpace: "nowrap",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {activeCardMeta.label}
            </Typography>
            <IconButton
                size="small"
                onClick={(e) => {
                    e.stopPropagation();
                    clearFocus();
                }}
                sx={closeBtnSx}
            >
                <CloseIcon sx={{ fontSize: 12 }} />
            </IconButton>
        </Box>
    );
});
