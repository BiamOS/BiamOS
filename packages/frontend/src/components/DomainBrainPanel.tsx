// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Domain Brain Panel (D8: Knowledge Engine UI)
// ============================================================
// Visualizes all domain-scoped knowledge the AI has learned or
// been taught. Left: domain browser. Right: knowledge list.
// Users can teach, delete, and inspect stored knowledge.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Chip,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Alert,
    Snackbar,
} from "@mui/material";
import {
    Delete as DeleteIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import {
    COLORS,
    GRADIENTS,
    accentAlpha,
    panelSx,
    LoadingSpinner,
    EmptyState,
    GhostButton,
    gradientTitleSx,
    scrollbarSx,
} from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

type KnowledgeType = "user_instruction" | "selector_rule" | "auto_trajectory" | "api_doc";

interface KnowledgeEntry {
    id: string;
    domain: string;
    type: KnowledgeType;
    content: string;
    confidence: number;
    source: "user" | "auto";
    version: number;
    created_at: string;
    expires_at: string | null;
}

interface DomainCount {
    domain: string;
    count: number;
}

// ─── Type Config ────────────────────────────────────────────

const TYPE_CONFIG: Record<KnowledgeType, { label: string; emoji: string; color: string; bg: string }> = {
    selector_rule: {
        label: "Selector Rule",
        emoji: "🔵",
        color: "#3B82F6",
        bg: "rgba(59, 130, 246, 0.12)",
    },
    user_instruction: {
        label: "User Instruction",
        emoji: "🟢",
        color: "#22C55E",
        bg: "rgba(34, 197, 94, 0.12)",
    },
    auto_trajectory: {
        label: "Auto-Learned",
        emoji: "🟡",
        color: "#F59E0B",
        bg: "rgba(245, 158, 11, 0.12)",
    },
    api_doc: {
        label: "API Doc",
        emoji: "⚪",
        color: "#9CA3AF",
        bg: "rgba(156, 163, 175, 0.12)",
    },
};

// ─── Knowledge Card ─────────────────────────────────────────

const KnowledgeCard = React.memo(function KnowledgeCard({
    entry,
    onDelete,
}: {
    entry: KnowledgeEntry;
    onDelete: (id: string) => void;
}) {
    const typeConf = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.api_doc;
    const isExpiring = entry.expires_at !== null;
    const expiryDate = isExpiring ? new Date(entry.expires_at!).toLocaleDateString() : null;
    const isExpiringSoon = isExpiring && new Date(entry.expires_at!).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

    return (
        <Box
            sx={{
                borderRadius: "6px",
                border: `1px solid ${COLORS.border}`,
                background: GRADIENTS.card,
                mb: 1,
                p: 1.5,
                transition: "all 0.2s ease",
                "&:hover": {
                    borderColor: COLORS.borderHover,
                    background: `linear-gradient(135deg, ${accentAlpha(0.03)}, transparent)`,
                },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                {/* Type Badge */}
                <Chip
                    label={`${typeConf.emoji} ${typeConf.label}`}
                    size="small"
                    sx={{
                        bgcolor: typeConf.bg,
                        color: typeConf.color,
                        fontWeight: 600,
                        fontSize: "0.65rem",
                        height: 20,
                        flexShrink: 0,
                    }}
                />
                {/* Source badge */}
                {entry.source === "auto" && (
                    <Chip
                        label="auto"
                        size="small"
                        sx={{
                            bgcolor: "rgba(245, 158, 11, 0.1)",
                            color: "#F59E0B",
                            fontSize: "0.6rem",
                            height: 20,
                            flexShrink: 0,
                        }}
                    />
                )}
                <Box sx={{ flex: 1 }} />
                {/* Confidence */}
                <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, flexShrink: 0 }}>
                    {Math.round(entry.confidence * 100)}%
                </Typography>
                {/* Delete */}
                <Tooltip title="Delete entry">
                    <IconButton
                        size="small"
                        onClick={() => onDelete(entry.id)}
                        sx={{
                            color: COLORS.textMuted,
                            p: 0.25,
                            "&:hover": { color: COLORS.red ?? "#ef4444" },
                        }}
                    >
                        <DeleteIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Content */}
            <Typography
                sx={{
                    mt: 0.75,
                    fontSize: "0.82rem",
                    color: COLORS.textPrimary,
                    lineHeight: 1.5,
                }}
            >
                {entry.content}
            </Typography>

            {/* Footer */}
            <Box sx={{ display: "flex", gap: 2, mt: 0.75, alignItems: "center" }}>
                <Typography sx={{ fontSize: "0.62rem", color: COLORS.textMuted }}>
                    {new Date(entry.created_at).toLocaleDateString()}
                </Typography>
                {expiryDate && (
                    <Typography
                        sx={{
                            fontSize: "0.62rem",
                            color: isExpiringSoon ? "#F59E0B" : COLORS.textMuted,
                            fontWeight: isExpiringSoon ? 600 : 400,
                        }}
                    >
                        ⏳ Expires {expiryDate}
                    </Typography>
                )}
            </Box>
        </Box>
    );
});

// ─── Teach Modal ────────────────────────────────────────────

const TeachModal = React.memo(function TeachModal({
    open,
    domain,
    onClose,
    onSaved,
}: {
    open: boolean;
    domain: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [type, setType] = useState<KnowledgeType>("user_instruction");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!content.trim()) return;
        setSaving(true);
        try {
            await fetch("/api/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain, type, content: content.trim(), source: "user" }),
            });
            setContent("");
            setType("user_instruction");
            onSaved();
            onClose();
        } catch (err) {
            console.error("[DomainBrain] teach error:", err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    bgcolor: COLORS.bgPaper,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "10px",
                    minWidth: 460,
                },
            }}
        >
            <DialogTitle sx={{ color: COLORS.textPrimary, fontSize: "1rem", fontWeight: 700, pb: 1 }}>
                🧠 Teach the Domain Brain
            </DialogTitle>
            <DialogContent>
                <Typography sx={{ color: COLORS.textMuted, fontSize: "0.78rem", mb: 2 }}>
                    Domain: <strong style={{ color: accentAlpha(0.9) }}>{domain}</strong>
                    {domain === "global" && " — applies to all websites"}
                </Typography>

                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel sx={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>Knowledge Type</InputLabel>
                    <Select
                        value={type}
                        label="Knowledge Type"
                        onChange={(e) => setType(e.target.value as KnowledgeType)}
                        sx={{
                            color: COLORS.textPrimary,
                            fontSize: "0.85rem",
                            ".MuiOutlinedInput-notchedOutline": { borderColor: COLORS.border },
                            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.borderHover },
                        }}
                    >
                        <MenuItem value="user_instruction">🟢 User Instruction — general guidance</MenuItem>
                        <MenuItem value="selector_rule">🔵 Selector Rule — keyboard shortcut, UI hint</MenuItem>
                        <MenuItem value="api_doc">⚪ API Doc — reference documentation chunk</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    fullWidth
                    multiline
                    rows={4}
                    placeholder={
                        type === "selector_rule"
                            ? "e.g. Ctrl+K opens the Quick-Add dialog"
                            : type === "user_instruction"
                            ? "e.g. The Save button is hidden behind the ⋮ dropdown menu"
                            : "Paste documentation chunk here..."
                    }
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    size="small"
                    sx={{
                        "& .MuiInputBase-root": {
                            color: COLORS.textPrimary,
                            fontSize: "0.85rem",
                            bgcolor: "rgba(255,255,255,0.03)",
                        },
                        "& .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.border },
                        "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.borderHover },
                    }}
                />

                <Typography sx={{ mt: 1.5, fontSize: "0.72rem", color: COLORS.textMuted }}>
                    ℹ️ This knowledge is retrieved semantically — only injected when the current task is relevant,
                    not on every request.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <GhostButton onClick={onClose}>Cancel</GhostButton>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={!content.trim() || saving}
                    sx={{
                        background: GRADIENTS.accent ?? accentAlpha(0.9),
                        color: "#fff",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: "6px",
                        textTransform: "none",
                        "&:hover": { opacity: 0.9 },
                    }}
                >
                    {saving ? "Saving..." : "Save to Brain"}
                </Button>
            </DialogActions>
        </Dialog>
    );
});

// ─── Main Component ─────────────────────────────────────────

export const DomainBrainPanel = React.memo(function DomainBrainPanel() {
    const [domains, setDomains] = useState<DomainCount[]>([]);
    const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
    const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
    const [loadingDomains, setLoadingDomains] = useState(true);
    const [loadingEntries, setLoadingEntries] = useState(false);
    const [teachModalOpen, setTeachModalOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // ─── Fetch domain list ──
    const fetchDomains = useCallback(async () => {
        try {
            const res = await fetch("/api/knowledge/domains");
            const data = await res.json();
            const list: DomainCount[] = data.data?.domains ?? [];
            setDomains(list);
            // Auto-select first domain or global
            if (!selectedDomain && list.length > 0) {
                setSelectedDomain(list[0].domain);
            }
        } catch (err) {
            console.error("[DomainBrain] domains fetch error:", err);
        } finally {
            setLoadingDomains(false);
        }
    }, [selectedDomain]);

    // ─── Fetch entries for selected domain ──
    const fetchEntries = useCallback(async (domain: string) => {
        setLoadingEntries(true);
        try {
            const res = await fetch(`/api/knowledge?domain=${encodeURIComponent(domain)}`);
            const data = await res.json();
            setEntries(data.data?.entries ?? []);
        } catch (err) {
            console.error("[DomainBrain] entries fetch error:", err);
        } finally {
            setLoadingEntries(false);
        }
    }, []);

    useEffect(() => { fetchDomains(); }, [fetchDomains]);

    useEffect(() => {
        if (selectedDomain) fetchEntries(selectedDomain);
    }, [selectedDomain, fetchEntries]);

    // ─── Delete entry ──
    const handleDelete = useCallback(async (id: string) => {
        await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
        setEntries((prev) => prev.filter((e) => e.id !== id));
        // Refresh domain counts
        fetchDomains();
    }, [fetchDomains]);

    // ─── After teach saved ──
    const handleSaved = useCallback(() => {
        setToast(`✅ Saved to ${selectedDomain}`);
        if (selectedDomain) fetchEntries(selectedDomain);
        fetchDomains();
    }, [selectedDomain, fetchEntries, fetchDomains]);

    if (loadingDomains) return <LoadingSpinner label="Loading Domain Brain..." />;

    const totalEntries = domains.reduce((sum, d) => sum + d.count, 0);

    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {/* ─── Header ─── */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="h5" sx={{ ...gradientTitleSx(GRADIENTS.title), mb: 0.5, fontSize: "1.3rem" }}>
                    🧠 Domain Brain
                </Typography>
                <Typography sx={{ color: COLORS.textMuted, fontSize: "0.78rem" }}>
                    {totalEntries} knowledge entries across {domains.length} domains. Retrieved semantically — only relevant chunks are injected.
                </Typography>
            </Box>

            {/* ─── Body: Domain Browser + Entries ─── */}
            <Box sx={{ display: "flex", gap: 2, flex: 1, overflow: "hidden", minHeight: 0 }}>

                {/* ─── Left: Domain Browser ─── */}
                <Box
                    sx={{
                        width: 200,
                        minWidth: 200,
                        ...panelSx,
                        ...scrollbarSx,
                        overflowY: "auto",
                        p: 1,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: "0.6rem",
                            color: COLORS.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            fontWeight: 700,
                            px: 1,
                            mb: 1,
                        }}
                    >
                        Domains
                    </Typography>

                    {domains.length === 0 ? (
                        <Typography sx={{ color: COLORS.textMuted, fontSize: "0.75rem", px: 1, py: 2, textAlign: "center" }}>
                            No knowledge yet.<br />Use /teach in chat.
                        </Typography>
                    ) : (
                        domains.map((d) => (
                            <Box
                                key={d.domain}
                                onClick={() => setSelectedDomain(d.domain)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    px: 1.5,
                                    py: 0.75,
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    bgcolor: selectedDomain === d.domain ? accentAlpha(0.12) : "transparent",
                                    border: `1px solid ${selectedDomain === d.domain ? accentAlpha(0.25) : "transparent"}`,
                                    "&:hover": { bgcolor: accentAlpha(0.07) },
                                    mb: 0.5,
                                    transition: "all 0.15s ease",
                                }}
                            >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                                    <Typography sx={{ fontSize: "0.75rem", flexShrink: 0 }}>
                                        {d.domain === "global" ? "🌍" : "🔗"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            fontSize: "0.75rem",
                                            color: selectedDomain === d.domain ? COLORS.textPrimary : COLORS.textSecondary,
                                            fontWeight: selectedDomain === d.domain ? 600 : 400,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {d.domain}
                                    </Typography>
                                </Box>
                                <Chip
                                    label={d.count}
                                    size="small"
                                    sx={{
                                        bgcolor: accentAlpha(0.1),
                                        color: accentAlpha(0.8),
                                        fontWeight: 700,
                                        fontSize: "0.65rem",
                                        height: 18,
                                        minWidth: 24,
                                        flexShrink: 0,
                                    }}
                                />
                            </Box>
                        ))
                    )}
                </Box>

                {/* ─── Right: Knowledge List ─── */}
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    {selectedDomain ? (
                        <>
                            {/* List Header */}
                            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5, gap: 1 }}>
                                <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>
                                    {selectedDomain === "global" ? "🌍 Global Knowledge" : `🔗 ${selectedDomain}`}
                                </Typography>
                                <Button
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => setTeachModalOpen(true)}
                                    variant="outlined"
                                    sx={{
                                        borderColor: accentAlpha(0.3),
                                        color: accentAlpha(0.8),
                                        fontSize: "0.75rem",
                                        textTransform: "none",
                                        borderRadius: "6px",
                                        py: 0.5,
                                        "&:hover": { borderColor: accentAlpha(0.6), bgcolor: accentAlpha(0.06) },
                                    }}
                                >
                                    Teach
                                </Button>
                            </Box>

                            {/* Entry List */}
                            <Box sx={{ flex: 1, overflowY: "auto", ...scrollbarSx }}>
                                {loadingEntries ? (
                                    <LoadingSpinner label="Loading entries..." />
                                ) : entries.length === 0 ? (
                                    <EmptyState
                                        icon="🧠"
                                        title="No knowledge for this domain yet"
                                        subtitle='Click "Teach" to add your first entry, or type /teach in the chat.'
                                    />
                                ) : (
                                    entries.map((entry) => (
                                        <KnowledgeCard
                                            key={entry.id}
                                            entry={entry}
                                            onDelete={handleDelete}
                                        />
                                    ))
                                )}
                            </Box>
                        </>
                    ) : (
                        <EmptyState
                            icon="🧠"
                            title="Select a domain"
                            subtitle="Choose a domain from the left to view and manage its knowledge."
                        />
                    )}
                </Box>
            </Box>

            {/* ─── Teach Modal ─── */}
            <TeachModal
                open={teachModalOpen}
                domain={selectedDomain ?? "global"}
                onClose={() => setTeachModalOpen(false)}
                onSaved={handleSaved}
            />

            {/* ─── Toast ─── */}
            <Snackbar
                open={!!toast}
                autoHideDuration={3000}
                onClose={() => setToast(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert severity="success" onClose={() => setToast(null)} sx={{ fontSize: "0.82rem" }}>
                    {toast}
                </Alert>
            </Snackbar>
        </Box>
    );
});
