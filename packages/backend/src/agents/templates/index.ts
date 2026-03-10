// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Intent Templates Index
// ============================================================
// Maps intent types to their layout template rules.
// Each template constrains: max blocks, forbidden types, rules.
// Shared rules (data fidelity, size hints) are injected ONCE
// by the Layout Architect, NOT repeated per template.
// ============================================================

import type { IntentType } from "../intent/2-classifier.js";

// ─── Types ──────────────────────────────────────────────────

export interface LayoutTemplate {
    maxBlocks: number;
    forbidden: string[];
    rules: string;
}

// ─── Shared Rules (injected ONCE by Layout Architect) ───────

export const SHARED_LAYOUT_RULES = `CRITICAL RULES:
- Output ONLY valid JSON: {"blocks":[...], "size_hint":"..."}
- Use REAL values from API data — NEVER invent URLs, images, or text
- URLs must be copied VERBATIM. Never use raw API endpoint URLs (/api/, /v1/) as links
- Do NOT truncate text content. Include ALL information from API data
- Each list/feed item MUST use DIFFERENT data. Never duplicate items
- size_hint: "compact" (1-2 blocks), "medium" (3-4), "large" (5+), "full" (dashboard/video)
- Be CREATIVE with block selection — use diverse blocks (key_value, chip_list, timeline, stat_bar, etc.)
- Do NOT just use title + text. Build rich, visually engaging cards`;

// ─── Templates (intent-specific rules ONLY) ─────────────────

const TEMPLATES: Record<IntentType, LayoutTemplate> = {
    ARTICLE: {
        maxBlocks: 6,
        forbidden: ["form_group"],
        rules: "ARTICLE intent — write detailed content. Use accordion for long sections, key_value for facts.",
    },

    IMAGE: {
        maxBlocks: 4,
        forbidden: ["form_group", "table", "code"],
        rules: "IMAGE intent — primary content should be visual. Lead with hero_image.",
    },

    IMAGES: {
        maxBlocks: 5,
        forbidden: ["form_group", "table", "code"],
        rules: "IMAGES intent — show multiple images. Use image_grid or media_card inside grid.",
    },

    SEARCH: {
        maxBlocks: 7,
        forbidden: ["form_group"],
        rules: "SEARCH intent — present results as browsable list or feed. Use list with url field or feed block.",
    },

    DATA: {
        maxBlocks: 6,
        forbidden: ["form_group"],
        rules: "DATA intent — dashboard style. Lead with hero for main metric, use metric_row for secondary.",
    },

    VIDEO: {
        maxBlocks: 4,
        forbidden: ["form_group"],
        rules: "VIDEO intent — lead with video block at full width. Keep metadata minimal.",
    },

    ACTION: {
        maxBlocks: 5,
        forbidden: ["video", "image_grid"],
        rules: `ACTION intent — build interactive form.
- Include form_group with appropriate input fields
- Set required: true for required params, pre-fill when applicable
- Include submitLabel`,
    },

    NAVIGATE: {
        maxBlocks: 3,
        forbidden: ["form_group", "table", "image_grid"],
        rules: "NAVIGATE intent — simple navigation target. Use size_hint: compact.",
    },

    TOOL: {
        maxBlocks: 3,
        forbidden: ["image", "image_grid", "video", "link_list", "accordion", "timeline", "stat_bar", "metric_row"],
        rules: `TOOL intent:
1. title block with emoji (e.g. "🧮 Calculator")
2. form_group with apiEndpoint, httpMethod, resultBlockId pointing to result block
3. hero block with value "—", label "Enter an expression", blockId "result"
form_group MUST include apiEndpoint and resultBlockId. size_hint: compact.`,
    },
};

// ─── Getter ─────────────────────────────────────────────────

export function getTemplate(intentType: IntentType): LayoutTemplate {
    return TEMPLATES[intentType] || TEMPLATES.ARTICLE;
}
