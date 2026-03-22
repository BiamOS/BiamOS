// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Onboarding Welcome Screen
// ============================================================
// Multi-step wizard shown when no API key is configured.
// Beautiful, informative, and guides the user through setup.
// ============================================================

import React, { useState, useEffect } from "react";
import { Box, Typography, IconButton, Chip, CircularProgress } from "@mui/material";
import {
    ArrowForward as NextIcon,
    ArrowBack as BackIcon,
    Key as KeyIcon,
    Visibility as ShowIcon,
    VisibilityOff as HideIcon,
    CheckCircle as CheckIcon,
    AutoAwesome as AIIcon,
    Dashboard as DashboardIcon,
    Extension as BlockIcon,
    Api as ApiIcon,
    RocketLaunch as RocketIcon,
    Store as ShopIcon,
    Tune as AgentIcon,
    Search as SearchIcon,
    Cloud as CloudIcon,
    Computer as LocalIcon,
    Lock as PrivacyIcon,
    Speed as SpeedIcon,
    Wifi as TestIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    DangerButton,
    COLORS,
    GRADIENTS,
    accentAlpha,
} from "./ui/SharedUI";

// ============================================================
// Props & Types
// ============================================================

interface OnboardingProps { onComplete: () => void }
type LLMChoice = "openrouter" | "ollama" | "lmstudio" | "custom";

const LLM_OPTIONS: { id: LLMChoice; label: string; icon: React.ReactNode; desc: string; url: string; needsKey: boolean; badge: string }[] = [
    { id: "openrouter", label: "OpenRouter", icon: <CloudIcon />, desc: "200+ cloud models (GPT-4o, Claude, Gemini)", url: "https://openrouter.ai/api/v1", needsKey: true, badge: "CLOUD" },
    { id: "ollama", label: "Ollama", icon: <LocalIcon />, desc: "Run Llama, Mistral, Gemma locally — ⚠️ not yet tested", url: "http://localhost:11434/v1", needsKey: false, badge: "ON-PREM" },
    { id: "lmstudio", label: "LM Studio", icon: <LocalIcon />, desc: "Local models with a beautiful UI — ⚠️ not yet tested", url: "http://localhost:1234/v1", needsKey: false, badge: "ON-PREM" },
    { id: "custom", label: "Custom", icon: <AgentIcon />, desc: "Any OpenAI-compatible endpoint — ⚠️ not yet tested", url: "http://localhost:8080/v1", needsKey: false, badge: "CUSTOM" },
];

// ============================================================
// Styles
// ============================================================

const containerSx = {
    position: "fixed" as const, inset: 0, zIndex: 9999,
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    background: "#000000",
    overflow: "hidden",
};

const cardGlassSx = {
    maxWidth: 720, width: "92%", p: { xs: 3, sm: 5 },
    borderRadius: 4,
    background: "rgba(28, 28, 30, 0.4)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    position: "relative" as const, overflow: "hidden",
};

const featureCardSx = {
    flex: "1 1 180px", p: 2.5, borderRadius: 3,
    bgcolor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
    textAlign: "center" as const, transition: "all 0.3s ease",
    "&:hover": { transform: "translateY(-4px)", borderColor: "rgba(255,255,255,0.15)", bgcolor: "rgba(255,255,255,0.05)" },
};

const pillSx = {
    display: "flex", alignItems: "center", gap: 2, p: 2, borderRadius: 2.5,
    bgcolor: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
    transition: "all 0.3s ease",
};

const strengthSx = {
    flex: "1 1 200px", p: 2, borderRadius: 2.5, textAlign: "center" as const,
    bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
};

const iconCircleSx = (color: string) => ({
    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    bgcolor: `${color}18`, border: `1.5px solid ${color}30`,
    color: color,
});

const progressDotSx = (active: boolean, done: boolean) => ({
    width: active ? 32 : 10, height: 10, borderRadius: 5,
    bgcolor: done ? "#8E8E93" : active ? COLORS.accent : "rgba(255,255,255,0.15)",
    transition: "all 0.4s ease",
});

const providerTabSx = (active: boolean) => ({
    p: 2, borderRadius: 2.5, cursor: "pointer",
    bgcolor: active ? "rgba(220, 0, 112, 0.08)" : "rgba(255,255,255,0.02)",
    border: `1.5px solid ${active ? COLORS.accent : "rgba(255,255,255,0.06)"}`,
    transition: "all 0.25s ease",
    "&:hover": { borderColor: active ? COLORS.accent : "rgba(255,255,255,0.15)", bgcolor: active ? "rgba(220, 0, 112, 0.12)" : "rgba(255,255,255,0.05)" },
});

// ============================================================
// Component
// ============================================================

export const OnboardingScreen = React.memo(function OnboardingScreen({ onComplete }: OnboardingProps) {
    const [step, setStep] = useState(0);
    const [fadeIn, setFadeIn] = useState(true);

    // Step 4 state
    const [llmChoice, setLlmChoice] = useState<LLMChoice>("openrouter");
    const [newKey, setNewKey] = useState("");
    const [customUrl, setCustomUrl] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [keyMsg, setKeyMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const totalSteps = 4;

    useEffect(() => {
        setFadeIn(false);
        const t = setTimeout(() => setFadeIn(true), 50);
        return () => clearTimeout(t);
    }, [step]);

    const next = () => { if (step < totalSteps - 1) setStep(s => s + 1); };
    const prev = () => { if (step > 0) setStep(s => s - 1); };

    const saveProvider = async () => {
        const option = LLM_OPTIONS.find(o => o.id === llmChoice)!;
        setSaving(true); setKeyMsg(null);

        try {
            const body: Record<string, string> = { provider: llmChoice };
            if (llmChoice === "custom" && customUrl.trim()) body.baseUrl = customUrl.trim();
            if (option.needsKey && newKey.trim()) body.apiKey = newKey.trim();

            const res = await fetch("/api/system/provider", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                // Test connection
                const testRes = await fetch("/api/system/provider/test", { method: "POST" });
                const testData = await testRes.json();
                if (testData.ok) {
                    setKeyMsg({ text: `Connected! ${testData.message || "Ready to go."}`, ok: true });
                    setTimeout(() => onComplete(), 1500);
                } else {
                    setKeyMsg({ text: testData.message || "Connection failed — check your configuration", ok: false });
                }
            } else {
                setKeyMsg({ text: "Failed to save", ok: false });
            }
        } catch {
            setKeyMsg({ text: "Connection error", ok: false });
        }
        setSaving(false);
    };

    return (
        <Box sx={containerSx}>
            {/* Decorative orbs */}


            <Box sx={{
                ...cardGlassSx,
                opacity: fadeIn ? 1 : 0, transform: fadeIn ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 0.4s ease, transform 0.4s ease",
            }}>
                {step === 0 && <StepWelcome />}
                {step === 1 && <StepHowItWorks />}
                {step === 2 && <StepWhyBiamOS />}
                {step === 3 && (
                    <StepLLMSetup
                        llmChoice={llmChoice} setLlmChoice={setLlmChoice}
                        newKey={newKey} setNewKey={setNewKey}
                        customUrl={customUrl} setCustomUrl={setCustomUrl}
                        showKey={showKey} setShowKey={setShowKey}
                        saving={saving} keyMsg={keyMsg}
                        onSave={saveProvider} onSkip={onComplete}
                    />
                )}

                {/* Navigation */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 4, pt: 3, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {step > 0 ? (
                        <IconButton onClick={prev} sx={{ color: COLORS.textSecondary, "&:hover": { color: COLORS.textPrimary } }}>
                            <BackIcon />
                        </IconButton>
                    ) : <Box />}

                    <Box sx={{ display: "flex", gap: 0.8 }}>
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <Box key={i} sx={progressDotSx(i === step, i < step)} />
                        ))}
                    </Box>

                    {step < totalSteps - 1 ? (
                        <GradientButton onClick={next} sx={{ px: 3 }}>
                            Next <NextIcon sx={{ fontSize: 18, ml: 0.5 }} />
                        </GradientButton>
                    ) : <Box sx={{ width: 90 }} />}
                </Box>
            </Box>
        </Box>
    );
});

// ============================================================
// Step 1 — Welcome
// ============================================================

function StepWelcome() {
    return (
        <Box sx={{ textAlign: "center" }}>
            <Typography sx={{
                fontWeight: 900, fontSize: "3.8rem", letterSpacing: "-0.04em",
                background: "linear-gradient(135deg, #FFFFFF 0%, #8E8E93 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 0.5,
            }}>
                Welcome to BiamOS.
            </Typography>
            <Typography variant="h5" sx={{ color: COLORS.textPrimary, fontWeight: 700, mb: 1 }}>
                Powered by Lura Core.
            </Typography>
            <Typography variant="body1" sx={{ color: COLORS.textSecondary, mb: 4, maxWidth: 540, mx: "auto", lineHeight: 1.7 }}>
                Transform your desktop into a proactive command center. End the era of broken tabs and manual tasks with the first OS built completely on agentic intelligence.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                {[
                    { icon: <AIIcon sx={{ fontSize: 36 }} />, color: "#8E8E93", title: "Agentic Web Browser", sub: "The Copilot reads the DOM, clicks elements, types text, and navigates seamlessly across any website tab." },
                    { icon: <BlockIcon sx={{ fontSize: 36 }} />, color: "#8E8E93", title: "Dynamic Canvas", sub: "Stop reading raw chat responses. The LLM generates interactive data blocks you can pin to your dashboard." },
                    { icon: <PrivacyIcon sx={{ fontSize: 36 }} />, color: "#8E8E93", title: "Reflexive Memory", sub: "Lura learns your routines. Repetitive verified workflows are instantly recognized via local vector memory." },
                ].map((f, i) => (
                    <Box key={i} sx={featureCardSx}>
                        <Box sx={{ color: f.color, mb: 1 }}>{f.icon}</Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>{f.title}</Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.5, display: "block", mt: 0.3 }}>{f.sub}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

// ============================================================
// Step 2 — How It Works
// ============================================================

function StepHowItWorks() {
    const items = [
        { icon: <AgentIcon />, color: "#8E8E93", title: "Dual-Agent Architecture", desc: "Two specialized systems: The OS Assistant controls your UI layout, while the Web Agent acts directly within your browser DOM." },
        { icon: <PrivacyIcon />, color: "#8E8E93", title: "Per-Tab Ghost-Auth Isolation", desc: "Each tab is an independent Chromium instance. Log in normally; the AI uses your secure cookies without needing any API keys." },
        { icon: <AIIcon />, color: "#8E8E93", title: "Reflexive Memory Engine", desc: "Local semantic embedding matches your intent with previously verified workflows, executing complex routines instantly." },
        { icon: <DashboardIcon />, color: "#8E8E93", title: "Global Task Manager", desc: "A unified Command Center tracks all running AI sequences and agent reasoning loops across your entire workspace in real-time." },
    ];

    return (
        <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: COLORS.textPrimary, mb: 0.5 }}>
                ⚡ The Lura Core Engine
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 3 }}>
                Four pillars that power your intelligent OS
            </Typography>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {items.map((item, i) => (
                    <Box key={i} sx={pillSx}>
                        <Box sx={iconCircleSx(item.color)}>{item.icon}</Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: COLORS.textPrimary, mb: 0.3 }}>{item.title}</Typography>
                            <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.5, display: "block" }}>{item.desc}</Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

// ============================================================
// Step 3 — Why BiamOS (Strengths & Differentiators)
// ============================================================

function StepWhyBiamOS() {
    return (
        <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: COLORS.textPrimary, mb: 0.5 }}>
                🚀 Why This Changes Everything
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 3 }}>
                What makes this OS different from every other chat tool out there
            </Typography>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 3 }}>
                {[
                    { icon: <SpeedIcon sx={{ fontSize: 28 }} />, color: "#8E8E93", title: "URL-First Strategy", sub: "The agent bypasses broken SPA (React) interfaces and uses direct URL parameter navigation to completely eliminate input loops." },
                    { icon: <SearchIcon sx={{ fontSize: 28 }} />, color: "#8E8E93", title: "Set-of-Mark Vision", sub: "Absolute precision. Page elements are tagged with numeric IDs so the agent clicks exactly what it needs to, every time." },
                    { icon: <PrivacyIcon sx={{ fontSize: 28 }} />, color: "#8E8E93", title: "1-Click Data Audit", sub: "Total control. Check the Data Audit panel anytime to see exactly what workflows and history are stored in your local SQLite database." },
                    { icon: <ShopIcon sx={{ fontSize: 28 }} />, color: "#8E8E93", title: "No Developer Keys", sub: "Ghost-Auth uses your active browser session. Automate Gmail, X.com, or Notion using standard user cookies without needing OAuth." },
                ].map((s, i) => (
                    <Box key={i} sx={strengthSx}>
                        <Box sx={{ color: s.color, mb: 1 }}>{s.icon}</Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: COLORS.textPrimary, mb: 0.3 }}>{s.title}</Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.5, display: "block" }}>{s.sub}</Typography>
                    </Box>
                ))}
            </Box>

            {/* Comparison pill */}
            <Box sx={{
                p: 2, borderRadius: 2.5,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
            }}>
                <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, mb: 0.5 }}>
                    💡 Say goodbye to the chat window...
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.6, display: "block" }}>
                    BiamOS acts as an intelligent layer over your entire workflow, replacing massive text dialogues with visual blocks and autonomous background actions.
                </Typography>
            </Box>
        </Box>
    );
}

// ============================================================
// Step 4 — LLM Provider Setup (All Providers)
// ============================================================

function StepLLMSetup({ llmChoice, setLlmChoice, newKey, setNewKey, customUrl, setCustomUrl, showKey, setShowKey, saving, keyMsg, onSave, onSkip }: {
    llmChoice: LLMChoice; setLlmChoice: (v: LLMChoice) => void;
    newKey: string; setNewKey: (v: string) => void;
    customUrl: string; setCustomUrl: (v: string) => void;
    showKey: boolean; setShowKey: (v: boolean) => void;
    saving: boolean; keyMsg: { text: string; ok: boolean } | null;
    onSave: () => void; onSkip: () => void;
}) {
    const option = LLM_OPTIONS.find(o => o.id === llmChoice)!;

    return (
        <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: COLORS.textPrimary, mb: 0.5 }}>
                🔌 Choose Your AI Provider
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 2.5 }}>
                Cloud or on-premise — Power your BiamOS agents with any OpenAI-compatible API.
            </Typography>

            {/* Provider Grid */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2.5 }}>
                {LLM_OPTIONS.map(opt => (
                    <Box key={opt.id} sx={providerTabSx(llmChoice === opt.id)} onClick={() => setLlmChoice(opt.id)}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                            <Box sx={{ color: llmChoice === opt.id ? accentAlpha(0.9) : COLORS.textSecondary, display: "flex" }}>
                                {opt.icon}
                            </Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>{opt.label}</Typography>
                            <Chip label={opt.badge} size="small" sx={{
                                fontSize: "0.6rem", fontWeight: 800, height: 20,
                                bgcolor: opt.badge === "CLOUD" ? "rgba(139,92,246,0.15)" : opt.badge === "ON-PREM" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                                color: opt.badge === "CLOUD" ? "#8b5cf6" : opt.badge === "ON-PREM" ? "#22c55e" : "#f59e0b",
                            }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.4 }}>{opt.desc}</Typography>
                    </Box>
                ))}
            </Box>

            {/* Config Area */}
            <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Endpoint */}
                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.5, display: "block" }}>
                    Endpoint
                </Typography>
                {llmChoice === "custom" ? (
                    <Box component="input"
                        value={customUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomUrl(e.target.value)}
                        placeholder="http://localhost:8080/v1"
                        sx={{
                            width: "100%", border: "none", outline: "none", bgcolor: "rgba(255,255,255,0.03)",
                            color: COLORS.textPrimary, fontSize: "0.8rem", p: 1, borderRadius: 1.5,
                            fontFamily: "'JetBrains Mono', monospace", mb: 1.5,
                            "::placeholder": { color: COLORS.textMuted },
                        }}
                    />
                ) : (
                    <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.textSecondary, display: "block", mb: 1.5 }}>
                        {option.url}
                    </Typography>
                )}

                {/* API Key (if needed) */}
                {option.needsKey && (
                    <>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", mb: 0.5, display: "block" }}>
                            API Key
                        </Typography>
                        <Box sx={{
                            display: "flex", alignItems: "center", gap: 1,
                            p: 1, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)",
                            border: `1px solid ${COLORS.border}`,
                            "&:focus-within": { borderColor: accentAlpha(0.6) },
                        }}>
                            <KeyIcon sx={{ fontSize: 16, color: COLORS.textMuted }} />
                            <Box component="input"
                                type={showKey ? "text" : "password"} value={newKey}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") onSave(); }}
                                placeholder="sk-or-v1-..."
                                sx={{
                                    flex: 1, border: "none", outline: "none", bgcolor: "transparent",
                                    color: COLORS.textPrimary, fontSize: "0.85rem",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    "::placeholder": { color: COLORS.textMuted },
                                }}
                            />
                            <IconButton size="small" onClick={() => setShowKey(!showKey)} sx={{ color: COLORS.textSecondary }}>
                                {showKey ? <HideIcon sx={{ fontSize: 16 }} /> : <ShowIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                        </Box>
                    </>
                )}

                {/* Local provider hint */}
                {!option.needsKey && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                        <CheckIcon sx={{ fontSize: 16, color: "#22c55e" }} />
                        <Typography variant="caption" sx={{ color: "#22c55e" }}>
                            No API key needed — runs on your machine
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Status */}
            {keyMsg && (
                <Box sx={{
                    mt: 1.5, p: 1.5, borderRadius: 2,
                    bgcolor: keyMsg.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${keyMsg.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                    display: "flex", alignItems: "center", gap: 1,
                }}>
                    {keyMsg.ok && <CheckIcon sx={{ fontSize: 18, color: "#22c55e" }} />}
                    <Typography variant="body2" sx={{ color: keyMsg.ok ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{keyMsg.text}</Typography>
                </Box>
            )}

            {/* Action */}
            <Box sx={{ display: "flex", gap: 1.5, mt: 2 }}>
                <GradientButton onClick={onSave} disabled={option.needsKey && !newKey.trim()} loading={saving} sx={{ flex: 1, py: 1.2 }}>
                    <TestIcon sx={{ fontSize: 18, mr: 0.5 }} />
                    {saving ? "Connecting..." : "Connect & Start"}
                </GradientButton>
            </Box>

            <Typography onClick={onSkip} variant="caption" sx={{
                color: COLORS.textMuted, display: "block", textAlign: "center", mt: 1.5,
                cursor: "pointer", "&:hover": { color: COLORS.textSecondary },
            }}>
                Skip for now — configure in Settings → LLM later
            </Typography>

            <Box sx={{ mt: 3, p: 2, borderRadius: 2.5, bgcolor: "rgba(220, 0, 112, 0.08)", border: `1px solid rgba(220, 0, 112, 0.2)` }}>
                <Typography variant="caption" sx={{ color: COLORS.textPrimary, display: "block", textAlign: "center", lineHeight: 1.5 }}>
                    <strong>You are ready!</strong><br/>To start, open the Command Center on the right and simply type:<br/>
                    <em style={{ color: COLORS.accent }}>"Go to X.com and search for AI News"</em>
                </Typography>
            </Box>
        </Box>
    );
}
