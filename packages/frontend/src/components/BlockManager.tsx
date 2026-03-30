// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Manager (Main Container)
// ============================================================
// Shows the 26+ UI block types the LLM uses to compose Canvas
// layouts. Users can preview, edit, create, and AI-generate blocks.
//
// Sub-components extracted to:
//   - BlockCard.tsx       (BlockCard, ImportsReference)
//   - BlockEditorPanel.tsx (BlockEditorPanel, newBlockTemplate)
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Box,
    Typography,
    Chip,
    Alert,
    Snackbar,
} from "@mui/material";
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    Widgets as WidgetsIcon,
    TextFields as TextIcon,
    BarChart as DataIcon,
    ViewList as ListIcon,
    Image as MediaIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import type { BlockSpec } from "./blocks/types";
import {
    GradientButton,
    ActionIcon,
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    accentAlpha,
    LoadingSpinner,
    EmptyState,
    errorAlertSx,
} from "./ui/SharedUI";
import { BlockCard } from "./BlockCard";
import { BlockEditorPanel } from "./BlockEditorPanel";

// ============================================================
// Types (exported for sub-components)
// ============================================================

export interface BlockMeta {
    type: string;
    component: string;
    category: "content" | "data" | "list" | "media";
    file: string;
    description: string;
    isCustom?: boolean;
}

export interface ValidationError {
    message: string;
    line?: number;
    column?: number;
}

// ============================================================
// Sample data for each block type (live preview)
// ============================================================

export const SAMPLE_PROPS: Record<string, BlockSpec> = {
    title: { type: "title", text: "Sample Title", subtitle: "With subtitle" },
    text: { type: "text", content: "This is a sample paragraph of body text that demonstrates how the TextBlock renders content." } as BlockSpec,
    image: { type: "image", src: "https://picsum.photos/400/200", alt: "Sample", caption: "Random photo" } as BlockSpec,
    divider: { type: "divider" },
    spacer: { type: "spacer", size: 2 } as BlockSpec,
    callout: { type: "callout", variant: "info", title: "Info", text: "This is a callout notice block." } as BlockSpec,
    accordion: { type: "accordion", sections: [{ title: "Section 1", content: "Content A" }, { title: "Section 2", content: "Content B" }] } as BlockSpec,
    hero: { type: "hero", value: "42.5", label: "Temperature", unit: "°C" } as BlockSpec,
    key_value: { type: "key_value", pairs: [{ key: "City", value: "Vienna" }, { key: "Country", value: "Austria" }, { key: "Pop.", value: "1.9M" }], columns: 3 } as BlockSpec,
    stat_bar: { type: "stat_bar", items: [{ label: "Health", value: 78, max: 100 }, { label: "Attack", value: 65, max: 100 }] } as BlockSpec,
    table: { type: "table", headers: ["Name", "Score", "Grade"], rows: [["Alice", 95, "A"], ["Bob", 82, "B"]] } as BlockSpec,
    metric_row: { type: "metric_row", metrics: [{ label: "Users", value: 1234, icon: "👤" }, { label: "Revenue", value: "$12K", icon: "💰" }] } as BlockSpec,
    rating: { type: "rating", value: 4, max: 5, label: "User Rating", count: "128 reviews" } as BlockSpec,
    timeline: { type: "timeline", events: [{ time: "2025-01", title: "Launch", description: "v1.0 released" }, { time: "2026-01", title: "Update", description: "v2.0" }] } as BlockSpec,
    chip_list: { type: "chip_list", items: ["React", "TypeScript", "MUI", "Hono"], color: "primary", label: "Technologies" } as BlockSpec,
    list: { type: "list", items: [{ primary: "Feature A", secondary: "Core" }, { primary: "Feature B", secondary: "Extra", badge: "New" }], label: "Features" } as BlockSpec,
    grid: { type: "grid", columns: 2, blocks: [{ type: "hero", value: "99", label: "Score" } as BlockSpec, { type: "hero", value: "42", label: "Level" } as BlockSpec] } as BlockSpec,
    image_grid: { type: "image_grid", images: [{ src: "https://picsum.photos/200/150?1", alt: "Photo 1" }, { src: "https://picsum.photos/200/150?2", alt: "Photo 2" }], columns: 2, label: "Gallery" } as BlockSpec,
    progress_ring: { type: "progress_ring", value: 72, max: 100, label: "Completion", unit: "%" } as BlockSpec,
    badge_row: { type: "badge_row", badges: [{ icon: "🏆", label: "Gold", value: 3 }, { icon: "🥈", label: "Silver", value: 7 }], label: "Achievements" } as BlockSpec,
    quote: { type: "quote", text: "The best way to predict the future is to invent it.", author: "Alan Kay" } as BlockSpec,
    code: { type: "code", content: 'const hello = "world";\nconsole.log(hello);', language: "javascript", label: "Example" } as BlockSpec,
    link_list: { type: "link_list", links: [{ label: "GitHub", url: "https://github.com", description: "Code hosting" }], label: "Links" } as BlockSpec,
    hero_image: { type: "hero_image", src: "https://picsum.photos/600/200", title: "Hero Image", subtitle: "Full width" } as BlockSpec,
    media_card: { type: "media_card", src: "https://picsum.photos/300/180", title: "Media Card", description: "Card preview", badge: "Featured" } as BlockSpec,
    video: { type: "video", src: "https://www.w3schools.com/html/mov_bbb.mp4", title: "Sample Video" } as BlockSpec,
    calculator: { type: "calculator" } as BlockSpec,
};

// ============================================================
// Category config
// ============================================================

export const CATEGORY_CONFIG = {
    content: { label: "Content", color: accentAlpha(0.7), icon: <TextIcon sx={{ fontSize: 14 }} /> },
    data: { label: "Data", color: "rgba(0, 200, 255, 0.7)", icon: <DataIcon sx={{ fontSize: 14 }} /> },
    list: { label: "List", color: "rgba(0, 220, 100, 0.7)", icon: <ListIcon sx={{ fontSize: 14 }} /> },
    media: { label: "Media", color: "rgba(255, 180, 0, 0.7)", icon: <MediaIcon sx={{ fontSize: 14 }} /> },
};

// ============================================================
// Main Component
// ============================================================

export const BlockManager = React.memo(function BlockManager() {
    const [blocks, setBlocks] = useState<BlockMeta[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
    const [editingBlock, setEditingBlock] = useState<BlockMeta | null>(null);
    const [isCreateMode, setIsCreateMode] = useState(false);

    const fetchBlocks = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/blocks");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setBlocks(data.blocks);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load blocks");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

    // Filter
    const filtered = useMemo(() => {
        let result = blocks;
        if (categoryFilter) {
            result = result.filter((b) => b.category === categoryFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (b) =>
                    b.type.includes(q) ||
                    b.component.toLowerCase().includes(q) ||
                    b.description.toLowerCase().includes(q)
            );
        }
        return result;
    }, [blocks, search, categoryFilter]);

    // Category counts
    const catCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        blocks.forEach((b) => { counts[b.category] = (counts[b.category] || 0) + 1; });
        return counts;
    }, [blocks]);

    // ─── Editor / Create View ───
    if (editingBlock || isCreateMode) {
        return (
            <BlockEditorPanel
                block={editingBlock}
                isCreateMode={isCreateMode}
                onClose={() => { setEditingBlock(null); setIsCreateMode(false); }}
                onBlockCreated={() => { fetchBlocks(); setSnackbar("Block created successfully!"); }}
                onBlockDeleted={() => { fetchBlocks(); setSnackbar("Block deleted."); }}
            />
        );
    }

    // ─── Grid View ───
    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
                <Box>
                    <Typography variant="h5" sx={gradientTitleSx()}>
                        🧊 Blocks
                    </Typography>
                    <Typography variant="caption" sx={{ color: COLORS.textSecondary, lineHeight: 1.5, display: "block", maxWidth: 600 }}>
                        Blocks are BiamOS's internal UI design system. The AI agent uses these components to dynamically assemble individual dashboards and views on the Canvas.
                        Depending on the context and data, the AI has 100% freedom to compose customized layouts (e.g., mixing tables, metrics, and charts) without any rigid or hardcoded templates.
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                    <GradientButton
                        onClick={() => setIsCreateMode(true)}
                        startIcon={<AddIcon />}
                        sx={{ minWidth: 130 }}
                    >
                        New Block
                    </GradientButton>
                    <ActionIcon tooltip="Refresh" onClick={fetchBlocks} disabled={isLoading}>
                        <RefreshIcon />
                    </ActionIcon>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={errorAlertSx}>
                    {error}
                </Alert>
            )}

            {/* Search + Category Filter */}
            <Box sx={{ mb: 2.5, display: "flex", gap: 1.5, alignItems: "center" }}>
                <Box
                    sx={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 1,
                        borderRadius: 2,
                        bgcolor: COLORS.surfaceDark,
                        border: `1px solid ${COLORS.border}`,
                        "&:focus-within": { borderColor: accentAlpha(0.6) },
                    }}
                >
                    <SearchIcon sx={{ color: COLORS.textMuted, fontSize: 20 }} />
                    <Box
                        component="input"
                        placeholder="Search blocks..."
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
            </Box>

            {/* Category Pills */}
            <Box sx={{ display: "flex", gap: 0.8, mb: 2, flexWrap: "wrap" }}>
                <Chip
                    size="small"
                    label={`All (${blocks.length})`}
                    onClick={() => setCategoryFilter(null)}
                    sx={{
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        bgcolor: !categoryFilter ? accentAlpha(0.15) : "transparent",
                        color: !categoryFilter ? COLORS.accent : COLORS.textMuted,
                        border: `1px solid ${!categoryFilter ? accentAlpha(0.3) : "transparent"}`,
                        cursor: "pointer",
                    }}
                />
                {(Object.entries(CATEGORY_CONFIG) as [string, typeof CATEGORY_CONFIG.content][]).map(
                    ([key, conf]) => (
                        <Chip
                            key={key}
                            size="small"
                            icon={conf.icon}
                            label={`${conf.label} (${catCounts[key] || 0})`}
                            onClick={() => setCategoryFilter(categoryFilter === key ? null : key)}
                            sx={{
                                fontWeight: 600,
                                fontSize: "0.75rem",
                                bgcolor: categoryFilter === key ? `${conf.color.replace("0.7", "0.12")}` : "transparent",
                                color: categoryFilter === key ? conf.color : COLORS.textMuted,
                                border: `1px solid ${categoryFilter === key ? conf.color.replace("0.7", "0.2") : "transparent"}`,
                                cursor: "pointer",
                                "& .MuiChip-icon": { color: categoryFilter === key ? conf.color : COLORS.textMuted, fontSize: 14 },
                            }}
                        />
                    )
                )}
            </Box>

            {/* Block Grid */}
            {isLoading ? (
                <LoadingSpinner py={6} />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="🧊"
                    title="No blocks match your search"
                />
            ) : (
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
                        gap: 2,
                    }}
                >
                    {filtered.map((block) => (
                        <BlockCard
                            key={block.type}
                            block={block}
                            onClick={() => setEditingBlock(block)}
                        />
                    ))}
                </Box>
            )}

            {/* Snackbar */}
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
