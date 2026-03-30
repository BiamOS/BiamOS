// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Panel (Settings Tab)
// ============================================================
// Agent pipeline management + usage dashboard.
// Includes per-agent token usage bars and system-wide stats.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Box,
    Typography,
    Alert,
    Tooltip,
} from "@mui/material";
import {
    Token as TokenIcon,
    Api as ApiIcon,
    Speed as SpeedIcon,
    TrendingUp as TrendIcon,
    WarningAmber as WarnIcon,
} from "@mui/icons-material";
import { COLORS, GRADIENTS, gradientTitleSx, sectionLabelSx, accentAlpha, LoadingSpinner } from "./ui/SharedUI";
import { AgentCard } from "./AgentCard";

// ─── Types ──────────────────────────────────────────────────

interface Agent {
    id: number;
    name: string;
    display_name: string;
    description: string;
    pipeline: string;
    step_order: number;
    prompt: string;
    model: string;
    is_active: boolean;
    temperature: number;
    max_tokens: number;
    total_calls: number;
    total_tokens_used: number;
}

interface SystemStats {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    api_calls: number;
}

// ─── Styles ─────────────────────────────────────────────────

const statCardSx = {
    flex: "1 1 140px",
    p: 2,
    borderRadius: "4px",
    bgcolor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    minWidth: 120,
    transition: "all 0.3s ease",
    "&:hover": {
        borderColor: COLORS.borderHover,
        transform: "translateY(-1px)",
    },
};

const AGENT_COLORS = [
    COLORS.accent,       // BiamOS Magenta
    COLORS.accentLight,  // Bright Magenta
    COLORS.accentDark,   // Deep Magenta
    COLORS.green,        // Apple system green
    COLORS.red,          // Apple system red
    COLORS.yellow,       // Apple system yellow
    COLORS.accentLight,  // fallback
    COLORS.accent,       // fallback
];

// ─── Component ──────────────────────────────────────────────

export const AgentPanel = React.memo(function AgentPanel() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentProvider, setCurrentProvider] = useState<string>("openrouter");

    // Fetch agents from API
    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch("/api/agents");
            const data = await res.json();
            setAgents(data.agents || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load agents");
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch system stats
    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch("/api/system/stats");
            const data = await res.json();
            setSystemStats(data.stats);
        } catch (err) { console.warn("[AgentPanel] stats fetch failed:", err); }
    }, []);

    useEffect(() => {
        fetchAgents();
        fetchStats();
        // Fetch current provider
        fetch("/api/system/provider").then(r => r.json()).then(d => {
            setCurrentProvider(d.provider || "openrouter");
        }).catch(() => { });
    }, [fetchAgents, fetchStats]);

    // Update agent via API
    const handleUpdate = useCallback(async (name: string, updates: Partial<Agent>) => {
        try {
            const res = await fetch(`/api/agents/${name}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (data.action === "agent_updated") {
                setAgents((prev) =>
                    prev.map((a) => (a.name === name ? { ...a, ...data.agent } : a))
                );
            }
        } catch (err) {
            console.error("Failed to update agent:", err);
        }
    }, []);

    // Sort active agents by pipeline step/order
    const sortedAgents = useMemo(() => {
        return [...agents].sort((a, b) => {
            if (a.pipeline !== b.pipeline) return a.pipeline.localeCompare(b.pipeline);
            return a.step_order - b.step_order;
        });
    }, [agents]);

    // Computed stats
    const totalCalls = agents.reduce((sum, a) => sum + a.total_calls, 0);
    const totalTokens = agents.reduce((sum, a) => sum + a.total_tokens_used, 0);
    const maxAgentTokens = Math.max(...agents.map((a) => a.total_tokens_used), 1);
    const avgTokensPerCall = totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0;

    const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

    if (loading) return <LoadingSpinner />;

    if (error) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography sx={{ color: COLORS.red }}>{error}</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* ─── Header ──── */}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" sx={gradientTitleSx(GRADIENTS.title)}>
                    🤖 Agent Pipeline
                </Typography>
                <Typography variant="body2" sx={{ color: COLORS.textSecondary, mt: 0.5 }}>
                    {agents.length} active agents · {(systemStats?.api_calls ?? totalCalls).toLocaleString()} total calls · {fmtNum(systemStats?.total_tokens ?? totalTokens)} tokens used
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textMuted, lineHeight: 1.5, display: "block", mt: 0.5, maxWidth: 600, fontSize: "0.8rem" }}>
                    Hier überwachst du die aktiven Core Agenten des BiamOS Universal Routers. 
                    Behalte Token-Verbrauch und API-Calls im Blick und passe die Master-Prompts der Agenten dynamisch an.
                </Typography>
            </Box>

            {/* ─── Provider Mismatch Warning ──── */}
            {currentProvider !== "openrouter" && (
                <Alert
                    severity="warning"
                    icon={<WarnIcon fontSize="inherit" />}
                    sx={{
                        mb: 2.5,
                        bgcolor: "rgba(255,152,0,0.08)",
                        color: "#ff9800",
                        border: "1px solid rgba(255,152,0,0.2)",
                        borderRadius: 1,
                        "& .MuiAlert-icon": { color: "#ff9800" },
                    }}
                >
                    <strong>Provider: {currentProvider}</strong> — Agents with a red "Invalid model" badge need
                    to be assigned a local model. Click the badge to open the agent.
                </Alert>
            )}

            {/* ═══ Usage Dashboard ═══ */}
            <Box sx={{ mb: 3.5 }}>
                {/* Stat Cards Row */}
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2.5 }}>
                    <Box sx={statCardSx}>
                        <TokenIcon sx={{ fontSize: 24, color: accentAlpha(0.7), mb: 0.5 }} />
                        <Typography variant="h6" sx={{ ...gradientTitleSx(), fontSize: "1.3rem" }}>
                            {(systemStats?.total_tokens ?? totalTokens).toLocaleString()}
                        </Typography>
                        <Tooltip title="Total tokens used globally, including the Chat Router and Core Engine." arrow placement="top">
                            <Typography variant="caption" sx={{ color: COLORS.textSecondary, textDecoration: "underline", textDecorationStyle: "dotted", cursor: "help" }}>
                                System Tokens
                            </Typography>
                        </Tooltip>
                    </Box>

                    <Box sx={statCardSx}>
                        <ApiIcon sx={{ fontSize: 24, color: accentAlpha(0.7), mb: 0.5 }} />
                        <Typography variant="h6" sx={{ ...gradientTitleSx(), fontSize: "1.3rem" }}>
                            {systemStats?.api_calls ?? totalCalls}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            API Calls
                        </Typography>
                    </Box>

                    <Box sx={statCardSx}>
                        <SpeedIcon sx={{ fontSize: 24, color: "rgba(0, 220, 100, 0.7)", mb: 0.5 }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, color: COLORS.green, fontSize: "1.3rem" }}>
                            {avgTokensPerCall.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            Avg Tokens/Call
                        </Typography>
                    </Box>

                    <Box sx={statCardSx}>
                        <TrendIcon sx={{ fontSize: 24, color: "rgba(255, 152, 0, 0.7)", mb: 0.5 }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, color: "#ff9800", fontSize: "1.3rem" }}>
                            {systemStats
                                ? `${Math.round((systemStats.total_prompt_tokens / Math.max(systemStats.total_tokens, 1)) * 100)}%`
                                : "—"
                            }
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            Prompt Ratio
                        </Typography>
                    </Box>
                </Box>

                {/* Per-Agent Token Usage Bars */}
                <Box
                    sx={{
                        p: 3,
                        borderRadius: 2,
                        bgcolor: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                    }}
                >
                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, mb: 2.5, fontSize: "0.95rem", opacity: 0.9 }}>
                        Token Usage by Agent
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {[...agents]
                            .sort((a, b) => b.total_tokens_used - a.total_tokens_used)
                            .map((agent, idx) => {
                                const hasUsage = agent.total_tokens_used > 0;
                                const pct = hasUsage ? (agent.total_tokens_used / maxAgentTokens) * 100 : 0;
                                const color = AGENT_COLORS[idx % AGENT_COLORS.length];
                                
                                // Hide agent entirely if there's no UI-tracked token usage
                                if (!hasUsage) return null;

                                return (
                                    <Box key={agent.name} sx={{ opacity: 1 }}>
                                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.8 }}>
                                            <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, fontSize: "0.9rem", letterSpacing: "0.5px" }}>
                                                {agent.display_name}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: COLORS.accentLight, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: "0.85rem" }}>
                                                {fmtNum(agent.total_tokens_used)} tokens <span style={{opacity:0.5}}>·</span> {agent.total_calls} calls
                                            </Typography>
                                        </Box>
                                        <Box
                                            sx={{
                                                height: 8,
                                                borderRadius: 2,
                                                bgcolor: "rgba(255,255,255,0.06)",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    height: "100%",
                                                    width: `${pct}%`,
                                                    borderRadius: 2,
                                                    background: `linear-gradient(90deg, ${color} 0%, ${color}aa 100%)`,
                                                    transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                );
                            })}
                            
                        {/* Fallback if ALL agents have 0 usage */}
                        {agents.every(a => a.total_tokens_used === 0) && (
                            <Box sx={{ textAlign: "center", py: 4, bgcolor: "rgba(255,255,255,0.02)", borderRadius: 2 }}>
                                <Typography variant="body1" sx={{ color: COLORS.textMuted, mb: 1, fontWeight: 500 }}>
                                    No individual agent usage recorded yet.
                                </Typography>
                                <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>
                                    Global system tokens (above) currently represent the Universal Router usage. Agent-specific tracking starts on their first call.
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* ─── Active Agents ──── */}
            <Box sx={{ mb: 3 }}>
                <Typography sx={{ ...sectionLabelSx, mb: 1.5, color: COLORS.accent, fontSize: "1rem" }}>
                    ⚡ Active Agents
                </Typography>
                <Typography
                    variant="caption"
                    sx={{ display: "block", color: COLORS.textMuted, mb: 2.5, fontSize: "0.85rem" }}
                >
                    Hier siehst du die aktiven KI-Agenten, die das Agentic OS antreiben.
                </Typography>
                {sortedAgents.map((agent) => (
                    <AgentCard key={agent.name} agent={agent} onUpdate={handleUpdate} />
                ))}
            </Box>
        </Box>
    );
});
