// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Health Dashboard Components
// ============================================================
// Extracted from IntegrationStore.tsx — health status banner,
// loading bar, and collapsible health monitor.
// ============================================================

import React, { useMemo } from "react";
import {
    Box,
    Typography,
    Tooltip,
    LinearProgress,
    Collapse,
} from "@mui/material";
import { KeyboardArrowDown as ArrowDownIcon } from "@mui/icons-material";
import { COLORS, accentAlpha } from "./ui/SharedUI";
import type { HealthResult, HealthHistoryEntry } from "../types/integration";

// ============================================================
// Health Check Loading Bar
// ============================================================

export const HealthCheckLoading = React.memo(function HealthCheckLoading() {
    return (
        <Box sx={{ mb: 2 }}>
            <LinearProgress
                sx={{
                    borderRadius: 2,
                    height: 3,
                    bgcolor: "rgba(0, 220, 100, 0.08)",
                    "& .MuiLinearProgress-bar": {
                        bgcolor: "#00dc64",
                        borderRadius: 2,
                    },
                }}
            />
            <Typography sx={{ fontSize: "0.7rem", color: "rgba(0, 220, 100, 0.7)", textAlign: "center", mt: 0.5 }}>
                🏥 Checking integration health...
            </Typography>
        </Box>
    );
});

// ============================================================
// Health Summary Banner
// ============================================================

export const HealthSummaryBanner = React.memo(function HealthSummaryBanner({
    healthMap,
    lastCheckedAt,
}: {
    healthMap: Record<number, HealthResult>;
    lastCheckedAt: string;
}) {
    const { healthy, degraded, offline } = useMemo(() => {
        const vals = Object.values(healthMap);
        return {
            healthy: vals.filter(v => v.status === "healthy").length,
            degraded: vals.filter(v => v.status === "degraded").length,
            offline: vals.filter(v => v.status === "offline").length,
        };
    }, [healthMap]);

    return (
        <Box sx={{
            mb: 2, p: 1.5, borderRadius: 2,
            bgcolor: "rgba(0, 220, 100, 0.04)",
            border: "1px solid rgba(0, 220, 100, 0.12)",
            display: "flex", alignItems: "center", gap: 2,
            flexWrap: "wrap",
        }}>
            <Typography sx={{ fontSize: "0.72rem", color: COLORS.textMuted }}>
                🏥 Last check: <b style={{ color: COLORS.textPrimary }}>{lastCheckedAt}</b>
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                <HealthDot color="#00dc64" count={healthy} label="healthy" />
                {degraded > 0 && <HealthDot color="#ffb300" count={degraded} label="degraded" />}
                {offline > 0 && <HealthDot color="#ff5252" count={offline} label="offline" />}
            </Box>
        </Box>
    );
});

// ─── Small reusable dot + count ──────────────────────────────

const HealthDot = React.memo(function HealthDot({
    color,
    count,
    label,
}: {
    color: string;
    count: number;
    label: string;
}) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, boxShadow: `0 0 4px ${color}60` }} />
            <Typography sx={{ fontSize: "0.7rem", color, fontWeight: 700 }}>{count}</Typography>
            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>{label}</Typography>
        </Box>
    );
});

// ============================================================
// Health Monitor Card (collapsible history)
// ============================================================

const STATUS_COLORS: Record<string, string> = {
    healthy: "#00dc64",
    degraded: "#ffb300",
    offline: "#ff5252",
};

export const HealthMonitorCard = React.memo(function HealthMonitorCard({
    healthHistory,
    showMonitor,
    onToggleMonitor,
}: {
    healthHistory: Record<string, HealthHistoryEntry[]>;
    showMonitor: boolean;
    onToggleMonitor: () => void;
}) {
    if (Object.keys(healthHistory).length === 0) return null;

    return (
        <Box sx={{ mb: 2 }}>
            <Box
                onClick={onToggleMonitor}
                sx={{
                    display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer",
                    color: COLORS.textMuted, fontSize: "0.72rem", mb: 0.5,
                    "&:hover": { color: COLORS.textSecondary },
                    transition: "color 0.2s",
                }}
            >
                <ArrowDownIcon sx={{ fontSize: 16, transform: showMonitor ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                <Typography sx={{ fontSize: "0.72rem", fontWeight: 600, color: "inherit" }}>
                    📊 Health Monitor
                </Typography>
            </Box>
            <Collapse in={showMonitor}>
                <Box sx={{
                    p: 1.5, borderRadius: 2,
                    bgcolor: COLORS.surfaceDark,
                    border: `1px solid ${COLORS.border}`,
                }}>
                    {Object.entries(healthHistory).map(([groupName, checks]) => (
                        <HealthHistoryRow key={groupName} groupName={groupName} checks={checks} />
                    ))}
                </Box>
            </Collapse>
        </Box>
    );
});

// ─── Single history row ──────────────────────────────────────

const HealthHistoryRow = React.memo(function HealthHistoryRow({
    groupName,
    checks,
}: {
    groupName: string;
    checks: HealthHistoryEntry[];
}) {
    const avgMs = Math.round(checks.reduce((s, c) => s + (c.response_time ?? 0), 0) / (checks.length || 1));

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.8, "&:last-child": { mb: 0 } }}>
            <Typography sx={{
                fontSize: "0.7rem", color: COLORS.textSecondary, fontWeight: 600,
                minWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
                {groupName.replace(/^id-/, "")}
            </Typography>
            <Box sx={{ display: "flex", gap: "3px", alignItems: "center" }}>
                {checks.slice(0, 10).reverse().map((c, i) => (
                    <Tooltip key={i} title={`${c.status} · ${c.response_time}ms · ${new Date(c.checked_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}>
                        <Box sx={{
                            width: 8, height: 8, borderRadius: "50%",
                            bgcolor: STATUS_COLORS[c.status] ?? "#666",
                            opacity: 0.9,
                            transition: "transform 0.15s",
                            "&:hover": { transform: "scale(1.5)" },
                        }} />
                    </Tooltip>
                ))}
            </Box>
            <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted, ml: "auto" }}>
                avg {avgMs}ms
            </Typography>
        </Box>
    );
});
