// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Smart Data Shape Analyzer
// ============================================================
// Analyzes arbitrary API JSON data and categorizes fields by
// type (images, stats, tags, text, links) for the Layout
// Architect. 100% generic — no API-specific logic.
// ============================================================

// ─── Types ──────────────────────────────────────────────────

export interface DataShape {
    images: string[];        // Image URLs found in the data
    stats: Record<string, number>;  // Numeric key-value pairs
    tags: string[];          // Short string labels (types, categories)
    text: string[];          // Long text passages
    links: string[];         // Non-image URLs (may include API URLs)
    webLinks: string[];      // Human-readable URLs (html_url, web_url)
    keyValues: Record<string, string>; // Short key-value facts
    lists: Record<string, string[]>;   // Named lists of items
    itemCount: number;       // Number of items in main array (for feed detection)
}

export interface ShapeHints {
    shape: DataShape;
    summary: string;         // Human-readable summary for LLM
    suggestedBlocks: string; // Block type suggestions
    compactData: string;     // Compact data representation for LLM
}

// ─── Pattern Detection ──────────────────────────────────────

const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|ico|bmp|avif)(\?.*)?$/i;
const IMAGE_URL_PATTERNS = /https?:\/\/[^\s"',]+\.(jpg|jpeg|png|gif|svg|webp|avif)(\?[^\s"',]*)?/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov|avi)(\?.*)?$/i;
const URL_PATTERN = /^https?:\/\//;

function isImageUrl(value: string): boolean {
    if (typeof value !== "string") return false;
    return IMAGE_EXTENSIONS.test(value) || IMAGE_URL_PATTERNS.test(value);
}

function isVideoUrl(value: string): boolean {
    if (typeof value !== "string") return false;
    return VIDEO_EXTENSIONS.test(value);
}

function isUrl(value: string): boolean {
    if (typeof value !== "string") return false;
    return URL_PATTERN.test(value);
}

function isShortLabel(value: string): boolean {
    return typeof value === "string" && value.length > 0 && value.length <= 40 && !value.includes("\n");
}

function isLongText(value: string): boolean {
    return typeof value === "string" && value.length > 100;
}

// ─── Main Analyzer ──────────────────────────────────────────

/**
 * Analyze any JSON data and extract a categorized shape.
 * Walks the object tree recursively, detecting images, numbers,
 * tags, text, links, and key-value pairs.
 */
export function analyzeDataShape(data: any): ShapeHints {
    const shape: DataShape = {
        images: [],
        stats: {},
        tags: [],
        text: [],
        links: [],
        webLinks: [],
        keyValues: {},
        lists: {},
        itemCount: 0,
    };

    // Walk the data tree
    walkObject(data, "", shape, 0);

    // Deduplicate
    shape.images = [...new Set(shape.images)].slice(0, 10);
    shape.tags = [...new Set(shape.tags)].slice(0, 20);
    shape.text = shape.text.slice(0, 5);
    shape.links = [...new Set(shape.links)].slice(0, 10);
    shape.webLinks = [...new Set(shape.webLinks)].slice(0, 10);

    // Keep only top stats (max 12)
    const statEntries = Object.entries(shape.stats);
    if (statEntries.length > 12) {
        const top = statEntries.slice(0, 12);
        shape.stats = Object.fromEntries(top);
    }

    // Generate hints
    const summary = buildSummary(shape);
    const suggestedBlocks = buildBlockSuggestions(shape);
    const compactData = buildCompactData(shape);

    return { shape, summary, suggestedBlocks, compactData };
}

// ─── Recursive Walker ───────────────────────────────────────

function walkObject(obj: any, path: string, shape: DataShape, depth: number): void {
    if (depth > 8) return; // Prevent infinite recursion

    if (obj === null || obj === undefined) return;

    if (typeof obj === "string") {
        classifyString(obj, path, shape);
        return;
    }

    if (typeof obj === "number" && isFinite(obj)) {
        // Only capture "meaningful" stats (skip IDs, timestamps, etc.)
        const key = lastKey(path);
        if (key && !isIdOrTimestamp(key) && obj > 0 && obj < 100000) {
            shape.stats[humanizeKey(key)] = obj;
        }
        return;
    }

    if (Array.isArray(obj)) {
        // Check if it's an array of short strings → tags
        if (obj.length > 0 && obj.length <= 30 && obj.every((v) => isShortLabel(String(v)))) {
            const key = lastKey(path) || "items";
            // Check if the items are objects with a "name" field
            if (typeof obj[0] === "object" && obj[0] !== null) {
                const names = obj.map((item: any) => item.name || item.label || item.title).filter(Boolean);
                if (names.length > 0) {
                    shape.lists[humanizeKey(key)] = names.slice(0, 15);
                    return;
                }
            }
            shape.tags.push(...obj.filter((v) => typeof v === "string" && isShortLabel(v)));
            return;
        }

        // Check if array of objects with name fields → lists (and track for feed detection)
        if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
            const names = obj
                .map((item: any) => item.name || item.label || item.title)
                .filter((n: any) => typeof n === "string" && n.length > 0);
            if (names.length >= 2) {
                const key = lastKey(path) || "items";
                shape.lists[humanizeKey(key)] = names.slice(0, 15);
            }

            // Track item count for feed detection
            const hasTitle = obj[0].title || obj[0].name || obj[0].full_name;
            const hasDesc = obj[0].description || obj[0].body || obj[0].summary || obj[0].selftext;
            if (hasTitle && obj.length >= 2) {
                shape.itemCount = Math.max(shape.itemCount, obj.length);
            }

            // Still walk into array items for nested data
            for (let i = 0; i < Math.min(obj.length, 5); i++) {
                walkObject(obj[i], `${path}[${i}]`, shape, depth + 1);
            }
            return;
        }

        // Walk first few items
        for (let i = 0; i < Math.min(obj.length, 5); i++) {
            walkObject(obj[i], `${path}[${i}]`, shape, depth + 1);
        }
        return;
    }

    if (typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
            const newPath = path ? `${path}.${key}` : key;

            // Special handling for "sprites" or "images" objects → grab all image URLs
            if (/sprite|image|photo|poster|thumbnail|artwork|logo|avatar|icon/i.test(key)) {
                extractImages(value, shape);
                continue;
            }

            walkObject(value, newPath, shape, depth + 1);
        }
    }
}

// ─── String Classification ──────────────────────────────────

function classifyString(value: string, path: string, shape: DataShape): void {
    if (isImageUrl(value)) {
        shape.images.push(value);
    } else if (isVideoUrl(value)) {
        shape.links.push(value); // Videos go in links for now
    } else if (isUrl(value)) {
        const key = lastKey(path);
        // Distinguish human-readable URLs from API URLs
        if (key && /^(html_url|web_url|webpage_url|external_url|homepage)$/i.test(key)) {
            shape.webLinks.push(value);
        } else {
            shape.links.push(value);
        }
    } else if (isLongText(value)) {
        shape.text.push(value.substring(0, 500)); // Cap text length
    } else if (isShortLabel(value) && path) {
        const key = lastKey(path);
        if (key && !isIdOrTimestamp(key)) {
            shape.keyValues[humanizeKey(key)] = value;
        }
    }
}

// ─── Image Extraction ───────────────────────────────────────

function extractImages(obj: any, shape: DataShape): void {
    if (typeof obj === "string" && isImageUrl(obj)) {
        shape.images.push(obj);
        return;
    }
    if (typeof obj === "object" && obj !== null) {
        for (const value of Object.values(obj)) {
            if (typeof value === "string" && isImageUrl(value)) {
                shape.images.push(value);
            } else if (typeof value === "object" && value !== null) {
                extractImages(value, shape);
            }
        }
    }
}

// ─── Helpers ────────────────────────────────────────────────

function lastKey(path: string): string {
    const parts = path.replace(/\[\d+\]/g, "").split(".");
    return parts[parts.length - 1] || "";
}

function humanizeKey(key: string): string {
    return key
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function isIdOrTimestamp(key: string): boolean {
    const lower = key.toLowerCase();
    return /^(id|_id|uid|uuid|created|updated|modified|timestamp|date|order|index|slot|game_index)$/.test(lower);
}

// ─── Output Builders ────────────────────────────────────────

function buildSummary(shape: DataShape): string {
    const parts: string[] = [];
    if (shape.images.length > 0) parts.push(`📸 ${shape.images.length} image(s)`);
    if (Object.keys(shape.stats).length > 0) parts.push(`📊 ${Object.keys(shape.stats).length} stat(s)`);
    if (shape.tags.length > 0) parts.push(`🏷️ ${shape.tags.length} tag(s)`);
    if (shape.text.length > 0) parts.push(`📝 ${shape.text.length} text block(s)`);
    if (shape.webLinks.length > 0) parts.push(`🌐 ${shape.webLinks.length} web link(s)`);
    if (shape.links.length > 0) parts.push(`🔗 ${shape.links.length} link(s)`);
    if (Object.keys(shape.keyValues).length > 0) parts.push(`📋 ${Object.keys(shape.keyValues).length} fact(s)`);
    if (Object.keys(shape.lists).length > 0) parts.push(`📃 ${Object.keys(shape.lists).length} list(s)`);
    if (shape.itemCount > 0) parts.push(`📦 ${shape.itemCount} feed items`);
    return parts.join(" | ");
}

function buildBlockSuggestions(shape: DataShape): string {
    const suggests: string[] = [];

    // Feed detection: array of items with titles → strongly recommend feed
    if (shape.itemCount >= 2) {
        suggests.push("⭐ feed (STRONGLY RECOMMENDED — data contains multiple items with titles. Use feed block for rich item cards with author, stats, badges, and clickable URLs. Use html_url or web_url for links, NOT api URLs)");
    }

    if (shape.images.length > 0) suggests.push("hero_image (main image), image_grid (multiple images)");
    if (Object.keys(shape.stats).length >= 3) suggests.push("stat_bar (stats), metric_row (key metrics)");
    if (shape.tags.length > 0 || Object.keys(shape.lists).length > 0) suggests.push("chip_list (tags/types), list (items)");
    if (shape.text.length > 0) suggests.push("text (descriptions)");
    if (Object.keys(shape.keyValues).length >= 2) suggests.push("key_value (facts)");
    if (shape.webLinks.length > 0) suggests.push("link_list (web links — use html_url/web_url, NOT api URLs)");
    else if (shape.links.length > 0) suggests.push("link_list (related links)");
    return suggests.length > 0 ? suggests.join(", ") : "title, text";
}

function buildCompactData(shape: DataShape): string {
    const sections: string[] = [];

    // Images
    if (shape.images.length > 0) {
        sections.push(`IMAGES:\n${shape.images.slice(0, 5).map((url) => `  - ${url}`).join("\n")}`);
    }

    // Stats
    const statEntries = Object.entries(shape.stats);
    if (statEntries.length > 0) {
        sections.push(`STATS:\n${statEntries.map(([k, v]) => `  - ${k}: ${v}`).join("\n")}`);
    }

    // Tags
    if (shape.tags.length > 0) {
        sections.push(`TAGS: ${shape.tags.join(", ")}`);
    }

    // Lists
    for (const [name, items] of Object.entries(shape.lists)) {
        sections.push(`${name.toUpperCase()}: ${items.join(", ")}`);
    }

    // Key-value facts
    const kvEntries = Object.entries(shape.keyValues);
    if (kvEntries.length > 0) {
        sections.push(`FACTS:\n${kvEntries.slice(0, 10).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}`);
    }

    // Text
    if (shape.text.length > 0) {
        sections.push(`TEXT:\n${shape.text.map((t) => `  ${t}`).join("\n\n")}`);
    }

    // Links
    if (shape.webLinks.length > 0) {
        sections.push(`WEB LINKS (human-readable — use these for clickable links):\n${shape.webLinks.slice(0, 5).map((url) => `  - ${url}`).join("\n")}`);
    }
    if (shape.links.length > 0) {
        sections.push(`OTHER LINKS:\n${shape.links.slice(0, 5).map((url) => `  - ${url}`).join("\n")}`);
    }

    return sections.join("\n\n");
}
