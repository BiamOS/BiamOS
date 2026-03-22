// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Renderer + Layout Renderer
// ============================================================

import React from "react";
import { Box, Divider } from "@mui/material";
import { COLORS } from "../ui/SharedUI";
import type { BlockSpec, LayoutSpec } from "./types";

// ─── Block components ───────────────────────────────────────
import {
    TitleBlock, TextBlock, ImageBlock, DividerBlock, SpacerBlock,
    CalloutBlock, AccordionBlock,
} from "./ContentBlocks";
import {
    HeroBlock, KeyValueBlock, StatBarBlock, TableBlock,
    MetricRowBlock, RatingBlock, TimelineBlock,
} from "./DataBlocks";
import { ChipListBlock, ListBlock, GridBlock, RowBlock, setRenderBlock } from "./ListBlocks";
import {
    ImageGridBlock,
    ProgressRingBlock,
    BadgeRowBlock,
    QuoteBlock,
    CodeBlock,
    LinkListBlock,
    HeroImageBlock,
    MediaCardBlock,
    VideoBlock,
    IframeBlock,
} from "./media";
import { FeedBlock } from "./FeedBlock";
import { CalculatorBlock } from "./CalculatorBlock";
import {
    TextInputBlock,
    SelectBlock,
    CheckboxGroupBlock,
    ToggleBlock,
    SliderBlock,
    FormGroupBlock,
    setFormRenderBlock,
} from "./FormBlocks";

// ─── Block Dispatcher ──────────────────────────────────────

function resolveBlockComponent(type: string): React.ComponentType<any> | null {
    switch (type) {
        // Content
        case "title": return TitleBlock;
        case "text": return TextBlock;
        case "image": return ImageBlock;
        case "divider": return DividerBlock;
        case "spacer": return SpacerBlock;
        // Data
        case "hero": return HeroBlock;
        case "key_value": return KeyValueBlock;
        case "stat_bar": return StatBarBlock;
        case "table": return TableBlock;
        // Lists
        case "chip_list": return ChipListBlock;
        case "list": return ListBlock;
        case "grid": return GridBlock;
        case "row": return RowBlock;
        // Media / Rich
        case "image_grid": return ImageGridBlock;
        case "progress_ring": return ProgressRingBlock;
        case "badge_row": return BadgeRowBlock;
        case "quote": return QuoteBlock;
        case "code": return CodeBlock;
        case "link_list": return LinkListBlock;
        case "hero_image": return HeroImageBlock;
        case "media_card": return MediaCardBlock;
        case "video": return VideoBlock;
        // Web / Embed
        case "iframe": return IframeBlock;
        // Data (extended)
        case "metric_row": return MetricRowBlock;
        case "rating": return RatingBlock;
        case "timeline": return TimelineBlock;
        // Content (extended)
        case "callout": return CalloutBlock;
        case "accordion": return AccordionBlock;
        // Form
        case "text_input": return TextInputBlock;
        case "select": return SelectBlock;
        case "checkbox_group": return CheckboxGroupBlock;
        case "toggle": return ToggleBlock;
        case "slider": return SliderBlock;
        case "form_group": return FormGroupBlock;
        case "feed": return FeedBlock;
        // Interactive / System Blocks
        case "calculator": return CalculatorBlock;
        default: return null;
    }
}

/**
 * SafeBlock — wraps each block render to catch crashes from bad LLM data.
 * Without this, a single block with null props crashes the entire layout.
 */
function SafeBlock({ block, Component }: { block: BlockSpec; Component: React.ComponentType<any> }) {
    try {
        // Pre-validate: if block expects array props, ensure they exist
        const safeProps: any = { ...block };
        if ("items" in safeProps && !Array.isArray(safeProps.items)) safeProps.items = [];
        if ("rows" in safeProps && !Array.isArray(safeProps.rows)) safeProps.rows = [];
        if ("chips" in safeProps && !Array.isArray(safeProps.chips)) safeProps.chips = [];
        if ("links" in safeProps && !Array.isArray(safeProps.links)) safeProps.links = [];
        if ("images" in safeProps && !Array.isArray(safeProps.images)) safeProps.images = [];
        if ("badges" in safeProps && !Array.isArray(safeProps.badges)) safeProps.badges = [];
        if ("metrics" in safeProps && !Array.isArray(safeProps.metrics)) safeProps.metrics = [];
        if ("steps" in safeProps && !Array.isArray(safeProps.steps)) safeProps.steps = [];
        if ("fields" in safeProps && !Array.isArray(safeProps.fields)) safeProps.fields = [];
        if ("columns" in safeProps && !Array.isArray(safeProps.columns)) safeProps.columns = [];
        return <Component {...safeProps} />;
    } catch (e) {
        console.error(`[BlockLibrary] Render crash in ${block.type}:`, e);
        return null;
    }
}

export const RenderBlock = React.memo(function RenderBlock({ block }: { block: BlockSpec }) {
    const Component = resolveBlockComponent(block.type);
    if (!Component) {
        console.warn(`[BlockLibrary] Unknown block type: ${block.type}`);
        return null;
    }
    return <SafeBlock block={block} Component={Component} />;
});

// Register RenderBlock for recursive sub-blocks (GridBlock + FormGroupBlock)
setRenderBlock(RenderBlock);
setFormRenderBlock(RenderBlock);

// ─── Layout Renderer ────────────────────────────────────────

/**
 * LayoutRenderer — stacks blocks vertically.
 * Title blocks get sticky positioning.
 * Dividers become subtle separators between sections.
 * When `stagger` is true, blocks animate in one-by-one.
 */
export const LayoutRenderer = React.memo(function LayoutRenderer({
    layout,
    stagger = false,
    width,
    onRequestResize,
}: {
    layout: LayoutSpec;
    stagger?: boolean;
    width?: number;
    onRequestResize?: (w: number, h: number) => void;
}) {
    // Find the index of the last block that should expand to fill remaining space
    const nonExpandable = new Set(["title", "divider", "spacer"]);
    let lastExpandIdx = -1;
    for (let i = layout.blocks.length - 1; i >= 0; i--) {
        if (!nonExpandable.has(layout.blocks[i].type)) {
            lastExpandIdx = i;
            break;
        }
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%", flex: 1, overflowX: "hidden", overflowY: "auto", minHeight: 0 }}>
            {layout.blocks.map((block, i) => {
                // Pass width and onRequestResize down to the block spec
                const enrichedBlock = { ...block, width, onRequestResize };

                // Stagger animation wrapper — each block fades in sequentially
                const staggerSx = stagger ? {
                    animation: "blockReveal 0.4s ease-out both",
                    animationDelay: `${Math.min(i, 10) * 0.08}s`,
                } : undefined;

                // Last expandable block gets flex:1 to fill remaining card space
                const expandSx = i === lastExpandIdx ? { flex: 1, minHeight: 0 } : undefined;

                // Sticky title headers
                if (block.type === "title") {
                    return (
                        <Box
                            key={i}
                            sx={{
                                py: 0.3,
                                mx: -1.5,
                                px: 1.5,
                                ...staggerSx,
                            }}
                        >
                            <RenderBlock block={enrichedBlock} />
                        </Box>
                    );
                }

                // Dividers — thin separator
                if (block.type === "divider") {
                    return (
                        <Divider
                            key={i}
                            sx={{
                                borderColor: COLORS.borderFaint,
                                my: 0.5,
                                ...(stagger ? {
                                    animation: "blockReveal 0.4s ease-out both",
                                    animationDelay: `${Math.min(i, 10) * 0.08}s`,
                                } : undefined),
                            }}
                        />
                    );
                }

                // Iframe blocks — fill remaining space
                if (block.type === "iframe") {
                    return (
                        <Box key={i} sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...staggerSx }}>
                            <RenderBlock block={enrichedBlock} />
                        </Box>
                    );
                }

                // All other blocks — normal flow, last one expands
                return (
                    <Box key={i} sx={{ ...staggerSx, ...expandSx }}>
                        <RenderBlock block={enrichedBlock} />
                    </Box>
                );
            })}
        </Box>
    );
});
