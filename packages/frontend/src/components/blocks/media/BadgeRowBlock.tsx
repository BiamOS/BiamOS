// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — BadgeRowBlock
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { COLORS, SectionLabel, accentAlpha } from "../../ui/SharedUI";
import type { BadgeRowBlockSpec } from "../types";

export const BadgeRowBlock = React.memo(function BadgeRowBlock({
    badges = [],
    label,
}: BadgeRowBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {badges.map((badge, i) => (
                    <Box
                        key={i}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                            px: 1.5,
                            py: 0.8,
                            borderRadius: 2,
                            bgcolor: badge.color
                                ? `${badge.color}15`
                                : accentAlpha(0.08),
                            border: `1px solid ${badge.color
                                ? `${badge.color}30`
                                : accentAlpha(0.15)}`,
                        }}
                    >
                        {badge.icon && (
                            <Typography sx={{ fontSize: "1rem" }}>{badge.icon}</Typography>
                        )}
                        <Box>
                            <Typography
                                variant="caption"
                                sx={{ color: COLORS.textMuted, fontSize: "0.6rem", display: "block", textTransform: "uppercase", letterSpacing: "0.05em" }}
                            >
                                {badge.label}
                            </Typography>
                            {badge.value !== undefined && (
                                <Typography
                                    variant="body2"
                                    sx={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: "0.85rem", lineHeight: 1 }}
                                >
                                    {badge.value}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
});
