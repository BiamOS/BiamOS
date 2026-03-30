// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Knowledge Base Hub v3
// Tabs: Base Rules | Knowledge | Workflows | About
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    Box, Typography, Chip, IconButton, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, Select, MenuItem,
    FormControl, InputLabel, Tooltip, CircularProgress,
    Snackbar, Alert, Tab, Tabs, InputAdornment, Checkbox,
    Button,
} from "@mui/material";
import {
    Delete as DeleteIcon, CheckCircle as VerifyIcon,
    Add as AddIcon, Search as SearchIcon, Save as SaveIcon,
    DeleteSweep as BulkDeleteIcon,
} from "@mui/icons-material";
import { COLORS, GRADIENTS, accentAlpha } from "./ui/SharedUI";

// ─── Types ───────────────────────────────────────────────────

interface DomainEntry {
    domain: string;
    knowledgeCount: number;
    workflowCount: number;
    cartridge: string | null;
}

interface KnowledgeItem {
    id: string;
    domain: string;
    type: "user_instruction" | "selector_rule" | "auto_trajectory" | "api_doc";
    content: string;
    confidence: number;
    source: string;
    path_pattern?: string;
    subdomain?: string;
    created_at: string;
}

interface LearnedPattern {
    id: string;
    domain: string;
    path_pattern?: string | null;
    content: string;
    review_status: "pending" | "active" | "rejected";
    created_at: string;
}

interface WorkflowItem {
    id: number;
    domain: string;
    intent_text: string;
    steps_count: number;
    steps?: Array<{
        action: string;
        description?: string;
        selector?: string;
        value?: string;
    }>;
    success_count: number;
    fail_count: number;
    verified: boolean;
    updated_at: string;
}

interface DomainProfile {
    domain: string;
    cartridge: {
        name: string;
        editor_type: string;
        navigation_style: string;
        preview: string;
    } | null;
    knowledge: KnowledgeItem[];
    workflows: WorkflowItem[];
    /** V4: true if Bootstrap is running in the background for this domain */
    bootstrapping?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; emoji: string }> = {
    user_instruction: { label: "Instruction", color: COLORS.accent,       emoji: "🎯" },
    selector_rule:    { label: "Selector",    color: "#3B82F6",            emoji: "🎨" },
    auto_trajectory:  { label: "Auto",        color: COLORS.textSecondary, emoji: "🤖" },
    api_doc:          { label: "API Doc",     color: COLORS.green,         emoji: "📄" },
};

function domainIcon(d: string): string {
    if (d === "global")                                 return "🌍";
    if (d.includes("todoist"))                          return "✅";
    if (d.includes("notion"))                           return "📝";
    if (d.includes("youtube"))                          return "▶️";
    if (d.includes("gmail") || d.includes("mail.google")) return "📧";
    if (d.includes("github"))                           return "🐙";
    if (d.includes("n8n") || d.includes("localhost"))  return "⚡";
    if (d.includes("linear"))                          return "📐";
    if (d.includes("salesforce") || d.includes("force.com")) return "☁️";
    if (d.includes("halo"))                             return "🎫";
    return "🔗";
}

function timeAgo(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60)   return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return `${Math.floor(m / 1440)}d ago`;
}

// ─── Tab Panel ───────────────────────────────────────────────

function TabPanel({ value, index, children }: { value: number; index: number; children: React.ReactNode }) {
    return value === index
        ? <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>{children}</Box>
        : null;
}

// ─── Confirm Dialog ──────────────────────────────────────────

function ConfirmDialog({ open, message, onConfirm, onCancel }: {
    open: boolean; message: string; onConfirm: () => void; onCancel: () => void;
}) {
    return (
        <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
            <DialogContent sx={{ pt: 3, pb: 1 }}>
                <Typography sx={{ fontSize: "0.85rem", color: COLORS.textPrimary }}>{message}</Typography>
            </DialogContent>
            <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
                <Box component="button" onClick={onCancel}
                    sx={{ bgcolor: "transparent", border: "none", color: COLORS.textSecondary, cursor: "pointer", fontSize: "0.8rem", px: 1.5, py: 0.8 }}>
                    Cancel
                </Box>
                <Box component="button" onClick={onConfirm}
                    sx={{ px: 2, py: 0.8, borderRadius: "8px", border: "none", bgcolor: COLORS.red, color: "#fff", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer" }}>
                    Delete
                </Box>
            </DialogActions>
        </Dialog>
    );
}

// ─── New Knowledge Modal ─────────────────────────────────────

function TeachModal({ open, domain, onClose, onSaved }: {
    open: boolean; domain: string; onClose: () => void; onSaved: () => void;
}) {
    const [type, setType] = useState("user_instruction");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!content.trim()) return;
        setLoading(true);
        try {
            const res = await fetch("/api/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain, type, content: content.trim(), source: "user" }),
            });
            if (res.ok) { onSaved(); onClose(); setContent(""); setType("user_instruction"); }
        } finally { setLoading(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontSize: "1rem", fontWeight: 700, pb: 0.5 }}>
                📚 New Knowledge Entry
                <Typography component="span" sx={{ fontSize: "0.75rem", color: COLORS.accent, ml: 1 }}>{domain}</Typography>
            </DialogTitle>
            <DialogContent>
                <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
                    <InputLabel>Type</InputLabel>
                    <Select value={type} label="Type" onChange={e => setType(e.target.value)}>
                        <MenuItem value="user_instruction">🎯 Instruction — behavioral rule</MenuItem>
                        <MenuItem value="selector_rule">🎨 Selector Rule — UI element hint</MenuItem>
                        <MenuItem value="api_doc">📄 API Doc — reference info</MenuItem>
                    </Select>
                </FormControl>
                <TextField fullWidth multiline rows={4} label="Knowledge"
                    value={content} onChange={e => setContent(e.target.value)}
                    placeholder="e.g. Always click the priority flag before saving a task..."
                    autoFocus
                    sx={{ "& .MuiInputBase-root": { fontSize: "0.83rem" } }}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                <Box component="button" onClick={onClose}
                    sx={{ bgcolor: "transparent", border: "none", color: COLORS.textSecondary, cursor: "pointer", fontSize: "0.8rem", px: 1.5, py: 0.8 }}>
                    Cancel
                </Box>
                <Box component="button" onClick={handleSave} disabled={loading || !content.trim()}
                    sx={{
                        px: 2, py: 0.8, borderRadius: "8px", border: "none",
                        background: content.trim() ? GRADIENTS.primary : COLORS.surface,
                        color: content.trim() ? "#fff" : COLORS.textMuted, fontWeight: 700, fontSize: "0.8rem",
                        cursor: loading || !content.trim() ? "default" : "pointer", transition: "all 0.2s",
                    }}>
                    {loading ? "Saving..." : "Save"}
                </Box>
            </DialogActions>
        </Dialog>
    );
}

// ─── Tab: Base Rules ─────────────────────────────────────────
// Single prompt view: shows the effective prompt for this domain.
// Clicking Edit makes it editable. Save stores as base_rule in DB.

function BaseRulesTab({ domain, cartridge, existingBaseRuleItem, onSaved }: {
    domain: string;
    cartridge: DomainProfile["cartridge"];
    existingBaseRuleItem: KnowledgeItem | null;
    onSaved: () => void;
}) {
    // Effective prompt: user-saved custom rule overrides cartridge; cartridge is the fallback
    const cartridgeText = cartridge?.preview ?? "";
    const savedText = existingBaseRuleItem?.content ?? "";
    const effectiveText = savedText || cartridgeText;
    const isCustomized = !!savedText;

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(effectiveText);
    const [saving, setSaving] = useState(false);

    // Sync when domain or saved content changes
    useEffect(() => {
        setEditing(false);
        setDraft(savedText || cartridgeText);
    }, [domain, existingBaseRuleItem?.id, cartridge?.preview]);

    const handleEdit = () => {
        setDraft(effectiveText);
        setEditing(true);
    };

    const handleCancel = () => {
        setDraft(effectiveText);
        setEditing(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (existingBaseRuleItem) {
                await fetch(`/api/knowledge/${existingBaseRuleItem.id}`, { method: "DELETE" });
            }
            if (draft.trim()) {
                await fetch("/api/knowledge", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ domain, type: "user_instruction", content: draft.trim(), source: "base_rule" }),
                });
            }
            setEditing(false);
            onSaved();
        } finally { setSaving(false); }
    };

    const handleReset = async () => {
        if (!existingBaseRuleItem) return;
        setSaving(true);
        await fetch(`/api/knowledge/${existingBaseRuleItem.id}`, { method: "DELETE" });
        setSaving(false);
        onSaved();
    };

    return (
        <Box>
            {/* Header row */}
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
                <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: COLORS.textPrimary }}>
                            Domain Prompt
                        </Typography>
                        {isCustomized ? (
                            <Chip label="custom" size="small" sx={{ height: 16, fontSize: "0.58rem", bgcolor: accentAlpha(0.15), color: COLORS.accent }} />
                        ) : cartridge ? (
                            <Chip label={`${cartridge.name} cartridge`} size="small" sx={{ height: 16, fontSize: "0.58rem", bgcolor: `${COLORS.yellow}22`, color: COLORS.yellow }} />
                        ) : null}
                    </Box>
                    <Typography sx={{ fontSize: "0.65rem", color: COLORS.textSecondary, mt: 0.3 }}>
                        Injected into the agent's system prompt on every call for this domain
                    </Typography>
                </Box>

                {/* Action buttons */}
                <Box sx={{ display: "flex", gap: 1, flexShrink: 0, ml: 2 }}>
                    {!editing ? (
                        <>
                            {isCustomized && (
                                <Tooltip title="Reset to cartridge default">
                                    <Box component="button" onClick={handleReset} disabled={saving}
                                        sx={{ px: 1.2, py: 0.5, borderRadius: "7px", border: `1px solid ${COLORS.border}`, bgcolor: "transparent", color: COLORS.textSecondary, fontSize: "0.7rem", cursor: "pointer", "&:hover": { color: COLORS.red, borderColor: COLORS.red } }}>
                                        Reset
                                    </Box>
                                </Tooltip>
                            )}
                            <Box component="button" onClick={handleEdit}
                                sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: "7px", border: `1px solid ${COLORS.border}`, bgcolor: "transparent", color: COLORS.textSecondary, fontSize: "0.7rem", cursor: "pointer", "&:hover": { color: COLORS.accent, borderColor: COLORS.accent }, transition: "all 0.15s" }}>
                                ✏️ Edit
                            </Box>
                        </>
                    ) : (
                        <>
                            <Box component="button" onClick={handleCancel}
                                sx={{ px: 1.2, py: 0.5, borderRadius: "7px", border: `1px solid ${COLORS.border}`, bgcolor: "transparent", color: COLORS.textSecondary, fontSize: "0.7rem", cursor: "pointer" }}>
                                Cancel
                            </Box>
                            <Box component="button" onClick={handleSave} disabled={saving}
                                sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5, borderRadius: "7px", border: "none", background: GRADIENTS.primary, color: "#fff", fontWeight: 700, fontSize: "0.7rem", cursor: "pointer" }}>
                                <SaveIcon sx={{ fontSize: "0.78rem" }} />
                                {saving ? "Saving..." : "Save"}
                            </Box>
                        </>
                    )}
                </Box>
            </Box>

            {/* Prompt area */}
            {!effectiveText && !editing ? (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 1.5, borderRadius: "10px", border: `1px dashed ${COLORS.borderFaint}` }}>
                    <Typography sx={{ fontSize: "0.8rem", color: COLORS.textSecondary }}>No prompt configured for this domain</Typography>
                    <Box component="button" onClick={handleEdit}
                        sx={{ px: 2, py: 0.8, borderRadius: "8px", border: "none", background: GRADIENTS.primary, color: "#fff", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                        ✏️ Write prompt
                    </Box>
                </Box>
            ) : editing ? (
                <Box>
                    {cartridge && !isCustomized && (
                        <Box sx={{ mb: 1.5, p: 1.2, borderRadius: "8px", bgcolor: `${COLORS.accent}12`, border: `1px solid ${COLORS.accent}30`, display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <Typography sx={{ fontSize: "0.7rem", color: COLORS.accent, lineHeight: 1.5 }}>
                                ℹ️ <strong>{cartridge.name} cartridge</strong> is hardcoded — clearing this box
                                reverts to the cartridge (it will reappear). To <strong>override</strong> it,
                                edit the text and save. To <strong>disable</strong> it, write a single
                                dash (<code>-</code>) and save.
                            </Typography>
                        </Box>
                    )}
                    <TextField
                        fullWidth multiline minRows={14}
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        sx={{
                            "& .MuiInputBase-root": { fontFamily: "monospace", fontSize: "0.78rem", bgcolor: COLORS.surfaceDark, lineHeight: 1.65 },
                            "& .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.accent },
                        }}
                    />
                </Box>
            ) : (
                <Box sx={{ borderRadius: "10px", border: `1px solid ${COLORS.borderFaint}`, bgcolor: COLORS.surfaceDark, p: 2, maxHeight: 480, overflowY: "auto" }}>
                    <Typography sx={{ fontFamily: "monospace", fontSize: "0.76rem", color: COLORS.textSecondary, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                        {effectiveText}
                    </Typography>
                </Box>
            )}
        </Box>
    );
}


// ─── Tab: Semantic Knowledge ──────────────────────────────────


function SemanticKnowledgeTab({ items, onDelete, onBulkDelete, onNew }: {
    items: KnowledgeItem[];
    onDelete: (id: string) => void;
    onBulkDelete: (ids: string[]) => void;
    onNew: () => void;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)));
    };

    const selCount = selected.size;

    return (
        <Box>
            {/* Header row */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                {items.length > 0 && (
                    <Checkbox
                        size="small"
                        checked={selCount === items.length && items.length > 0}
                        indeterminate={selCount > 0 && selCount < items.length}
                        onChange={toggleAll}
                        sx={{ p: "2px", color: COLORS.textSecondary, "&.Mui-checked": { color: COLORS.accent } }}
                    />
                )}
                <Typography sx={{ fontSize: "0.7rem", color: COLORS.textSecondary, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>
                    {selCount > 0 ? `${selCount} selected` : `${items.length} ${items.length === 1 ? "entry" : "entries"}`}
                </Typography>
                {selCount > 0 && (
                    <Box component="button" onClick={() => setConfirmBulk(true)}
                        sx={{
                            display: "flex", alignItems: "center", gap: 0.5,
                            px: 1.2, py: 0.5, borderRadius: "6px", border: "none",
                            bgcolor: `${COLORS.red}22`, color: COLORS.red,
                            fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                        }}>
                        <BulkDeleteIcon sx={{ fontSize: "0.85rem" }} /> Delete {selCount}
                    </Box>
                )}
                <Box component="button" onClick={onNew}
                    sx={{
                        display: "flex", alignItems: "center", gap: 0.5,
                        px: 1.5, py: 0.65, borderRadius: "8px", border: "none",
                        background: GRADIENTS.primary, color: "#fff",
                        fontWeight: 700, fontSize: "0.72rem", cursor: "pointer",
                        "&:hover": { opacity: 0.9 }, transition: "opacity 0.15s",
                    }}>
                    <AddIcon sx={{ fontSize: "0.82rem" }} /> New
                </Box>
            </Box>

            {items.length === 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 1.5, borderRadius: "10px", border: `1px dashed ${COLORS.borderFaint}` }}>
                    <Typography sx={{ fontSize: "2rem" }}>🧠</Typography>
                    <Typography sx={{ fontSize: "0.8rem", color: COLORS.textSecondary }}>No semantic knowledge yet</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: COLORS.textMuted }}>
                        Use <strong style={{ color: COLORS.accent }}>/teach</strong> in chat or click New
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {items.map(item => {
                        const meta = TYPE_META[item.type] ?? { label: item.type, color: COLORS.textSecondary, emoji: "•" };
                        const isSel = selected.has(item.id);
                        return (
                            <Box key={item.id} sx={{
                                display: "flex", alignItems: "flex-start", gap: 1.5, p: 1.5,
                                borderRadius: "10px",
                                border: `1px solid ${isSel ? accentAlpha(0.35) : COLORS.borderFaint}`,
                                bgcolor: isSel ? accentAlpha(0.05) : COLORS.surfaceDark,
                                transition: "all 0.12s",
                                cursor: "default",
                            }}>
                                <Checkbox
                                    size="small"
                                    checked={isSel}
                                    onChange={() => toggleSelect(item.id)}
                                    sx={{ p: "2px", mt: 0.2, color: COLORS.textSecondary, "&.Mui-checked": { color: COLORS.accent }, flexShrink: 0 }}
                                />
                                <Box sx={{ pt: 0.3, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0.4 }}>
                                    <Chip label={`${meta.emoji} ${meta.label}`} size="small"
                                        sx={{ bgcolor: `${meta.color}22`, color: meta.color, fontWeight: 600, fontSize: "0.6rem", height: 20 }} />
                                    {item.path_pattern && (
                                        <Chip label={`🗂 ${item.path_pattern}`} size="small"
                                            sx={{ bgcolor: `${COLORS.textSecondary}15`, color: COLORS.textMuted, fontSize: "0.55rem", height: 17, fontFamily: "monospace" }} />
                                    )}
                                    {item.source === "auto" && (
                                        <Chip label="✨ auto" size="small"
                                            sx={{ bgcolor: `${COLORS.yellow}18`, color: COLORS.yellow, fontSize: "0.55rem", height: 17 }} />
                                    )}
                                </Box>
                                <Typography flex={1} sx={{ fontSize: "0.8rem", color: COLORS.textPrimary, lineHeight: 1.55 }}>
                                    {item.content}
                                </Typography>
                                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, flexShrink: 0 }}>
                                    <Typography sx={{ fontSize: "0.58rem", color: COLORS.textMuted }}>
                                        {Math.round(item.confidence * 100)}% · {timeAgo(item.created_at)}
                                    </Typography>
                                    <Tooltip title="Delete">
                                        <IconButton size="small" onClick={() => setConfirmId(item.id)}
                                            sx={{ color: COLORS.textSecondary, "&:hover": { color: COLORS.red }, p: "2px" }}>
                                            <DeleteIcon sx={{ fontSize: "0.82rem" }} />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}

            <ConfirmDialog
                open={confirmBulk}
                message={`Delete ${selCount} selected entries? This cannot be undone.`}
                onConfirm={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()); setConfirmBulk(false); }}
                onCancel={() => setConfirmBulk(false)}
            />
            <ConfirmDialog
                open={!!confirmId}
                message="Delete this knowledge entry?"
                onConfirm={() => { if (confirmId) { onDelete(confirmId); setConfirmId(null); } }}
                onCancel={() => setConfirmId(null)}
            />
        </Box>
    );
}

// ─── Tab: Workflows ───────────────────────────────────────────

function WorkflowsTab({ items, onVerify, onDelete, onBulkDelete }: {
    items: WorkflowItem[];
    onVerify: (id: number) => void;
    onDelete: (id: number) => void;
    onBulkDelete: (ids: number[]) => void;
}) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [confirmBulk, setConfirmBulk] = useState(false);
    const [confirmId, setConfirmId] = useState<number | null>(null);

    const toggle = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(w => w.id)));
    const toggleExpand = (id: number) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const selCount = selected.size;

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                {items.length > 0 && (
                    <Checkbox size="small" checked={selCount === items.length && items.length > 0}
                        indeterminate={selCount > 0 && selCount < items.length}
                        onChange={toggleAll}
                        sx={{ p: "2px", color: COLORS.textSecondary, "&.Mui-checked": { color: COLORS.accent } }}
                    />
                )}
                <Typography sx={{ fontSize: "0.7rem", color: COLORS.textSecondary, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>
                    {selCount > 0 ? `${selCount} selected` : `${items.length} ${items.length === 1 ? "workflow" : "workflows"}`}
                    {items.some(w => !w.verified) && selCount === 0 && (
                        <Chip label={`${items.filter(w => !w.verified).length} unverified`} size="small"
                            sx={{ ml: 1, height: 16, fontSize: "0.58rem", bgcolor: `${COLORS.yellow}22`, color: COLORS.yellow }} />
                    )}
                </Typography>
                {selCount > 0 && (
                    <Box component="button" onClick={() => setConfirmBulk(true)}
                        sx={{
                            display: "flex", alignItems: "center", gap: 0.5,
                            px: 1.2, py: 0.5, borderRadius: "6px", border: "none",
                            bgcolor: `${COLORS.red}22`, color: COLORS.red,
                            fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
                        }}>
                        <BulkDeleteIcon sx={{ fontSize: "0.85rem" }} /> Delete {selCount}
                    </Box>
                )}
            </Box>

            {items.length === 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 1.5, borderRadius: "10px", border: `1px dashed ${COLORS.borderFaint}` }}>
                    <Typography sx={{ fontSize: "2rem" }}>💪</Typography>
                    <Typography sx={{ fontSize: "0.8rem", color: COLORS.textSecondary }}>No workflows recorded yet</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: COLORS.textMuted }}>Lura learns automatically from successful tasks</Typography>
                </Box>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {items.map(w => {
                        const isSel = selected.has(w.id);
                        const isExp = expanded.has(w.id);
                        return (
                            <Box key={w.id} sx={{
                                borderRadius: "10px",
                                border: `1px solid ${isSel ? accentAlpha(0.35) : w.verified ? accentAlpha(0.2) : COLORS.borderFaint}`,
                                bgcolor: isSel ? accentAlpha(0.05) : w.verified ? accentAlpha(0.03) : COLORS.surfaceDark,
                                overflow: "hidden",
                                transition: "all 0.12s",
                            }}>
                                {/* Row header — click to expand */}
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5, cursor: "pointer" }}
                                    onClick={() => toggleExpand(w.id)}>
                                    <Box onClick={e => { e.stopPropagation(); toggle(w.id); }}>
                                        <Checkbox size="small" checked={isSel}
                                            sx={{ p: "2px", color: COLORS.textSecondary, "&.Mui-checked": { color: COLORS.accent }, flexShrink: 0 }} />
                                    </Box>
                                    <Tooltip title={w.verified ? "Verified — will be replayed" : "Unverified — click ✓ to trust"}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: w.verified ? COLORS.green : COLORS.yellow }} />
                                    </Tooltip>
                                    <Box flex={1} sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: "0.78rem", color: COLORS.textPrimary, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {w.intent_text}
                                        </Typography>
                                        <Box sx={{ display: "flex", gap: 1.5, mt: 0.3 }}>
                                            <Typography sx={{ fontSize: "0.6rem", color: COLORS.green }}>✓ {w.success_count}x</Typography>
                                            {w.fail_count > 0 && <Typography sx={{ fontSize: "0.6rem", color: COLORS.red }}>✗ {w.fail_count}x</Typography>}
                                            <Typography sx={{ fontSize: "0.6rem", color: COLORS.textSecondary }}>{w.steps_count} steps · {timeAgo(w.updated_at)}</Typography>
                                        </Box>
                                    </Box>
                                    <Typography sx={{ fontSize: "0.65rem", color: COLORS.textSecondary, mr: 0.5 }}>{isExp ? "▲" : "▼"}</Typography>
                                    <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                        {!w.verified && (
                                            <Tooltip title="Trust this workflow">
                                                <IconButton size="small" onClick={() => onVerify(w.id)}
                                                    sx={{ color: COLORS.textSecondary, "&:hover": { color: COLORS.green }, p: "4px" }}>
                                                    <VerifyIcon sx={{ fontSize: "0.9rem" }} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title="Delete">
                                            <IconButton size="small" onClick={() => setConfirmId(w.id)}
                                                sx={{ color: COLORS.textSecondary, "&:hover": { color: COLORS.red }, p: "4px" }}>
                                                <DeleteIcon sx={{ fontSize: "0.9rem" }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>

                                {/* Expanded steps */}
                                {isExp && (w.steps?.length ?? 0) > 0 && (
                                    <Box sx={{ px: 2, pb: 2, borderTop: `1px solid ${COLORS.borderFaint}`, bgcolor: COLORS.surfaceDark }}>
                                        <Typography sx={{ fontSize: "0.62rem", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", pt: 1.5, pb: 1 }}>Steps</Typography>
                                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                                            {(w.steps ?? []).map((step, i) => {
                                                const detail = [step.description, step.value, step.selector].filter(Boolean).join(" · ").substring(0, 120);
                                                return (
                                                    <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                                                        <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted, minWidth: 18, pt: 0.1 }}>{i + 1}.</Typography>
                                                        <Chip label={step.action} size="small" sx={{ height: 18, fontSize: "0.58rem", bgcolor: accentAlpha(0.12), color: COLORS.accent, fontWeight: 600, flexShrink: 0 }} />
                                                        {detail && (
                                                            <Typography sx={{ fontSize: "0.68rem", color: COLORS.textSecondary, lineHeight: 1.5, wordBreak: "break-all" }}>
                                                                {detail}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                );
                                            })}
                                        </Box>
                                    </Box>
                                )}
                                {isExp && (w.steps?.length ?? 0) === 0 && (
                                    <Box sx={{ px: 2, pb: 1.5, pt: 1, borderTop: `1px solid ${COLORS.borderFaint}` }}>
                                        <Typography sx={{ fontSize: "0.7rem", color: COLORS.textMuted }}>No step data available</Typography>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}

            <ConfirmDialog
                open={confirmBulk}
                message={`Delete ${selCount} workflows? Lura will forget these patterns.`}
                onConfirm={() => { onBulkDelete(Array.from(selected)); setSelected(new Set()); setConfirmBulk(false); }}
                onCancel={() => setConfirmBulk(false)}
            />
            <ConfirmDialog
                open={confirmId !== null}
                message="Delete this workflow?"
                onConfirm={() => { if (confirmId !== null) { onDelete(confirmId); setConfirmId(null); } }}
                onCancel={() => setConfirmId(null)}
            />
        </Box>
    );
}


// ─── Tab: About ───────────────────────────────────────────────

function AboutTab() {
    const sections = [
        {
            icon: "🏛", title: "Base Rules",
            desc: "Custom text you write here is injected at the top of Lura's system prompt every time she works on this domain. Think of it as a sticky note on her desk — it's always visible. Platform Cartridges are additional hardcoded behavioral rules for known tools like Todoist, n8n, or Notion that the team pre-built into the app.",
        },
        {
            icon: "🧠", title: "Semantic Knowledge",
            desc: "When you type /teach \"always click the priority flag\" — that instruction gets saved here. Before every agent step, Lura runs a vector similarity search against all saved knowledge for the current domain. The most relevant snippets (top 5) are automatically inserted into the agent's context window so she always has your rules in mind.",
        },
        {
            icon: "💪", title: "Learned Workflows",
            desc: "After Lura successfully completes a task (e.g. \"add a todo in Todoist\"), the full click-path she used is stored here. Next time you give her a similar task, she finds it via semantic search and plays it back — like muscle memory. Only workflows you mark ✓ Verified are used for automatic replay. Unverified ones are held back until you approve them.",
        },
        {
            icon: "⚡", title: "How the layers work together",
            desc: "Every agent call stacks the knowledge in this order: Platform Cartridge → Custom Base Rules → Top-5 RAG Knowledge Chunks → Verified Workflow (if found). This means domain-specific knowledge always overrides generic behavior. The LLM never \"forgets\" your rules as long as they live in this Hub.",
        },
        {
            icon: "🌍", title: "Global vs. Per-Domain",
            desc: "Knowledge saved under the \"global\" domain is injected on every website, no matter what. Per-domain knowledge (e.g. app.todoist.com) is only injected when Lura is working on that specific site. Root-domain rules (e.g. todoist.com) automatically match all subdomains (app.todoist.com, calendar.todoist.com, etc.).",
        },
    ];

    return (
        <Box>
            <Typography sx={{ fontSize: "0.68rem", fontWeight: 700, color: COLORS.textSecondary, letterSpacing: "0.08em", textTransform: "uppercase", mb: 2.5 }}>
                How this works
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {sections.map(s => (
                    <Box key={s.title} sx={{ p: 2, borderRadius: "10px", border: `1px solid ${COLORS.borderFaint}`, bgcolor: COLORS.surfaceFaint }}>
                        <Typography sx={{ fontSize: "0.83rem", fontWeight: 700, color: COLORS.textPrimary, mb: 0.8 }}>
                            {s.icon} {s.title}
                        </Typography>
                        <Typography sx={{ fontSize: "0.78rem", color: COLORS.textSecondary, lineHeight: 1.65 }}>
                            {s.desc}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

// ─── Tab: Learned (Auto-Patterns) ───────────────────────────

function LearnedTab({ domain, onReview }: {
    domain: string;
    onReview: () => void;
}) {
    const [patterns, setPatterns] = useState<LearnedPattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'rejected'>('all');

    const load = useCallback(() => {
        setLoading(true);
        fetch(`/api/knowledge/pending?domain=${encodeURIComponent(domain)}`)
            .then(r => r.json())
            .then(d => setPatterns(d?.data ?? []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [domain]);

    useEffect(() => { load(); }, [load]);

    const handleReview = async (id: string, action: 'approve' | 'reject') => {
        await fetch(`/api/knowledge/${id}/review`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        load();
        onReview();
    };

    const STATUS_META = {
        pending:  { label: 'Pending',  color: COLORS.yellow,  bg: `${COLORS.yellow}18`,  emoji: '🟡' },
        active:   { label: 'Approved', color: COLORS.green,   bg: `${COLORS.green}18`,   emoji: '✅' },
        rejected: { label: 'Rejected', color: COLORS.red,     bg: `${COLORS.red}18`,     emoji: '❌' },
    };

    const filtered = filter === 'all' ? patterns : patterns.filter(p => p.review_status === filter);
    const pending = patterns.filter(p => p.review_status === 'pending').length;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: COLORS.textPrimary, flex: 1 }}>
                    Auto-Learned Patterns
                </Typography>
                {pending > 0 && (
                    <Chip label={`${pending} need review`} size="small"
                        sx={{ height: 18, fontSize: '0.6rem', bgcolor: `${COLORS.yellow}22`, color: COLORS.yellow, fontWeight: 700 }} />
                )}
                {(['all','pending','active','rejected'] as const).map(f => (
                    <Box key={f} component="button" onClick={() => setFilter(f)}
                        sx={{
                            px: 1.2, py: 0.3, borderRadius: '6px', border: `1px solid ${filter === f ? COLORS.accent : COLORS.border}`,
                            bgcolor: filter === f ? accentAlpha(0.15) : 'transparent',
                            color: filter === f ? COLORS.accent : COLORS.textSecondary,
                            fontSize: '0.65rem', cursor: 'pointer', textTransform: 'capitalize',
                        }}>{f}</Box>
                ))}
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={20} sx={{ color: COLORS.accent }} />
                </Box>
            ) : filtered.length === 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 1.5,
                    borderRadius: '10px', border: `1px dashed ${COLORS.borderFaint}` }}>
                    <Typography sx={{ fontSize: '1.8rem' }}>🧠</Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: COLORS.textSecondary }}>
                        {filter === 'pending' ? 'No patterns need review' : 'No auto-learned patterns yet'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: COLORS.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
                        Patterns appear here when Lura fails then recovers — they show what to avoid.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                    {filtered.map(p => {
                        const meta = STATUS_META[p.review_status];
                        const [avoidLine, insteadLine, urlLine] = p.content.split('\n');
                        return (
                            <Box key={p.id} sx={{
                                borderRadius: '10px', border: `1px solid ${COLORS.border}`,
                                bgcolor: COLORS.surfaceDark, overflow: 'hidden',
                            }}>
                                {/* Header */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.8,
                                    bgcolor: meta.bg, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: meta.color }}>
                                        {meta.emoji} {meta.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.6rem', color: COLORS.textSecondary, flex: 1 }}>
                                        {p.domain}{p.path_pattern ? p.path_pattern : ''}
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.55rem', color: COLORS.textMuted }}>
                                        {timeAgo(p.created_at)}
                                    </Typography>
                                </Box>
                                {/* Content */}
                                <Box sx={{ px: 1.5, py: 1 }}>
                                    {avoidLine && (
                                        <Box sx={{ display: 'flex', gap: 0.8, mb: 0.5 }}>
                                            <Typography sx={{ fontSize: '0.67rem', color: COLORS.red, fontWeight: 700, flexShrink: 0 }}>AVOID</Typography>
                                            <Typography sx={{ fontSize: '0.67rem', color: COLORS.textPrimary, fontFamily: 'monospace' }}>
                                                {avoidLine.replace('AVOID: ', '')}
                                            </Typography>
                                        </Box>
                                    )}
                                    {insteadLine && (
                                        <Box sx={{ display: 'flex', gap: 0.8 }}>
                                            <Typography sx={{ fontSize: '0.67rem', color: COLORS.green, fontWeight: 700, flexShrink: 0 }}>USE</Typography>
                                            <Typography sx={{ fontSize: '0.67rem', color: COLORS.textPrimary, fontFamily: 'monospace' }}>
                                                {insteadLine.replace('INSTEAD: ', '')}
                                            </Typography>
                                        </Box>
                                    )}
                                    {urlLine && (
                                        <Typography sx={{ fontSize: '0.58rem', color: COLORS.textMuted, mt: 0.5 }}>{urlLine}</Typography>
                                    )}
                                </Box>
                                {/* Actions */}
                                {p.review_status === 'pending' && (
                                    <Box sx={{ display: 'flex', gap: 0.8, px: 1.5, py: 0.8,
                                        borderTop: `1px solid ${COLORS.borderFaint}` }}>
                                        <Box component="button" onClick={() => handleReview(p.id, 'approve')}
                                            sx={{
                                                px: 1.5, py: 0.4, borderRadius: '6px', border: 'none',
                                                bgcolor: `${COLORS.green}22`, color: COLORS.green,
                                                fontSize: '0.67rem', fontWeight: 700, cursor: 'pointer',
                                                '&:hover': { bgcolor: `${COLORS.green}40` },
                                            }}>✓ Approve &amp; Activate</Box>
                                        <Box component="button" onClick={() => handleReview(p.id, 'reject')}
                                            sx={{
                                                px: 1.5, py: 0.4, borderRadius: '6px',
                                                border: `1px solid ${COLORS.borderFaint}`,
                                                bgcolor: 'transparent', color: COLORS.textSecondary,
                                                fontSize: '0.67rem', cursor: 'pointer',
                                                '&:hover': { color: COLORS.red, borderColor: COLORS.red },
                                            }}>✕ Reject</Box>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}


// ─── Main Component ──────────────────────────────────────────

export default function KnowledgeBaseHub() {
    const [domains, setDomains] = useState<DomainEntry[]>([]);
    const [search, setSearch] = useState("");
    const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
    const [profile, setProfile] = useState<DomainProfile | null>(null);
    const [loadingDomains, setLoadingDomains] = useState(true);
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [teachOpen, setTeachOpen] = useState(false);
    const [toast, setToast] = useState<{ msg: string; severity: "success" | "error" } | null>(null);
    const [deleteDomainConfirm, setDeleteDomainConfirm] = useState<string | null>(null);

    const loadDomains = useCallback((silent = false) => {
        if (!silent) setLoadingDomains(true);
        fetch("/api/knowledge/all-domains")
            .then(r => r.json())
            .then(d => {
                const list: DomainEntry[] = (d?.data?.domains ?? []).sort(
                    (a: DomainEntry, b: DomainEntry) => (b.knowledgeCount + b.workflowCount) - (a.knowledgeCount + a.workflowCount)
                );
                setDomains(list);
                if (list.length > 0 && !selectedDomain) setSelectedDomain(list[0].domain);
            })
            .catch(() => {})
            .finally(() => { if (!silent) setLoadingDomains(false); });
    }, [selectedDomain]);

    useEffect(() => { loadDomains(); }, []);

    const loadProfile = useCallback((domain: string, silent = false) => {
        if (!silent) {
            setLoadingProfile(true);
            setProfile(null);
        }
        fetch(`/api/knowledge/profile?domain=${encodeURIComponent(domain)}`)
            .then(r => r.json())
            .then(d => {
                if (d?.data || !silent) setProfile(d?.data ?? null);
            })
            .finally(() => { if (!silent) setLoadingProfile(false); });
    }, []);

    useEffect(() => { if (selectedDomain) loadProfile(selectedDomain); }, [selectedDomain]);

    const filteredDomains = useMemo(() =>
        domains.filter(d => d.domain.toLowerCase().includes(search.toLowerCase())),
        [domains, search]
    );

    // Separate base_rule / auto_bootstrap entries from regular knowledge items
    const baseRuleItem = profile?.knowledge.find(
        k => k.source === "base_rule" || k.source === "auto_bootstrap"
    ) ?? null;
    const knowledgeItems = profile?.knowledge.filter(
        k => k.source !== "base_rule" && k.source !== "auto_bootstrap"
    ) ?? [];

    const showToast = (msg: string, severity: "success" | "error" = "success") =>
        setToast({ msg, severity });

    const refresh = useCallback(() => {
        if (selectedDomain) loadProfile(selectedDomain);
        loadDomains();
    }, [selectedDomain, loadProfile, loadDomains]);

    // V4: Realtime Auto-polling (Background Sync)
    const bootstrapping = !!profile?.bootstrapping;
    useEffect(() => {
        if (!selectedDomain) return;
        const timer = setInterval(() => {
            loadProfile(selectedDomain, true);
            loadDomains(true);
        }, 3000); // 3s polling for real-time responsiveness
        return () => clearInterval(timer);
    }, [selectedDomain, loadProfile, loadDomains]);

    const deleteDomain = useCallback(async (domain: string) => {
        await fetch(`/api/knowledge/domain/${encodeURIComponent(domain)}`, { method: "DELETE" });
        setSelectedDomain(null);
        setProfile(null);
        await loadDomains();
        showToast(`${domain} deleted`);
    }, [loadDomains]);

    const deleteKnowledge = useCallback(async (id: string) => {
        await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
        setProfile(p => p ? { ...p, knowledge: p.knowledge.filter(k => k.id !== id) } : p);
        showToast("Entry deleted");
    }, []);

    const bulkDeleteKnowledge = useCallback(async (ids: string[]) => {
        await Promise.all(ids.map(id => fetch(`/api/knowledge/${id}`, { method: "DELETE" })));
        setProfile(p => p ? { ...p, knowledge: p.knowledge.filter(k => !ids.includes(k.id)) } : p);
        showToast(`${ids.length} entries deleted`);
    }, []);

    const verifyWorkflow = useCallback(async (id: number) => {
        await fetch(`/api/knowledge/workflows/${id}/verify`, { method: "POST" });
        setProfile(p => p ? { ...p, workflows: p.workflows.map(w => w.id === id ? { ...w, verified: true } : w) } : p);
        showToast("Workflow trusted ✓");
    }, []);

    const deleteWorkflow = useCallback(async (id: number) => {
        await fetch(`/api/knowledge/workflows/${id}`, { method: "DELETE" });
        setProfile(p => p ? { ...p, workflows: p.workflows.filter(w => w.id !== id) } : p);
        showToast("Workflow deleted");
    }, []);

    const bulkDeleteWorkflows = useCallback(async (ids: number[]) => {
        await Promise.all(ids.map(id => fetch(`/api/knowledge/workflows/${id}`, { method: "DELETE" })));
        setProfile(p => p ? { ...p, workflows: p.workflows.filter(w => !ids.includes(w.id)) } : p);
        showToast(`${ids.length} workflows deleted`);
    }, []);

    const [learnedCount, setLearnedCount] = useState(0);

    // Load count of pending auto-learned patterns for badge
    useEffect(() => {
        if (!selectedDomain) return;
        fetch(`/api/knowledge/pending?domain=${encodeURIComponent(selectedDomain)}`)
            .then(r => r.json())
            .then(d => setLearnedCount((d?.data ?? []).filter((p: any) => p.review_status === 'pending').length))
            .catch(() => {});
    }, [selectedDomain]);

    const tabCounts = profile ? [0, knowledgeItems.length, profile.workflows.length, learnedCount] : [0, 0, 0, 0];

    const tabLabels = [
        { emoji: "🏛", label: "Base Rules" },
        { emoji: "🧠", label: "Knowledge",  count: tabCounts[1] },
        { emoji: "💪", label: "Workflows",  count: tabCounts[2] },
        { emoji: "🤖", label: "Learned",    count: tabCounts[3] },
        { emoji: "ℹ️",  label: "About" },
    ];

    return (
        <Box sx={{ display: "flex", height: "100%", bgcolor: COLORS.bg, overflow: "hidden" }}>

            {/* ── Left Sidebar ── */}
            <Box sx={{
                width: 280, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`,
                display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: COLORS.bgPaper,
            }}>
                <Box sx={{ p: 1.5, borderBottom: `1px solid ${COLORS.borderFaint}` }}>
                    <TextField
                        size="small" fullWidth placeholder="Search domains..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start">
                                <SearchIcon sx={{ fontSize: "0.9rem", color: COLORS.textSecondary }} />
                            </InputAdornment>,
                            sx: { fontSize: "0.78rem", borderRadius: "8px", height: 34 },
                        }}
                    />
                </Box>
                <Box sx={{ flex: 1, overflowY: "auto" }}>
                    {loadingDomains ? (
                        <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
                            <CircularProgress size={18} sx={{ color: COLORS.accent }} />
                        </Box>
                    ) : filteredDomains.map(d => {
                        const isSel = selectedDomain === d.domain;
                        return (
                            <Box key={d.domain}
                                onClick={() => { setSelectedDomain(d.domain); setActiveTab(0); }}
                                sx={{
                                    px: 1.5, py: 1.2, cursor: "pointer", display: "flex", alignItems: "center", gap: 1.2,
                                    bgcolor: isSel ? accentAlpha(0.1) : "transparent",
                                    borderLeft: isSel ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                                    "&:hover": { bgcolor: isSel ? accentAlpha(0.1) : accentAlpha(0.04), "& .domain-delete-btn": { opacity: 1 } },
                                    transition: "all 0.12s",
                                    position: "relative",
                                }}>
                                <Typography sx={{ fontSize: "0.9rem", flexShrink: 0 }}>{domainIcon(d.domain)}</Typography>
                                <Box flex={1} sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: "0.73rem", fontWeight: isSel ? 600 : 400, color: isSel ? COLORS.textPrimary : COLORS.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {d.domain}
                                    </Typography>
                                    <Box sx={{ display: "flex", gap: 0.6, mt: 0.2 }}>
                                        {d.knowledgeCount > 0 && <Typography sx={{ fontSize: "0.58rem", color: COLORS.accent }}>{d.knowledgeCount} kb</Typography>}
                                        {d.workflowCount > 0 && <Typography sx={{ fontSize: "0.58rem", color: COLORS.green }}>{d.workflowCount} wf</Typography>}
                                        {d.cartridge && <Typography sx={{ fontSize: "0.58rem", color: COLORS.yellow }}>cartridge</Typography>}
                                    </Box>
                                </Box>
                                {/* Delete domain button — visible on hover */}
                                <Tooltip title="Delete entire domain">
                                    <IconButton
                                        className="domain-delete-btn"
                                        size="small"
                                        onClick={e => { e.stopPropagation(); setDeleteDomainConfirm(d.domain); }}
                                        sx={{
                                            opacity: 0, p: "3px", flexShrink: 0,
                                            color: COLORS.textSecondary,
                                            "&:hover": { color: COLORS.red },
                                            transition: "opacity 0.15s, color 0.15s",
                                        }}
                                    >
                                        <DeleteIcon sx={{ fontSize: "0.8rem" }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        );
                    })}
                </Box>
            </Box>

            {/* ── Right Panel ── */}
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                {!selectedDomain ? (
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 2 }}>
                        <Typography sx={{ fontSize: "3rem" }}>🧠</Typography>
                        <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.85rem" }}>Select a domain</Typography>
                    </Box>
                ) : (
                    <>
                        {/* Domain header */}
                        <Box sx={{ px: 3, py: 1.8, borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, minWidth: 0 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: COLORS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                    {domainIcon(selectedDomain)} {selectedDomain}
                                </Typography>
                                {bootstrapping && (
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                                        <CircularProgress size={11} sx={{ color: COLORS.accent }} />
                                        <Typography sx={{ fontSize: "0.62rem", color: COLORS.accent }}>Generating rules...</Typography>
                                    </Box>
                                )}
                            </Box>
                            {profile && (
                                <Typography sx={{ fontSize: "0.68rem", color: COLORS.textSecondary, mt: 0.2 }}>
                                    {knowledgeItems.length} knowledge entries · {profile.workflows.length} workflows
                                    {baseRuleItem?.source === "auto_bootstrap" && " · 🤖 auto rules"}
                                    {baseRuleItem?.source === "base_rule" && " · custom rules saved"}
                                    {profile.cartridge && ` · ${profile.cartridge.name} cartridge`}
                                </Typography>
                            )}
                        </Box>

                        {/* Tabs */}
                        <Box sx={{ borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0 }}>
                            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{
                                minHeight: 40, px: 1,
                                "& .MuiTab-root": { minHeight: 40, fontSize: "0.74rem", fontWeight: 600, color: COLORS.textSecondary, textTransform: "none", px: 1.5, py: 0, "&.Mui-selected": { color: COLORS.accent } },
                                "& .MuiTabs-indicator": { bgcolor: COLORS.accent, height: 2 },
                            }}>
                                {tabLabels.map((t, i) => (
                                    <Tab key={t.label} label={
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.7 }}>
                                            {t.emoji} {t.label}
                                            {t.count != null && t.count > 0 && (
                                                <Chip label={t.count} size="small"
                                                    sx={{ height: 15, fontSize: "0.56rem", bgcolor: accentAlpha(0.15), color: COLORS.accent }} />
                                            )}
                                        </Box>
                                    } />
                                ))}
                            </Tabs>
                        </Box>

                        {/* Content */}
                        {loadingProfile ? (
                            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                                <CircularProgress size={28} sx={{ color: COLORS.accent }} />
                            </Box>
                        ) : (
                            <>
                                <TabPanel value={activeTab} index={0}>
                                    <BaseRulesTab
                                        domain={selectedDomain}
                                        cartridge={profile?.cartridge ?? null}
                                        existingBaseRuleItem={baseRuleItem}
                                        onSaved={() => { showToast("Base rules saved ✓"); refresh(); }}
                                    />
                                </TabPanel>
                                <TabPanel value={activeTab} index={1}>
                                    <SemanticKnowledgeTab
                                        items={knowledgeItems}
                                        onDelete={deleteKnowledge}
                                        onBulkDelete={bulkDeleteKnowledge}
                                        onNew={() => setTeachOpen(true)}
                                    />
                                </TabPanel>
                                <TabPanel value={activeTab} index={2}>
                                    <WorkflowsTab
                                        items={profile?.workflows ?? []}
                                        onVerify={verifyWorkflow}
                                        onDelete={deleteWorkflow}
                                        onBulkDelete={bulkDeleteWorkflows}
                                    />
                                </TabPanel>
                                <TabPanel value={activeTab} index={3}>
                                    {selectedDomain && (
                                        <LearnedTab
                                            domain={selectedDomain}
                                            onReview={() => { refresh(); setLearnedCount(c => Math.max(0, c - 1)); }}
                                        />
                                    )}
                                </TabPanel>
                                <TabPanel value={activeTab} index={4}>
                                    <AboutTab />
                                </TabPanel>
                            </>
                        )}
                    </>
                )}
            </Box>

            <TeachModal
                open={teachOpen}
                domain={selectedDomain ?? "global"}
                onClose={() => setTeachOpen(false)}
                onSaved={() => { showToast("Knowledge saved ✓"); refresh(); }}
            />

            {/* Domain delete confirm */}
            <ConfirmDialog
                open={!!deleteDomainConfirm}
                message={`Delete all knowledge & workflows for "${deleteDomainConfirm}"? This cannot be undone.`}
                onConfirm={async () => {
                    if (deleteDomainConfirm) await deleteDomain(deleteDomainConfirm);
                    setDeleteDomainConfirm(null);
                }}
                onCancel={() => setDeleteDomainConfirm(null)}
            />

            <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
                <Alert severity={toast?.severity ?? "success"} sx={{ fontSize: "0.78rem" }} onClose={() => setToast(null)}>
                    {toast?.msg}
                </Alert>
            </Snackbar>
        </Box>
    );
}
