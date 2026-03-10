// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Picker (Allowed Blocks Selector)
// ============================================================
// Dynamic block catalog fetched from GET /api/integrations/block-catalog.
// "AI Select" calls POST /api/integrations/suggest-blocks.
// Reuses SharedUI components — no custom CSS.
// ============================================================

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
    Box,
    Typography,
    Chip,
    CircularProgress,
} from "@mui/material";
import { AutoAwesome as AIIcon, RestartAlt as ResetIcon } from "@mui/icons-material";
import {
    GhostButton,
    GradientButton,
    COLORS,
    accentAlpha,
    sectionLabelSx,
} from "./ui/SharedUI";

// ============================================================
// Category display labels
// ============================================================

const CATEGORY_LABELS: Record<string, string> = {
    content: "Content",
    data: "Data",
    list: "List",
    media: "Media",
    form: "Form",
};

// ============================================================
// Props
// ============================================================

export interface BlockPickerEndpoint {
    name: string;
    path: string;
    intent_description: string;
    response_type?: string;
    endpoint_tags?: string;
}

// ============================================================
// Component
// ============================================================

export const BlockPicker = React.memo(function BlockPicker({
    selectedBlocks,
    onChange,
    endpoints,
}: {
    selectedBlocks: string[] | null;
    onChange: (blocks: string[] | null) => void;
    endpoints?: BlockPickerEndpoint[];
}) {
    const [loading, setLoading] = useState(false);
    const [catalog, setCatalog] = useState<Record<string, string[]> | null>(null);

    // Fetch block catalog from backend (single source of truth)
    useEffect(() => {
        fetch("/api/integrations/block-catalog")
            .then((r) => r.json())
            .then((data) => {
                if (data.categories) setCatalog(data.categories);
            })
            .catch(() => { /* silently use empty state */ });
    }, []);

    const allBlocks = useMemo(
        () => catalog ? Object.values(catalog).flat() : [],
        [catalog]
    );

    const selected = useMemo(
        () => new Set(selectedBlocks || allBlocks),
        [selectedBlocks, allBlocks]
    );
    const isAllSelected = selectedBlocks === null || (allBlocks.length > 0 && selectedBlocks?.length === allBlocks.length);

    const toggleBlock = (blockType: string) => {
        const next = new Set(selected);
        if (next.has(blockType)) {
            next.delete(blockType);
        } else {
            next.add(blockType);
        }
        if (next.size === allBlocks.length) {
            onChange(null);
        } else {
            onChange(Array.from(next));
        }
    };

    const handleAutoSelect = useCallback(async () => {
        if (!endpoints || endpoints.length === 0) {
            // Fallback: smart defaults
            onChange([
                "title", "text", "divider", "spacer", "callout",
                "hero", "key_value", "metric_row", "stat_bar",
                "chip_list", "list", "badge_row", "link_list",
            ]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/integrations/suggest-blocks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoints }),
            });
            const data = await res.json();
            if (Array.isArray(data.blocks) && data.blocks.length > 0) {
                onChange(data.blocks);
            }
        } catch (err) {
            console.error("Block suggestion failed:", err);
            onChange([
                "title", "text", "divider", "spacer", "callout",
                "hero", "key_value", "metric_row", "stat_bar",
                "chip_list", "list", "badge_row", "link_list",
            ]);
        } finally {
            setLoading(false);
        }
    }, [endpoints, onChange]);

    const handleReset = () => {
        onChange(null);
    };

    // Don't render until catalog is loaded
    if (!catalog) return null;

    return (
        <Box sx={{
            p: 2.5,
            borderRadius: 3,
            bgcolor: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
        }}>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box>
                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, fontSize: "0.7rem", mb: 0.3 }}>
                        📦 Allowed Blocks
                    </Typography>
                    <Typography sx={{ fontSize: "0.7rem", color: COLORS.textMuted }}>
                        Select which blocks the AI can use for this integration
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    <GradientButton
                        startIcon={loading
                            ? <CircularProgress size={14} sx={{ color: "inherit" }} />
                            : <AIIcon sx={{ fontSize: 14 }} />
                        }
                        onClick={handleAutoSelect}
                        disabled={loading}
                        sx={{ fontSize: "0.7rem", py: 0.5, px: 1.5, minWidth: 0 }}
                    >
                        {loading ? "Thinking..." : "AI Select"}
                    </GradientButton>
                    {!isAllSelected && (
                        <GhostButton
                            startIcon={<ResetIcon sx={{ fontSize: 14 }} />}
                            onClick={handleReset}
                            sx={{ fontSize: "0.7rem", py: 0.5 }}
                        >
                            Reset
                        </GhostButton>
                    )}
                </Box>
            </Box>

            {/* Category Groups — dynamically from backend */}
            {Object.entries(catalog).map(([catKey, blocks]) => (
                <Box key={catKey} sx={{ mb: 1.5 }}>
                    <Typography sx={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        color: accentAlpha(0.7),
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        mb: 0.5,
                    }}>
                        {CATEGORY_LABELS[catKey] || catKey}
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {blocks.map((block) => {
                            const isChecked = selected.has(block);
                            return (
                                <Chip
                                    key={block}
                                    label={block}
                                    size="small"
                                    onClick={() => toggleBlock(block)}
                                    sx={{
                                        bgcolor: isChecked ? accentAlpha(0.15) : "transparent",
                                        color: isChecked ? accentAlpha(0.9) : COLORS.textMuted,
                                        border: `1px solid ${isChecked ? accentAlpha(0.3) : COLORS.border}`,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: "0.65rem",
                                        fontWeight: isChecked ? 700 : 400,
                                        cursor: "pointer",
                                        transition: "all 0.2s ease",
                                        "&:hover": {
                                            bgcolor: accentAlpha(0.1),
                                            borderColor: accentAlpha(0.4),
                                        },
                                    }}
                                />
                            );
                        })}
                    </Box>
                </Box>
            ))}

            {/* Counter */}
            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, mt: 1, textAlign: "right" }}>
                {isAllSelected
                    ? `All ${allBlocks.length} blocks available`
                    : `${selected.size} of ${allBlocks.length} blocks selected`
                }
            </Typography>
        </Box>
    );
});
