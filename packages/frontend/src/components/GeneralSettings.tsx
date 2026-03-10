// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — General Settings Panel
// ============================================================
// Language preferences + Data & Privacy.
// Uses SharedUI presets for consistent design.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Select,
    MenuItem,
    FormControl,
    Chip,
    Collapse,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Switch,
} from "@mui/material";
import {
    Language as LanguageIcon,
    Key as KeyIcon,
    Shield as ShieldIcon,
    DeleteForever as DeleteIcon,
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon,
    Cookie as CookieIcon,
    Storage as StorageIcon,
    QueryStats as StatsIcon,
    Extension as IntegIcon,
    TravelExplore as WebSearchIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    DangerButton,
    GhostButton,
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    sectionLabelSx,
    panelSx,
    rowSx,
    accentAlpha,
    LoadingSpinner,
} from "./ui/SharedUI";
import { useLanguage } from "../hooks/useLanguage";
import { LANGUAGES, type SupportedLanguage } from "../i18n";
import type { AuditData } from "../types/settings";

// ============================================================
// Component
// ============================================================

export const GeneralSettings = React.memo(function GeneralSettings() {
    const { language, setLanguage, tr } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [auditData, setAuditData] = useState<AuditData | null>(null);
    const [auditOpen, setAuditOpen] = useState(false);
    const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [webSearchEnabled, setWebSearchEnabled] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try { await fetch("/api/system/stats"); } catch (err) { console.warn("[GeneralSettings] stats prefetch failed:", err); }
        // Load web search fallback setting
        try {
            const res = await fetch("/api/system/settings");
            const json = await res.json();
            if (json.settings?.web_search_fallback !== undefined) {
                setWebSearchEnabled(json.settings.web_search_fallback !== "false");
            }
        } catch (err) { console.warn("[GeneralSettings] settings load failed:", err); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 5000); };

    if (loading) return <LoadingSpinner py={6} />;

    return (
        <Box>
            {/* Title */}
            <Typography variant="h5" sx={{ ...gradientTitleSx(), mb: 0.5 }}>
                ⚙️ General
            </Typography>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: "block", mb: 2.5 }}>
                Language preferences and data management
            </Typography>

            {/* ═══ Language ═══ */}
            <Box sx={panelSx}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                    <LanguageIcon sx={{ color: accentAlpha(0.7), fontSize: 20 }} />
                    <Typography sx={{ ...sectionLabelSx, mb: 0 }}>{tr.language}</Typography>
                </Box>

                <FormControl fullWidth size="small">
                    <Select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                        sx={{
                            bgcolor: COLORS.surfaceDark,
                            color: COLORS.textPrimary,
                            borderRadius: 2,
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
                            <MenuItem key={lang.code} value={lang.code}
                                sx={{ color: COLORS.textPrimary, "&:hover": { bgcolor: accentAlpha(0.08) }, "&.Mui-selected": { bgcolor: accentAlpha(0.12) } }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                    <Typography sx={{ fontSize: "1.2rem" }}>{lang.flag}</Typography>
                                    <Typography sx={{ fontWeight: 500 }}>{lang.label}</Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Typography variant="caption" sx={{ color: COLORS.textMuted, mt: 1, display: "block" }}>
                    {language === "en" ? "This affects the UI language and AI-generated content."
                        : language === "de" ? "Dies betrifft die UI-Sprache und KI-generierte Inhalte."
                            : language === "es" ? "Esto afecta el idioma de la interfaz y el contenido generado por IA."
                                : language === "fr" ? "Ceci affecte la langue de l'interface et le contenu généré par l'IA."
                                    : "これはUIの言語とAI生成コンテンツに影響します。"}
                </Typography>
            </Box>

            {/* ═══ Web Search Fallback ═══ */}
            <Box sx={{ ...panelSx, mt: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <WebSearchIcon sx={{ color: accentAlpha(0.7), fontSize: 20 }} />
                        <Box>
                            <Typography sx={{ ...sectionLabelSx, mb: 0 }}>Web Search Fallback</Typography>
                            <Typography variant="caption" sx={{ color: COLORS.textMuted, display: "block" }}>
                                When no integration matches, open a Google search
                            </Typography>
                        </Box>
                    </Box>
                    <Switch
                        checked={webSearchEnabled}
                        onChange={async (e) => {
                            const newVal = e.target.checked;
                            setWebSearchEnabled(newVal);
                            try {
                                await fetch("/api/system/settings", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ key: "web_search_fallback", value: String(newVal) }),
                                });
                            } catch { setWebSearchEnabled(!newVal); }
                        }}
                        sx={{
                            "& .MuiSwitch-switchBase.Mui-checked": { color: accentAlpha(1) },
                            "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: accentAlpha(0.5) },
                        }}
                    />
                </Box>
            </Box>

            {/* Hint: API Key in LLM tab */}
            <Box sx={{ ...rowSx, mt: 2, mb: 3, gap: 1.5 }}>
                <KeyIcon sx={{ color: accentAlpha(0.6), fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                    API Key and LLM Provider settings can be found in the <strong>LLM</strong> tab.
                </Typography>
            </Box>

            {/* ═══ Data & Privacy ═══ */}
            <Typography variant="h5" sx={{ ...gradientTitleSx(), mb: 0.5, background: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)" }}>
                🛡️ Data & Privacy
            </Typography>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: "block", mb: 2 }}>
                View stored data and manage your privacy
            </Typography>

            {/* Status */}
            {msg && (
                <Box sx={{
                    p: 1.5, borderRadius: 2, mb: 2,
                    bgcolor: msg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                    border: `1px solid ${msg.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}>
                    <Typography variant="body2" sx={{ color: msg.ok ? "#22C55E" : "#EF4444", fontWeight: 600 }}>
                        {msg.ok ? "✅" : "❌"} {msg.text}
                    </Typography>
                </Box>
            )}

            {/* Audit + Delete buttons */}
            <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
                <GradientButton
                    onClick={async () => {
                        if (auditData && auditOpen) { setAuditOpen(false); return; }
                        try {
                            const res = await fetch("/api/system/audit");
                            const json = await res.json();
                            setAuditData(json.audit);
                            setAuditOpen(true);
                        } catch { flash("Audit fetch failed", false); }
                    }}
                    sx={{ textTransform: "none" }}
                >
                    <ShieldIcon sx={{ fontSize: 18, mr: 0.5 }} />
                    Data Audit
                    {auditOpen ? <CollapseIcon sx={{ ml: 0.5 }} /> : <ExpandIcon sx={{ ml: 0.5 }} />}
                </GradientButton>

                <DangerButton onClick={() => setPurgeDialogOpen(true)} sx={{ textTransform: "none" }}>
                    <DeleteIcon sx={{ fontSize: 18, mr: 0.5 }} />
                    Delete All Data
                </DangerButton>
            </Box>

            {/* Audit Results */}
            <Collapse in={auditOpen && !!auditData}>
                {auditData && (
                    <Box sx={{ ...panelSx, mb: 2, display: "flex", flexDirection: "column", gap: 0.5 }}>
                        <AuditRow icon={<KeyIcon sx={{ fontSize: 18 }} />} color={auditData.api_key.stored ? "#F59E0B" : "#22C55E"}
                            label="API Key" detail={auditData.api_key.info}
                            badge={auditData.api_key.stored ? "STORED" : "NONE"} badgeColor={auditData.api_key.stored ? "#F59E0B" : "#22C55E"} />

                        <AuditRow icon={<StorageIcon sx={{ fontSize: 18 }} />} color="#3B82F6"
                            label="Settings" detail={auditData.settings.items.map(s => `${s.key}: ${s.value}`).join(", ") || "No settings"}
                            badge={`${auditData.settings.count} items`} badgeColor="#3B82F6" />

                        <AuditRow icon={<StatsIcon sx={{ fontSize: 18 }} />} color="#8B5CF6"
                            label="Usage Logs" detail={auditData.usage_logs.info + (auditData.usage_logs.last_query ? ` — last: "${auditData.usage_logs.last_query.intent}"` : "")}
                            badge={`${auditData.usage_logs.count} logs`} badgeColor="#8B5CF6" />

                        <AuditRow icon={<IntegIcon sx={{ fontSize: 18 }} />} color="#06B6D4"
                            label="Integrations" detail={auditData.integrations.info}
                            badge={`${auditData.integrations.count} endpoints`} badgeColor="#06B6D4" />

                        <AuditRow icon={<CookieIcon sx={{ fontSize: 18 }} />} color="#F97316"
                            label="Browser Sessions" detail={auditData.electron_session.info}
                            action={
                                <DangerButton sx={{ minWidth: 0, px: 1.5, py: 0.2, fontSize: "0.7rem" }}
                                    onClick={async () => {
                                        try {
                                            if (window.electronAPI?.clearSession) {
                                                await window.electronAPI.clearSession();
                                                flash("Browser sessions cleared", true);
                                            } else {
                                                flash("Session clearing only available in Electron app", false);
                                            }
                                        } catch { flash("Error clearing sessions", false); }
                                    }}>Clear</DangerButton>
                            } />

                        <Box sx={{ ...rowSx, bgcolor: "rgba(34,197,94,0.04)" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <CheckIcon sx={{ color: "#22C55E", fontSize: 18 }} />
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: "#22C55E", fontSize: "0.85rem" }}>.gitignore Protection</Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted }}>*.db, data/, .env files are excluded from git</Typography>
                                </Box>
                            </Box>
                            <Chip label="SAFE" size="small" sx={{ bgcolor: "rgba(34,197,94,0.15)", color: "#22C55E", fontWeight: 700, fontSize: "0.7rem" }} />
                        </Box>
                    </Box>
                )}
            </Collapse>

            {/* ═══ Confirmation Dialog ═══ */}
            <Dialog open={purgeDialogOpen} onClose={() => setPurgeDialogOpen(false)}
                PaperProps={{ sx: { bgcolor: COLORS.surface, border: "1px solid rgba(239,68,68,0.3)", borderRadius: 3, maxWidth: 420 } }}>
                <DialogTitle sx={{ color: "#EF4444", fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
                    <WarningIcon /> Delete All Data?
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 2 }}>This will permanently delete:</Typography>
                    {[
                        "🔑 API keys & user settings",
                        "📊 Usage logs (query history)",
                        "📈 Agent statistics",
                        "🧩 All integrations",
                        "📌 Pinned blocks & scraper endpoints",
                        "📋 Changelog entries",
                        "🍪 Browser sessions (cookies, logins)",
                    ].map((item) => (
                        <Typography key={item} variant="body2" sx={{ color: COLORS.textPrimary, py: 0.3 }}>{item}</Typography>
                    ))}
                    <Typography variant="body2" sx={{ color: "#22C55E", mt: 2, fontWeight: 600 }}>
                        ✅ Agent pipeline configurations are preserved.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <GhostButton onClick={() => setPurgeDialogOpen(false)}>Cancel</GhostButton>
                    <DangerButton
                        onClick={async () => {
                            setPurgeDialogOpen(false);
                            try {
                                const res = await fetch("/api/system/data", { method: "DELETE" });
                                const json = await res.json();
                                if (json.ok) {
                                    if (window.electronAPI?.clearSession) await window.electronAPI.clearSession();
                                    // Reload to clear all React state (pinned cards, etc.)
                                    window.location.reload();
                                } else {
                                    flash(json.error || "Could not purge data", false);
                                }
                            } catch { flash("Could not purge data", false); }
                        }}
                    >
                        Delete Everything
                    </DangerButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
});

// ============================================================
// Audit Row (reusable sub-component)
// ============================================================

function AuditRow({ icon, color, label, detail, badge, badgeColor, action }: {
    icon: React.ReactNode; color: string; label: string; detail: string;
    badge?: string; badgeColor?: string; action?: React.ReactNode;
}) {
    return (
        <Box sx={rowSx}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flex: 1, minWidth: 0 }}>
                <Box sx={{ color, flexShrink: 0 }}>{icon}</Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: "0.85rem" }}>{label}</Typography>
                    <Typography variant="caption" sx={{ color: COLORS.textMuted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</Typography>
                </Box>
            </Box>
            {action || (badge && (
                <Chip label={badge} size="small" sx={{ bgcolor: `${badgeColor}26`, color: badgeColor, fontWeight: 700, fontSize: "0.7rem" }} />
            ))}
        </Box>
    );
}
