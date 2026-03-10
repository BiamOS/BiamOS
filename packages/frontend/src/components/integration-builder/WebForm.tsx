// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Web Integration Form
// ============================================================
// Simple form for creating web (iframe) integrations.
// Just URL + label + triggers + icon — no endpoints needed.
// ============================================================

import { useState, useCallback } from "react";
import { Box, TextField, Typography, Button, Alert } from "@mui/material";
import { Language as WebIcon, Save as SaveIcon } from "@mui/icons-material";
import { COLORS, gradientTitleSx , accentAlpha } from "../ui/SharedUI";
import { IconPicker, RenderIcon } from "./IconPicker";
import type { CapsuleBuilderProps } from "./shared";

// ─── Helpers ────────────────────────────────────────────────

function extractHostname(url: string): string {
    try {
        return new URL(url).hostname.replace("www.", "");
    } catch {
        return "";
    }
}

function extractLabel(url: string): string {
    const host = extractHostname(url);
    if (!host) return "";
    // "youtube.com" → "YouTube"
    const name = host.split(".")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// ============================================================
// Component
// ============================================================

export function WebForm({ onCreated, onClose }: CapsuleBuilderProps) {
    const [url, setUrl] = useState("");
    const [label, setLabel] = useState("");
    const [triggers, setTriggers] = useState("");
    const [icon, setIcon] = useState("Language");
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Auto-fill label when URL changes
    const handleUrlChange = useCallback((val: string) => {
        setUrl(val);
        if (!label || label === extractLabel(url)) {
            setLabel(extractLabel(val));
        }
        // Auto-generate triggers from hostname
        const host = extractHostname(val);
        if (host && (!triggers || triggers === extractHostname(url))) {
            const name = host.split(".")[0];
            setTriggers(`${name} | open ${name} | visit ${name}`);
        }
    }, [url, label, triggers]);

    const handleSave = useCallback(async () => {
        if (!url.trim()) { setError("URL is required"); return; }
        if (!url.startsWith("http")) { setError("URL must start with http:// or https://"); return; }

        setSaving(true);
        setError(null);

        try {
            const hostname = extractHostname(url);
            const groupName = label || hostname;
            const name = `${groupName.replace(/\s+/g, "")}WebWidget`;

            const body = {
                name,
                intent_description: triggers || `open ${hostname}`,
                api_endpoint: url.trim(),
                http_method: "GET",
                group_name: groupName,
                sidebar_icon: icon,
                sidebar_label: label || groupName,
                human_triggers: triggers,
                integration_type: "web",
                is_active: true,
            };

            const resp = await fetch("http://localhost:3001/api/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!resp.ok) {
                const err = await resp.text();
                throw new Error(err || `HTTP ${resp.status}`);
            }

            setSuccess(true);
            onCreated?.();
            setTimeout(() => onClose?.(), 1000);
        } catch (err: any) {
            setError(err.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    }, [url, label, triggers, icon, onCreated, onClose]);

    if (success) {
        return (
            <Box sx={{ textAlign: "center", py: 4, animation: "fadeInUp 0.4s ease-out" }}>
                <Typography variant="h5" sx={{ color: "rgba(0, 220, 100, 0.9)", fontWeight: 800 }}>
                    ✅ Web Integration Created!
                </Typography>
                <Typography sx={{ color: COLORS.textMuted, mt: 1 }}>
                    Type "{label || extractHostname(url)}" to open it
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, animation: "fadeInUp 0.3s ease-out" }}>
            {/* Info */}
            <Alert
                severity="info"
                sx={{
                    bgcolor: accentAlpha(0.06),
                    color: "rgba(167, 139, 250, 0.9)",
                    border: `1px solid ${accentAlpha(0.12)}`,
                    "& .MuiAlert-icon": { color: accentAlpha(0.6) },
                    fontSize: "0.8rem",
                }}
            >
                Some sites (YouTube, Google, Twitter) block iframe embedding.
                They'll show as a link card instead. For full data access, use the <b>API</b> method.
            </Alert>

            {/* URL */}
            <TextField
                label="Website URL"
                placeholder="https://youtube.com"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                fullWidth
                required
                sx={fieldSx}
                slotProps={{ inputLabel: { sx: { color: COLORS.textMuted } } }}
            />

            {/* Label + Icon */}
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                <TextField
                    label="Label"
                    placeholder="YouTube"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    sx={{ ...fieldSx, flex: 1 }}
                    slotProps={{ inputLabel: { sx: { color: COLORS.textMuted } } }}
                />
                <Box sx={{ pt: 1 }}>
                    <Box
                        onClick={() => setIconPickerOpen(true)}
                        sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: accentAlpha(0.1),
                            border: `1px solid ${accentAlpha(0.2)}`,
                            cursor: "pointer",
                            transition: "all 0.2s",
                            "&:hover": { borderColor: accentAlpha(0.5), bgcolor: accentAlpha(0.15) },
                        }}
                    >
                        <RenderIcon name={icon} sx={{ fontSize: 24, color: COLORS.textSecondary }} />
                    </Box>
                </Box>
            </Box>

            {/* Triggers */}
            <TextField
                label="Trigger Keywords"
                placeholder="youtube | video | watch | open youtube"
                value={triggers}
                onChange={(e) => setTriggers(e.target.value)}
                fullWidth
                helperText="Pipe-separated keywords that activate this integration"
                sx={fieldSx}
                slotProps={{ inputLabel: { sx: { color: COLORS.textMuted } } }}
            />

            {/* Preview */}
            {url && extractHostname(url) && (
                <Box
                    sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: accentAlpha(0.05),
                        border: `1px solid ${accentAlpha(0.1)}`,
                    }}
                >
                    <Typography variant="caption" sx={{ color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Preview
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                        <Box
                            component="img"
                            src={`https://www.google.com/s2/favicons?domain=${extractHostname(url)}&sz=32`}
                            alt=""
                            sx={{ width: 20, height: 20, borderRadius: "3px" }}
                        />
                        <Typography sx={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                            {label || extractHostname(url)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "rgba(255, 255, 255, 0.25)" }}>
                            → iframe embed
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* Error */}
            {error && <Alert severity="error" sx={{ bgcolor: "rgba(255, 50, 50, 0.08)", color: "#ff6b6b" }}>{error}</Alert>}

            {/* Save */}
            <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || !url.trim()}
                startIcon={<SaveIcon />}
                sx={{
                    bgcolor: accentAlpha(0.8),
                    color: "#fff",
                    fontWeight: 700,
                    borderRadius: 2,
                    py: 1.2,
                    "&:hover": { bgcolor: accentAlpha(1) },
                    "&.Mui-disabled": { bgcolor: accentAlpha(0.2), color: "rgba(255,255,255,0.3)" },
                }}
            >
                {saving ? "Saving..." : "Create Web Integration"}
            </Button>

            {/* Icon Picker Modal */}
            <IconPicker
                open={iconPickerOpen}
                onClose={() => setIconPickerOpen(false)}
                onSelect={(name) => { setIcon(name); setIconPickerOpen(false); }}
                currentIcon={icon}
            />
        </Box>
    );
}

// ─── Shared field style ─────────────────────────────────────

const fieldSx = {
    "& .MuiOutlinedInput-root": {
        color: COLORS.textPrimary,
        bgcolor: "rgba(255, 255, 255, 0.03)",
        borderRadius: 2,
        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.08)" },
        "&:hover fieldset": { borderColor: accentAlpha(0.3) },
        "&.Mui-focused fieldset": { borderColor: accentAlpha(0.6) },
    },
    "& .MuiFormHelperText-root": { color: "rgba(255, 255, 255, 0.25)" },
};
