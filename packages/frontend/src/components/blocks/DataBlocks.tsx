// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Data Blocks (Apple-Style)
// hero, key_value, stat_bar, table, metric_row, rating, timeline
// ============================================================

import React from "react";
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import { COLORS, GRADIENTS, SectionLabel } from "../ui/SharedUI";
import { GLASS, SHADOWS } from "../../theme/theme";
import { useCardContext } from "./CardContext";
import type {
    HeroBlockSpec,
    KeyValueBlockSpec,
    StatBarBlockSpec,
    TableBlockSpec,
    MetricRowBlockSpec,
    RatingBlockSpec,
    TimelineBlockSpec,
} from "./types";

// ─── HERO ───────────────────────────────────────────────────

export const HeroBlock = React.memo(function HeroBlock({
    value,
    label,
    unit,
    gradient,
    blockId,
}: HeroBlockSpec) {
    const cardCtx = useCardContext();
    const g = gradient ?? [COLORS.accent, COLORS.cyan];

    const dynamicResult = blockId && cardCtx ? cardCtx.results[blockId] : undefined;
    const isLoading = blockId && cardCtx ? cardCtx.loading[blockId] : false;
    const error = blockId && cardCtx ? cardCtx.errors[blockId] : null;

    const displayValue = error
        ? "⚠️"
        : isLoading
            ? "..."
            : dynamicResult !== undefined
                ? String(dynamicResult)
                : value;

    const displayLabel = error ?? label;

    return (
        <Box sx={{ textAlign: "center", py: 1 }}>
            <Typography
                sx={{
                    fontWeight: 900,
                    fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
                    letterSpacing: "-0.04em",
                    lineHeight: 1.05,
                    background: error
                        ? "linear-gradient(135deg, #ff5252, #ff8a80)"
                        : `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    display: "inline",
                    transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    filter: error ? "none" : "drop-shadow(0 2px 8px rgba(88,28,255,0.15))",
                }}
            >
                {displayValue}
            </Typography>
            {unit && !error && (
                <Typography
                    component="span"
                    sx={{
                        color: COLORS.textMuted,
                        fontSize: "clamp(0.75rem, 1.5vw, 1rem)",
                        ml: 0.5,
                        fontWeight: 500,
                    }}
                >
                    {unit}
                </Typography>
            )}
            <Typography
                variant="body2"
                sx={{
                    color: error ? "#ff8a80" : COLORS.textMuted,
                    mt: 0.5,
                    fontSize: "0.8rem",
                    letterSpacing: "0.02em",
                }}
            >
                {displayLabel}
            </Typography>
        </Box>
    );
});

// ─── KEY VALUE ──────────────────────────────────────────────

export const KeyValueBlock = React.memo(function KeyValueBlock({
    pairs,
    columns = 2,
    label,
}: KeyValueBlockSpec) {
    const safePairs = Array.isArray(pairs) ? pairs : [];
    if (safePairs.length === 0) return null;
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Grid container spacing={1.2} columns={12}>
                {safePairs.map((pair, i) => (
                    <Grid size={12 / columns} key={i}>
                        <Box
                            sx={{
                                ...GLASS.subtle,
                                p: 1.2,
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    borderColor: "rgba(255,255,255,0.1)",
                                    transform: "translateY(-1px)",
                                },
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: COLORS.textMuted,
                                    fontWeight: 500,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    display: "block",
                                    fontSize: "0.62rem",
                                    mb: 0.5,
                                }}
                            >
                                {pair.key}
                            </Typography>
                            <Typography
                                variant="body1"
                                sx={{
                                    color: "rgba(255, 255, 255, 0.92)",
                                    fontWeight: 700,
                                    fontSize: "0.85rem",
                                    lineHeight: 1.3,
                                }}
                            >
                                {pair.value}
                            </Typography>
                        </Box>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
});

// ─── STAT BAR ───────────────────────────────────────────────

export const StatBarBlock = React.memo(function StatBarBlock({
    items,
    label,
}: StatBarBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {items.map((stat, i) => {
                    const max = stat.max ?? 100;
                    const percentage = Math.min(100, (stat.value / max) * 100);
                    return (
                        <Box key={i}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: COLORS.textSecondary,
                                        fontWeight: 500,
                                        textTransform: "capitalize",
                                        fontSize: "0.78rem",
                                    }}
                                >
                                    {stat.label}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ color: COLORS.textPrimary, fontWeight: 700, fontSize: "0.78rem" }}
                                >
                                    {stat.value}
                                </Typography>
                            </Box>
                            <Box
                                sx={{
                                    height: 8,
                                    bgcolor: "rgba(255,255,255,0.04)",
                                    borderRadius: "99px",
                                    overflow: "hidden",
                                }}
                            >
                                <Box
                                    sx={{
                                        height: "100%",
                                        width: `${percentage}%`,
                                        background: GRADIENTS.accent,
                                        borderRadius: "99px",
                                        transition: "width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                                        boxShadow: `0 0 12px ${COLORS.accent}40`,
                                    }}
                                />
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
});

// ─── TABLE ──────────────────────────────────────────────────

const tableHeaderCellSx = {
    color: COLORS.textMuted,
    fontWeight: 600,
    fontSize: "0.72rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    borderColor: "rgba(255,255,255,0.04)",
    py: 1.2,
};

const tableCellSx = {
    color: "rgba(255, 255, 255, 0.85)",
    borderColor: "rgba(255, 255, 255, 0.03)",
    fontSize: "0.85rem",
    py: 1.2,
};

export const TableBlock = React.memo(function TableBlock({
    headers,
    rows,
    label,
}: TableBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <TableContainer
                sx={{
                    ...GLASS.surface,
                    overflow: "hidden",
                }}
            >
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            {headers.map((h, i) => (
                                <TableCell key={i} sx={tableHeaderCellSx}>
                                    {h}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, ri) => (
                            <TableRow
                                key={ri}
                                sx={{
                                    "&:nth-of-type(even)": {
                                        bgcolor: "rgba(255,255,255,0.01)",
                                    },
                                    "&:hover": {
                                        bgcolor: "rgba(255,255,255,0.03)",
                                    },
                                    transition: "background-color 0.2s ease",
                                }}
                            >
                                {row.map((cell, ci) => (
                                    <TableCell key={ci} sx={tableCellSx}>
                                        {cell}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
});

// ─── METRIC ROW ─────────────────────────────────────────────

export const MetricRowBlock = React.memo(function MetricRowBlock({
    metrics,
}: MetricRowBlockSpec) {
    return (
        <Box sx={{ display: "flex", gap: 1.2, flexWrap: "wrap" }}>
            {metrics.map((m, i) => (
                <Box
                    key={i}
                    sx={{
                        flex: 1,
                        minWidth: 90,
                        textAlign: "center",
                        ...GLASS.subtle,
                        p: 1.3,
                        transition: "all 0.3s ease",
                        "&:hover": {
                            borderColor: "rgba(255,255,255,0.1)",
                            transform: "translateY(-2px)",
                            boxShadow: SHADOWS.sm,
                        },
                    }}
                >
                    {m.icon && (
                        <Typography sx={{ fontSize: "1rem", mb: 0.3, lineHeight: 1 }}>
                            {m.icon}
                        </Typography>
                    )}
                    <Typography
                        sx={{
                            fontWeight: 800,
                            fontSize: "0.95rem",
                            color: COLORS.textPrimary,
                            lineHeight: 1.2,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {m.value}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: COLORS.textMuted,
                            display: "block",
                            fontSize: "0.58rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            mt: 0.5,
                            fontWeight: 500,
                        }}
                    >
                        {m.label}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
});

// ─── RATING ─────────────────────────────────────────────────

export const RatingBlock = React.memo(function RatingBlock({
    value,
    max = 5,
    label,
    count,
}: RatingBlockSpec) {
    const stars = [];
    for (let i = 1; i <= max; i++) {
        const filled = i <= Math.floor(value);
        const half = !filled && i - value < 1 && i - value > 0;
        stars.push(
            <Typography
                key={i}
                component="span"
                sx={{
                    fontSize: "1.4rem",
                    color: filled
                        ? "#FFD700"
                        : half
                            ? "rgba(255, 215, 0, 0.4)"
                            : "rgba(255,255,255,0.1)",
                    transition: "all 0.2s ease",
                    display: "inline-block",
                    filter: filled ? "drop-shadow(0 1px 3px rgba(255,215,0,0.3))" : "none",
                    "&:hover": { transform: "scale(1.15)" },
                }}
            >
                ★
            </Typography>
        );
    }

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
            <Box sx={{ display: "flex", gap: 0.3 }}>{stars}</Box>
            <Typography sx={{ fontWeight: 800, color: COLORS.textPrimary, fontSize: "1.15rem", letterSpacing: "-0.02em" }}>
                {value}
            </Typography>
            {count && (
                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>
                    ({count})
                </Typography>
            )}
            {label && (
                <Typography variant="caption" sx={{ color: COLORS.textMuted, ml: "auto", fontSize: "0.75rem" }}>
                    {label}
                </Typography>
            )}
        </Box>
    );
});

// ─── TIMELINE ───────────────────────────────────────────────

export const TimelineBlock = React.memo(function TimelineBlock({
    events,
    label,
}: TimelineBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ position: "relative", pl: 3.5 }}>
                {/* Vertical line */}
                <Box
                    sx={{
                        position: "absolute",
                        left: 9,
                        top: 6,
                        bottom: 6,
                        width: 2.5,
                        background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.cyan}40)`,
                        borderRadius: "99px",
                    }}
                />
                {events.map((ev, i) => (
                    <Box key={i} sx={{ position: "relative", mb: 2.5, "&:last-child": { mb: 0 } }}>
                        {/* Dot */}
                        <Box
                            sx={{
                                position: "absolute",
                                left: -23,
                                top: 5,
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                bgcolor: i === 0 ? COLORS.cyan : COLORS.accent,
                                border: "2.5px solid rgba(10, 10, 15, 0.95)",
                                boxShadow: `0 0 10px ${i === 0 ? COLORS.cyan : COLORS.accent}50`,
                                transition: "box-shadow 0.3s ease",
                            }}
                        />
                        <Box
                            sx={{
                                ...GLASS.subtle,
                                p: 1.5,
                                transition: "all 0.3s ease",
                                "&:hover": {
                                    borderColor: "rgba(255,255,255,0.08)",
                                    transform: "translateX(2px)",
                                },
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: COLORS.cyan,
                                    fontWeight: 600,
                                    fontSize: "0.68rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.06em",
                                }}
                            >
                                {ev.time}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: COLORS.textPrimary,
                                    fontWeight: 700,
                                    mt: 0.3,
                                    fontSize: "0.875rem",
                                }}
                            >
                                {ev.title}
                            </Typography>
                            {ev.description && (
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: COLORS.textMuted,
                                        display: "block",
                                        mt: 0.3,
                                        lineHeight: 1.5,
                                        fontSize: "0.78rem",
                                    }}
                                >
                                    {ev.description}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
});
