// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — List Blocks (Apple-Style)
// chip_list, list, grid
// ============================================================

import React from "react";
import { Box, Chip, List, ListItem, ListItemText, ListItemIcon } from "@mui/material";
import { COLORS, SectionLabel, accentAlpha } from "../ui/SharedUI";
import { dispatchLinkOpen } from "../LinkPrompt";
import { useCardGroup } from "../../contexts/CardGroupContext";
import { GLASS } from "../../theme/theme";
import type { ChipListBlockSpec, ListBlockSpec, GridBlockSpec, BlockSpec } from "./types";

// ─── CHIP LIST ──────────────────────────────────────────────

type ChipColor = "primary" | "secondary" | "success" | "error" | "warning" | "info";

const chipPalette: Record<ChipColor, { bg: string; fg: string; border: string }> = {
    primary: { bg: accentAlpha(0.1), fg: "rgba(180, 140, 255, 0.9)", border: accentAlpha(0.2) },
    secondary: { bg: "rgba(0, 200, 255, 0.08)", fg: "rgba(0, 220, 255, 0.9)", border: "rgba(0, 200, 255, 0.2)" },
    success: { bg: "rgba(0, 220, 100, 0.08)", fg: "rgba(0, 220, 100, 0.9)", border: "rgba(0, 220, 100, 0.2)" },
    error: { bg: "rgba(255, 80, 80, 0.08)", fg: "rgba(255, 100, 100, 0.9)", border: "rgba(255, 80, 80, 0.2)" },
    warning: { bg: "rgba(255, 180, 0, 0.08)", fg: "rgba(255, 200, 50, 0.9)", border: "rgba(255, 180, 0, 0.2)" },
    info: { bg: "rgba(33, 150, 243, 0.08)", fg: "rgba(100, 180, 255, 0.9)", border: "rgba(33, 150, 243, 0.2)" },
};

export const ChipListBlock = React.memo(function ChipListBlock({
    items = [],
    color = "primary",
    label,
}: ChipListBlockSpec) {
    const pal = chipPalette[color] ?? chipPalette.primary;
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                {items.map((item, i) => (
                    <Chip
                        key={i}
                        label={item}
                        size="small"
                        sx={{
                            bgcolor: pal.bg,
                            color: pal.fg,
                            border: `1px solid ${pal.border}`,
                            borderRadius: "99px",
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textTransform: "capitalize",
                            backdropFilter: "blur(8px)",
                            transition: "all 0.25s ease",
                            "&:hover": {
                                transform: "translateY(-1px)",
                                boxShadow: `0 2px 8px ${pal.border}`,
                            },
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
});

// ─── LIST ───────────────────────────────────────────────────

export const ListBlock = React.memo(function ListBlock({
    items = [],
    label,
}: ListBlockSpec) {
    const groupName = useCardGroup();
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <List dense disablePadding>
                {items.map((item, i) => {
                    const isLink = !!item.url;
                    const handleClick = isLink ? (e: React.MouseEvent) => {
                        e.preventDefault();
                        dispatchLinkOpen(item.url!, item.primary, groupName);
                    } : undefined;

                    const itemContent = (
                        <ListItem
                            key={i}
                            onClick={handleClick}
                            sx={{
                                px: 1.5,
                                py: 1,
                                borderRadius: "14px",
                                mb: 0.6,
                                bgcolor: "rgba(255,255,255,0.02)",
                                border: "1px solid rgba(255,255,255,0.04)",
                                backdropFilter: "blur(8px)",
                                transition: "all 0.25s ease",
                                textDecoration: "none",
                                cursor: isLink ? "pointer" : "default",
                                "&:hover": {
                                    bgcolor: "rgba(255,255,255,0.04)",
                                    transform: isLink ? "translateX(4px)" : "translateX(3px)",
                                    borderColor: isLink ? accentAlpha(0.2) : "rgba(255,255,255,0.08)",
                                },
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 24 }}>
                                <Box
                                    sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        bgcolor: isLink ? COLORS.accent : COLORS.cyan,
                                        boxShadow: `0 0 6px ${isLink ? COLORS.accent : COLORS.cyan}40`,
                                    }}
                                />
                            </ListItemIcon>
                            <ListItemText
                                primary={item.primary}
                                secondary={item.secondary}
                                primaryTypographyProps={{
                                    sx: {
                                        color: COLORS.textPrimary,
                                        fontSize: "0.875rem",
                                        fontWeight: 500,
                                        letterSpacing: "-0.01em",
                                    },
                                }}
                                secondaryTypographyProps={{
                                    sx: { color: COLORS.textMuted, fontSize: "0.75rem" },
                                }}
                            />
                            {item.badge && (
                                <Chip
                                    label={item.badge}
                                    size="small"
                                    sx={{
                                        bgcolor: "rgba(255, 180, 0, 0.08)",
                                        color: "rgba(255, 200, 50, 0.9)",
                                        border: "1px solid rgba(255, 180, 0, 0.2)",
                                        borderRadius: "99px",
                                        fontSize: "0.65rem",
                                        height: 20,
                                        fontWeight: 600,
                                    }}
                                />
                            )}
                            {isLink && (
                                <Box sx={{ ml: 0.5, color: COLORS.textMuted, fontSize: "0.75rem", opacity: 0.5 }}>↗</Box>
                            )}
                        </ListItem>
                    );
                    return itemContent;
                })}
            </List>
        </Box>
    );
});

// ─── GRID (recursive, responsive columns) ──────────────────

let _RenderBlock: React.ComponentType<{ block: BlockSpec }> | null = null;
export function setRenderBlock(component: React.ComponentType<{ block: BlockSpec }>) {
    _RenderBlock = component;
}

export const GridBlock = React.memo(function GridBlock({
    columns = 2,
    blocks = [],
}: GridBlockSpec) {
    const RB = _RenderBlock;
    return (
        <Box
            sx={{
                display: "grid",
                gridTemplateColumns: `repeat(auto-fit, minmax(min(${Math.floor(100 / columns) - 5}%, 180px), 1fr))`,
                gap: 1.5,
                alignItems: "start",
            }}
        >
            {blocks.map((block, i) => (
                RB ? <RB key={i} block={block} /> : null
            ))}
        </Box>
    );
});
