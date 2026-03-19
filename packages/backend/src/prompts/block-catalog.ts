// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Catalog (Single Source of Truth)
// ============================================================
// Every UI block type is defined here with:
//   - type:     The block identifier (matches frontend BlockRenderer)
//   - category: Logical grouping (content, data, list, media)
//   - when:     Semantic description — tells the AI WHEN to use it
//   - schema:   Minimal JSON example for the AI
//
// The layout prompt reads from this catalog automatically.
// To add a new block: add it here + in frontend types + renderer.
// ============================================================

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface BlockCatalogEntry {
    type: string;
    category: "content" | "data" | "list" | "media" | "form";
    when: string;
    schema: Record<string, unknown>;
    notes?: string;
    /** Which intent types this block is most relevant for (used for dynamic filtering) */
    intentRelevance?: string[];
}

export const BLOCK_CATALOG: BlockCatalogEntry[] = [
    // ═══════════════ CONTENT (7) ═══════════════

    {
        type: "title",
        category: "content",
        when: "Heading. Use FIRST for section titles",
        schema: { type: "title", text: "...", subtitle: "...", align: "center", size: "h5" },
        intentRelevance: ["ARTICLE", "IMAGE", "IMAGES", "SEARCH", "DATA", "VIDEO", "ACTION", "NAVIGATE", "TOOL"],
    },
    {
        type: "text",
        category: "content",
        when: "Body paragraph. For ARTICLE: write 200+ words of detailed content",
        schema: { type: "text", content: "...", variant: "body2" },
        intentRelevance: ["ARTICLE", "SEARCH", "DATA", "ACTION"],
    },
    {
        type: "image",
        category: "content",
        when: "ONE small image — logos, icons, profiles. NOT for focal photos (use hero_image)",
        schema: { type: "image", src: "URL", alt: "...", caption: "...", rounded: false },
        intentRelevance: ["IMAGE", "ARTICLE", "DATA"],
    },
    {
        type: "divider",
        category: "content",
        when: "Separator ONLY between distinct sections",
        schema: { type: "divider" },
        intentRelevance: ["ARTICLE", "SEARCH", "DATA"],
    },
    {
        type: "spacer",
        category: "content",
        when: "Vertical whitespace between sections",
        schema: { type: "spacer", size: 2 },
        intentRelevance: ["ARTICLE", "IMAGE", "IMAGES", "SEARCH", "DATA", "VIDEO", "ACTION", "NAVIGATE", "TOOL"],
    },
    {
        type: "callout",
        category: "content",
        when: "Info box — tips, warnings, fun facts",
        schema: { type: "callout", variant: "info", title: "Did you know?", text: "..." },
        notes: "Variants: info, success, warning, tip",
        intentRelevance: ["ARTICLE", "DATA", "SEARCH", "ACTION"],
    },
    {
        type: "accordion",
        category: "content",
        when: "Collapsible sections — FAQs, long content",
        schema: { type: "accordion", label: "Details", sections: [{ title: "Section 1", content: "..." }] },
        intentRelevance: ["ARTICLE", "SEARCH"],
    },

    // ═══════════════ DATA (7) ═══════════════

    {
        type: "hero",
        category: "data",
        when: "ONE large number — temperature, score, price. CENTERPIECE metric",
        schema: { type: "hero", value: "25.3", unit: "°C", label: "Temperature" },
        intentRelevance: ["DATA", "TOOL"],
    },
    {
        type: "key_value",
        category: "data",
        when: "Key-value pairs — specs, properties, details",
        schema: { type: "key_value", label: "Details", columns: 2, pairs: [{ key: "Height", value: "0.7 m" }] },
        intentRelevance: ["ARTICLE", "DATA", "SEARCH"],
    },
    {
        type: "stat_bar",
        category: "data",
        when: "Progress bars — stats, scores, skill levels",
        schema: { type: "stat_bar", label: "Stats", items: [{ label: "HP", value: 45, max: 255 }] },
        intentRelevance: ["DATA", "ARTICLE"],
    },
    {
        type: "table",
        category: "data",
        when: "Table — comparisons, structured columnar data",
        schema: { type: "table", label: "Overview", headers: ["Name", "Value"], rows: [["HP", "45"]] },
        intentRelevance: ["DATA", "SEARCH", "ARTICLE"],
    },
    {
        type: "metric_row",
        category: "data",
        when: "3-4 metric cards side-by-side — dashboard summary. Perfect below hero",
        schema: { type: "metric_row", metrics: [{ label: "Pop.", value: "1.9M", icon: "👥" }] },
        intentRelevance: ["DATA"],
    },
    {
        type: "rating",
        category: "data",
        when: "Star rating — reviews, quality scores",
        schema: { type: "rating", value: 4.5, max: 5, label: "User Rating", count: "12,345" },
        intentRelevance: ["DATA", "ARTICLE", "SEARCH"],
    },
    {
        type: "timeline",
        category: "data",
        when: "Vertical timeline — history, events, chronological steps",
        schema: { type: "timeline", label: "History", events: [{ time: "2024", title: "Founded", description: "..." }] },
        intentRelevance: ["ARTICLE", "DATA"],
    },

    // ═══════════════ LIST (3) ═══════════════

    {
        type: "chip_list",
        category: "list",
        when: "Tag pills — categories, labels, metadata",
        schema: { type: "chip_list", items: ["Tag1", "Tag2"], label: "Category", color: "primary" },
        notes: "Colors: primary, secondary, success, error, warning, info",
        intentRelevance: ["ARTICLE", "DATA", "SEARCH", "IMAGE", "IMAGES"],
    },
    {
        type: "list",
        category: "list",
        when: "List items — abilities, features, results. Add 'url' for clickable links",
        schema: { type: "list", label: "Abilities", items: [{ primary: "Name", secondary: "Description", badge: "Special", url: "https://..." }] },
        notes: "url optional → makes item clickable",
        intentRelevance: ["SEARCH", "ARTICLE", "DATA"],
    },
    {
        type: "grid",
        category: "list",
        when: "2-3 column layout. Use for card galleries (media_card inside grid)",
        schema: { type: "grid", columns: 2, blocks: ["(nested blocks)"] },
        intentRelevance: ["IMAGES", "SEARCH", "ARTICLE"],
    },
    {
        type: "row",
        category: "list",
        when: "Horizontal flex row — place 2-3 blocks SIDE-BY-SIDE. Use for newspaper layouts: callout+callout, badges+chips, stats next to insights. Each child gets equal width.",
        schema: { type: "row", gap: 2, blocks: ["(nested blocks — callout, badge_row, metric_row, etc.)"] },
        notes: "Children render flex: 1. Use for layout composition, NOT for galleries (use 'grid' for galleries).",
        intentRelevance: ["ARTICLE", "SEARCH", "DATA", "ACTION"],
    },

    // ═══════════════ MEDIA (9) ═══════════════

    {
        type: "image_grid",
        category: "media",
        when: "MULTIPLE images gallery — photo results, portfolio",
        schema: { type: "image_grid", label: "Gallery", columns: 3, images: [{ src: "URL", alt: "...", caption: "..." }] },
        intentRelevance: ["IMAGES", "IMAGE", "SEARCH"],
    },
    {
        type: "progress_ring",
        category: "media",
        when: "Circular progress — completion %, scores",
        schema: { type: "progress_ring", value: 75, max: 100, label: "Completion", unit: "%", color: "#00c8ff" },
        intentRelevance: ["DATA"],
    },
    {
        type: "badge_row",
        category: "media",
        when: "Icon badges in a row — quick stats with emoji",
        schema: { type: "badge_row", label: "Quick Stats", badges: [{ icon: "🏆", label: "Rank", value: "#3" }] },
        intentRelevance: ["DATA", "ARTICLE"],
    },
    {
        type: "quote",
        category: "media",
        when: "Elegant quote — famous quotes, testimonials",
        schema: { type: "quote", text: "To be or not to be", author: "Shakespeare" },
        intentRelevance: ["ARTICLE"],
    },
    {
        type: "code",
        category: "media",
        when: "Code window — programming examples, API responses",
        schema: { type: "code", label: "Example", content: "const x = 42;", language: "javascript" },
        intentRelevance: ["ARTICLE", "DATA"],
    },
    {
        type: "link_list",
        category: "list",
        when: "Link cards — external resources, docs. Use THIS instead of 'list' for URLs",
        schema: { type: "link_list", label: "Resources", links: [{ label: "Docs", url: "https://...", description: "Official docs" }] },
        intentRelevance: ["SEARCH", "ARTICLE"],
    },
    {
        type: "hero_image",
        category: "media",
        when: "FOCAL full-width image — main visual centerpiece for photos",
        schema: { type: "hero_image", src: "URL", title: "Title", subtitle: "...", height: 300, overlay: "bottom" },
        notes: "Overlay: bottom, center, top",
        intentRelevance: ["IMAGE", "IMAGES", "ARTICLE"],
    },
    {
        type: "media_card",
        category: "media",
        when: "Card with image + text — news, products. Use inside 'grid' for galleries",
        schema: { type: "media_card", src: "URL", title: "...", description: "...", badge: "Popular" },
        intentRelevance: ["SEARCH", "IMAGES", "ARTICLE"],
    },
    {
        type: "video",
        category: "media",
        when: "Video player — .mp4/.webm files or Pexels/Vimeo URLs. NEVER invent YouTube URLs",
        schema: { type: "video", src: "https://videos.pexels.com/.../.mp4", title: "...", aspectRatio: "16:9" },
        notes: "Use ACTUAL video URL from API data",
        intentRelevance: ["VIDEO"],
    },

    // ═══════════════ FORM (6) ═══════════════

    {
        type: "text_input",
        category: "form",
        when: "Text field — name, email, search, feedback",
        schema: { type: "text_input", label: "Name", placeholder: "Enter your name", inputType: "text", required: true },
        notes: "inputType: text, email, password, number, tel, url. multiline: true + rows: 4 for textarea",
        intentRelevance: ["ACTION", "TOOL"],
    },
    {
        type: "select",
        category: "form",
        when: "Dropdown — choosing from options",
        schema: { type: "select", label: "Country", placeholder: "Choose...", options: [{ value: "de", label: "Germany" }] },
        intentRelevance: ["ACTION", "TOOL"],
    },
    {
        type: "checkbox_group",
        category: "form",
        when: "Multiple selection — features, preferences",
        schema: { type: "checkbox_group", label: "Interests", columns: 2, items: [{ label: "Music", checked: true }] },
        intentRelevance: ["ACTION"],
    },
    {
        type: "toggle",
        category: "form",
        when: "On/off switch — settings, feature flags",
        schema: { type: "toggle", label: "Dark Mode", description: "Enable dark theme", defaultValue: true },
        intentRelevance: ["ACTION"],
    },
    {
        type: "slider",
        category: "form",
        when: "Range input — volume, price range, filters",
        schema: { type: "slider", label: "Volume", min: 0, max: 100, step: 5, defaultValue: 75, unit: "%" },
        intentRelevance: ["ACTION", "TOOL"],
    },
    {
        type: "form_group",
        category: "form",
        when: "Form container — wraps form fields with submit button. For contact forms, settings, surveys",
        schema: { type: "form_group", title: "Contact Us", description: "Fill out the form below", submitLabel: "Send", blocks: ["(nested form blocks)"] },
        notes: "blocks[] can contain: text_input, select, checkbox_group, toggle, slider, or any block",
        intentRelevance: ["ACTION", "TOOL"],
    },

    // ═══════════════ FEED (1) ═══════════════

    {
        type: "feed",
        category: "media",
        when: "Feed cards — social posts, news, Reddit-style. EVERY item MUST use DIFFERENT API data",
        schema: { type: "feed", label: "Feed", columns: 1, items: [{ image: "URL", title: "...", body: "...", author: "...", timestamp: "2h ago", stats: { likes: 42, comments: 5 }, url: "https://..." }] },
        notes: "columns: 1 (list) or 2 (grid). Include ALL items, NEVER repeat. Fields: image, title (required), body, author, avatar, timestamp, stats, url, badge",
        intentRelevance: ["SEARCH", "ARTICLE"],
    },
];

// ─── Helpers ────────────────────────────────────────────────

/** Generate the block catalog section for the AI prompt.
 *  Filters by: allowedBlocks (integration-level) AND intentType (dynamic per-query).
 *  Falls back to ALL blocks when no filters set.
 */
export function buildBlockCatalogPrompt(allowedBlocks?: string[] | null, intentType?: string): string {
    let entries = [...BLOCK_CATALOG] as BlockCatalogEntry[];

    // Dynamically load custom blocks from CustomBlocks.tsx
    try {
        const customPath = resolve(import.meta.dirname, "../../../frontend/src/components/blocks/CustomBlocks.tsx");
        if (existsSync(customPath)) {
            const src = readFileSync(customPath, "utf-8");
            const regex = /\/\/ @block type=(\S+) component=\S+ category=(\S+) description=(.+)/g;
            let m;
            while ((m = regex.exec(src)) !== null) {
                const [, type, category, description] = m;
                // Parse the interface to build a basic schema
                const ifaceRegex = new RegExp(`export interface \\w+\\{([^}]+)\\}`, "s");
                const ifaceMatch = src.match(ifaceRegex);
                const schema: Record<string, unknown> = { type };
                if (ifaceMatch) {
                    const props = ifaceMatch[1].match(/(\w+)\??\s*:/g);
                    if (props) {
                        for (const p of props) {
                            const name = p.replace(/\??:/, "").trim();
                            if (name !== "type") schema[name] = "...";
                        }
                    }
                }
                entries.push({
                    type,
                    category: category as BlockCatalogEntry["category"],
                    when: description.trim(),
                    schema,
                });
            }
        }
    } catch { /* silently skip if custom blocks can't be read */ }

    // Filter by integration-level allowed_blocks
    if (allowedBlocks && allowedBlocks.length > 0) {
        entries = entries.filter((e) => allowedBlocks.includes(e.type));
    }

    // Filter by intent relevance (Phase 9: dynamic per-query filtering)
    if (intentType) {
        entries = entries.filter((e) =>
            !e.intentRelevance || e.intentRelevance.includes(intentType)
        );
    }

    const categories: Record<string, BlockCatalogEntry[]> = {};
    for (const entry of entries) {
        if (!categories[entry.category]) categories[entry.category] = [];
        categories[entry.category].push(entry);
    }

    const categoryLabels: Record<string, string> = {
        content: "CONTENT BLOCKS",
        data: "DATA BLOCKS",
        list: "LIST BLOCKS",
        media: "MEDIA / RICH BLOCKS",
        form: "FORM / INPUT BLOCKS",
    };

    const sections: string[] = [];
    let index = 1;

    for (const cat of ["content", "data", "list", "media", "form"]) {
        const catEntries = categories[cat] || [];
        if (catEntries.length === 0) continue;
        const label = categoryLabels[cat] || cat.toUpperCase();
        const lines = [`═══════════════════════════════════════════`, `${label} (${catEntries.length})`, `═══════════════════════════════════════════`, ""];

        for (const entry of catEntries) {
            lines.push(`${index}. "${entry.type}" — ${entry.when}`);
            lines.push(`   ${JSON.stringify(entry.schema)}`);
            if (entry.notes) lines.push(`   ${entry.notes}`);
            lines.push("");
            index++;
        }

        sections.push(lines.join("\n"));
    }

    return sections.join("\n");
}

