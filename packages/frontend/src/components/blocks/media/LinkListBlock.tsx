// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — LinkListBlock
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { OpenInNew as LinkIcon } from "@mui/icons-material";
import { COLORS, SectionLabel, accentAlpha } from "../../ui/SharedUI";
import type { LinkListBlockSpec } from "../types";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useCardGroup } from "../../../contexts/CardGroupContext";

export const LinkListBlock = React.memo(function LinkListBlock({
    links = [],
    label,
}: LinkListBlockSpec) {
    const navigate = useNavigation();
    const groupName = useCardGroup();

    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                {links.map((link, i) => (
                    <Box
                        key={i}
                        onClick={(e: React.MouseEvent) => {
                            if (e.ctrlKey || e.metaKey) { window.open(link.url, "_blank"); return; }
                            navigate(link.url, link.label, groupName);
                        }}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 1,
                            borderRadius: 2,
                            bgcolor: COLORS.surfaceFaint,
                            border: `1px solid ${COLORS.borderFaint}`,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            "&:hover": {
                                bgcolor: accentAlpha(0.06),
                                borderColor: accentAlpha(0.2),
                            },
                        }}
                    >
                        <LinkIcon sx={{ fontSize: 16, color: "rgba(0, 200, 255, 0.6)" }} />
                        <Box sx={{ flex: 1 }}>
                            <Typography
                                variant="body2"
                                sx={{ color: "rgba(0, 200, 255, 0.9)", fontWeight: 600, fontSize: "0.85rem" }}
                            >
                                {link.label}
                            </Typography>
                            {link.description && (
                                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.7rem" }}>
                                    {link.description}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
});
