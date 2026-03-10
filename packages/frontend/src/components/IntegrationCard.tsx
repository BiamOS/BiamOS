// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Card (Apple-style grid item)
// ============================================================
// Prominent icon + clean layout with name, status, meta chips.
// ============================================================

import React from "react";
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
    AutoAwesome as AutoIcon,
    Person as HumanIcon,
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
import { RenderIcon } from "./integration-builder/IconPicker";
import { STATUS_CONFIG, HEALTH_COLORS, type IntegrationItem } from "../types/integration";

// ============================================================
// Styles
// ============================================================

export const triggerChipSx = {
    bgcolor: "rgba(0, 200, 255, 0.06)",
    color: "rgba(0, 200, 255, 0.7)",
    border: "1px solid rgba(0, 200, 255, 0.15)",
    fontSize: "0.65rem",
    height: 22,
};

export const authChipSx = (hasAuth: boolean) => ({
    bgcolor: hasAuth ? accentAlpha(0.1) : COLORS.surface,
    color: hasAuth ? accentAlpha(0.8) : COLORS.textSecondary,
    border: `1px solid ${hasAuth ? accentAlpha(0.2) : COLORS.border}`,
    fontSize: "0.7rem",
});

// ============================================================
// Integration Card
// ============================================================

export const IntegrationCard = React.memo(function IntegrationCard({
    integration,
    onEdit,
    onDelete,
    onToggleActive,
    isDeleting,
    healthStatus,
    onCheckHealth,
}: {
    integration: IntegrationItem;
    onEdit: (c: IntegrationItem) => void;
    onDelete: (c: IntegrationItem) => void;
    onToggleActive: (c: IntegrationItem) => void;
    isDeleting: boolean;
    healthStatus?: { status: string; responseTime: number; message?: string } | null;
    onCheckHealth?: (c: IntegrationItem) => void;
}) {
    const hasAuth = integration.api_config?.requiresAuth ?? false;
    const status = integration.status ?? "live";
    const displayName = integration.group_name || integration.name.replace("Widget", "");

    const st = STATUS_CONFIG[status] || STATUS_CONFIG.live;

    // Health status colors — prefer prop (realtime), fallback to DB-persisted
    const effectiveStatus = healthStatus?.status ?? integration.health_status;
    const hs = effectiveStatus && effectiveStatus !== "unchecked"
        ? (HEALTH_COLORS[effectiveStatus as keyof typeof HEALTH_COLORS] || null)
        : null;

    // Count endpoints in this group
    const endpointCount = integration.intent_description.split("|").filter(Boolean).length;

    return (
        <Card sx={{ ...cardSx, opacity: isDeleting ? 0.4 : status === "inactive" ? 0.45 : 1, transition: "all 0.3s ease" }}>
            <CardContent sx={{ p: 2.5, pb: 1 }}>
                {/* ─── Icon + Name Row (Apple-style) ─── */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                    {/* Prominent Icon */}
                    <Box sx={{
                        width: 44, height: 44,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "12px",
                        bgcolor: "rgba(255, 255, 255, 0.04)",
                        border: `1px solid rgba(255, 255, 255, 0.06)`,
                        flexShrink: 0,
                    }}>
                        <RenderIcon
                            name={integration.sidebar_icon}
                            label={displayName}
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
                            {displayName}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.3 }}>
                            {/* Status dot */}
                            <Box sx={{
                                width: 6, height: 6, borderRadius: "50%",
                                bgcolor: st.color,
                                boxShadow: `0 0 4px ${st.color}60`,
                            }} />
                            <Typography sx={{ fontSize: "0.7rem", color: st.color, fontWeight: 600 }}>
                                {st.label}
                            </Typography>
                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, ml: 0.5 }}>
                                •
                            </Typography>
                            <Tooltip title={integration.is_auto_generated ? "Auto-generated" : "Manually created"}>
                                <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                                    {integration.is_auto_generated ? "Auto" : "Manual"}
                                </Typography>
                            </Tooltip>
                            {hs && (
                                <>
                                    <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, ml: 0.5 }}>•</Typography>
                                    <Tooltip title={healthStatus?.message || `${hs.label} (${healthStatus?.responseTime ?? 0}ms)`}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, cursor: "default" }}>
                                            <Box sx={{
                                                width: 5, height: 5, borderRadius: "50%",
                                                bgcolor: hs.color,
                                                boxShadow: `0 0 4px ${hs.color}60`,
                                            }} />
                                            <Typography sx={{ fontSize: "0.6rem", color: hs.color, fontWeight: 600 }}>
                                                {hs.label}
                                            </Typography>
                                        </Box>
                                    </Tooltip>
                                </>
                            )}
                        </Box>
                    </Box>
                </Box>

                {/* ─── Meta Chips ─── */}
                <Box sx={{ display: "flex", gap: 0.5, mb: 1.5, flexWrap: "wrap" }}>
                    <Chip
                        size="small"
                        icon={hasAuth ? <AuthIcon sx={{ fontSize: 12 }} /> : <NoAuthIcon sx={{ fontSize: 12 }} />}
                        label={hasAuth ? `Auth: ${(integration.api_config?.requiresAuth ? integration.api_config.authType : undefined) ?? "bearer"}` : "No Auth"}
                        sx={authChipSx(hasAuth)}
                    />
                    {integration.http_method && (
                        <Chip
                            size="small"
                            label={`${integration.http_method}: ${endpointCount}`}
                            sx={{
                                bgcolor: "rgba(0, 200, 255, 0.08)",
                                color: "rgba(0, 200, 255, 0.8)",
                                border: "1px solid rgba(0, 200, 255, 0.15)",
                                fontSize: "0.65rem",
                                fontWeight: 700,
                                fontFamily: "'JetBrains Mono', monospace",
                            }}
                        />
                    )}
                </Box>

                {/* ─── Triggers ─── */}
                <Typography variant="caption" sx={sectionLabelSx}>Triggers</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                    {integration.intent_description.split("|").map(s => s.trim()).filter(Boolean).slice(0, 4).map((kw, i) => (
                        <Chip key={i} label={kw} size="small" sx={triggerChipSx} />
                    ))}
                </Box>
            </CardContent>

            <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end", gap: 0.5 }}>
                {onCheckHealth && (
                    <ActionIcon tooltip="Check Health" hoverColor="#00dc64" onClick={() => onCheckHealth(integration)}>
                        <HealthIcon sx={{ fontSize: 16 }} />
                    </ActionIcon>
                )}
                <ActionIcon tooltip="Edit" hoverColor={COLORS.accent} onClick={() => onEdit(integration)}>
                    <EditIcon sx={{ fontSize: 16 }} />
                </ActionIcon>
                <ActionIcon tooltip="Delete" hoverColor={COLORS.red} onClick={() => onDelete(integration)} disabled={isDeleting}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                </ActionIcon>
            </CardActions>
        </Card>
    );
});
