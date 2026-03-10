// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — CodeBlock
// ============================================================

import React from "react";
import { Box, Chip } from "@mui/material";
import { COLORS, SectionLabel , accentAlpha } from "../../ui/SharedUI";
import type { CodeBlockSpec } from "../types";

export const CodeBlock = React.memo(function CodeBlock({
    content,
    language,
    label,
}: CodeBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box
                sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: "rgba(0, 0, 0, 0.3)",
                    border: `1px solid ${COLORS.borderFaint}`,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: "0.78rem",
                    lineHeight: 1.6,
                    color: "rgba(0, 220, 255, 0.85)",
                    whiteSpace: "pre-wrap",
                    overflowX: "auto",
                }}
            >
                {language && (
                    <Chip
                        label={language}
                        size="small"
                        sx={{
                            bgcolor: accentAlpha(0.1),
                            color: accentAlpha(0.7),
                            fontSize: "0.6rem",
                            height: 18,
                            mb: 1,
                        }}
                    />
                )}
                {content}
            </Box>
        </Box>
    );
});
