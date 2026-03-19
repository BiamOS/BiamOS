// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — GenUI Prompt Builder
// ============================================================
// Builds the system prompt for the GenUI dashboard generator.
// Uses buildBlockCatalogPrompt() from block-catalog.ts so that
// available blocks are always in sync with the block system.
// ============================================================

import { z } from "zod/v4";
import { buildBlockCatalogPrompt, BLOCK_CATALOG } from "./block-catalog.js";

// ─── Zod Schema for LLM Block Output ───────────────────────
// Validates that the LLM returned well-formed block JSON.
// Each block must have a valid `type` from the catalog.

const validTypes = BLOCK_CATALOG.map((b) => b.type);

const BlockSchema = z.object({
    type: z.enum(validTypes as [string, ...string[]]),
}).passthrough(); // allow additional properties (each block type has its own shape)

export const GenUIResponseSchema = z.object({
    blocks: z.array(BlockSchema).min(1, "At least one block is required"),
});

export type GenUIResponse = z.infer<typeof GenUIResponseSchema>;

// ─── Error Fallback Block ───────────────────────────────────
// Shown when the LLM returns empty or invalid data.

export function buildErrorFallbackBlocks(reason: string): GenUIResponse {
    return {
        blocks: [
            {
                type: "callout",
                variant: "warning",
                title: "Dashboard Generation Failed",
                text: reason,
            },
        ],
    };
}

// ─── Prompt Builder ─────────────────────────────────────────

export function buildGenUIPrompt(data?: Record<string, unknown> | null): string {
    const catalog = buildBlockCatalogPrompt(null, "DATA");

    return `You are a content magazine architect for BiamOS.
You CREATE rich, insightful dashboards — NOT link aggregators. You SYNTHESIZE data into real content.

OUTPUT FORMAT:
Return a JSON object with a single key "blocks" containing an array of block objects.
Each block MUST have a "type" field matching one of the available block types below.
Output ONLY valid JSON. No markdown, no explanations, no code fences.

YOUR STYLE DEPENDS ON THE DATA:
- **News/Research data**: Write like a journalist — title, executive summary (text block), key insights (callouts in row), source cards (feed max 3-4), analysis (text block)
- **Email/Inbox data**: Write like an executive assistant — priority overview (badge_row), urgent items (callout warning), email list (feed), action items (callout tip)  
- **Product/Entity data**: Write like an analyst — hero metric, key specs (key_value in row), comparison (table), highlights (callout)

EXAMPLE OUTPUT:
{
  "blocks": [
    { "type": "title", "text": "🔥 Diablo 4: Season 12 & Expansion", "subtitle": "Key updates from 6 sources" },
    { "type": "text", "content": "Season 12 brings the biggest shake-up yet: Killstreaks, Bloodied Items, and a completely reworked gearing system. The community is buzzing about what Blizzard calls 'Diablo 4 3.0' — an upcoming expansion that promises to fundamentally change the endgame.", "variant": "body1" },
    { "type": "row", "gap": 2, "blocks": [
      { "type": "callout", "variant": "tip", "title": "🆕 Season 12 Highlights", "text": "• Killstreaks system\\n• Bloodied Items & Sigils\\n• Improved gearing\\n• New Uniques" },
      { "type": "callout", "variant": "info", "title": "🚀 Upcoming Expansion", "text": "Dubbed 'Diablo 4 3.0' — aims to overhaul the endgame with new zones, class changes, and progression system." }
    ]},
    { "type": "feed", "label": "Top Sources", "columns": 2, "items": [
      { "image": "...", "title": "Season 12 Overview", "body": "Release date, PTR details...", "author": "wowhead.com", "url": "..." },
      { "image": "...", "title": "Build Guides", "body": "Tier lists for new season...", "author": "maxroll.gg", "url": "..." }
    ]},
    { "type": "row", "gap": 2, "blocks": [
      { "type": "key_value", "label": "Quick Facts", "pairs": [
        { "key": "Season", "value": "12" },
        { "key": "New System", "value": "Killstreaks" },
        { "key": "Expansion", "value": "Coming 2026" }
      ]},
      { "type": "badge_row", "badges": [
        { "icon": "📰", "label": "Sources", "value": "6" },
        { "icon": "⭐", "label": "Hype", "value": "Very High" }
      ]}
    ]}
  ]
}

CONTENT RULES:
1. **WRITE REAL CONTENT**: Use "text" blocks to write actual summaries and analysis (50-150 words). Don't just show links.
2. **SYNTHESIZE, don't aggregate**: Combine information from multiple sources into coherent paragraphs.
3. All URLs MUST come from the provided data. NEVER invent URLs.
4. You CAN add emoji indicators, write your own text, and create original analysis from the data.
5. Maximum 12 blocks — quality over quantity.

LAYOUT RULES:
6. Start with "title" + "text" (executive summary).
7. Use "row" to place 2-3 blocks side-by-side: callout+callout, key_value+badge_row, etc.
8. Use "feed" for source cards (max 3-4 items, not ALL results — pick the best).
9. Use "callout" for key insights, tips, warnings — the meat of your analysis.
10. Use "key_value" for structured facts and specs.
11. Use "text" for written analysis paragraphs.
12. Full-width: title, text, feed, hero_image, table. Side-by-side in "row": callout, badge_row, chip_list, key_value, metric_row.
${data ? `\nDATA AVAILABLE:\n${JSON.stringify(data, null, 2).substring(0, 8000)}` : ""}

AVAILABLE BLOCK TYPES:
${catalog}`;
}
