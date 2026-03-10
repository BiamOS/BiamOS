// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — QuoteBlock
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { FormatQuote as QuoteIcon } from "@mui/icons-material";
import { COLORS } from "../../ui/SharedUI";
import type { QuoteBlockSpec } from "../types";

export const QuoteBlock = React.memo(function QuoteBlock({
    text,
    author,
}: QuoteBlockSpec) {
    return (
        <Box
            sx={{
                pl: 2,
                py: 1,
                borderLeft: `3px solid rgba(0, 200, 255, 0.5)`,
                bgcolor: "rgba(0, 200, 255, 0.03)",
                borderRadius: "0 8px 8px 0",
            }}
        >
            <Box sx={{ display: "flex", gap: 0.5 }}>
                <QuoteIcon sx={{ color: "rgba(0, 200, 255, 0.3)", fontSize: 18, mt: 0.2 }} />
                <Typography
                    variant="body2"
                    sx={{ color: COLORS.textSecondary, fontStyle: "italic", lineHeight: 1.6 }}
                >
                    {text}
                </Typography>
            </Box>
            {author && (
                <Typography
                    variant="caption"
                    sx={{ color: COLORS.textMuted, mt: 0.5, display: "block", pl: 3 }}
                >
                    — {author}
                </Typography>
            )}
        </Box>
    );
});
