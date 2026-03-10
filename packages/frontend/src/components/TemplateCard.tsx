// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Template Card (Template Shop grid item)
// ============================================================
// Reuses cardSx, COLORS, GradientButton from SharedUI.
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    Chip,
    Card,
    CardContent,
    CardActions,
    CircularProgress,
} from "@mui/material";
import { Download as InstallIcon, Check as CheckIcon, Settings as SettingsIcon } from "@mui/icons-material";
import {
    GradientButton,
    GhostButton,
    COLORS,
    cardSx,
    chipSx,
    accentAlpha,
} from "./ui/SharedUI";
import { RenderIcon } from "./integration-builder/IconPicker";

// ============================================================
// Types
// ============================================================

export interface TemplateData {
    id: string;
    name: string;
    icon: string;
    label: string;
    description: string;
    category: "data" | "content" | "tools" | "web";
    auth_type: "none" | "apikey" | "bearer";
    auth_hint?: string;
    endpoints: { name: string }[];
    human_triggers: string;
    installed: boolean;
}

// ============================================================
// Category Badge Config
// ============================================================

const CATEGORY_BADGE: Record<string, { color: string; label: string }> = {
    data: { color: "#00dc64", label: "📊 Data" },
    content: { color: "#ff9800", label: "📰 Content" },
    tools: { color: "#2196f3", label: "🔧 Tools" },
    web: { color: "#9c27b0", label: "🌐 Web" },
};

const AUTH_BADGE: Record<string, { color: string; label: string }> = {
    none: { color: "#00dc64", label: "Free" },
    apikey: { color: "#ffb300", label: "Free Key" },
    bearer: { color: "#ff5252", label: "Auth Required" },
};

// ============================================================
// Component
// ============================================================

export const TemplateCard = React.memo(function TemplateCard({
    template,
    onInstall,
    onConfigure,
}: {
    template: TemplateData;
    onInstall: (templateId: string) => Promise<void>;
    onConfigure: (templateName: string) => void;
}) {
    const [installing, setInstalling] = useState(false);
    const [justInstalled, setJustInstalled] = useState(false);
    const isInstalled = template.installed || justInstalled;

    const cat = CATEGORY_BADGE[template.category] || CATEGORY_BADGE.data;
    const auth = AUTH_BADGE[template.auth_type] || AUTH_BADGE.none;

    const handleInstall = async () => {
        setInstalling(true);
        try {
            await onInstall(template.id);
            setJustInstalled(true);
        } finally {
            setInstalling(false);
        }
    };

    const triggers = template.human_triggers.split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);

    return (
        <Card sx={{ ...cardSx, display: "flex", flexDirection: "column", position: "relative", overflow: "visible" }}>
            {/* FREE Badge */}
            <Box sx={{
                position: "absolute",
                top: -8,
                right: 12,
                px: 1.2,
                py: 0.3,
                borderRadius: "6px",
                background: "linear-gradient(135deg, #00dc64 0%, #00b856 100%)",
                boxShadow: "0 2px 8px rgba(0, 220, 100, 0.3)",
                zIndex: 1,
            }}>
                <Typography sx={{
                    fontSize: "0.6rem",
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    lineHeight: 1.4,
                }}>
                    FREE
                </Typography>
            </Box>
            <CardContent sx={{ p: 2.5, pb: 1, flex: 1 }}>
                {/* ─── Icon + Name ─── */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Box sx={{
                        width: 44, height: 44,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "12px",
                        bgcolor: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                        flexShrink: 0,
                    }}>
                        <RenderIcon name={template.icon} label={template.label} sx={{ fontSize: 26 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{
                            fontWeight: 700,
                            color: COLORS.textPrimary,
                            fontSize: "1rem",
                            lineHeight: 1.2,
                        }}>
                            {template.label}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                            <Chip size="small" label={auth.label} sx={{
                                ...chipSx(auth.color),
                                height: 18,
                                fontSize: "0.6rem",
                            }} />
                            <Chip size="small" label={cat.label} sx={{
                                ...chipSx(cat.color),
                                height: 18,
                                fontSize: "0.6rem",
                            }} />
                        </Box>
                    </Box>
                </Box>

                {/* ─── Description ─── */}
                <Typography sx={{
                    color: COLORS.textSecondary,
                    fontSize: "0.78rem",
                    lineHeight: 1.5,
                    mb: 1.5,
                    minHeight: 36,
                }}>
                    {template.description}
                </Typography>

                {/* ─── Meta ─── */}
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    <Chip
                        size="small"
                        label={`${template.endpoints.length} endpoint${template.endpoints.length > 1 ? "s" : ""}`}
                        sx={{
                            bgcolor: accentAlpha(0.08),
                            color: accentAlpha(0.8),
                            border: `1px solid ${accentAlpha(0.15)}`,
                            fontSize: "0.65rem",
                            height: 22,
                        }}
                    />
                    {triggers.map((t, i) => (
                        <Chip key={i} size="small" label={t} sx={{
                            bgcolor: "rgba(0, 200, 255, 0.06)",
                            color: "rgba(0, 200, 255, 0.7)",
                            border: "1px solid rgba(0, 200, 255, 0.15)",
                            fontSize: "0.65rem",
                            height: 22,
                        }} />
                    ))}
                </Box>
            </CardContent>

            {/* ─── Actions ─── */}
            <CardActions sx={{ px: 2.5, pb: 2, pt: 1 }}>
                {isInstalled ? (
                    <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
                        <GhostButton
                            startIcon={<CheckIcon sx={{ fontSize: 16 }} />}
                            disabled
                            sx={{
                                flex: 1,
                                color: "#00dc64 !important",
                                fontSize: "0.8rem",
                                opacity: "0.8 !important",
                            }}
                        >
                            Installed
                        </GhostButton>
                        <GhostButton
                            startIcon={<SettingsIcon sx={{ fontSize: 14 }} />}
                            onClick={() => onConfigure(template.name)}
                            sx={{ fontSize: "0.75rem" }}
                        >
                            Edit
                        </GhostButton>
                    </Box>
                ) : (
                    <GradientButton
                        fullWidth
                        startIcon={installing
                            ? <CircularProgress size={14} sx={{ color: "inherit" }} />
                            : <InstallIcon sx={{ fontSize: 16 }} />
                        }
                        onClick={handleInstall}
                        disabled={installing}
                        sx={{ fontSize: "0.8rem" }}
                    >
                        {installing ? "Installing..." : "Install"}
                    </GradientButton>
                )}
            </CardActions>
        </Card>
    );
});
