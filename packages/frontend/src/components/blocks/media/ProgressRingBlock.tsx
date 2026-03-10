// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — ProgressRingBlock
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { COLORS } from "../../ui/SharedUI";
import type { ProgressRingBlockSpec } from "../types";

export const ProgressRingBlock = React.memo(function ProgressRingBlock({
    value,
    max = 100,
    label,
    unit,
    color,
}: ProgressRingBlockSpec) {
    const percentage = Math.min(100, (value / max) * 100);
    const ringColor = color ?? COLORS.accent;
    const circumference = 2 * Math.PI * 40; // r=40
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <Box sx={{ textAlign: "center", py: 1 }}>
            <Box sx={{ position: "relative", display: "inline-flex" }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                    {/* Background ring */}
                    <circle
                        cx="50" cy="50" r="40"
                        fill="none"
                        stroke={COLORS.textFaint}
                        strokeWidth="6"
                    />
                    {/* Progress ring */}
                    <circle
                        cx="50" cy="50" r="40"
                        fill="none"
                        stroke={ringColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform="rotate(-90 50 50)"
                        style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
                    />
                </svg>
                <Box
                    sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        textAlign: "center",
                    }}
                >
                    <Typography
                        sx={{
                            fontWeight: 900,
                            fontSize: "1.2rem",
                            color: COLORS.textPrimary,
                            lineHeight: 1,
                        }}
                    >
                        {value}{unit && <span style={{ fontSize: "0.7rem", color: COLORS.textMuted }}>{unit}</span>}
                    </Typography>
                </Box>
            </Box>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, display: "block", mt: 0.5 }}>
                {label}
            </Typography>
        </Box>
    );
});
