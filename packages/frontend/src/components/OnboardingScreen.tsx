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
    background: "radial-gradient(ellipse at 30% 20%, rgba(88,28,255,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(0,200,255,0.08) 0%, transparent 50%), #0a0a14",
    overflow: "hidden",
};

const cardGlassSx = {
    maxWidth: 720, width: "92%", p: { xs: 3, sm: 5 },
    borderRadius: 4,
    background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(40px)",
    position: "relative" as const, overflow: "hidden",
};

const featureCardSx = {
    flex: "1 1 180px", p: 2.5, borderRadius: 3,
    bgcolor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
    textAlign: "center" as const, transition: "all 0.3s ease",
    "&:hover": { transform: "translateY(-4px)", borderColor: accentAlpha(0.3), bgcolor: "rgba(255,255,255,0.05)" },
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
    bgcolor: done ? "#22c55e" : active ? accentAlpha(0.8) : "rgba(255,255,255,0.15)",
    transition: "all 0.4s ease",
});

const providerTabSx = (active: boolean) => ({
    p: 2, borderRadius: 2.5, cursor: "pointer",
    bgcolor: active ? accentAlpha(0.08) : "rgba(255,255,255,0.02)",
    border: `1.5px solid ${active ? accentAlpha(0.4) : "rgba(255,255,255,0.06)"}`,
    transition: "all 0.25s ease",
    "&:hover": { borderColor: accentAlpha(0.3), bgcolor: accentAlpha(0.05) },
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
            <Box sx={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(88,28,255,0.08), transparent 70%)", top: -100, right: -100, pointerEvents: "none" }} />
            <Box sx={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,200,255,0.06), transparent 70%)", bottom: -80, left: -80, pointerEvents: "none" }} />

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
                background: GRADIENTS.title || "linear-gradient(135deg, #a855f7, #6366f1, #06b6d4)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", mb: 0.5,
            }}>
                BiamOS
            </Typography>
            <Typography variant="h5" sx={{ color: COLORS.textPrimary, fontWeight: 700, mb: 1 }}>
                The AI-Native Workspace OS.
            </Typography>
            <Typography variant="body1" sx={{ color: COLORS.textSecondary, mb: 4, maxWidth: 540, mx: "auto", lineHeight: 1.7 }}>
                Transform your desktop into a proactive command center. BiamOS combines a built-in web browser with local AI to read your context, bypass complex API auth, and generate dynamic UI dashboards instantly.
            </Typography>

            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                {[
                    { icon: <AIIcon sx={{ fontSize: 36 }} />, color: "#a855f7", title: "Context-Aware", sub: "The AI thinks with you. Surf the web normally and let BiamOS auto-generate data blocks based on what you're viewing." },
                    { icon: <BlockIcon sx={{ fontSize: 36 }} />, color: "#06b6d4", title: "Dynamic Blocks", sub: "Stop reading text walls. The LLM renders completely customizable UI blocks. Pin them directly to your canvas." },
                    { icon: <PrivacyIcon sx={{ fontSize: 36 }} />, color: "#22c55e", title: "Ghost-Auth", sub: "Log into Gmail or Notion via the webview. The local AI securely reads the DOM. No API keys or OAuth required." },
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
        { icon: <AgentIcon />, color: "#f59e0b", title: "Dual-Agent System", desc: "Two specialized AIs: The System Assistant controls your OS canvas, while the Web Copilot reads and interacts with your browser DOM." },
        { icon: <PrivacyIcon />, color: "#22c55e", title: "Smart Privacy Shield", desc: "Sensitive domains (banking, email) are auto-blocked from background analysis. You are always in control of what the AI sees." },
        { icon: <AIIcon />, color: "#a855f7", title: "6-Stage AI Pipeline", desc: "Our local middleware routes your intent, extracts parameters, bypasses API limits, and composes a dynamic layout in milliseconds." },
        { icon: <DashboardIcon />, color: "#06b6d4", title: "Persistent Workspaces", desc: "Your interactive command center. Pin generated UI blocks, drag, resize, and organize your daily tools into a living dashboard." },
    ];

    return (
        <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: COLORS.textPrimary, mb: 0.5 }}>
                ⚡ The Engine Behind BiamOS
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 3 }}>
                Four pillars that power your intelligent workspace
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
                🚀 Why BiamOS?
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 3 }}>
                What makes BiamOS different from every other tool out there
            </Typography>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 3 }}>
                {[
                    { icon: <AIIcon sx={{ fontSize: 28 }} />, color: "#a855f7", title: "Zero-Prompting", sub: "You don't always have to ask. BiamOS proactively detects your context and fetches relevant data before you type a single word." },
                    { icon: <PrivacyIcon sx={{ fontSize: 28 }} />, color: "#22c55e", title: "1-Click Data Audit", sub: "Your data never leaves your machine. Check the Data Audit panel anytime to see exactly what's stored in your local SQLite database." },
                    { icon: <SpeedIcon sx={{ fontSize: 28 }} />, color: "#f59e0b", title: "Voice & TTS", sub: "Talk to your OS naturally. The System Assistant processes your spoken intent and replies with high-quality Text-to-Speech audio." },
                    { icon: <ShopIcon sx={{ fontSize: 28 }} />, color: "#06b6d4", title: "Integration Shop", sub: "Install pre-built templates in one click, or let the AI build custom endpoints via Swagger and AI Discovery." },
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
                background: "linear-gradient(135deg, rgba(88,28,255,0.06), rgba(6,182,212,0.04))",
                border: "1px solid rgba(88,28,255,0.12)",
            }}>
                <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, mb: 0.5 }}>
                    💡 Unlike ChatGPT or standard browsers...
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.6, display: "block" }}>
                    BiamOS doesn't trap AI in a simple chat window. It acts as an intelligent layer over your entire workflow, creating visual, actionable UI blocks instead of plain text.
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
        </Box>
    );
}
