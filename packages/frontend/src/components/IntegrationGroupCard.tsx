// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Group Card
// ============================================================
// Extracted from IntegrationStore.tsx — renders a card for a
// group of integrations sharing the same group_name.
// ============================================================

import React, { useMemo } from "react";
import {
    Box,
    Typography,
    Chip,
    Card,
    CardContent,
    CardActions,
    Tooltip,
} from "@mui/material";
import {
    Lock as AuthIcon,
    LockOpen as NoAuthIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    MonitorHeart as HealthIcon,
} from "@mui/icons-material";
import {
    ActionIcon,
    COLORS,
    cardSx,
    sectionLabelSx,
    accentAlpha,
} from "./ui/SharedUI";
import { triggerChipSx, authChipSx } from "./IntegrationCard";
import { RenderIcon } from "./integration-builder/IconPicker";
import type { IntegrationItem, HealthResult } from "../types/integration";

// ─── Status Config (hoisted, never re-created) ───────────────

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    live: { color: "#00dc64", label: "Live" },
    pending: { color: "#ffb300", label: "Pending" },
    auth_needed: { color: "#ff5252", label: "Auth Needed" },
    inactive: { color: "#666", label: "Inactive" },
};

const HEALTH_COLORS: Record<string, { c: string; l: string }> = {
    healthy: { c: "#00dc64", l: "Healthy" },
    degraded: { c: "#ffb300", l: "Degraded" },
    offline: { c: "#ff5252", l: "Offline" },
};

const METHOD_COLORS: Record<string, string> = {
    GET: "#00dc64", POST: "#ffb300", PUT: "#6366f1", PATCH: "#6366f1", DELETE: "#ff5252",
};

// ============================================================
// Component
// ============================================================

export const IntegrationGroupCard = React.memo(function IntegrationGroupCard({
    groupName,
    integrations,
    healthMap,
    onEdit,
    onDelete,
    onCheckHealth,
}: {
    groupName: string;
    integrations: IntegrationItem[];
    healthMap: Record<number, HealthResult>;
    onEdit: (c: IntegrationItem) => void;
    onDelete: (c: IntegrationItem) => void;
    onCheckHealth: (c: IntegrationItem) => void;
}) {
    const first = integrations[0];
    const isWeb = (first as any).integration_type === "web";
    const hasAuth = integrations.some(c => c.api_config?.requiresAuth);

    // Compute group status
    const groupStatus = useMemo(() => {
        const statuses = integrations.map(c => (c as any).status ?? "live");
        if (statuses.every((s: string) => s === "live")) return STATUS_CONFIG.live;
        if (statuses.some((s: string) => s === "auth_needed")) return STATUS_CONFIG.auth_needed;
        if (statuses.some((s: string) => s === "pending")) return STATUS_CONFIG.pending;
        return STATUS_CONFIG.inactive;
    }, [integrations]);

    // Compute health badge
    const healthBadge = useMemo(() => {
        const hm = healthMap[first.id];
        const dbStatus = (first as any).health_status;
        const statusVal = hm?.status ?? dbStatus;
        if (!statusVal || statusVal === "unchecked") return null;
        const h = HEALTH_COLORS[statusVal];
        if (!h) return null;
        const tooltipMsg = hm?.message || (first as any).health_message || h.l;
        return { ...h, tooltipMsg };
    }, [healthMap, first]);

    // Compute method summary
    const methodSummary = useMemo(() => {
        const methods: Record<string, number> = {};
        for (const cap of integrations) {
            const method = ((cap as any).http_method ?? "GET").toUpperCase();
            methods[method] = (methods[method] || 0) + 1;
        }
        return Object.entries(methods);
    }, [integrations]);

    // Compute triggers
    const triggers = useMemo(() => {
        const source = first.human_triggers || first.intent_description;
        return source.split("|").map(s => s.trim()).filter(Boolean).slice(0, 5);
    }, [first]);

    const handleDeleteAll = React.useCallback(async () => {
        for (const cap of integrations) await onDelete(cap);
    }, [integrations, onDelete]);

    return (
        <Card sx={{
            ...cardSx,
            opacity: integrations.every(c => !c.is_active) ? 0.45 : 1,
            transition: "opacity 0.3s ease",
            position: "relative",
        }}>
            {/* Auth Warning Badge — top right corner, like a game notification */}
            {groupStatus === STATUS_CONFIG.auth_needed && (
                <Tooltip title="API Key required! Click edit to add your key." arrow>
                    <Box sx={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        bgcolor: "rgba(255, 82, 82, 0.15)",
                        border: "2px solid #ff5252",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                        cursor: "pointer",
                        animation: "pulse-warn 2s ease-in-out infinite",
                        "@keyframes pulse-warn": {
                            "0%, 100%": { boxShadow: "0 0 0 0 rgba(255, 82, 82, 0.4)" },
                            "50%": { boxShadow: "0 0 0 6px rgba(255, 82, 82, 0)" },
                        },
                    }}
                        onClick={() => onEdit(first)}
                    >
                        <Typography sx={{ fontSize: "0.85rem", lineHeight: 1 }}>⚠️</Typography>
                    </Box>
                </Tooltip>
            )}
            <CardContent sx={{ p: 2.5, pb: 1 }}>
                {/* Group Header — Apple-style icon + name */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                    {/* Prominent Icon */}
                    <Box sx={{
                        width: 44, height: 44,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                    }}>
                        <RenderIcon
                            name={first.sidebar_icon}
                            label={groupName}
                            sx={{ fontSize: 26 }}
                        />
                    </Box>

                    {/* Name + Status */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            sx={{
                                fontWeight: 700,
                                color: COLORS.textPrimary,
                                fontSize: "1rem",
                                lineHeight: 1.2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {groupName}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.3 }}>
                            <Box sx={{
                                width: 6, height: 6, borderRadius: "50%",
                                bgcolor: groupStatus.color,
                                boxShadow: `0 0 4px ${groupStatus.color}60`,
                            }} />
                            <Typography sx={{ fontSize: "0.7rem", color: groupStatus.color, fontWeight: 600 }}>
                                {groupStatus.label}
                            </Typography>
                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>•</Typography>
                            <Typography sx={{ fontSize: "0.65rem", color: isWeb ? COLORS.accent : COLORS.textMuted }}>
                                {isWeb ? "🌐 Web" : (first.is_auto_generated ? "Auto" : "Manual")}
                            </Typography>
                            {/* Health badge */}
                            {healthBadge && (
                                <>
                                    <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, ml: 0.5 }}>•</Typography>
                                    <Tooltip title={healthBadge.tooltipMsg}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, cursor: "default" }}>
                                            <Box sx={{
                                                width: 5, height: 5, borderRadius: "50%",
                                                bgcolor: healthBadge.c,
                                                boxShadow: `0 0 4px ${healthBadge.c}60`,
                                            }} />
                                            <Typography sx={{ fontSize: "0.6rem", color: healthBadge.c, fontWeight: 600 }}>
                                                {healthBadge.l}
                                            </Typography>
                                        </Box>
                                    </Tooltip>
                                </>
                            )}
                        </Box>
                    </Box>
                </Box>

                {/* Auth + Method Summary */}
                <Box sx={{ display: "flex", gap: 0.5, mb: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip
                        size="small"
                        icon={hasAuth ? <AuthIcon sx={{ fontSize: 12 }} /> : <NoAuthIcon sx={{ fontSize: 12 }} />}
                        label={hasAuth ? `Auth: ${(first.api_config?.requiresAuth ? first.api_config.authType : undefined) ?? "bearer"}` : "No Auth"}
                        sx={authChipSx(hasAuth)}
                    />
                    {methodSummary.map(([method, count]) => (
                        <Chip
                            key={method}
                            size="small"
                            label={`${method}: ${count}`}
                            sx={{
                                bgcolor: `${METHOD_COLORS[method] ?? COLORS.accent}15`,
                                color: METHOD_COLORS[method] ?? COLORS.accent,
                                border: `1px solid ${METHOD_COLORS[method] ?? COLORS.accent}30`,
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                height: 22,
                            }}
                        />
                    ))}
                </Box>

                {/* Triggers preview */}
                <Typography variant="caption" sx={sectionLabelSx}>Triggers</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                    {triggers.map((kw, i) => (
                        <Chip key={i} label={kw} size="small" sx={triggerChipSx} />
                    ))}
                </Box>
            </CardContent>

            <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 0.5 }}>
                {!isWeb && (
                    <ActionIcon tooltip="Check Health" hoverColor="#00dc64" onClick={() => onCheckHealth(first)}>
                        <HealthIcon sx={{ fontSize: 16 }} />
                    </ActionIcon>
                )}
                {!isWeb && (
                    <ActionIcon tooltip="Edit" hoverColor={COLORS.accent} onClick={() => onEdit(first)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                    </ActionIcon>
                )}
                <ActionIcon tooltip="Delete all" hoverColor={COLORS.red} onClick={handleDeleteAll}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                </ActionIcon>
            </CardActions>
        </Card>
    );
});
