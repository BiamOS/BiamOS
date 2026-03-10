// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — LLM Settings Panel
// ============================================================
// Tab-based provider selection with connection status indicators.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Chip, CircularProgress, IconButton } from "@mui/material";
import {
    Api as ApiIcon,
    Key as KeyIcon,
    Visibility as ShowIcon,
    VisibilityOff as HideIcon,
    Cloud as CloudIcon,
    Computer as LocalIcon,
    TuneRounded as CustomIcon,
    CheckCircle as CheckIcon,
    Wifi as TestIcon,
    DeleteOutline as DeleteIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    DangerButton,
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    sectionLabelSx,
    panelSx,
    accentAlpha,
    LoadingSpinner,
    StatusDot,
} from "./ui/SharedUI";

// ============================================================
// Types & Providers
// ============================================================

type LLMProvider = "openrouter" | "ollama" | "lmstudio" | "custom";
type ConnStatus = "ok" | "fail" | "unknown" | "checking";

interface SystemStats { masked_api_key: string }
interface ProviderState { provider: LLMProvider; baseUrl: string; hasApiKey: boolean }

const PROVIDERS: { id: LLMProvider; label: string; url: string; needsKey: boolean; untested?: boolean }[] = [
    { id: "openrouter", label: "☁️ OpenRouter", url: "https://openrouter.ai/api/v1", needsKey: true },
    { id: "ollama", label: "🖥️ Ollama", url: "http://localhost:11434/v1", needsKey: false, untested: true },
    { id: "lmstudio", label: "🖥️ LM Studio", url: "http://localhost:1234/v1", needsKey: false, untested: true },
    { id: "custom", label: "⚙️ Custom", url: "http://localhost:8080/v1", needsKey: false, untested: true },
];

// ============================================================
// Styles
// ============================================================

const chipSx = (active: boolean) => ({
    bgcolor: active ? accentAlpha(0.15) : COLORS.surface,
    color: active ? accentAlpha(0.9) : COLORS.textSecondary,
    border: `1px solid ${active ? COLORS.borderHover : COLORS.border}`,
    fontWeight: active ? 700 : 500,
    transition: "all 0.2s ease",
    cursor: "pointer",
    height: 36,
    fontSize: "0.85rem",
    px: 1,
    "&:hover": { bgcolor: accentAlpha(0.1), borderColor: COLORS.borderHover },
});

const monoBoxSx = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.8rem",
    color: COLORS.textSecondary,
    p: 1.2,
    bgcolor: COLORS.surfaceDark,
    borderRadius: 1.5,
    display: "flex",
    alignItems: "center",
    gap: 1,
};

const CONN_STATUS_MAP: Record<ConnStatus, string> = {
    ok: "healthy",
    fail: "offline",
    checking: "checking",
    unknown: "unknown",
};

// ============================================================
// Component
// ============================================================

export const LLMSettings = React.memo(function LLMSettings() {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [prov, setProv] = useState<ProviderState>({ provider: "openrouter", baseUrl: "", hasApiKey: false });
    const [customUrl, setCustomUrl] = useState("");
    const [connStatus, setConnStatus] = useState<Record<LLMProvider, ConnStatus>>({
        openrouter: "unknown", ollama: "unknown", lmstudio: "unknown", custom: "unknown",
    });

    // ─── Fetch ──────────────────────────────────────────────

    const load = useCallback(async (): Promise<LLMProvider> => {
        let activeProvider: LLMProvider = "openrouter";
        try {
            const [statsRes, provRes] = await Promise.all([
                fetch("/api/system/stats"),
                fetch("/api/system/provider"),
            ]);
            const s = await statsRes.json();
            const p = await provRes.json();
            setStats(s.stats);
            activeProvider = p.provider || "openrouter";
            setProv({ provider: activeProvider, baseUrl: p.baseUrl || "", hasApiKey: p.hasApiKey || false });
            if (activeProvider === "custom") setCustomUrl(p.baseUrl || "");
        } catch (err) { console.warn("[LLMSettings] config load failed:", err); }
        setLoading(false);
        return activeProvider;
    }, []);

    // Auto-test all providers on load
    const testAllProviders = useCallback(async (activeProvider: LLMProvider) => {
        for (const p of PROVIDERS) {
            setConnStatus(prev => ({ ...prev, [p.id]: "checking" }));
            try {
                // For the active provider, use the main test endpoint (has DB API key)
                if (p.id === activeProvider) {
                    const res = await fetch("/api/system/provider/test", { method: "POST" });
                    const data = await res.json();
                    setConnStatus(prev => ({ ...prev, [p.id]: data.ok ? "ok" : "fail" }));
                } else {
                    // For inactive providers, just ping their default URL
                    const res = await fetch("/api/system/provider/test-url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ baseUrl: p.url }),
                    });
                    const data = await res.json();
                    setConnStatus(prev => ({ ...prev, [p.id]: data.ok ? "ok" : "fail" }));
                }
            } catch {
                setConnStatus(prev => ({ ...prev, [p.id]: "fail" }));
            }
        }
    }, []);

    useEffect(() => {
        load().then((activeProv) => testAllProviders(activeProv));
    }, [load, testAllProviders]);

    // ─── Handlers ───────────────────────────────────────────

    const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

    const switchProvider = async (id: LLMProvider) => {
        setSaving(true); setMsg(null);
        const def = PROVIDERS.find(p => p.id === id)!;
        const body: Record<string, string> = { provider: id };
        if (id === "custom") body.baseUrl = customUrl || def.url;

        try {
            const res = await fetch("/api/system/provider", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setProv(prev => ({ ...prev, provider: id, baseUrl: body.baseUrl || def.url }));
                flash(`Switched to ${def.label.replace(/^[^\w]*/, "")} ✓`, true);
            } else flash("Failed to save", false);
        } catch { flash("Connection error", false); }
        setSaving(false);
    };

    const saveKey = async () => {
        if (!newKey.trim()) return;
        setSaving(true); setMsg(null);
        try {
            const res = await fetch("/api/system/provider", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: prov.provider, apiKey: newKey.trim() }),
            });
            if (res.ok) {
                flash("API key saved ✓", true);
                setNewKey(""); setProv(prev => ({ ...prev, hasApiKey: true }));
                load();
                // Re-test this provider with the new key
                testProvider(prov.provider);
            } else flash("Failed to save", false);
        } catch { flash("Connection error", false); }
        setSaving(false);
    };

    const deleteKey = async () => {
        if (!confirm("Remove API key for this provider?")) return;
        try {
            const res = await fetch("/api/system/provider/key", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: prov.provider }),
            });
            if (res.ok) {
                flash("API key removed ✓", true);
                setProv(prev => ({ ...prev, hasApiKey: false }));
                load();
                testProvider(prov.provider);
            } else flash("Failed to remove key", false);
        } catch { flash("Connection error", false); }
    };

    const saveCustomUrl = async () => {
        if (!customUrl.trim()) return;
        try {
            const res = await fetch("/api/system/provider", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: "custom", baseUrl: customUrl.trim() }),
            });
            if (res.ok) {
                flash("URL saved ✓", true);
                setProv(prev => ({ ...prev, baseUrl: customUrl.trim() }));
                testProvider("custom");
            }
        } catch (err) { console.warn("[LLMSettings] custom URL save failed:", err); }
    };

    const testProvider = async (id: LLMProvider) => {
        const def = PROVIDERS.find(p => p.id === id)!;
        setConnStatus(prev => ({ ...prev, [id]: "checking" }));
        setTesting(true); setMsg(null);
        try {
            const res = await fetch("/api/system/provider/test-url", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ baseUrl: id === "custom" ? (customUrl || def.url) : def.url }),
            });
            const data = await res.json();
            setConnStatus(prev => ({ ...prev, [id]: data.ok ? "ok" : "fail" }));
            flash(data.ok ? "Connected ✓" : "Connection failed", data.ok);
        } catch {
            setConnStatus(prev => ({ ...prev, [id]: "fail" }));
            flash("Server not reachable", false);
        }
        setTesting(false);
    };

    // ─── Render ─────────────────────────────────────────────

    if (loading) return <LoadingSpinner py={6} />;

    const active = PROVIDERS.find(p => p.id === prov.provider)!;
    const needsKey = active.needsKey || prov.provider === "custom";

    return (
        <Box>
            {/* Header */}
            <Typography variant="h5" sx={{ ...gradientTitleSx(), mb: 0.5 }}>
                🧠 LLM Settings
            </Typography>
            <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: "block", mb: 2, lineHeight: 1.5, maxWidth: 600 }}>
                Configure which AI provider powers BiamOS. Connect via OpenRouter for access to multiple models,
                or use a direct provider like OpenAI or Gemini. Set your API key, choose a model, and test the connection.
            </Typography>

            {/* ═══ Provider Tabs with Status Dots ═══ */}
            <Box sx={{ display: "flex", gap: 1, mb: 2.5, flexWrap: "wrap" }}>
                {PROVIDERS.map(p => (
                    <Chip
                        key={p.id}
                        label={
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                                <StatusDot status={CONN_STATUS_MAP[connStatus[p.id]]} />
                                {p.label}
                            </Box>
                        }
                        onClick={() => switchProvider(p.id)}
                        disabled={saving}
                        sx={chipSx(prov.provider === p.id)}
                    />
                ))}
            </Box>

            {/* ═══ Untested Provider Banner ═══ */}
            {active.untested && (
                <Box sx={{
                    display: "flex", alignItems: "center", gap: 1,
                    p: 1.5, mb: 2, borderRadius: 2,
                    bgcolor: "rgba(255, 183, 0, 0.08)",
                    border: "1px solid rgba(255, 183, 0, 0.25)",
                }}>
                    <Typography sx={{ fontSize: "0.8rem", color: "rgba(255, 183, 0, 0.9)" }}>
                        ⚠️ This provider has not been tested yet. It may work, but is not officially supported.
                    </Typography>
                </Box>
            )}

            {/* ═══ Active Provider Config ═══ */}
            <Box sx={panelSx}>
                {/* Endpoint */}
                <Typography sx={{ ...sectionLabelSx, mb: 1 }}>Endpoint</Typography>
                <Box sx={monoBoxSx}>
                    <ApiIcon sx={{ fontSize: 14, color: COLORS.textMuted, flexShrink: 0 }} />
                    {prov.provider === "custom" ? (
                        <Box
                            component="input"
                            value={customUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomUrl(e.target.value)}
                            onBlur={saveCustomUrl}
                            placeholder="http://localhost:8080/v1"
                            sx={{
                                flex: 1, border: "none", outline: "none", bgcolor: "transparent",
                                color: COLORS.textPrimary, fontSize: "0.8rem",
                                fontFamily: "'JetBrains Mono', monospace",
                                "::placeholder": { color: COLORS.textMuted },
                            }}
                        />
                    ) : (
                        <span>{prov.baseUrl || active.url}</span>
                    )}
                </Box>

                {/* API Key Section */}
                {needsKey ? (
                    <Box sx={{ mt: 2.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Typography sx={sectionLabelSx}>API Key</Typography>
                            {prov.hasApiKey && (
                                <DangerButton
                                    onClick={deleteKey}
                                    sx={{ minWidth: 0, px: 1.5, py: 0.2, fontSize: "0.7rem" }}
                                >
                                    <DeleteIcon sx={{ fontSize: 14, mr: 0.3 }} /> Delete Key
                                </DangerButton>
                            )}
                        </Box>

                        {prov.hasApiKey && (
                            <Box sx={{ ...monoBoxSx, mb: 1.5, color: "rgba(255,255,255,0.45)" }}>
                                <CheckIcon sx={{ fontSize: 14, color: COLORS.green || "#00dc64" }} />
                                {stats?.masked_api_key ?? "Key configured"}
                            </Box>
                        )}

                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Box sx={{
                                flex: 1, display: "flex", alignItems: "center", gap: 1,
                                p: 1, borderRadius: 2, bgcolor: COLORS.surfaceDark,
                                border: `1px solid ${COLORS.border}`,
                                "&:focus-within": { borderColor: accentAlpha(0.6) },
                            }}>
                                <KeyIcon sx={{ fontSize: 14, color: COLORS.textMuted }} />
                                <Box
                                    component="input"
                                    type={showKey ? "text" : "password"}
                                    value={newKey}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
                                    placeholder={prov.provider === "openrouter" ? "sk-or-..." : "API key..."}
                                    sx={{
                                        flex: 1, border: "none", outline: "none", bgcolor: "transparent",
                                        color: COLORS.textPrimary, fontSize: "0.85rem",
                                        "::placeholder": { color: COLORS.textMuted },
                                    }}
                                />
                                <IconButton size="small" onClick={() => setShowKey(!showKey)} sx={{ color: COLORS.textSecondary }}>
                                    {showKey ? <HideIcon sx={{ fontSize: 16 }} /> : <ShowIcon sx={{ fontSize: 16 }} />}
                                </IconButton>
                            </Box>
                            <GradientButton onClick={saveKey} disabled={!newKey.trim()} loading={saving}>
                                Save
                            </GradientButton>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 2, color: COLORS.green || "#00dc64" }}>
                        <CheckIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            No API key needed — runs locally
                        </Typography>
                    </Box>
                )}

                {/* Test Connection */}
                <Box sx={{ mt: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
                    <GradientButton
                        onClick={() => testProvider(prov.provider)}
                        loading={testing}
                        sx={{ px: 2.5 }}
                    >
                        <TestIcon sx={{ fontSize: 16, mr: 0.5 }} /> Test Connection
                    </GradientButton>
                    {msg && (
                        <Typography variant="caption" sx={{
                            color: msg.ok ? (COLORS.green || "#00dc64") : "#ff5050",
                            fontWeight: 600,
                        }}>
                            {msg.text}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
});
