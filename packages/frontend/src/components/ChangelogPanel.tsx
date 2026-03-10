// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Changelog Panel
// ============================================================
// Timeline-style release notes viewer with CRUD functionality.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Typography,
    Chip,
    Alert,
    Snackbar,
    IconButton,
} from "@mui/material";
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Close as CloseIcon,
    NewReleases as ReleaseIcon,
    CheckCircle as SaveIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    GhostButton,
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    accentAlpha,
    LoadingSpinner,
    EmptyState,
} from "./ui/SharedUI";

// ============================================================
// Types
// ============================================================

interface ChangelogItem {
    type: "feature" | "fix" | "improvement" | "breaking";
    text: string;
}

interface ChangelogRelease {
    id: number;
    version: string;
    date: string;
    entries: string; // JSON stringified ChangelogItem[]
}

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
    feature: { label: "New Feature", emoji: "✨", color: "rgba(0, 220, 100, 0.8)" },
    fix: { label: "Bug Fix", emoji: "🐛", color: "rgba(255, 180, 0, 0.8)" },
    improvement: { label: "Improvement", emoji: "🔧", color: "rgba(0, 200, 255, 0.8)" },
    breaking: { label: "Breaking Change", emoji: "⚠️", color: "rgba(255, 80, 80, 0.8)" },
};

// ============================================================
// Component
// ============================================================

export const ChangelogPanel = React.memo(function ChangelogPanel() {
    const [releases, setReleases] = useState<ChangelogRelease[]>([]);
    const [currentVersion, setCurrentVersion] = useState("...");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<string | null>(null);

    // Create form state
    const [showForm, setShowForm] = useState(false);
    const [formVersion, setFormVersion] = useState("");
    const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
    const [formEntries, setFormEntries] = useState<ChangelogItem[]>([{ type: "feature", text: "" }]);
    const [saving, setSaving] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<number | null>(null);

    const fetchChangelog = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/changelog");
            const data = await res.json();
            setReleases(data.entries || []);
            setCurrentVersion(data.version || "0.0.0");
        } catch {
            setError("Failed to load changelog");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchChangelog(); }, [fetchChangelog]);

    const handleAddEntry = () => {
        setFormEntries([...formEntries, { type: "feature", text: "" }]);
    };

    const handleRemoveEntry = (idx: number) => {
        setFormEntries(formEntries.filter((_, i) => i !== idx));
    };

    const handleEntryChange = (idx: number, field: "type" | "text", value: string) => {
        const updated = [...formEntries];
        updated[idx] = { ...updated[idx], [field]: value };
        setFormEntries(updated);
    };

    const handleSave = async () => {
        if (!formVersion.trim()) { setError("Version is required"); return; }
        const validEntries = formEntries.filter(e => e.text.trim());
        if (validEntries.length === 0) { setError("At least one entry is required"); return; }

        setSaving(true);
        setError(null);
        try {
            const url = editingId ? `/api/changelog/${editingId}` : "/api/changelog";
            const method = editingId ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    version: formVersion,
                    date: formDate,
                    entries: validEntries,
                }),
            });
            if (!res.ok) throw new Error((await res.json()).message || "Save failed");
            setSnackbar(editingId ? "Release updated!" : "Release created!");
            resetForm();
            fetchChangelog();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await fetch(`/api/changelog/${id}`, { method: "DELETE" });
            setSnackbar("Release deleted");
            fetchChangelog();
        } catch {
            setError("Delete failed");
        }
    };

    const handleEdit = (release: ChangelogRelease) => {
        setEditingId(release.id);
        setFormVersion(release.version);
        setFormDate(release.date);
        try {
            setFormEntries(JSON.parse(release.entries));
        } catch {
            setFormEntries([{ type: "feature", text: "Error parsing entries" }]);
        }
        setShowForm(true);
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormVersion("");
        setFormDate(new Date().toISOString().split("T")[0]);
        setFormEntries([{ type: "feature", text: "" }]);
    };

    // ─── Input Styles ───
    const inputSx = {
        p: 1,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 2,
        bgcolor: "rgba(0,0,0,0.3)",
        color: COLORS.textPrimary,
        fontSize: "0.85rem",
        outline: "none",
        "&:focus": { borderColor: accentAlpha(0.5) },
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
                <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Typography variant="h5" sx={gradientTitleSx(GRADIENTS.titleCyan)}>
                            📋 Changelog
                        </Typography>
                        <Chip
                            size="small"
                            label={`v${currentVersion}`}
                            sx={{
                                height: 22,
                                fontWeight: 700,
                                fontSize: "0.72rem",
                                bgcolor: accentAlpha(0.12),
                                color: accentAlpha(0.9),
                                border: `1px solid ${accentAlpha(0.25)}`,
                            }}
                        />
                    </Box>
                    <Typography variant="caption" sx={{ color: COLORS.textSecondary, lineHeight: 1.5, display: "block", maxWidth: 600 }}>
                        Track changes, new features, bug fixes, and improvements across BiamOS releases.
                        Add entries before deploying a new version to keep a clean release history.
                    </Typography>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, bgcolor: "rgba(255,50,50,0.08)", color: "#ff6464", border: "1px solid rgba(255,50,50,0.2)", borderRadius: 2 }}>
                    {error}
                </Alert>
            )}

            {/* ═══ Create / Edit Form ═══ */}
            {showForm && (
                <Box sx={{
                    mb: 3,
                    p: 2.5,
                    borderRadius: 3,
                    bgcolor: COLORS.surface,
                    border: `1px solid ${accentAlpha(0.2)}`,
                    boxShadow: `0 4px 24px ${accentAlpha(0.08)}`,
                }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ color: accentAlpha(0.9), fontWeight: 700 }}>
                            {editingId ? "✏️ Edit Release" : "✨ New Release"}
                        </Typography>
                        <IconButton size="small" onClick={resetForm} sx={{ color: COLORS.textMuted }}>
                            <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
                        <Box
                            component="input"
                            placeholder="Version (e.g. 0.9.0)"
                            value={formVersion}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormVersion(e.target.value)}
                            sx={{ ...inputSx, flex: 1, fontFamily: "'JetBrains Mono', monospace" }}
                        />
                        <Box
                            component="input"
                            type="date"
                            value={formDate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormDate(e.target.value)}
                            sx={{ ...inputSx, width: 160 }}
                        />
                    </Box>

                    {/* Entry rows */}
                    {formEntries.map((entry, idx) => (
                        <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                            <Box
                                component="select"
                                value={entry.type}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleEntryChange(idx, "type", e.target.value)}
                                sx={{
                                    ...inputSx,
                                    width: 140,
                                    cursor: "pointer",
                                    appearance: "auto" as any,
                                }}
                            >
                                {Object.entries(TYPE_CONFIG).map(([key, conf]) => (
                                    <option key={key} value={key}>{conf.emoji} {conf.label}</option>
                                ))}
                            </Box>
                            <Box
                                component="input"
                                placeholder="What changed..."
                                value={entry.text}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEntryChange(idx, "text", e.target.value)}
                                sx={{ ...inputSx, flex: 1 }}
                            />
                            {formEntries.length > 1 && (
                                <IconButton size="small" onClick={() => handleRemoveEntry(idx)} sx={{ color: "rgba(255,80,80,0.5)" }}>
                                    <DeleteIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            )}
                        </Box>
                    ))}

                    <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                        <GhostButton onClick={handleAddEntry} sx={{ fontSize: "0.75rem" }}>
                            + Add Entry
                        </GhostButton>
                        <Box sx={{ flex: 1 }} />
                        <GhostButton onClick={resetForm}>Cancel</GhostButton>
                        <GradientButton onClick={handleSave} loading={saving} startIcon={<SaveIcon />}>
                            {editingId ? "Update" : "Create Release"}
                        </GradientButton>
                    </Box>
                </Box>
            )}

            {/* ═══ Timeline ═══ */}
            {loading ? (
                <LoadingSpinner py={6} />
            ) : releases.length === 0 ? (
                <EmptyState
                    icon="📋"
                    title="No releases yet"
                />
            ) : (
                <Box sx={{ position: "relative", pl: 3 }}>
                    {/* Timeline line */}
                    <Box sx={{
                        position: "absolute",
                        left: 10,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        bgcolor: accentAlpha(0.15),
                        borderRadius: 1,
                    }} />

                    {releases.map((release, rIdx) => {
                        let items: ChangelogItem[] = [];
                        try { items = JSON.parse(release.entries); } catch { /* */ }

                        return (
                            <Box key={release.id} sx={{ mb: 3, position: "relative" }}>
                                {/* Timeline dot */}
                                <Box sx={{
                                    position: "absolute",
                                    left: -22,
                                    top: 6,
                                    width: 12,
                                    height: 12,
                                    borderRadius: "50%",
                                    bgcolor: rIdx === 0 ? accentAlpha(0.8) : accentAlpha(0.3),
                                    border: `2px solid ${rIdx === 0 ? accentAlpha(0.4) : "transparent"}`,
                                    boxShadow: rIdx === 0 ? `0 0 12px ${accentAlpha(0.4)}` : "none",
                                }} />

                                {/* Release card */}
                                <Box sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: COLORS.surface,
                                    border: `1px solid ${rIdx === 0 ? accentAlpha(0.2) : COLORS.border}`,
                                    transition: "all 0.2s",
                                    "&:hover": { borderColor: accentAlpha(0.3) },
                                }}>
                                    {/* Version header */}
                                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                            <ReleaseIcon sx={{ fontSize: 18, color: rIdx === 0 ? accentAlpha(0.8) : COLORS.textMuted }} />
                                            <Typography sx={{
                                                fontWeight: 800,
                                                fontSize: "1rem",
                                                fontFamily: "'JetBrains Mono', monospace",
                                                color: COLORS.textPrimary,
                                            }}>
                                                v{release.version}
                                            </Typography>
                                            {rIdx === 0 && (
                                                <Chip size="small" label="Latest" sx={{
                                                    height: 18,
                                                    fontSize: "0.6rem",
                                                    fontWeight: 700,
                                                    bgcolor: "rgba(0,220,100,0.1)",
                                                    color: "rgba(0,220,100,0.8)",
                                                    border: "1px solid rgba(0,220,100,0.2)",
                                                }} />
                                            )}
                                            <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.72rem" }}>
                                                {release.date}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    {/* Entry list */}
                                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                                        {items.map((item, iIdx) => {
                                            const conf = TYPE_CONFIG[item.type] || TYPE_CONFIG.feature;
                                            return (
                                                <Box key={iIdx} sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                                                    <Chip
                                                        size="small"
                                                        label={`${conf.emoji} ${conf.label}`}
                                                        sx={{
                                                            height: 20,
                                                            fontSize: "0.6rem",
                                                            fontWeight: 600,
                                                            bgcolor: conf.color.replace("0.8", "0.08"),
                                                            color: conf.color,
                                                            border: `1px solid ${conf.color.replace("0.8", "0.15")}`,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.82rem", lineHeight: 1.5, pt: 0.1 }}>
                                                        {item.text}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}

            <Snackbar
                open={!!snackbar}
                autoHideDuration={3000}
                onClose={() => setSnackbar(null)}
                message={snackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
});
