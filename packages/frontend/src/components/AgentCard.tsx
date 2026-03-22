// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Card Component (Premium Edition)
// ============================================================
// Individual agent card with pipeline accent, model selector,
// editable prompt, reset-to-default, and usage stats.
// ============================================================

import React, { useState, useCallback, useEffect } from "react";
import {
    Box,
    Typography,
    TextField,
    Chip,
    IconButton,
    CircularProgress,
    Collapse,
    Autocomplete,
    Tooltip,
} from "@mui/material";
import {
    ExpandMore as ExpandIcon,
    ExpandLess as CollapseIcon,
    Save as SaveIcon,
    Psychology as ThinkingIcon,
    ErrorOutline as InvalidIcon,
    RestartAlt as ResetIcon,
} from "@mui/icons-material";
import { COLORS, GRADIENTS, inputSx, accentAlpha } from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

export type { AgentBase as Agent } from "@biamos/shared";
import type { AgentBase as Agent } from "@biamos/shared";

interface AgentCardProps {
    agent: Agent;
    onUpdate: (name: string, updates: Partial<Agent>) => Promise<void>;
    accentColor?: string;
}

interface ModelOption {
    id: string;
    name: string;
    provider: string;
    context: number;
    pricing: string;
    thinking: boolean;
}

// ─── Pipeline accent colors (all unified to BiamOS Magenta) ─

const PIPELINE_ACCENTS: Record<string, { color: string; gradient: string; glow: string }> = {
    intent:  { color: COLORS.accent,      gradient: `linear-gradient(135deg, ${COLORS.accentLight}, ${COLORS.accent})`,  glow: accentAlpha(0.15) },
    builder: { color: COLORS.accentLight, gradient: `linear-gradient(135deg, ${COLORS.accentLight}, ${COLORS.accent})`, glow: accentAlpha(0.12) },
    copilot: { color: COLORS.accentDark,  gradient: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentDark})`,  glow: accentAlpha(0.12) },
};

function getAccent(pipeline: string) {
    return PIPELINE_ACCENTS[pipeline] || PIPELINE_ACCENTS.intent;
}

// ─── Module-level model cache ───────────────────────────────

let cachedModels: ModelOption[] | null = null;
let modelsLoading = false;
let modelsListeners: Array<(models: ModelOption[]) => void> = [];

async function loadModels(): Promise<ModelOption[]> {
    if (cachedModels) return cachedModels;
    if (modelsLoading) {
        return new Promise((resolve) => { modelsListeners.push(resolve); });
    }
    modelsLoading = true;
    try {
        const res = await fetch("/api/agents/models");
        const data = await res.json();
        cachedModels = data.models || [];
        modelsListeners.forEach((cb) => cb(cachedModels!));
        modelsListeners = [];
        return cachedModels!;
    } catch {
        modelsLoading = false;
        return [];
    }
}

/** Force refresh model cache (on provider change) */
export function invalidateModelCache(): void {
    cachedModels = null;
    modelsLoading = false;
    modelsListeners = [];
}

/** Get cached models for validation (non-blocking) */
export function getCachedModels(): ModelOption[] | null {
    return cachedModels;
}

// ─── Helpers ────────────────────────────────────────────────

function isThinking(modelId: string): boolean {
    return /gemini-2\.5-(?:pro|flash)(?!.*lite)/i.test(modelId) ||
        /claude-(?:sonnet|opus)/i.test(modelId) ||
        /gpt-4o(?!.*mini)/i.test(modelId) ||
        /\b(o1|o3|o4)\b/i.test(modelId) ||
        /deepseek-r1/i.test(modelId);
}

function shortModelName(modelId: string): string {
    const after = modelId.includes("/") ? modelId.split("/")[1] : modelId;
    if (/gemini.*flash.*lite/i.test(after)) return "Flash Lite";
    if (/gemini.*flash/i.test(after)) return "Flash";
    if (/gemini.*pro/i.test(after)) return "Pro";
    if (/claude.*sonnet/i.test(after)) return "Sonnet";
    if (/claude.*haiku/i.test(after)) return "Haiku";
    if (/claude.*opus/i.test(after)) return "Opus";
    if (/gpt-4o-mini/i.test(after)) return "4o Mini";
    if (/gpt-4o/i.test(after)) return "GPT-4o";
    if (/deepseek-r1/i.test(after)) return "R1";
    return after.split("-").slice(0, 2).join(" ").substring(0, 16);
}

// ─── Component ──────────────────────────────────────────────

export const AgentCard = React.memo(function AgentCard({ agent, onUpdate, accentColor }: AgentCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [prompt, setPrompt] = useState(agent.prompt);
    const [model, setModel] = useState(agent.model);
    const [saving, setSaving] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [models, setModels] = useState<ModelOption[]>([]);
    const [modelsReady, setModelsReady] = useState(false);

    const accent = getAccent(agent.pipeline);
    const color = accentColor || accent.color;

    useEffect(() => {
        loadModels().then((m) => { setModels(m); setModelsReady(true); });
    }, []);

    // Sync local state when agent prop changes (e.g. after reset)
    useEffect(() => {
        setPrompt(agent.prompt);
        setModel(agent.model);
        setDirty(false);
    }, [agent.prompt, agent.model]);

    const modelInvalid = modelsReady && models.length > 0 && !models.some((m) => m.id === model);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const updates: Record<string, any> = {};
            if (prompt !== agent.prompt) updates.prompt = prompt;
            if (model !== agent.model) updates.model = model;
            if (Object.keys(updates).length > 0) {
                await onUpdate(agent.name, updates);
                setDirty(false);
            }
        } finally {
            setSaving(false);
        }
    }, [agent.name, agent.prompt, agent.model, prompt, model, onUpdate]);

    const handleReset = useCallback(async () => {
        setResetting(true);
        try {
            const res = await fetch(`/api/agents/${agent.name}/reset`, { method: "POST" });
            const data = await res.json();
            if (data.action === "agent_reset" && data.agent) {
                await onUpdate(agent.name, data.agent);
                setPrompt(data.agent.prompt);
                setModel(data.agent.model);
                setDirty(false);
            }
        } catch (err) {
            console.error("Reset failed:", err);
        } finally {
            setResetting(false);
        }
    }, [agent.name, onUpdate]);

    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
        setDirty(true);
    }, []);

    const selectedModel = models.find((m) => m.id === model) ?? undefined;

    const tokenK = agent.total_tokens_used > 1000
        ? `${(agent.total_tokens_used / 1000).toFixed(1)}k`
        : String(agent.total_tokens_used);

    const fmtCtx = (ctx: number) => {
        if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
        if (ctx >= 1000) return `${(ctx / 1000).toFixed(0)}k`;
        return String(ctx);
    };

    return (
        <Box
            sx={{
                position: "relative",
                mb: 1.5,
                borderRadius: "8px",
                background: "linear-gradient(135deg, rgba(16,20,30,0.95), rgba(20,25,38,0.9))",
                border: `1px solid ${expanded ? `${color}33` : COLORS.border}`,
                overflow: "hidden",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                "&:hover": {
                    borderColor: `${color}44`,
                    boxShadow: `0 0 20px ${accent.glow}, 0 2px 8px rgba(0,0,0,0.3)`,
                    transform: "translateY(-1px)",
                },
                ...(expanded && {
                    boxShadow: `0 0 24px ${accent.glow}, 0 4px 16px rgba(0,0,0,0.4)`,
                }),
            }}
        >
            {/* ─── Left accent bar ──── */}
            <Box
                sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: accent.gradient,
                    borderRadius: "8px 0 0 8px",
                }}
            />

            {/* ─── Header Row ──── */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    pl: 2.5,
                    cursor: "pointer",
                    userSelect: "none",
                }}
                onClick={() => setExpanded(!expanded)}
            >
                {/* Step Number Badge */}
                <Box
                    sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "8px",
                        background: `${color}18`,
                        border: `1px solid ${color}33`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        color: color,
                        flexShrink: 0,
                        fontFamily: "'Inter', sans-serif",
                    }}
                >
                    {agent.step_order}
                </Box>

                {/* Name + Description */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 700,
                            color: COLORS.textPrimary,
                            fontSize: "0.88rem",
                            letterSpacing: "-0.01em",
                        }}
                    >
                        {agent.display_name}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            color: COLORS.textSecondary,
                            fontSize: "0.68rem",
                            lineHeight: 1.3,
                            display: "block",
                            maxWidth: 400,
                        }}
                        noWrap
                    >
                        {agent.description}
                    </Typography>
                </Box>


                {/* Model Chip */}
                {modelInvalid ? (
                    <Chip
                        icon={<InvalidIcon sx={{ fontSize: "14px !important", color: "#ff5050 !important" }} />}
                        label="Invalid model"
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                        sx={{
                            bgcolor: "rgba(255,80,80,0.12)",
                            color: "#ff5050",
                            fontSize: "0.62rem",
                            height: 22,
                            fontWeight: 700,
                            border: "1px solid rgba(255,80,80,0.3)",
                            cursor: "pointer",
                            animation: "pulse 2s ease infinite",
                            "@keyframes pulse": {
                                "0%, 100%": { opacity: 1 },
                                "50%": { opacity: 0.7 },
                            },
                            "& .MuiChip-icon": { ml: "4px" },
                        }}
                    />
                ) : (
                    <Chip
                        icon={isThinking(agent.model) ? <ThinkingIcon sx={{ fontSize: "14px !important", color: `${color} !important` }} /> : undefined}
                        label={shortModelName(agent.model)}
                        size="small"
                        sx={{
                            bgcolor: isThinking(agent.model) ? `${color}14` : "rgba(255,255,255,0.05)",
                            color: isThinking(agent.model) ? color : COLORS.textSecondary,
                            fontSize: "0.62rem",
                            height: 22,
                            fontWeight: 600,
                            border: `1px solid ${isThinking(agent.model) ? `${color}22` : "transparent"}`,
                            "& .MuiChip-icon": { ml: "4px" },
                        }}
                    />
                )}

                {/* Stats */}
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: COLORS.textMuted,
                            fontSize: "0.65rem",
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        }}
                    >
                        {agent.total_calls} calls
                    </Typography>
                    <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: COLORS.textMuted, opacity: 0.4 }} />
                    <Typography
                        variant="caption"
                        sx={{
                            color: color,
                            fontSize: "0.65rem",
                            fontWeight: 600,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        }}
                    >
                        {tokenK}
                    </Typography>
                </Box>

                {/* Expand Toggle */}
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    sx={{
                        color: expanded ? color : COLORS.textSecondary,
                        transition: "all 0.2s ease",
                        "&:hover": { color: color },
                    }}
                >
                    {expanded ? <CollapseIcon /> : <ExpandIcon />}
                </IconButton>
            </Box>

            {/* ─── Expanded Details ──── */}
            <Collapse in={expanded}>
                <Box sx={{
                    px: 2.5,
                    pb: 2.5,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    borderTop: `1px solid ${color}15`,
                }}>
                    {/* Model Selector */}
                    {modelsReady ? (
                        <Autocomplete
                            options={models}
                            value={selectedModel}
                            onChange={(_e, newValue) => {
                                if (newValue) {
                                    setModel(newValue.id);
                                    setDirty(true);
                                }
                            }}
                            groupBy={(option) => option.provider}
                            getOptionLabel={(option) => option.name || option.id}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            filterOptions={(options, { inputValue }) => {
                                const lower = inputValue.toLowerCase();
                                return options.filter(
                                    (o) => o.name.toLowerCase().includes(lower) ||
                                        o.id.toLowerCase().includes(lower) ||
                                        o.provider.toLowerCase().includes(lower)
                                );
                            }}
                            renderOption={(props, option) => {
                                const { key, ...rest } = props as any;
                                return (
                                    <Box
                                        component="li"
                                        key={option.id}
                                        {...rest}
                                        sx={{
                                            display: "flex !important",
                                            gap: 1,
                                            py: "4px !important",
                                            px: "12px !important",
                                            "&:hover": { bgcolor: `${color}0D !important` },
                                        }}
                                    >
                                        {option.thinking ? (
                                            <ThinkingIcon sx={{ fontSize: 15, color: color, flexShrink: 0, mt: 0.2 }} />
                                        ) : (
                                            <Box sx={{ width: 15, flexShrink: 0 }} />
                                        )}
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontSize: "0.76rem",
                                                    color: COLORS.textPrimary,
                                                    fontWeight: option.thinking ? 600 : 400,
                                                }}
                                                noWrap
                                            >
                                                {option.name}
                                            </Typography>
                                        </Box>
                                        <Typography
                                            variant="caption"
                                            sx={{ color: color, fontSize: "0.62rem", flexShrink: 0, opacity: 0.7 }}
                                        >
                                            {option.pricing}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{ color: COLORS.textMuted, fontSize: "0.62rem", flexShrink: 0, minWidth: 30, textAlign: "right" }}
                                        >
                                            {fmtCtx(option.context)}
                                        </Typography>
                                    </Box>
                                );
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Model"
                                    size="small"
                                    sx={{ ...inputSx }}
                                    slotProps={{
                                        input: {
                                            ...params.InputProps,
                                            startAdornment: selectedModel?.thinking ? (
                                                <ThinkingIcon sx={{ fontSize: 16, color: color, mr: 0.5 }} />
                                            ) : undefined,
                                        },
                                    }}
                                />
                            )}
                            renderGroup={(params) => (
                                <Box key={params.key}>
                                    <Typography
                                        sx={{
                                            px: 1.5,
                                            py: 0.75,
                                            fontSize: "0.68rem",
                                            fontWeight: 800,
                                            color: color,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                            bgcolor: `${color}08`,
                                            borderBottom: `1px solid ${color}15`,
                                            borderTop: `1px solid ${color}15`,
                                        }}
                                    >
                                        {params.group}
                                    </Typography>
                                    {params.children}
                                </Box>
                            )}
                            slotProps={{
                                paper: {
                                    sx: {
                                        bgcolor: "#131720",
                                        border: `1px solid ${color}25`,
                                        borderRadius: 1,
                                        maxHeight: 400,
                                        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${color}0D`,
                                        backdropFilter: "blur(20px)",
                                        "& .MuiAutocomplete-listbox": {
                                            py: 0.5,
                                            "& .MuiAutocomplete-option": {
                                                minHeight: 32,
                                                "&:hover": {
                                                    bgcolor: `${color}12 !important`,
                                                },
                                                '&[aria-selected="true"]': {
                                                    bgcolor: `${color}1A !important`,
                                                },
                                            },
                                        },
                                    },
                                },
                            }}
                            fullWidth
                            disableClearable
                            size="small"
                        />
                    ) : (
                        <TextField
                            label="Model"
                            size="small"
                            value={model}
                            sx={{ ...inputSx }}
                            fullWidth
                            disabled
                            slotProps={{
                                input: {
                                    endAdornment: <CircularProgress size={16} sx={{ color: COLORS.textMuted }} />,
                                },
                            }}
                        />
                    )}

                    {/* Prompt */}
                    <TextField
                        label="System Prompt"
                        multiline
                        minRows={4}
                        maxRows={12}
                        size="small"
                        value={prompt}
                        onChange={handlePromptChange}
                        sx={{
                            ...inputSx,
                            "& .MuiInputBase-input": {
                                color: COLORS.textPrimary,
                                fontSize: "0.75rem",
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                lineHeight: 1.5,
                            },
                            "& .MuiOutlinedInput-root.Mui-focused fieldset": {
                                borderColor: `${color}66`,
                            },
                        }}
                        fullWidth
                    />

                    {/* Action Buttons */}
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                        {/* Reset to Default */}
                        <Tooltip title="Reset prompt & model to factory defaults" arrow placement="top">
                            <IconButton
                                onClick={handleReset}
                                disabled={resetting}
                                sx={{
                                    bgcolor: "rgba(255,255,255,0.04)",
                                    color: COLORS.textSecondary,
                                    borderRadius: "6px",
                                    px: 1.5,
                                    border: `1px solid ${COLORS.border}`,
                                    transition: "all 0.2s ease",
                                    "&:hover": {
                                        bgcolor: "rgba(255,152,0,0.08)",
                                        color: "#ff9800",
                                        borderColor: "rgba(255,152,0,0.3)",
                                    },
                                }}
                            >
                                {resetting ? (
                                    <CircularProgress size={16} sx={{ color: "inherit" }} />
                                ) : (
                                    <ResetIcon fontSize="small" />
                                )}
                                <Typography
                                    variant="caption"
                                    sx={{ ml: 0.5, fontWeight: 600, fontSize: "0.72rem" }}
                                >
                                    Reset
                                </Typography>
                            </IconButton>
                        </Tooltip>

                        {/* Save Button */}
                        {dirty && (
                            <IconButton
                                onClick={handleSave}
                                disabled={saving}
                                sx={{
                                    background: accent.gradient,
                                    color: "#fff",
                                    borderRadius: "6px",
                                    px: 2,
                                    transition: "all 0.2s ease",
                                    boxShadow: `0 2px 8px ${accent.glow}`,
                                    "&:hover": {
                                        boxShadow: `0 4px 16px ${color}44`,
                                        transform: "translateY(-1px)",
                                    },
                                }}
                            >
                                {saving ? (
                                    <CircularProgress size={16} sx={{ color: "inherit" }} />
                                ) : (
                                    <SaveIcon fontSize="small" />
                                )}
                                <Typography
                                    variant="caption"
                                    sx={{ ml: 0.5, fontWeight: 700, fontSize: "0.75rem" }}
                                >
                                    Save
                                </Typography>
                            </IconButton>
                        )}
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
});
