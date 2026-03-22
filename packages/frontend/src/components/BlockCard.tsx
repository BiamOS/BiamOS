// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Card (grid item) + Imports Reference
// ============================================================
// Extracted from BlockManager.tsx for maintainability.
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    Chip,
    Card,
    CardContent,
    Collapse,
} from "@mui/material";
import {
    Code as CodeIcon,
    ExpandMore as ExpandIcon,
} from "@mui/icons-material";
import { RenderBlock } from "./blocks/BlockRenderer";
import type { BlockSpec } from "./blocks/types";
import { COLORS, cardSx, sectionLabelSx, accentAlpha } from "./ui/SharedUI";
import type { BlockMeta } from "./BlockManager";
import { SAMPLE_PROPS, CATEGORY_CONFIG } from "./BlockManager";

// ============================================================
// Block Card (grid item)
// ============================================================

export const BlockCard = React.memo(function BlockCard({
    block,
    onClick,
}: {
    block: BlockMeta;
    onClick: () => void;
}) {
    const cat = CATEGORY_CONFIG[block.category];
    const sampleProps = SAMPLE_PROPS[block.type];

    return (
        <Card
            sx={{
                ...cardSx,
                cursor: "pointer",
                transition: "all 0.3s ease",
                "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: `0 8px 32px ${accentAlpha(0.15)}`,
                    borderColor: accentAlpha(0.3),
                },
            }}
            onClick={onClick}
        >
            <CardContent sx={{ p: 2, pb: "12px !important", overflow: "hidden" }}>
                {/* Mini Preview */}
                <Box
                    sx={{
                        mb: 1.5,
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: "rgba(0, 0, 0, 0.25)",
                        border: "1px solid rgba(255,255,255,0.03)",
                        overflow: "hidden",
                        maxHeight: 120,
                        pointerEvents: "none",
                        transform: "scale(0.85)",
                        transformOrigin: "top left",
                    }}
                >
                    {sampleProps ? (
                        <RenderBlock block={sampleProps} />
                    ) : (
                        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                            No preview
                        </Typography>
                    )}
                </Box>

                {/* Block Info */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5, flexWrap: "wrap" }}>
                    <CodeIcon sx={{ fontSize: 14, color: cat.color }} />
                    <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45%" }}
                    >
                        {block.type}
                    </Typography>
                    {block.isCustom && (
                        <Chip
                            size="small"
                            label="Custom"
                            sx={{
                                height: 16,
                                bgcolor: "rgba(0, 220, 100, 0.08)",
                                color: "rgba(0, 220, 100, 0.8)",
                                border: "1px solid rgba(0, 220, 100, 0.15)",
                                fontSize: "0.55rem",
                            }}
                        />
                    )}
                    <Chip
                        size="small"
                        icon={cat.icon}
                        label={cat.label}
                        sx={{
                            ml: "auto",
                            height: 20,
                            bgcolor: `${cat.color.replace("0.7", "0.08")}`,
                            color: cat.color,
                            border: `1px solid ${cat.color.replace("0.7", "0.15")}`,
                            fontSize: "0.6rem",
                            "& .MuiChip-icon": { color: cat.color, fontSize: 12 },
                        }}
                    />
                </Box>
                <Typography
                    variant="caption"
                    sx={{ color: COLORS.textSecondary, fontSize: "0.72rem" }}
                >
                    {block.description}
                </Typography>
            </CardContent>
        </Card>
    );
});

// ============================================================
// Available Imports Panel (collapsible reference)
// ============================================================

export const ImportsReference = React.memo(function ImportsReference() {
    const [open, setOpen] = useState(false);

    return (
        <Box sx={{ mt: 1.5 }}>
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    cursor: "pointer",
                    "&:hover": { opacity: 0.8 },
                }}
            >
                <ExpandIcon
                    sx={{
                        fontSize: 16,
                        color: COLORS.textMuted,
                        transform: open ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s",
                    }}
                />
                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Available Imports
                </Typography>
            </Box>
            <Collapse in={open}>
                <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, bgcolor: "rgba(0,0,0,0.2)", border: `1px solid ${COLORS.border}`, fontSize: "0.7rem", fontFamily: "'JetBrains Mono', monospace", color: COLORS.textMuted, lineHeight: 1.8 }}>
                    <Typography variant="caption" sx={{ color: "rgba(88,28,255,0.6)", fontWeight: 700, display: "block", mb: 0.5 }}>MUI Components</Typography>
                    Box, Typography, Chip, Button,{"\n"}
                    Grid, Card, CardContent,{"\n"}
                    Table, TableRow, TableCell,{"\n"}
                    List, ListItem, Avatar, Tooltip,{"\n"}
                    LinearProgress, CircularProgress{"\n"}

                    <Typography variant="caption" sx={{ color: "rgba(0,200,255,0.6)", fontWeight: 700, display: "block", mt: 1, mb: 0.5 }}>Design Tokens</Typography>
                    COLORS.accent <span style={{ color: COLORS.accent }}>■</span>{" "}
                    COLORS.accentLight <span style={{ color: COLORS.accentLight }}>■</span>{"\n"}
                    COLORS.textPrimary{"\n"}
                    COLORS.textSecondary{"\n"}
                    COLORS.textMuted{"\n"}
                    COLORS.surfaceSubtle{"\n"}
                    COLORS.surfaceFaint{"\n"}
                    COLORS.borderFaint{"\n"}
                    SectionLabel {"(component)"}{"\n"}

                    <Typography variant="caption" sx={{ color: "rgba(0,220,100,0.6)", fontWeight: 700, display: "block", mt: 1, mb: 0.5 }}>Pattern</Typography>
                    {"React.memo(function Xxx({...}: XxxSpec) {"}{"\n"}
                    {"  return <Box>...</Box>;"}{"\n"}
                    {"});"}
                </Box>
            </Collapse>
        </Box>
    );
});
