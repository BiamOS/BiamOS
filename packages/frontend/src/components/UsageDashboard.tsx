// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Usage Dashboard (Token Stats + API Key)
// ============================================================
// Extracted from IntegrationManager.tsx for modularity.
// Shows token usage metrics and allows API key management.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Button,
    Divider,
    TextField,
    InputAdornment,
    IconButton,
} from "@mui/material";
import {
    Token as TokenIcon,
    Api as ApiIcon,
    Visibility as ShowIcon,
    VisibilityOff as HideIcon,
    Key as KeyIcon,
} from "@mui/icons-material";
import type { SystemStats } from "./IntegrationManager";
import { accentAlpha, LoadingSpinner, COLORS, inputSx } from "./ui/SharedUI";

// ─── Styles ─────────────────────────────────────────────────

const statCardSx = {
    p: 2,
    borderRadius: 3,
    bgcolor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    flex: 1,
    minWidth: 120,
    textAlign: "center" as const,
};

const editFieldSx = inputSx;

// ─── Component ──────────────────────────────────────────────

export function UsageDashboard() {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/system/stats");
            const data = await res.json();
            setStats(data.stats);
        } catch (err) { console.warn("[UsageDashboard] stats fetch failed:", err); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const handleSaveKey = async () => {
        if (!newKey.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/system/key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: newKey.trim() }),
            });
            if (res.ok) {
                setMsg("API key updated ✓");
                setNewKey("");
                fetchStats();
            } else {
                setMsg("Failed to save");
            }
        } catch {
            setMsg("Connection error");
        }
        setSaving(false);
    };

    if (loading) return <LoadingSpinner py={3} />;

    return (
        <Box sx={{ mb: 3 }}>
            {/* Stats Cards */}
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2.5 }}>
                <Box sx={statCardSx}>
                    <TokenIcon sx={{ fontSize: 28, color: accentAlpha(0.7), mb: 0.5 }} />
                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 800,
                            background: `linear-gradient(135deg, #fff, ${accentAlpha(0.8)})`,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        {(stats?.total_tokens ?? 0).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.4)" }}>
                        Total Tokens
                    </Typography>
                </Box>

                <Box sx={statCardSx}>
                    <ApiIcon sx={{ fontSize: 28, color: accentAlpha(0.7), mb: 0.5 }} />
                    <Typography
                        variant="h5"
                        sx={{
                            fontWeight: 800,
                            background: `linear-gradient(135deg, #fff, ${accentAlpha(0.8)})`,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        {stats?.api_calls ?? 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.4)" }}>
                        API Calls
                    </Typography>
                </Box>

                <Box sx={statCardSx}>
                    <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.4)", display: "block", mb: 0.5 }}>
                        Prompt
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: "rgba(255, 255, 255, 0.8)" }}>
                        {(stats?.total_prompt_tokens ?? 0).toLocaleString()}
                    </Typography>
                </Box>

                <Box sx={statCardSx}>
                    <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.4)", display: "block", mb: 0.5 }}>
                        Completion
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: "rgba(255, 255, 255, 0.8)" }}>
                        {(stats?.total_completion_tokens ?? 0).toLocaleString()}
                    </Typography>
                </Box>
            </Box>

            {/* API Key Editor */}
            <Box
                sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        color: "rgba(255, 255, 255, 0.4)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        mb: 1.5,
                    }}
                >
                    <KeyIcon sx={{ fontSize: 14 }} /> OpenRouter API-Key
                </Typography>

                <Typography
                    variant="body2"
                    sx={{
                        color: "rgba(255, 255, 255, 0.5)",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.8rem",
                        mb: 1.5,
                        p: 1,
                        bgcolor: "rgba(0, 0, 0, 0.2)",
                        borderRadius: 1,
                    }}
                >
                    {stats?.masked_api_key ?? "No key configured"}
                </Typography>

                <Box sx={{ display: "flex", gap: 1 }}>
                    <TextField
                        type={showKey ? "text" : "password"}
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="Enter new API key..."
                        size="small"
                        fullWidth
                        sx={editFieldSx}
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowKey(!showKey)}
                                            sx={{ color: "rgba(255, 255, 255, 0.3)" }}
                                        >
                                            {showKey ? <HideIcon sx={{ fontSize: 18 }} /> : <ShowIcon sx={{ fontSize: 18 }} />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSaveKey}
                        disabled={!newKey.trim() || saving}
                        size="small"
                        sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 700,
                            px: 3,
                            minWidth: "auto",
                            background: newKey.trim()
                                ? `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 100%)`
                                : undefined,
                            "&.Mui-disabled": {
                                bgcolor: "rgba(255, 255, 255, 0.05)",
                                color: "rgba(255, 255, 255, 0.2)",
                            },
                        }}
                    >
                        {saving ? <CircularProgress size={16} sx={{ color: "inherit" }} /> : "Save"}
                    </Button>
                </Box>
            </Box>

            {msg && (
                <Alert
                    severity="success"
                    onClose={() => setMsg(null)}
                    sx={{
                        mt: 1.5,
                        bgcolor: "rgba(0, 220, 100, 0.08)",
                        color: "#00dc64",
                        border: "1px solid rgba(0, 220, 100, 0.2)",
                        borderRadius: 2,
                        "& .MuiAlert-icon": { color: "#00dc64" },
                    }}
                >
                    {msg}
                </Alert>
            )}

            <Divider sx={{ mt: 3, borderColor: COLORS.border }} />
        </Box>
    );
}
