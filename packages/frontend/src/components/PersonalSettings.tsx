// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Personal Settings Panel
// ============================================================
// Language selection, data audit, and privacy controls.
// ============================================================

import React, { useState, useCallback } from "react";
import {
    Box, Typography, Select, MenuItem, FormControl,
    Button, Chip, Collapse, CircularProgress, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import {
    Language as LanguageIcon,
    Shield as ShieldIcon,
    DeleteForever as DeleteIcon,
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    Cookie as CookieIcon,
    Storage as StorageIcon,
    Key as KeyIcon,
    QueryStats as StatsIcon,
} from "@mui/icons-material";
import { COLORS, accentAlpha } from "./ui/SharedUI";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGES, type SupportedLanguage } from "../i18n";
import type { AuditData } from "../types/settings";

// ─── Styles ─────────────────────────────────────────────────

const cardSx = {
    p: 2.5, borderRadius: 3,
    border: `1px solid ${COLORS.border}`,
    bgcolor: COLORS.surface,
};

const auditRowSx = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    py: 1.5, px: 2, borderRadius: 2,
    bgcolor: "rgba(255,255,255,0.02)",
    "&:hover": { bgcolor: "rgba(88,28,255,0.04)" },
    transition: "background 0.2s",
};

// ============================================================
// Component
// ============================================================

export const PersonalSettings = React.memo(function PersonalSettings() {
    const { language, setLanguage, tr } = useLanguage();
    const [auditData, setAuditData] = useState<AuditData | null>(null);
    const [auditOpen, setAuditOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
    const [purgeResult, setPurgeResult] = useState<string | null>(null);

    // ─── Load Audit ─────────────────────────────────────────
    const loadAudit = useCallback(async () => {
        if (auditData && auditOpen) {
            setAuditOpen(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/system/audit");
            const json = await res.json();
            setAuditData(json.audit);
            setAuditOpen(true);
        } catch {
            console.error("Failed to load audit");
        }
        setLoading(false);
    }, [auditData, auditOpen]);

    // ─── Purge All Data ─────────────────────────────────────
    const purgeAll = useCallback(async () => {
        setPurgeDialogOpen(false);
        setLoading(true);
        try {
            const res = await fetch("/api/system/data", { method: "DELETE" });
            const json = await res.json();
            setPurgeResult(json.message || "Data cleared");
            setAuditData(null);
            setAuditOpen(false);

            // Also clear Electron session if available
            if (window.electronAPI?.clearSession) {
                await window.electronAPI.clearSession();
            }
        } catch {
            setPurgeResult("Error: Could not purge data");
        }
        setLoading(false);
        setTimeout(() => setPurgeResult(null), 4000);
    }, []);

    // ─── Clear Browser Sessions ─────────────────────────────
    const clearSessions = useCallback(async () => {
        try {
            if (window.electronAPI?.clearSession) {
                await window.electronAPI.clearSession();
                setPurgeResult("Browser sessions cleared (cookies, logins)");
            } else {
                setPurgeResult("Session clearing only available in Electron app");
            }
        } catch {
            setPurgeResult("Error clearing sessions");
        }
        setTimeout(() => setPurgeResult(null), 4000);
    }, []);

    return (
        <Box>
            {/* Header */}
            <Typography
                variant="h5"
                sx={{
                    fontWeight: 800, mb: 0.5,
                    background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}
            >
                👤 {tr.personal}
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
                {tr.languageDescription}
            </Typography>

            {/* Language Selection */}
            <Box sx={{ ...cardSx, maxWidth: 420, mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                    <LanguageIcon sx={{ color: accentAlpha(0.7), fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>
                        {tr.language}
                    </Typography>
                </Box>

                <FormControl fullWidth size="small">
                    <Select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                        sx={{
                            bgcolor: COLORS.surfaceDark, color: COLORS.textPrimary, borderRadius: 2,
                            "& .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.border },
                            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: accentAlpha(0.4) },
                            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: accentAlpha(0.7) },
                        }}
                        MenuProps={{
                            PaperProps: {
                                sx: { bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 2 },
                            },
                        }}
                    >
                        {LANGUAGES.map((lang) => (
                            <MenuItem key={lang.code} value={lang.code} sx={{
                                color: COLORS.textPrimary,
                                "&:hover": { bgcolor: accentAlpha(0.08) },
                                "&.Mui-selected": { bgcolor: accentAlpha(0.12) },
                            }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                    <Typography sx={{ fontSize: "1.2rem" }}>{lang.flag}</Typography>
                                    <Typography sx={{ fontWeight: 500 }}>{lang.label}</Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Typography variant="caption" sx={{ color: COLORS.textMuted, mt: 1.5, display: "block" }}>
                    {language === "en" ? "This affects the UI language and AI-generated content."
                        : language === "de" ? "Dies betrifft die UI-Sprache und KI-generierte Inhalte."
                            : language === "es" ? "Esto afecta el idioma de la interfaz y el contenido generado por IA."
                                : language === "fr" ? "Ceci affecte la langue de l'interface et le contenu généré par l'IA."
                                    : "これはUIの言語とAI生成コンテンツに影響します。"
                    }
                </Typography>
            </Box>

            <Divider sx={{ borderColor: COLORS.border, my: 3 }} />

            {/* ═══════════ Data & Privacy Section ═══════════ */}
            <Typography
                variant="h5"
                sx={{
                    fontWeight: 800, mb: 0.5,
                    background: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}
            >
                🛡️ Data & Privacy
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
                View stored data and manage your privacy. Important before publishing to GitHub.
            </Typography>

            {/* Status Banner */}
            {purgeResult && (
                <Box sx={{
                    p: 1.5, borderRadius: 2, mb: 2,
                    bgcolor: purgeResult.startsWith("Error") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${purgeResult.startsWith("Error") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                }}>
                    <Typography variant="body2" sx={{
                        color: purgeResult.startsWith("Error") ? "#EF4444" : "#22C55E",
                        fontWeight: 600,
                    }}>
                        {purgeResult.startsWith("Error") ? "❌" : "✅"} {purgeResult}
                    </Typography>
                </Box>
            )}

            {/* Audit Button */}
            <Button
                variant="outlined"
                onClick={loadAudit}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} /> : <ShieldIcon />}
                endIcon={auditOpen ? <CollapseIcon /> : <ExpandIcon />}
                sx={{
                    color: "#A78BFA", borderColor: "rgba(88,28,255,0.3)",
                    textTransform: "none", fontWeight: 600, mb: 2,
                    "&:hover": { borderColor: "rgba(88,28,255,0.6)", bgcolor: "rgba(88,28,255,0.05)" },
                }}
            >
                Data Audit — What's Stored?
            </Button>

            {/* Audit Results */}
            <Collapse in={auditOpen && !!auditData}>
                {auditData && (
                    <Box sx={{ ...cardSx, mb: 3, display: "flex", flexDirection: "column", gap: 1 }}>
                        {/* API Key */}
                        <Box sx={auditRowSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <KeyIcon sx={{ color: auditData.api_key.stored ? "#F59E0B" : "#22C55E", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary }}>
                                        API Key
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        {auditData.api_key.info}
                                    </Typography>
                                </Box>
                            </Box>
                            <Chip
                                label={auditData.api_key.stored ? "STORED" : "NONE"}
                                size="small"
                                sx={{
                                    bgcolor: auditData.api_key.stored ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                                    color: auditData.api_key.stored ? "#F59E0B" : "#22C55E",
                                    fontWeight: 700, fontSize: "0.7rem",
                                }}
                            />
                        </Box>

                        {/* Settings */}
                        <Box sx={auditRowSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <StorageIcon sx={{ color: auditData.settings.count > 0 ? "#3B82F6" : "#22C55E", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary }}>
                                        Settings
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        {auditData.settings.items.map((s) => `${s.key}: ${s.value}`).join(", ") || "No settings stored"}
                                    </Typography>
                                </Box>
                            </Box>
                            <Chip
                                label={`${auditData.settings.count} items`}
                                size="small"
                                sx={{ bgcolor: "rgba(59,130,246,0.15)", color: "#3B82F6", fontWeight: 700, fontSize: "0.7rem" }}
                            />
                        </Box>

                        {/* Usage Logs */}
                        <Box sx={auditRowSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <StatsIcon sx={{ color: auditData.usage_logs.count > 0 ? "#8B5CF6" : "#22C55E", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary }}>
                                        Usage Logs
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        {auditData.usage_logs.info}
                                        {auditData.usage_logs.last_query && ` — last: "${auditData.usage_logs.last_query.intent}"`}
                                    </Typography>
                                </Box>
                            </Box>
                            <Chip
                                label={`${auditData.usage_logs.count} logs`}
                                size="small"
                                sx={{ bgcolor: "rgba(139,92,246,0.15)", color: "#8B5CF6", fontWeight: 700, fontSize: "0.7rem" }}
                            />
                        </Box>

                        {/* Integrations */}
                        <Box sx={auditRowSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <StorageIcon sx={{ color: "#06B6D4", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary }}>
                                        Integrations
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        {auditData.integrations.info}
                                    </Typography>
                                </Box>
                            </Box>
                            <Chip
                                label={`${auditData.integrations.count} endpoints`}
                                size="small"
                                sx={{ bgcolor: "rgba(6,182,212,0.15)", color: "#06B6D4", fontWeight: 700, fontSize: "0.7rem" }}
                            />
                        </Box>

                        {/* Browser Sessions */}
                        <Box sx={auditRowSx}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <CookieIcon sx={{ color: "#F97316", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary }}>
                                        Browser Sessions
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        {auditData.electron_session.info}
                                    </Typography>
                                </Box>
                            </Box>
                            <Button
                                size="small"
                                onClick={clearSessions}
                                sx={{
                                    textTransform: "none", fontSize: "0.7rem", fontWeight: 600,
                                    color: "#F97316", borderColor: "rgba(249,115,22,0.3)",
                                    "&:hover": { bgcolor: "rgba(249,115,22,0.08)" },
                                }}
                                variant="outlined"
                            >
                                Clear Sessions
                            </Button>
                        </Box>

                        {/* .gitignore status */}
                        <Box sx={{ ...auditRowSx, bgcolor: "rgba(34,197,94,0.04)" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <CheckIcon sx={{ color: "#22C55E", fontSize: 20 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#22C55E" }}>
                                        .gitignore Protection
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                        *.db, data/, .env files are excluded from git
                                    </Typography>
                                </Box>
                            </Box>
                            <Chip label="SAFE" size="small" sx={{ bgcolor: "rgba(34,197,94,0.15)", color: "#22C55E", fontWeight: 700, fontSize: "0.7rem" }} />
                        </Box>
                    </Box>
                )}
            </Collapse>

            {/* ═══ Delete All Data Button ═══ */}
            <Button
                variant="contained"
                onClick={() => setPurgeDialogOpen(true)}
                startIcon={<DeleteIcon />}
                disabled={loading}
                sx={{
                    bgcolor: "rgba(239,68,68,0.15)", color: "#EF4444",
                    textTransform: "none", fontWeight: 700, px: 3, py: 1.2,
                    border: "1px solid rgba(239,68,68,0.3)",
                    "&:hover": { bgcolor: "rgba(239,68,68,0.25)", boxShadow: "0 0 20px rgba(239,68,68,0.2)" },
                }}
            >
                Delete All Personal Data
            </Button>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, mt: 1, display: "block" }}>
                Removes API keys, settings, usage logs, and browser sessions. Integrations are kept.
            </Typography>

            {/* Confirmation Dialog */}
            <Dialog
                open={purgeDialogOpen}
                onClose={() => setPurgeDialogOpen(false)}
                PaperProps={{
                    sx: {
                        bgcolor: COLORS.surface, border: `1px solid rgba(239,68,68,0.3)`,
                        borderRadius: 3, maxWidth: 420,
                    },
                }}
            >
                <DialogTitle sx={{ color: "#EF4444", fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
                    <WarningIcon /> Delete All Data?
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 2 }}>
                        This will permanently delete:
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        {[
                            "🔑 OpenRouter API Key",
                            "⚙️ All user settings (language, preferences)",
                            "📊 Usage logs (query history, token counts)",
                            "📈 Agent usage statistics",
                            "🍪 Browser sessions (cookies, logins)",
                        ].map((item) => (
                            <Typography key={item} variant="body2" sx={{ color: COLORS.textPrimary }}>
                                {item}
                            </Typography>
                        ))}
                    </Box>
                    <Typography variant="body2" sx={{ color: "#22C55E", mt: 2, fontWeight: 600 }}>
                        ✅ Integrations and agent configs are kept.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <Button onClick={() => setPurgeDialogOpen(false)} sx={{ color: COLORS.textMuted, textTransform: "none" }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={purgeAll}
                        variant="contained"
                        sx={{
                            bgcolor: "#EF4444", color: "#fff", textTransform: "none", fontWeight: 700,
                            "&:hover": { bgcolor: "#DC2626" },
                        }}
                    >
                        Delete Everything
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
});
