// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Memory Manager (Settings Tab)
// ============================================================
// Shows all learned workflows with CRUD operations.
// Users can view, verify/unverify, and delete stored workflows.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Chip,
    Collapse,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
} from "@mui/material";
import {
    Delete as DeleteIcon,
    VerifiedUser as VerifiedIcon,
    RemoveCircleOutline as UnverifyIcon,
    ExpandMore as ExpandIcon,
    DeleteSweep as ClearAllIcon,
} from "@mui/icons-material";
import {
    COLORS,
    GRADIENTS,
    accentAlpha,
    panelSx,
    LoadingSpinner,
    EmptyState,
    DangerButton,
    GhostButton,
    gradientTitleSx,
    scrollbarSx,
} from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

interface WorkflowStep {
    action: string;
    description: string;
    value?: string;
}

interface Workflow {
    id: number;
    domain: string;
    intent_hash: string;
    intent_text: string;
    success_count: number;
    fail_count: number;
    verified: boolean;
    has_embedding: boolean;
    step_count: number;
    steps: WorkflowStep[];
    created_at: string;
    updated_at: string;
}

interface MemoryStats {
    total: number;
    verified: number;
    with_embedding: number;
    domains: number;
}

// ─── Action Icons ───────────────────────────────────────────

const ACTION_ICONS: Record<string, string> = {
    navigate: "🌐",
    click: "🖱️",
    click_at: "🎯",
    type_text: "⌨️",
    scroll: "📜",
    wait: "⏳",
    search_web: "🔍",
    done: "✅",
    ask_user: "💬",
};

// ─── Stat Card ──────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: number | string;
    icon: string;
    color: string;
}) {
    return (
        <Box
            sx={{
                flex: 1,
                p: 2,
                borderRadius: "8px",
                background: GRADIENTS.card,
                border: `1px solid ${COLORS.border}`,
                textAlign: "center",
                minWidth: 100,
            }}
        >
            <Typography sx={{ fontSize: "1.5rem", mb: 0.5 }}>{icon}</Typography>
            <Typography
                sx={{
                    fontSize: "1.4rem",
                    fontWeight: 800,
                    color,
                    lineHeight: 1,
                }}
            >
                {value}
            </Typography>
            <Typography
                sx={{
                    fontSize: "0.65rem",
                    color: COLORS.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    mt: 0.5,
                }}
            >
                {label}
            </Typography>
        </Box>
    );
});

// ─── Workflow Row ───────────────────────────────────────────

const WorkflowRow = React.memo(function WorkflowRow({
    wf,
    onDelete,
    onToggleVerify,
}: {
    wf: Workflow;
    onDelete: (id: number) => void;
    onToggleVerify: (id: number, verified: boolean) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <Box
            sx={{
                borderRadius: "6px",
                border: `1px solid ${wf.verified ? "rgba(34, 197, 94, 0.2)" : COLORS.border}`,
                background: wf.verified
                    ? "linear-gradient(135deg, rgba(34, 197, 94, 0.04), rgba(34, 197, 94, 0.01))"
                    : GRADIENTS.card,
                mb: 1,
                overflow: "hidden",
                transition: "all 0.2s ease",
                "&:hover": {
                    borderColor: wf.verified ? "rgba(34, 197, 94, 0.35)" : COLORS.borderHover,
                },
            }}
        >
            {/* ─── Row Header ─── */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: "pointer",
                    "&:hover": { bgcolor: accentAlpha(0.03) },
                }}
                onClick={() => setExpanded(!expanded)}
            >
                {/* Expand arrow */}
                <IconButton
                    size="small"
                    sx={{
                        color: COLORS.textMuted,
                        transform: expanded ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s",
                        p: 0.5,
                    }}
                >
                    <ExpandIcon sx={{ fontSize: 18 }} />
                </IconButton>

                {/* Domain chip */}
                <Chip
                    label={wf.domain}
                    size="small"
                    sx={{
                        bgcolor: accentAlpha(0.1),
                        color: accentAlpha(0.9),
                        fontWeight: 600,
                        fontSize: "0.7rem",
                        height: 22,
                    }}
                />

                {/* Intent text */}
                <Typography
                    sx={{
                        flex: 1,
                        fontSize: "0.82rem",
                        color: COLORS.textPrimary,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {wf.intent_text}
                </Typography>

                {/* Badges */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                    {wf.verified && (
                        <Chip
                            label="✅ Verified"
                            size="small"
                            sx={{
                                bgcolor: "rgba(34, 197, 94, 0.12)",
                                color: "#22C55E",
                                fontWeight: 700,
                                fontSize: "0.65rem",
                                height: 20,
                            }}
                        />
                    )}
                    {wf.has_embedding && (
                        <Chip
                            label="🧠"
                            size="small"
                            sx={{
                                bgcolor: "rgba(139, 92, 246, 0.12)",
                                color: "#8B5CF6",
                                fontSize: "0.65rem",
                                height: 20,
                                minWidth: 28,
                            }}
                        />
                    )}
                    <Typography
                        sx={{
                            fontSize: "0.7rem",
                            color: COLORS.textMuted,
                            minWidth: 50,
                            textAlign: "right",
                        }}
                    >
                        {wf.step_count} steps
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: wf.success_count > wf.fail_count ? "#22C55E" : wf.fail_count > 0 ? COLORS.red : COLORS.textMuted,
                            minWidth: 40,
                            textAlign: "right",
                        }}
                    >
                        {wf.success_count}✓ {wf.fail_count}✗
                    </Typography>
                </Box>

                {/* Action buttons */}
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={wf.verified ? "Remove verification" : "Mark as verified"}>
                        <IconButton
                            size="small"
                            onClick={() => onToggleVerify(wf.id, !wf.verified)}
                            sx={{
                                color: wf.verified ? "#22C55E" : COLORS.textMuted,
                                "&:hover": { color: wf.verified ? COLORS.red : "#22C55E" },
                            }}
                        >
                            {wf.verified ? <UnverifyIcon sx={{ fontSize: 16 }} /> : <VerifiedIcon sx={{ fontSize: 16 }} />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete workflow">
                        <IconButton
                            size="small"
                            onClick={() => onDelete(wf.id)}
                            sx={{
                                color: COLORS.textMuted,
                                "&:hover": { color: COLORS.red },
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* ─── Expanded Step Details ─── */}
            <Collapse in={expanded}>
                <Box
                    sx={{
                        px: 2,
                        pb: 2,
                        pt: 0.5,
                        borderTop: `1px solid ${COLORS.border}`,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: "0.65rem",
                            color: COLORS.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            mb: 1,
                        }}
                    >
                        Learned Steps
                    </Typography>
                    {wf.steps.map((step, i) => (
                        <Box
                            key={i}
                            sx={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 1,
                                py: 0.5,
                                px: 1,
                                borderRadius: "4px",
                                "&:hover": { bgcolor: accentAlpha(0.04) },
                            }}
                        >
                            <Typography sx={{ fontSize: "0.75rem", opacity: 0.4, minWidth: 16, textAlign: "right" }}>
                                {i + 1}.
                            </Typography>
                            <Typography sx={{ fontSize: "0.9rem", minWidth: 20 }}>
                                {ACTION_ICONS[step.action] || "⚡"}
                            </Typography>
                            <Box>
                                <Typography sx={{ fontSize: "0.78rem", color: COLORS.textPrimary }}>
                                    {step.description}
                                </Typography>
                                {step.value && (
                                    <Typography
                                        sx={{
                                            fontSize: "0.7rem",
                                            color: accentAlpha(0.7),
                                            fontFamily: "monospace",
                                        }}
                                    >
                                        → "{step.value}"
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    ))}
                    <Box sx={{ display: "flex", gap: 2, mt: 1.5, pt: 1, borderTop: `1px dashed ${COLORS.border}` }}>
                        <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                            Hash: <span style={{ fontFamily: "monospace" }}>{wf.intent_hash}</span>
                        </Typography>
                        <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                            Created: {new Date(wf.created_at).toLocaleString()}
                        </Typography>
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
});

// ─── Main Component ─────────────────────────────────────────

export const MemoryManager = React.memo(function MemoryManager() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [stats, setStats] = useState<MemoryStats>({ total: 0, verified: 0, with_embedding: 0, domains: 0 });
    const [loading, setLoading] = useState(true);
    const [clearDialogOpen, setClearDialogOpen] = useState(false);

    // ─── Fetch workflows ──
    const fetchWorkflows = useCallback(async () => {
        try {
            const res = await fetch("/api/agents/memory");
            const data = await res.json();
            setWorkflows(data.workflows || []);
            setStats(data.stats || { total: 0, verified: 0, with_embedding: 0, domains: 0 });
        } catch (err) {
            console.error("[MemoryManager] fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWorkflows();
    }, [fetchWorkflows]);

    // ─── Delete single ──
    const handleDelete = useCallback(async (id: number) => {
        await fetch(`/api/agents/memory/${id}`, { method: "DELETE" });
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
        setStats((prev) => ({
            ...prev,
            total: prev.total - 1,
            verified: prev.verified - (workflows.find((w) => w.id === id)?.verified ? 1 : 0),
        }));
    }, [workflows]);

    // ─── Toggle verify ──
    const handleToggleVerify = useCallback(async (id: number, verified: boolean) => {
        await fetch(`/api/agents/memory/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verified }),
        });
        setWorkflows((prev) =>
            prev.map((w) => (w.id === id ? { ...w, verified } : w))
        );
        setStats((prev) => ({
            ...prev,
            verified: prev.verified + (verified ? 1 : -1),
        }));
    }, []);

    // ─── Clear all ──
    const handleClearAll = useCallback(async () => {
        await fetch("/api/agents/memory", { method: "DELETE" });
        setWorkflows([]);
        setStats({ total: 0, verified: 0, with_embedding: 0, domains: 0 });
        setClearDialogOpen(false);
    }, []);

    if (loading) return <LoadingSpinner label="Loading agent memory..." />;

    return (
        <Box sx={{ ...scrollbarSx, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
            {/* ─── Header ─── */}
            <Typography variant="h5" sx={{ ...gradientTitleSx(GRADIENTS.title), mb: 0.5, fontSize: "1.3rem" }}>
                🧠 Agent Memory
            </Typography>
            <Typography sx={{ color: COLORS.textMuted, fontSize: "0.78rem", mb: 3 }}>
                Learned workflows from verified agent tasks. The agent replays these as reflexes on similar requests.
            </Typography>

            {/* ─── Stats Row ─── */}
            <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
                <StatCard label="Workflows" value={stats.total} icon="📋" color={accentAlpha(0.9)} />
                <StatCard label="Verified" value={stats.verified} icon="✅" color="#22C55E" />
                <StatCard label="Embeddings" value={stats.with_embedding} icon="🧠" color="#8B5CF6" />
                <StatCard label="Domains" value={stats.domains} icon="🌐" color="#3B82F6" />
            </Box>

            {/* ─── Workflow List ─── */}
            {workflows.length === 0 ? (
                <EmptyState
                    icon="🧠"
                    title="No workflows learned yet"
                    subtitle="Use /act to give the agent a task, then press 👍 to save it as a reflex."
                />
            ) : (
                <Box sx={{ ...panelSx, p: 1.5 }}>
                    {workflows.map((wf) => (
                        <WorkflowRow
                            key={wf.id}
                            wf={wf}
                            onDelete={handleDelete}
                            onToggleVerify={handleToggleVerify}
                        />
                    ))}
                </Box>
            )}

            {/* ─── Clear All Button ─── */}
            {workflows.length > 0 && (
                <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
                    <DangerButton
                        onClick={() => setClearDialogOpen(true)}
                        startIcon={<ClearAllIcon />}
                        size="small"
                    >
                        Clear All Memory ({stats.total} workflows)
                    </DangerButton>
                </Box>
            )}

            {/* ─── Clear Confirmation Dialog ─── */}
            <Dialog
                open={clearDialogOpen}
                onClose={() => setClearDialogOpen(false)}
                PaperProps={{
                    sx: {
                        bgcolor: COLORS.bgPaper,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: "8px",
                        minWidth: 360,
                    },
                }}
            >
                <DialogTitle sx={{ color: COLORS.textPrimary, fontSize: "1rem", fontWeight: 700 }}>
                    ⚠️ Clear All Agent Memory?
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.85rem" }}>
                        This will delete all {stats.total} learned workflows, including {stats.verified} verified ones.
                        The agent will have to learn everything from scratch.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <GhostButton onClick={() => setClearDialogOpen(false)}>Cancel</GhostButton>
                    <DangerButton onClick={handleClearAll}>
                        Delete All
                    </DangerButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
});
