// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — ContextChip (Lura Anchor Indicator)
// ============================================================
// Shows which card Lura is mentally bound to.
// IMPORTANT: reads lastKnownCardMeta (not activeCardMeta) so
// the chip stays visible even when the card loses live focus.
// The X button does a HARD RESET — killing the lastKnown anchor
// completely so Lura is truly detached from the card.
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
        color: "#FF453A",
        bgcolor: "rgba(255, 69, 58, 0.15)",
    },
    transition: "all 0.15s ease",
};

// ─── Component ──────────────────────────────────────────────

export const ContextChip = React.memo(function ContextChip() {
    // Read the STICKY ANCHOR (lastKnownCardMeta), not the live activeCardMeta.
    // This keeps the chip visible even when the card loses click-focus,
    // so the user always sees what Lura is bound to.
    const anchorMeta = useFocusStore((s) => s.lastKnownCardMeta);

    if (!anchorMeta) return null;

    const hardReset = () => {
        // Kill ALL context — live focus, sticky anchor, and snapshot.
        // This is the explicit "detach Lura from this card" action.
        useFocusStore.setState({
            activeCardId: null,
            activeCardMeta: null,
            lastKnownCardId: null,
            lastKnownCardMeta: null,
            snapshotCardId: null,
            snapshotCardMeta: null,
        });
    };

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
                {anchorMeta.label}
            </Typography>
            <IconButton
                size="small"
                title="Detach Lura from this card"
                onClick={(e) => {
                    e.stopPropagation();
                    hardReset();
                }}
                sx={closeBtnSx}
            >
                <CloseIcon sx={{ fontSize: 12 }} />
            </IconButton>
        </Box>
    );
});
