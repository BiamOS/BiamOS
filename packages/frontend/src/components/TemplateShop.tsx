// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Template Shop (pre-built integrations)
// ============================================================
// Grid of installable templates with category filters.
// Reuses all SharedUI components — no custom CSS.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Box,
    Typography,
    Chip,
    Alert,
    Snackbar,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import {
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    accentAlpha,
    LoadingSpinner,
    EmptyState,
    errorAlertSx,
} from "./ui/SharedUI";
import { TemplateCard, type TemplateData } from "./TemplateCard";

// ============================================================
// Category Filters
// ============================================================

const CATEGORIES = [
    { key: "all", label: "All" },
    { key: "data", label: "📊 Data" },
    { key: "content", label: "📰 Content" },
    { key: "tools", label: "🔧 Tools" },
    { key: "web", label: "🌐 Web" },
];

const chipFilterSx = (active: boolean) => ({
    bgcolor: active ? accentAlpha(0.15) : COLORS.surface,
    color: active ? accentAlpha(0.9) : COLORS.textSecondary,
    border: `1px solid ${active ? COLORS.borderHover : COLORS.border}`,
    fontWeight: active ? 700 : 400,
    transition: "all 0.2s ease",
    cursor: "pointer",
    "&:hover": { bgcolor: accentAlpha(0.1), borderColor: COLORS.borderHover },
});

// ============================================================
// Main Component
// ============================================================

export const TemplateShop = React.memo(function TemplateShop({
    onInstalled,
    onConfigure,
}: {
    onInstalled: () => void;
    onConfigure: (groupName: string) => void;
}) {
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState("all");
    const [search, setSearch] = useState("");
    const [snackbar, setSnackbar] = useState<string | null>(null);

    // ─── Fetch templates ───
    const fetchTemplates = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await fetch("/api/integrations/templates");
            const data = await res.json();
            setTemplates(data.templates || []);
        } catch (err) {
            setError("Failed to load templates");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

    // ─── Install handler ───
    const handleInstall = useCallback(async (templateId: string) => {
        const res = await fetch("/api/integrations/install-template", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateId }),
        });
        const data = await res.json();

        if (!res.ok) {
            setError(data.message || "Install failed");
            throw new Error(data.message);
        }

        setSnackbar(data.message);
        onInstalled();
        // Notify sidebar to refresh
        window.dispatchEvent(new Event("biamos:integrations-changed"));
    }, [onInstalled]);

    // ─── Filtered templates ───
    const filtered = useMemo(() => {
        let result = templates;
        if (category !== "all") {
            result = result.filter((t) => t.category === category);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter((t) =>
                t.label.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q) ||
                t.human_triggers.toLowerCase().includes(q)
            );
        }
        return result;
    }, [templates, category, search]);

    return (
        <Box>
            {/* Search + Category Filters */}
            <Box sx={{ mb: 2.5 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 1,
                        borderRadius: 2,
                        bgcolor: COLORS.surfaceDark,
                        border: `1px solid ${COLORS.border}`,
                        mb: 1.5,
                        "&:focus-within": { borderColor: accentAlpha(0.6) },
                    }}
                >
                    <SearchIcon sx={{ color: COLORS.textMuted, fontSize: 20 }} />
                    <Box
                        component="input"
                        placeholder="Search templates..."
                        value={search}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                        sx={{
                            flex: 1,
                            border: "none",
                            outline: "none",
                            bgcolor: "transparent",
                            color: COLORS.textPrimary,
                            fontSize: "0.85rem",
                            "::placeholder": { color: COLORS.textMuted },
                        }}
                    />
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {CATEGORIES.map((c) => (
                        <Chip
                            key={c.key}
                            label={c.label}
                            size="small"
                            onClick={() => setCategory(c.key)}
                            sx={chipFilterSx(category === c.key)}
                        />
                    ))}
                </Box>
            </Box>

            {error && (
                <Alert
                    severity="error"
                    onClose={() => setError(null)}
                    sx={errorAlertSx}
                >
                    {error}
                </Alert>
            )}

            {/* Grid */}
            {isLoading ? (
                <LoadingSpinner py={6} />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="📦"
                    title="No templates found"
                    subtitle="Try adjusting your search or filters"
                />
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: 2,
                    }}
                >
                    {filtered.map((t) => (
                        <TemplateCard
                            key={t.id}
                            template={t}
                            onInstall={handleInstall}
                            onConfigure={onConfigure}
                        />
                    ))}
                </Box>
            )}

            <Snackbar
                open={!!snackbar}
                autoHideDuration={4000}
                onClose={() => setSnackbar(null)}
                message={snackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
});
