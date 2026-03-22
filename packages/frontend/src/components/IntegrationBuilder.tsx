// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IntegrationBuilder (Main Component)
// ============================================================
// Thin wrapper: mode toggle between Manual, AI Discovery,
// Swagger Import. Each mode lives in its own file.
// Web browsing is handled by the built-in Navigator Agent.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    ToggleButtonGroup,
    ToggleButton,
    LinearProgress,
} from "@mui/material";
import {
    AutoAwesome as MagicIcon,
    Person as ManualIcon,
    CloudDownload as ImportIcon,
    InfoOutlined as InfoIcon,
} from "@mui/icons-material";
import {
    CloseButton,
    COLORS,
    gradientTitleSx,
} from "./ui/SharedUI";
import { type CreationMode, type CapsuleBuilderProps, toggleSx } from "./integration-builder/shared";
import { ManualForm } from "./integration-builder/ManualForm";
import { AIFlow } from "./integration-builder/AIFlow";
import { SwaggerImport } from "./integration-builder/SwaggerImport";

export type { CapsuleBuilderProps } from "./integration-builder/shared";

// ─── Global Loading Event Interface ─────────────────────────
// Child flows dispatch: window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: true, message: "..." } }))

interface BuilderLoadingState {
    loading: boolean;
    message: string;
}

export function IntegrationBuilder({ onClose, onCreated }: CapsuleBuilderProps) {
    const [mode, setMode] = useState<CreationMode>("ai");
    const [loadingState, setLoadingState] = useState<BuilderLoadingState>({ loading: false, message: "" });

    // Listen for loading events from child flows
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<BuilderLoadingState>).detail;
            setLoadingState(detail);
        };
        window.addEventListener("biamos:builder-loading", handler);
        return () => window.removeEventListener("biamos:builder-loading", handler);
    }, []);

    const modeDescriptions: Record<CreationMode, string> = {
        ai: "Let AI discover endpoints and generate integrations automatically.",
        manual: "Define your integration with multiple API endpoints — full control.",
        swagger: "Import all endpoints from an OpenAPI / Swagger JSON spec URL.",
    };

    return (
        <Box sx={{ width: "100%", animation: "fadeInUp 0.4s ease-out" }}>
            {/* Global Loading Bar */}
            {loadingState.loading && (
                <Box
                    sx={{
                        mb: 2,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: "rgba(120, 80, 255, 0.06)",
                        border: "1px solid rgba(120, 80, 255, 0.2)",
                        animation: "fadeInUp 0.3s ease-out",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                        <Box
                            sx={{
                                width: 8, height: 8, borderRadius: "50%",
                                bgcolor: "#7850ff",
                                animation: "pulse 1.2s ease-in-out infinite",
                                "@keyframes pulse": {
                                    "0%, 100%": { opacity: 0.4, transform: "scale(0.8)" },
                                    "50%": { opacity: 1, transform: "scale(1.2)" },
                                },
                            }}
                        />
                        <Typography sx={{ fontSize: "0.8rem", color: COLORS.textPrimary, fontWeight: 600 }}>
                            {loadingState.message || "Processing…"}
                        </Typography>
                    </Box>
                    <LinearProgress
                        sx={{
                            height: 3,
                            borderRadius: 2,
                            bgcolor: "rgba(120, 80, 255, 0.1)",
                            "& .MuiLinearProgress-bar": {
                                bgcolor: "#7850ff",
                                borderRadius: 2,
                                animation: "shimmer 1.8s ease-in-out infinite",
                                "@keyframes shimmer": {
                                    "0%": { transform: "translateX(-100%)" },
                                    "100%": { transform: "translateX(200%)" },
                                },
                            },
                        }}
                    />
                </Box>
            )}

            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
                <Typography variant="h5" sx={gradientTitleSx()}>
                    🚀 New Integration
                </Typography>
                {onClose && <CloseButton onClick={onClose} disabled={loadingState.loading} />}
            </Box>

            {/* Mode Toggle */}
            <Box sx={{ mb: 3 }}>
                <ToggleButtonGroup
                    value={mode}
                    exclusive
                    onChange={(_e, val) => val && !loadingState.loading && setMode(val)}
                    size="small"
                    sx={{ ...toggleSx, ...(loadingState.loading && { opacity: 0.5, pointerEvents: "none" }) }}
                >
                    <ToggleButton value="ai">
                        <MagicIcon sx={{ fontSize: 18, mr: 1 }} />
                        AI Discovery
                    </ToggleButton>
                    <ToggleButton value="manual">
                        <ManualIcon sx={{ fontSize: 18, mr: 1 }} />
                        Manual
                        <Typography component="span" sx={{ ml: 0.5, fontSize: "0.55rem", opacity: 0.5, fontStyle: "italic" }}>(partially tested)</Typography>
                    </ToggleButton>
                    <ToggleButton value="swagger">
                        <ImportIcon sx={{ fontSize: 18, mr: 1 }} />
                        Swagger
                        <Typography component="span" sx={{ ml: 0.5, fontSize: "0.55rem", opacity: 0.5, fontStyle: "italic" }}>(untested)</Typography>
                    </ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" sx={{ display: "block", mt: 1, color: COLORS.textMuted }}>
                    {modeDescriptions[mode]}
                </Typography>

                {/* GET-only info banner */}
                <Box sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    mt: 1.5, p: 1.2, borderRadius: 2,
                    bgcolor: "rgba(0, 200, 255, 0.06)",
                    border: "1px solid rgba(0, 200, 255, 0.15)",
                }}>
                    <InfoIcon sx={{ fontSize: 16, color: COLORS.accentLight, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)" }}>
                        <strong style={{ color: COLORS.accentLight }}>GET</strong> endpoints are fully tested. <strong style={{ color: "#ffb400" }}>POST</strong>, PUT, PATCH are supported but not yet verified — use the method selector per endpoint to try them.
                    </Typography>
                </Box>
            </Box>

            {/* Content */}
            <Box sx={{ ...(loadingState.loading && { opacity: 0.6, pointerEvents: "none", filter: "grayscale(0.3)" }), transition: "opacity 0.3s, filter 0.3s" }}>
                {mode === "manual" && <ManualForm onCreated={onCreated} onClose={onClose} />}
                {mode === "ai" && <AIFlow onCreated={onCreated} onClose={onClose} />}
                {mode === "swagger" && <SwaggerImport onCreated={onCreated} onClose={onClose} />}
            </Box>
        </Box>
    );
}
