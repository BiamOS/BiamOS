// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 5: Layout Architect
// ============================================================
// Generates JSON block layouts from API data using
// intent-specific templates (article, image, search, data,
// action, video). Each template constrains allowed blocks
// and sets max block count — anti-hallucination by design.
// ============================================================

import { runAgentJSON } from "../agent-runner.js";
import type { IntentType } from "./2-classifier.js";
import type { Integration } from "../../db/schema.js";
import { getTemplate, SHARED_LAYOUT_RULES } from "../templates/index.js";
import { buildBlockCatalogPrompt } from "../../prompts/block-catalog.js";
import { analyzeDataShape } from "../../services/data-shape-analyzer.js";

// ─── Types ──────────────────────────────────────────────────

export interface LayoutResult {
    blocks: any[];
    size_hint?: "compact" | "medium" | "large" | "full";
}

// ─── Valid Block Types ──────────────────────────────────────

const VALID_BLOCK_TYPES = new Set([
    "title", "text", "image", "divider", "spacer", "callout", "accordion",
    "hero", "key_value", "stat_bar", "table", "metric_row", "rating", "timeline",
    "chip_list", "list", "grid",
    "image_grid", "progress_ring", "badge_row", "quote", "code", "link_list",
    "hero_image", "media_card", "video", "feed",
    "text_input", "select", "checkbox_group", "toggle", "slider", "form_group",
]);

// ─── Main Function ──────────────────────────────────────────

/**
 * Generate a JSON block layout from API data.
 * Uses intent-specific templates to constrain the LLM output.
 */
export async function generateLayout(
    intentType: IntentType,
    entity: string,
    apiData: any,
    integration: Integration,
    language?: string
): Promise<LayoutResult> {
    const template = getTemplate(intentType);

    // Parse allowed_blocks from integration (JSON string or null)
    let allowedBlocks: string[] | null = null;
    if (integration.allowed_blocks) {
        try {
            const parsed = typeof integration.allowed_blocks === "string"
                ? JSON.parse(integration.allowed_blocks)
                : integration.allowed_blocks;
            if (Array.isArray(parsed) && parsed.length > 0) {
                allowedBlocks = parsed;
            }
        } catch { /* fallback to all blocks */ }
    }

    const blockCatalog = buildBlockCatalogPrompt(allowedBlocks);

    // ─── Smart Data Analysis ────────────────────────────────
    const shapeHints = analyzeDataShape(apiData);

    // Dynamic template adjustments based on actual data shape
    let forbidden = [...template.forbidden];
    const templateMax = template.maxBlocks;
    let maxBlocks = templateMax;

    if (shapeHints.shape.images.length > 0) {
        // Data has images → allow image blocks
        forbidden = forbidden.filter((b) => !["hero_image", "image_grid"].includes(b));
        maxBlocks = Math.max(maxBlocks, templateMax + 1);
    }
    if (Object.keys(shapeHints.shape.stats).length >= 2) {
        // Data has stats → allow stat blocks
        forbidden = forbidden.filter((b) => !["stat_bar", "metric_row", "progress_ring"].includes(b));
        maxBlocks = Math.max(maxBlocks, templateMax + 1);
    }
    if (shapeHints.shape.tags.length > 0 || Object.keys(shapeHints.shape.lists).length > 0) {
        // Data has tags/lists → allow chip/list blocks
        forbidden = forbidden.filter((b) => !["chip_list", "badge_row"].includes(b));
        maxBlocks = Math.max(maxBlocks, templateMax + 1);
    }
    if (Object.keys(shapeHints.shape.keyValues).length >= 2) {
        // Data has key-value facts → allow key_value block
        forbidden = forbidden.filter((b) => b !== "key_value");
    }

    // Cap at reasonable max
    maxBlocks = Math.min(maxBlocks, 8);

    // Use compact analyzed data when available, fall back to raw JSON
    let dataSection: string;
    if (shapeHints.compactData.length > 50) {
        // Analyzer found structured data — use it
        dataSection = shapeHints.compactData;

        // Also include a small raw JSON preview for context
        const rawPreview = JSON.stringify(apiData, null, 2);
        if (rawPreview.length < 3000) {
            dataSection += `\n\nRAW JSON (reference):\n${rawPreview}`;
        }
    } else {
        // Analyzer found nothing useful — fall back to raw JSON
        const dataStr = JSON.stringify(apiData, null, 2);
        const maxChars = intentType === "ARTICLE" ? 20000 : 10000;
        dataSection = dataStr.length > maxChars
            ? dataStr.substring(0, maxChars) + "\n... (truncated)"
            : dataStr;
    }

    // Build the user message with template rules
    const userMessage = `INTENT TYPE: ${intentType}
ENTITY: "${entity}"
INTEGRATION: ${integration.name}

═══════════════════════════════════════════
SHARED RULES (FOLLOW ALWAYS)
═══════════════════════════════════════════
${SHARED_LAYOUT_RULES}

═══════════════════════════════════════════
INTENT-SPECIFIC RULES
═══════════════════════════════════════════
${template.rules}

MAX BLOCKS: ${maxBlocks}
FORBIDDEN BLOCKS: ${forbidden.join(", ")}

═══════════════════════════════════════════
BLOCK TYPE SUGGESTIONS (based on data analysis)
═══════════════════════════════════════════
${shapeHints.suggestedBlocks}

═══════════════════════════════════════════
AVAILABLE BLOCK TYPES
═══════════════════════════════════════════
${blockCatalog}

═══════════════════════════════════════════
API DATA (analyzed & structured)
═══════════════════════════════════════════
${dataSection}

${language && language !== "English" ? `═══════════════════════════════════════════
⚠️ OUTPUT LANGUAGE: ${language} (MANDATORY)
═══════════════════════════════════════════
The API data is in English, but you MUST translate text content to ${language}.
RULES:
1. Translate titles, descriptions, body text, callout text, labels.
2. NEVER modify URLs — copy them EXACTLY from the API data.
3. Keep proper nouns (names, brands, usernames, subreddits) unchanged.
4. CRITICAL: For feed/list blocks, each item's title+body+url MUST come from the SAME API entry.
   Do NOT mix title from item #1 with url from item #3. Maintain 1:1 mapping.

` : ""}Generate the JSON layout now. Output ONLY {"blocks":[...], "size_hint":"..."}
CRITICAL RULES:
- size_hint MUST be one of: "compact" (short answer, few blocks), "medium" (normal article/data), "large" (long article, table+data), "full" (dashboard, video, complex layout)
- Use REAL values from the API data — do NOT invent content.${language && language !== "English" ? ` Translate text to ${language}.` : ""}
- For feed/list blocks: map each API data item to exactly one feed entry. Keep title+body+url+author as a unit from the SAME source item.
- URLs must be copied VERBATIM from the API data. Never modify, translate, or fabricate URLs.
- Each feed entry must be UNIQUE — never repeat the same item.`;

    try {
        const result = await runAgentJSON<LayoutResult>("layout-architect", userMessage);

        if (result.skipped) {
            // Layout architect disabled — return raw data fallback
            return fallbackLayout(integration.name, apiData);
        }

        // Validate blocks
        const layout = validateLayout(result.output, forbidden);
        if (!layout) {
            return fallbackLayout(integration.name, apiData);
        }

        // Extract size_hint from LLM output
        const validHints = ["compact", "medium", "large", "full"] as const;
        const rawHint = result.output.size_hint;
        layout.size_hint = validHints.includes(rawHint) ? rawHint : "medium";

        // Hydrate feed blocks with real API data (prevents LLM hallucination)
        hydrateFeedBlocks(layout, apiData);

        // Enforce max blocks
        if (layout.blocks.length > maxBlocks) {
            layout.blocks = layout.blocks.slice(0, maxBlocks);
        }


        return layout;
    } catch {
        return fallbackLayout(integration.name, apiData);
    }
}


// ─── Validation ─────────────────────────────────────────────

function validateLayout(raw: any, forbidden: string[]): LayoutResult | null {
    if (!raw || !Array.isArray(raw.blocks)) return null;

    const forbiddenSet = new Set(forbidden);
    const validBlocks = raw.blocks.filter((b: any) => {
        if (!b || !b.type) return false;
        if (!VALID_BLOCK_TYPES.has(b.type)) {
            return false;
        }
        if (forbiddenSet.has(b.type)) {
            return false;
        }
        return true;
    });

    if (validBlocks.length === 0) return null;

    // Sanitize links and URLs in all blocks
    const sanitized = sanitizeLinks(validBlocks);
    if (sanitized.length === 0) return null;

    // Deduplicate feed items (LLM sometimes repeats the same entry)
    for (const block of sanitized) {
        if (block.type === "feed" && Array.isArray(block.items)) {
            const seen = new Set<string>();
            block.items = block.items.filter((item: any) => {
                const key = item.title || item.url || JSON.stringify(item);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
    }

    return { blocks: sanitized };
}

// ─── Link Sanitization ─────────────────────────────────────

/**
 * Check if a URL is likely hallucinated by the LLM.
 */
function isFakeUrl(url: string): boolean {
    if (!url || typeof url !== "string") return true;
    if (!url.startsWith("http")) return true;
    if (url.includes("localhost")) return true;
    if (url.includes("N/A") || url.includes("n/a")) return true;
    if (url.includes("example.com") || url.includes("example.org")) return true;
    if (url.includes("test.com") || url.includes("dummy.com")) return true;
    if (url.includes("placeholder") || url.includes("your-")) return true;
    if (url.includes("{}") || /\{\w+\}/.test(url)) return true; // template placeholders
    if (url.includes("undefined") || url.includes("null")) return true;
    if (url.startsWith("data:")) return true;
    // API endpoint URLs — return raw JSON, not human-readable pages
    if (/\/api\/v?\d/i.test(url)) return true;
    if (/\/api\//.test(url) && /\.json/i.test(url)) return true;
    return false;
}

/**
 * Remove hallucinated URLs from layout blocks.
 * - link_list: filter out entries with fake URLs
 * - text/callout: strip fake inline markdown links
 * - image/hero_image: remove blocks with fake image URLs
 */
function sanitizeLinks(blocks: any[]): any[] {
    return blocks.map(b => {
        // link_list: filter entries with bad URLs
        if (b.type === "link_list" && Array.isArray(b.links)) {
            b.links = b.links.filter((link: any) => !isFakeUrl(link?.url));
            if (b.links.length === 0) return null;
        }

        // text/callout: strip fake markdown links [text](badUrl) → text
        for (const field of ["content", "text"]) {
            if (b[field] && typeof b[field] === "string") {
                b[field] = b[field].replace(
                    /\[([^\]]+)\]\((https?:\/\/(?:localhost|[^)]*(?:N\/A|example\.com|undefined|null))[^)]*)\)/g,
                    "$1"
                );
            }
        }

        return b;
    }).filter(Boolean);
}

// ─── Fallback Layout ────────────────────────────────────────

function fallbackLayout(integrationName: string, apiData: any): LayoutResult {
    return {
        blocks: [
            { type: "title", text: integrationName.replace(/Widget$/, "").replace(/([A-Z])/g, " $1").trim() },
            { type: "callout", title: "Layout Failed", text: "Could not generate layout — showing raw data", variant: "warning" },
            { type: "code", label: "Raw Data", content: JSON.stringify(apiData, null, 2).substring(0, 2000), language: "json" },
        ],
    };
}

// ─── Feed Hydration (prevents LLM data cross-contamination) ─

/**
 * Extract an array of items from any API response shape.
 * Handles: Reddit (data.children), generic wrappers, top-level arrays.
 */
function extractItemsArray(apiData: any): any[] | null {
    if (!apiData || typeof apiData !== "object") return null;

    // Reddit: data.children[].data
    if (apiData.data?.children && Array.isArray(apiData.data.children)) {
        return apiData.data.children.map((c: any) =>
            c.data && typeof c.data === "object" ? c.data : c
        );
    }

    // Direct array
    if (Array.isArray(apiData)) return apiData;

    // Common wrapper keys
    const ARRAY_KEYS = ["items", "results", "entries", "posts", "data", "hits", "list", "feed", "children"];

    // Check root level
    for (const key of ARRAY_KEYS) {
        if (Array.isArray(apiData[key]) && apiData[key].length > 0) {
            return apiData[key].map((item: any) =>
                item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : item
            );
        }
    }

    // Check one level deep
    if (apiData.data && typeof apiData.data === "object" && !Array.isArray(apiData.data)) {
        for (const key of ARRAY_KEYS) {
            if (Array.isArray(apiData.data[key]) && apiData.data[key].length > 0) {
                return apiData.data[key];
            }
        }
    }

    return null;
}

/**
 * Map a generic API item to a FeedItemSpec-compatible object.
 * Uses priority-based field name detection for maximum compatibility.
 * 
 * 100% GENERIC — no API-specific logic. Works for GitHub, Reddit,
 * Gmail, Slack, Jira, HackerNews, any REST API.
 */
function mapToFeedItem(item: any): any {
    if (!item || typeof item !== "object") return null;

    // Unwrap Reddit's { data: { ... } } pattern
    const src = item.data && typeof item.data === "object" && item.data.title ? item.data : item;

    // ─── Title (first match wins) ────────────────────────
    const title = src.title || src.full_name || src.name || src.headline
        || src.subject || src.label || src.login || "";
    if (!title) return null;

    // ─── Body/Description ────────────────────────────────
    const body = src.selftext || src.body || src.description || src.summary
        || src.snippet || src.text || src.content || src.bio || src.excerpt || "";

    // ─── URL — CRITICAL: prefer human-readable URLs ──────
    // html_url/web_url = browser link, url = often raw API endpoint
    let url = src.html_url || src.web_url || src.webpage_url
        || src.external_url || src.link || src.href
        || src.canonical_url || "";
    // Fallback to src.url ONLY if it's NOT an api.* domain
    if (!url && src.url && typeof src.url === "string") {
        url = /api\.|\/api\/|\.json$/i.test(src.url) ? "" : src.url;
    }
    // Reddit permalink → full URL
    if (!url && src.permalink) {
        url = src.permalink.startsWith("http") ? src.permalink : `https://www.reddit.com${src.permalink}`;
    }

    // ─── Author ──────────────────────────────────────────
    const author = src.author
        || src.owner?.login || src.owner?.name || src.owner?.username
        || src.user?.name || src.user?.username || src.user?.login
        || src.username || src.creator || src.by || "";

    // ─── Avatar (profile image) ──────────────────────────
    const avatar = src.owner?.avatar_url || src.user?.avatar_url
        || src.user?.profile_image_url || src.author_avatar
        || src.avatar_url || src.avatar || src.profile_image || "";

    // ─── Timestamp ───────────────────────────────────────
    const timestamp = src.created_utc
        ? new Date(src.created_utc * 1000).toLocaleDateString()
        : src.created_at || src.timestamp || src.date
        || src.published || src.published_at || src.updated_at || "";

    // ─── Stats — generic *_count + known aliases ─────────
    // First: known patterns
    let likes = src.score ?? src.ups ?? src.upvotes ?? src.likes
        ?? src.points ?? src.stargazers_count ?? src.stars ?? undefined;
    let comments = src.num_comments ?? src.comments ?? src.comment_count
        ?? src.forks_count ?? src.forks ?? src.replies ?? undefined;
    const shares = src.shares ?? src.retweets ?? src.watchers_count ?? undefined;

    // Second: auto-detect any *_count fields we missed
    if (likes === undefined || comments === undefined) {
        for (const [key, val] of Object.entries(src)) {
            if (typeof val !== "number" || val < 0) continue;
            if (/_count$/i.test(key) && !["id", "node_id"].includes(key)) {
                if (likes === undefined) { likes = val; continue; }
                if (comments === undefined) { comments = val; continue; }
                break;
            }
        }
    }

    const stats = (likes !== undefined || comments !== undefined)
        ? { likes, comments, shares }
        : undefined;

    // ─── Badge (language, category, type) ─────────────────
    const badge = src.language || src.category || src.tag
        || src.label_name || src.topic || "";

    // ─── Image (thumbnail or preview) ────────────────────
    let image = "";
    if (src.thumbnail && typeof src.thumbnail === "string" && src.thumbnail.startsWith("http")) {
        image = src.thumbnail;
    } else if (src.preview?.images?.[0]?.source?.url) {
        image = src.preview.images[0].source.url.replace(/&amp;/g, "&");
    } else if (src.image && typeof src.image === "string" && src.image.startsWith("http")) {
        image = src.image;
    } else if (src.cover_image && typeof src.cover_image === "string") {
        image = src.cover_image;
    }

    return {
        title: title.length > 200 ? title.substring(0, 200) + "..." : title,
        body: body ? (body.length > 300 ? body.substring(0, 300) + "..." : body) : undefined,
        url: url || undefined,
        author: author || undefined,
        avatar: avatar || undefined,
        timestamp: timestamp ? String(timestamp) : undefined,
        stats,
        badge: badge || undefined,
        image: image || undefined,
    };
}

/**
 * Replace LLM-generated feed items with real API data.
 * The LLM decides WHICH block types to use (title, feed, etc.),
 * but the feed items' actual content comes directly from the API.
 */
function hydrateFeedBlocks(layout: LayoutResult, apiData: any): void {
    const feedBlocks = layout.blocks.filter((b: any) => b.type === "feed");
    if (feedBlocks.length === 0) return;

    const rawItems = extractItemsArray(apiData);
    if (!rawItems || rawItems.length === 0) {
        return;
    }

    const feedItems = rawItems
        .slice(0, 10)
        .map(mapToFeedItem)
        .filter(Boolean);

    if (feedItems.length === 0) {
        return;
    }

    for (const block of feedBlocks) {
        // Keep LLM's label but replace items
        const label = block.label;
        block.items = feedItems;
        if (label) block.label = label;
    }


}
