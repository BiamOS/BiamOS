// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Library (Settings Tab)
// ============================================================
// Shows all prompt modules (built-in + user-created) with CRUD.
// Users can create new modules via AI-assisted URL analysis,
// edit rules, toggle active/inactive, and delete custom modules.
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
    TextField,
} from "@mui/material";
import {
    Delete as DeleteIcon,
    ExpandMore as ExpandIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Pause as PauseIcon,
    PlayArrow as PlayIcon,
    AutoAwesome as AIIcon,
    Lock as BuiltinIcon,
    Close as CloseIcon,
    Save as SaveIcon,
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
    GradientButton,
    gradientTitleSx,
    scrollbarSx,
} from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

interface UserModule {
    id: number;
    module_id: string;
    name: string;
    priority: number;
    url_patterns: string;  // JSON string
    task_patterns: string | null;
    phases: string | null;
    rules: string;
    is_active: boolean;
    source: string;
    source_url: string | null;
    created_at: string;
    updated_at: string;
}

interface BuiltinModule {
    module_id: string;
    name: string;
    priority: number;
    is_builtin: true;
    is_active: true;
    url_patterns: string[];
    phases: string[];
    has_task_patterns: boolean;
    always: boolean;
    rules_preview: string;
    rules: string;
}

interface ModuleStats {
    total: number;
    custom: number;
    builtin: number;
    active: number;
}

// ─── Stat Card ──────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
    label, value, icon, color,
}: {
    label: string; value: number | string; icon: string; color: string;
}) {
    return (
        <Box sx={{
            flex: 1, p: 2, borderRadius: "8px",
            background: GRADIENTS.card, border: `1px solid ${COLORS.border}`,
            textAlign: "center", minWidth: 100,
        }}>
            <Typography sx={{ fontSize: "1.5rem", mb: 0.5 }}>{icon}</Typography>
            <Typography sx={{ fontSize: "1.4rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</Typography>
            <Typography sx={{
                fontSize: "0.65rem", color: COLORS.textMuted,
                textTransform: "uppercase", letterSpacing: "0.05em", mt: 0.5,
            }}>{label}</Typography>
        </Box>
    );
});

// ─── Module Row ─────────────────────────────────────────────

const ModuleRow = React.memo(function ModuleRow({
    module, isBuiltin, onDelete, onToggleActive, onEdit,
}: {
    module: UserModule | BuiltinModule;
    isBuiltin: boolean;
    onDelete?: (id: number) => void;
    onToggleActive?: (id: number, active: boolean) => void;
    onEdit?: (module: UserModule) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const isActive = isBuiltin ? true : (module as UserModule).is_active;
    const urlPatterns = isBuiltin
        ? (module as BuiltinModule).url_patterns
        : JSON.parse((module as UserModule).url_patterns || "[]");

    return (
        <Box sx={{
            borderRadius: "6px",
            border: `1px solid ${isBuiltin ? "rgba(59, 130, 246, 0.15)" : isActive ? "rgba(34, 197, 94, 0.2)" : COLORS.border}`,
            background: isBuiltin
                ? "linear-gradient(135deg, rgba(59, 130, 246, 0.04), rgba(59, 130, 246, 0.01))"
                : isActive ? "linear-gradient(135deg, rgba(34, 197, 94, 0.04), rgba(34, 197, 94, 0.01))" : GRADIENTS.card,
            mb: 1, overflow: "hidden", transition: "all 0.2s ease",
            opacity: isActive ? 1 : 0.6,
            "&:hover": { borderColor: isBuiltin ? "rgba(59, 130, 246, 0.3)" : COLORS.borderHover },
        }}>
            {/* ─── Row Header ─── */}
            <Box
                sx={{
                    display: "flex", alignItems: "center", gap: 1.5,
                    px: 2, py: 1.5, cursor: "pointer",
                    "&:hover": { bgcolor: accentAlpha(0.03) },
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <IconButton size="small" sx={{
                    color: COLORS.textMuted,
                    transform: expanded ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s", p: 0.5,
                }}>
                    <ExpandIcon sx={{ fontSize: 18 }} />
                </IconButton>

                {/* Name */}
                <Typography sx={{
                    flex: 1, fontSize: "0.85rem", color: COLORS.textPrimary, fontWeight: 600,
                }}>
                    {module.name}
                </Typography>

                {/* URL chips */}
                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0, flexWrap: "wrap", maxWidth: 200 }}>
                    {urlPatterns.slice(0, 2).map((p: string, i: number) => (
                        <Chip key={i} label={p.replace(/\\\./g, ".").replace(/\|/g, " | ")} size="small" sx={{
                            bgcolor: accentAlpha(0.1), color: accentAlpha(0.9),
                            fontWeight: 500, fontSize: "0.65rem", height: 20, fontFamily: "monospace",
                        }} />
                    ))}
                    {urlPatterns.length > 2 && (
                        <Chip label={`+${urlPatterns.length - 2}`} size="small" sx={{
                            bgcolor: COLORS.surface, color: COLORS.textMuted,
                            fontSize: "0.65rem", height: 20,
                        }} />
                    )}
                </Box>

                {/* Type badge */}
                {isBuiltin ? (
                    <Chip icon={<BuiltinIcon sx={{ fontSize: 12 }} />} label="Built-in" size="small" sx={{
                        bgcolor: "rgba(59, 130, 246, 0.12)", color: "#3B82F6",
                        fontWeight: 700, fontSize: "0.65rem", height: 20,
                    }} />
                ) : (
                    <Chip label={isActive ? "✅ Active" : "⏸ Disabled"} size="small" sx={{
                        bgcolor: isActive ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                        color: isActive ? "#22C55E" : "#EF4444",
                        fontWeight: 700, fontSize: "0.65rem", height: 20,
                    }} />
                )}

                {/* Priority */}
                <Typography sx={{ fontSize: "0.7rem", color: COLORS.textMuted, minWidth: 30, textAlign: "right" }}>
                    P:{module.priority}
                </Typography>

                {/* Action buttons (only for custom modules) */}
                {!isBuiltin && (
                    <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit rules">
                            <IconButton size="small" onClick={() => onEdit?.(module as UserModule)}
                                sx={{ color: COLORS.textMuted, "&:hover": { color: accentAlpha(0.9) } }}>
                                <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={isActive ? "Disable" : "Enable"}>
                            <IconButton size="small"
                                onClick={() => onToggleActive?.((module as UserModule).id, !isActive)}
                                sx={{ color: COLORS.textMuted, "&:hover": { color: isActive ? "#EF4444" : "#22C55E" } }}>
                                {isActive ? <PauseIcon sx={{ fontSize: 16 }} /> : <PlayIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete module">
                            <IconButton size="small" onClick={() => onDelete?.((module as UserModule).id)}
                                sx={{ color: COLORS.textMuted, "&:hover": { color: COLORS.red } }}>
                                <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </Box>

            {/* ─── Expanded Rule Preview ─── */}
            <Collapse in={expanded}>
                <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: `1px solid ${COLORS.border}` }}>
                    <Typography sx={{
                        fontSize: "0.65rem", color: COLORS.textMuted,
                        textTransform: "uppercase", letterSpacing: "0.05em", mb: 1,
                    }}>Rules</Typography>
                    <Box sx={{
                        p: 1.5, borderRadius: "4px", bgcolor: COLORS.surfaceDark,
                        border: `1px solid ${COLORS.border}`, fontFamily: "monospace",
                        fontSize: "0.75rem", color: COLORS.textSecondary,
                        whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 200, overflow: "auto",
                        ...scrollbarSx,
                    }}>
                        {isBuiltin ? (module as BuiltinModule).rules : (module as UserModule).rules}
                    </Box>
                    {!isBuiltin && (module as UserModule).source_url && (
                        <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, mt: 1 }}>
                            Source: {(module as UserModule).source_url}
                        </Typography>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
});

// ─── Create/Edit Dialog ─────────────────────────────────────

function ModuleEditorDialog({
    open, onClose, onSave, editModule,
}: {
    open: boolean;
    onClose: () => void;
    onSave: (data: { name: string; url_patterns: string[]; rules: string; priority: number; source?: string; source_url?: string }) => Promise<void>;
    editModule: UserModule | null;
}) {
    const [name, setName] = useState("");
    const [urlPatternsStr, setUrlPatternsStr] = useState("");
    const [rules, setRules] = useState("");
    const [priority, setPriority] = useState(50);
    const [analyzeUrl, setAnalyzeUrl] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Pre-fill for edit mode
    useEffect(() => {
        if (editModule) {
            setName(editModule.name);
            const patterns = JSON.parse(editModule.url_patterns || "[]");
            setUrlPatternsStr(patterns.join(", "));
            setRules(editModule.rules);
            setPriority(editModule.priority);
            setAnalyzeUrl(editModule.source_url || "");
        } else {
            setName(""); setUrlPatternsStr(""); setRules(""); setPriority(50);
            setAnalyzeUrl(""); setError(null);
        }
    }, [editModule, open]);

    const handleAnalyze = async () => {
        if (!analyzeUrl) return;
        setAnalyzing(true);
        setError(null);

        try {
            // We need to extract pageText from the URL — this would be done via the webview
            // For now, we send a simplified request; the full webview integration comes later
            const res = await fetch("/api/prompt-modules/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: analyzeUrl,
                    pageText: `Page at ${analyzeUrl} — AI analysis requested. Please generate generic rules based on the URL pattern.`,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Analysis failed");

            setName(data.name || "");
            setUrlPatternsStr((data.url_patterns || []).join(", "));
            setRules((data.suggested_rules || "").replace(/\\n/g, "\n"));
        } catch (err: any) {
            setError(err.message || "Analysis failed");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleSave = async () => {
        if (!name || !urlPatternsStr || !rules) {
            setError("Name, URL patterns, and rules are required");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const url_patterns = urlPatternsStr.split(",").map(s => s.trim()).filter(Boolean);
            await onSave({ name, url_patterns, rules, priority, source_url: analyzeUrl || undefined });
            onClose();
        } catch (err: any) {
            setError(err.message || "Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{
            sx: {
                bgcolor: COLORS.bgPaper, border: `1px solid ${COLORS.border}`,
                borderRadius: "12px", minHeight: 500,
            },
        }}>
            <DialogTitle sx={{
                color: COLORS.textPrimary, fontSize: "1rem", fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
                {editModule ? "✏️ Edit Module" : "🧠 Train New Site"}
                <IconButton onClick={onClose} size="small" sx={{ color: COLORS.textMuted }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                {/* AI Analysis URL */}
                {!editModule && (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
                        <TextField
                            label="URL to Analyze"
                            placeholder="https://github.com"
                            value={analyzeUrl}
                            onChange={(e) => setAnalyzeUrl(e.target.value)}
                            fullWidth size="small"
                            sx={{ "& .MuiOutlinedInput-root": { color: COLORS.textPrimary, bgcolor: COLORS.surfaceDark } }}
                            InputLabelProps={{ sx: { color: COLORS.textMuted } }}
                        />
                        <GradientButton
                            onClick={handleAnalyze}
                            disabled={analyzing || !analyzeUrl}
                            startIcon={<AIIcon />}
                            sx={{ minWidth: 120, flexShrink: 0 }}
                        >
                            {analyzing ? "Analyzing..." : "🔍 Analyze"}
                        </GradientButton>
                    </Box>
                )}

                {error && (
                    <Typography sx={{ color: COLORS.red, fontSize: "0.8rem" }}>⚠️ {error}</Typography>
                )}

                {/* Name + Priority */}
                <Box sx={{ display: "flex", gap: 2 }}>
                    <TextField
                        label="Module Name"
                        placeholder="GitHub"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth size="small"
                        sx={{ "& .MuiOutlinedInput-root": { color: COLORS.textPrimary, bgcolor: COLORS.surfaceDark } }}
                        InputLabelProps={{ sx: { color: COLORS.textMuted } }}
                    />
                    <TextField
                        label="Priority"
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(parseInt(e.target.value) || 50)}
                        sx={{
                            width: 100,
                            "& .MuiOutlinedInput-root": { color: COLORS.textPrimary, bgcolor: COLORS.surfaceDark },
                        }}
                        size="small"
                        InputLabelProps={{ sx: { color: COLORS.textMuted } }}
                    />
                </Box>

                {/* URL Patterns */}
                <TextField
                    label="URL Patterns (comma-separated regex)"
                    placeholder="github\\.com, gist\\.github\\.com"
                    value={urlPatternsStr}
                    onChange={(e) => setUrlPatternsStr(e.target.value)}
                    fullWidth size="small"
                    sx={{ "& .MuiOutlinedInput-root": { color: COLORS.textPrimary, bgcolor: COLORS.surfaceDark, fontFamily: "monospace" } }}
                    InputLabelProps={{ sx: { color: COLORS.textMuted } }}
                />

                {/* Rules Editor */}
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: "0.7rem", color: COLORS.textMuted, mb: 0.5, textTransform: "uppercase" }}>
                        Navigation Rules
                    </Typography>
                    <Box
                        component="textarea"
                        value={rules}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRules(e.target.value)}
                        placeholder={`═══════════════════════════════════════════════════\nPLATFORM: Example\n═══════════════════════════════════════════════════\n- Search: Use the search bar at the top\n- Navigation: Click on menu items\n- Forms: Fill in fields from top to bottom`}
                        sx={{
                            width: "100%", minHeight: 200, p: 1.5,
                            bgcolor: COLORS.surfaceDark, color: COLORS.textSecondary,
                            border: `1px solid ${COLORS.border}`, borderRadius: "6px",
                            fontFamily: "monospace", fontSize: "0.8rem", lineHeight: 1.6,
                            resize: "vertical", outline: "none",
                            "&:focus": { borderColor: accentAlpha(0.6) },
                        }}
                    />
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <GhostButton onClick={onClose}>Cancel</GhostButton>
                <GradientButton
                    onClick={handleSave}
                    disabled={saving || !name || !urlPatternsStr || !rules}
                    startIcon={<SaveIcon />}
                >
                    {saving ? "Saving..." : editModule ? "Update Module" : "💾 Save Module"}
                </GradientButton>
            </DialogActions>
        </Dialog>
    );
}

// ─── Main Component ─────────────────────────────────────────

type TabType = "custom" | "builtin";

export const PromptLibrary = React.memo(function PromptLibrary() {
    const [userModules, setUserModules] = useState<UserModule[]>([]);
    const [builtinModules, setBuiltinModules] = useState<BuiltinModule[]>([]);
    const [stats, setStats] = useState<ModuleStats>({ total: 0, custom: 0, builtin: 0, active: 0 });
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<TabType>("custom");
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingModule, setEditingModule] = useState<UserModule | null>(null);

    // ─── Fetch modules ──
    const fetchModules = useCallback(async () => {
        try {
            const res = await fetch("/api/prompt-modules");
            const data = await res.json();
            setUserModules(data.modules || []);
            setBuiltinModules(data.builtinModules || []);
            setStats(data.stats || { total: 0, custom: 0, builtin: 0, active: 0 });
        } catch (err) {
            console.error("[PromptLibrary] fetch error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchModules();
    }, [fetchModules]);

    // ─── Create / Update ──
    const handleSave = useCallback(async (data: {
        name: string; url_patterns: string[]; rules: string;
        priority: number; source?: string; source_url?: string;
    }) => {
        if (editingModule) {
            // Update
            const res = await fetch(`/api/prompt-modules/${editingModule.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Update failed");
            }
        } else {
            // Create
            const res = await fetch("/api/prompt-modules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Create failed");
            }
        }
        setEditingModule(null);
        await fetchModules();
    }, [editingModule, fetchModules]);

    // ─── Delete ──
    const handleDelete = useCallback(async (id: number) => {
        await fetch(`/api/prompt-modules/${id}`, { method: "DELETE" });
        setUserModules((prev) => prev.filter((m) => m.id !== id));
        setStats((prev) => ({ ...prev, total: prev.total - 1, custom: prev.custom - 1 }));
    }, []);

    // ─── Toggle active ──
    const handleToggleActive = useCallback(async (id: number, active: boolean) => {
        await fetch(`/api/prompt-modules/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: active }),
        });
        setUserModules((prev) =>
            prev.map((m) => (m.id === id ? { ...m, is_active: active } : m))
        );
        setStats((prev) => ({
            ...prev,
            active: prev.active + (active ? 1 : -1),
        }));
    }, []);

    // ─── Edit ──
    const handleEdit = useCallback((module: UserModule) => {
        setEditingModule(module);
        setEditorOpen(true);
    }, []);

    if (loading) return <LoadingSpinner label="Loading prompt modules..." />;

    return (
        <Box sx={{ ...scrollbarSx, maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
            {/* ─── Header ─── */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="h5" sx={{ ...gradientTitleSx(GRADIENTS.title), fontSize: "1.3rem" }}>
                    📝 Prompt Library
                </Typography>
                <GradientButton
                    startIcon={<AddIcon />}
                    onClick={() => { setEditingModule(null); setEditorOpen(true); }}
                    size="small"
                >
                    Train New Site
                </GradientButton>
            </Box>
            <Typography sx={{ color: COLORS.textMuted, fontSize: "0.78rem", mb: 3 }}>
                Manage agent navigation rules per platform. Create custom modules or let AI generate rules from any website.
            </Typography>

            {/* ─── Stats Row ─── */}
            <Box sx={{ display: "flex", gap: 1.5, mb: 3 }}>
                <StatCard label="Total" value={stats.total} icon="📋" color={accentAlpha(0.9)} />
                <StatCard label="Custom" value={stats.custom} icon="✨" color="#8B5CF6" />
                <StatCard label="Built-in" value={stats.builtin} icon="📦" color="#3B82F6" />
                <StatCard label="Active" value={stats.active} icon="✅" color="#22C55E" />
            </Box>

            {/* ─── Tab Toggle ─── */}
            <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                <Chip
                    label={`✨ Custom (${userModules.length})`}
                    onClick={() => setTab("custom")}
                    sx={{
                        bgcolor: tab === "custom" ? accentAlpha(0.15) : COLORS.surface,
                        color: tab === "custom" ? accentAlpha(0.9) : COLORS.textSecondary,
                        border: `1px solid ${tab === "custom" ? COLORS.borderHover : COLORS.border}`,
                        fontWeight: tab === "custom" ? 700 : 400,
                        height: 32, cursor: "pointer",
                        transition: "all 0.2s ease",
                        "&:hover": { bgcolor: accentAlpha(0.1) },
                    }}
                />
                <Chip
                    label={`📦 Built-in (${builtinModules.length})`}
                    onClick={() => setTab("builtin")}
                    sx={{
                        bgcolor: tab === "builtin" ? accentAlpha(0.15) : COLORS.surface,
                        color: tab === "builtin" ? accentAlpha(0.9) : COLORS.textSecondary,
                        border: `1px solid ${tab === "builtin" ? COLORS.borderHover : COLORS.border}`,
                        fontWeight: tab === "builtin" ? 700 : 400,
                        height: 32, cursor: "pointer",
                        transition: "all 0.2s ease",
                        "&:hover": { bgcolor: accentAlpha(0.1) },
                    }}
                />
            </Box>

            {/* ─── Module List ─── */}
            {tab === "custom" && (
                userModules.length === 0 ? (
                    <EmptyState
                        icon="✨"
                        title="No custom modules yet"
                        subtitle="Click 'Train New Site' to create your first custom platform module."
                    />
                ) : (
                    <Box sx={{ ...panelSx, p: 1.5 }}>
                        {userModules.map((m) => (
                            <ModuleRow
                                key={m.id}
                                module={m}
                                isBuiltin={false}
                                onDelete={handleDelete}
                                onToggleActive={handleToggleActive}
                                onEdit={handleEdit}
                            />
                        ))}
                    </Box>
                )
            )}

            {tab === "builtin" && (
                <Box sx={{ ...panelSx, p: 1.5 }}>
                    {builtinModules.map((m) => (
                        <ModuleRow
                            key={m.module_id}
                            module={m}
                            isBuiltin={true}
                        />
                    ))}
                </Box>
            )}

            {/* ─── Editor Dialog ─── */}
            <ModuleEditorDialog
                open={editorOpen}
                onClose={() => { setEditorOpen(false); setEditingModule(null); }}
                onSave={handleSave}
                editModule={editingModule}
            />
        </Box>
    );
});
