// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — API Data Filter (Metadata-Driven)
// ============================================================
// Preprocesses raw API responses before sending to the LLM.
// 
// Priority:
// 1. Integration.response_mapping (metadata-driven, fully generic)
// 2. Integration.response_type (type-based filter selection)
// 3. Legacy: name/structure detection (backwards compatible)
//
// Goal: Reduce token usage by ~80% while preserving all
// information needed for visual layout decisions.
// ============================================================

import type { Integration } from "../db/schema.js";

/**
 * Maximum number of items to keep in top-level arrays.
 * Most layouts only display 3-6 items, so 5 is a good default.
 */
const MAX_ARRAY_ITEMS = 5;

/**
 * Fields to always remove (internal/pagination metadata).
 */
const STRIP_FIELDS = new Set([
    // Pexels
    "photographer_id", "photographer_url", "avg_color", "liked",
    // Wikipedia
    "pageid", "ns", "revision", "contentformat", "contentmodel",
    // Generic
    "next_page", "prev_page", "total_results", "per_page", "page",
    "request_id", "rate_limit", "cursor", "offset",
]);

/**
 * For image source objects (like Pexels `src`), prefer medium/large for display.
 * Full-res original is provided separately for lightbox zoom.
 * Priority: medium > large > landscape > large2x (smaller = faster load)
 */
const IMAGE_SIZE_PRIORITY = ["medium", "large", "landscape", "large2x", "small"];
const ORIGINAL_SIZE_PRIORITY = ["original", "large2x", "large"];

// ─── Response Mapping Types ─────────────────────────────────

interface ResponseMapping {
    response_path?: string;     // "data.photos" — dot-path to results array/object
    fields_keep?: string[];     // ["src.medium", "alt", "photographer"] — only keep these
    fields_strip?: string[];    // ["photographer_id", "avg_color"] — extra strip fields
    max_items?: number;         // Override MAX_ARRAY_ITEMS
}

/**
 * Main filter function. Takes raw API data and returns a cleaned version.
 * Accepts optional Integration for metadata-driven filtering.
 */
export function filterApiData(data: any, integrationName?: string, integration?: Integration): any {
    if (data === null || data === undefined) return data;

    // ─── Priority 1: Metadata-driven (response_mapping) ─────
    if (integration?.response_mapping) {
        try {
            const mapping: ResponseMapping = JSON.parse(integration.response_mapping);
            return filterByMapping(data, mapping);
        } catch {
            // Invalid mapping JSON — fall through to legacy
        }
    }

    // ─── Priority 2: Type-based (response_type) ─────────────
    if (integration?.response_type) {
        const rType = integration.response_type.toLowerCase();
        if (rType === "image") return filterImageData(data);
        if (rType === "video") return filterVideoData(data);
        if (rType === "text" || rType === "article") return filterWikiData(data);
        // "list" and "mixed" → generic
        return filterGeneric(data);
    }

    // ─── Priority 3: Legacy name/structure detection ────────
    const name = (integrationName || "").toLowerCase();

    if (name.includes("photo") || name.includes("image") || hasField(data, "photos")) {
        return filterImageData(data);
    }

    if (name.includes("video") || hasField(data, "videos")) {
        return filterVideoData(data);
    }

    if (name.includes("wiki") || hasField(data, "extract") || hasField(data, "query")) {
        return filterWikiData(data);
    }

    // Generic filter for unknown APIs (includes auto-unwrap for deeply nested structures)
    return filterGeneric(data);
}

// ─── Metadata-Driven Filter ─────────────────────────────────

/**
 * Generic filter driven by response_mapping config.
 * Extracts data at response_path, keeps/strips specified fields,
 * limits array size.
 */
function filterByMapping(data: any, mapping: ResponseMapping): any {
    let target = data;

    // Navigate to response_path (e.g. "data.photos" → data.data.photos)
    if (mapping.response_path) {
        for (const key of mapping.response_path.split(".")) {
            if (target && typeof target === "object" && key in target) {
                target = target[key];
            } else {
                // Path not found — return cleaned full data
                return filterGeneric(data);
            }
        }
    }

    const maxItems = mapping.max_items || MAX_ARRAY_ITEMS;

    // If target is an array, limit and filter each item
    if (Array.isArray(target)) {
        const items = target.slice(0, maxItems).map((item: any) => {
            if (typeof item !== "object" || item === null) return item;
            return filterObjectByMapping(item, mapping);
        });
        return { items, total: Array.isArray(data) ? data.length : target.length };
    }

    // If target is an object, filter it directly
    if (typeof target === "object" && target !== null) {
        return filterObjectByMapping(target, mapping);
    }

    return target;
}

/**
 * Filter a single object according to the mapping config.
 */
function filterObjectByMapping(obj: any, mapping: ResponseMapping): any {
    // If fields_keep specified, only keep those fields
    if (mapping.fields_keep && mapping.fields_keep.length > 0) {
        const result: Record<string, any> = {};
        for (const field of mapping.fields_keep) {
            const value = getNestedValue(obj, field);
            if (value !== undefined) {
                result[field.replace(/\./g, "_")] = value;
            }
        }
        return result;
    }

    // Otherwise clean with strip list
    const extraStrip = new Set(mapping.fields_strip || []);
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (STRIP_FIELDS.has(key) || extraStrip.has(key)) continue;
        if (typeof value === "string" && value.length > 2000) {
            cleaned[key] = value.substring(0, 200) + "... (truncated)";
            continue;
        }
        cleaned[key] = value;
    }
    return cleaned;
}

/**
 * Get a nested value from an object by dot-path.
 * E.g. getNestedValue(obj, "src.medium") → obj.src.medium
 */
function getNestedValue(obj: any, path: string): any {
    let current = obj;
    for (const key of path.split(".")) {
        if (current && typeof current === "object" && key in current) {
            current = current[key];
        } else {
            return undefined;
        }
    }
    return current;
}

// ─── Image Data (Pexels, Unsplash) ──────────────────────────

function filterImageData(data: any): any {
    const photos = data.photos || data.results || data.images || [];
    const filtered = photos.slice(0, MAX_ARRAY_ITEMS).map((photo: any) => {
        // Extract medium/large URL for display (fast loading)
        let imageUrl = photo.url || "";
        let originalUrl = "";
        if (photo.src && typeof photo.src === "object") {
            for (const size of IMAGE_SIZE_PRIORITY) {
                if (photo.src[size]) { imageUrl = photo.src[size]; break; }
            }
            for (const size of ORIGINAL_SIZE_PRIORITY) {
                if (photo.src[size]) { originalUrl = photo.src[size]; break; }
            }
        }
        // Fallback: use download URL or any URL-like field
        if (!imageUrl && photo.download) imageUrl = photo.download;
        if (!imageUrl && photo.urls?.regular) imageUrl = photo.urls.regular;

        return {
            url: imageUrl,
            alt: photo.alt || photo.description || photo.title || "",
            photographer: photo.photographer || photo.user?.name || "",
            width: photo.width,
            height: photo.height,
        };
    });

    return {
        total_results: Math.min(data.total_results || photos.length, 100),
        photos: filtered,
    };
}

// ─── Video Data (Pexels) ────────────────────────────────────

function filterVideoData(data: any): any {
    const videos = data.videos || data.results || [];
    const filtered = videos.slice(0, MAX_ARRAY_ITEMS).map((video: any) => {
        // Get best quality video file URL
        let videoUrl = "";
        let quality = "";
        if (video.video_files && Array.isArray(video.video_files)) {
            // Sort by quality (highest first), prefer mp4
            const sorted = [...video.video_files]
                .filter((f: any) => f.file_type === "video/mp4")
                .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
            if (sorted.length > 0) {
                videoUrl = sorted[0].link || sorted[0].url || "";
                quality = `${sorted[0].width}x${sorted[0].height}`;
            }
        }
        // Fallback
        if (!videoUrl && video.url) videoUrl = video.url;

        return {
            url: videoUrl,
            title: video.title || video.alt || "",
            duration: video.duration,
            quality,
            thumbnail: video.image || video.video_pictures?.[0]?.picture || "",
        };
    });

    return {
        total_results: Math.min(data.total_results || videos.length, 100),
        videos: filtered,
    };
}

// ─── Wikipedia Data ─────────────────────────────────────────

function filterWikiData(data: any): any {
    // MediaWiki API: data.query.pages[pageId]
    if (data.query?.pages) {
        const pages = Object.values(data.query.pages) as any[];
        if (pages.length === 0) return filterGeneric(data);

        // Single page result
        if (pages.length === 1) {
            const page = pages[0];
            return extractWikiPage(page);
        }

        // Multiple pages (search results)
        return {
            results: pages.slice(0, MAX_ARRAY_ITEMS).map((p: any) => ({
                title: p.title || "",
                extract: (p.extract || "").substring(0, 500),
                description: p.description || "",
                url: p.fullurl || p.canonicalurl || wikiUrl(p.title),
                thumbnail: p.thumbnail?.source || "",
            })),
        };
    }

    // Search list results: data.query.search[]
    if (data.query?.search) {
        return {
            results: data.query.search.slice(0, MAX_ARRAY_ITEMS).map((s: any) => ({
                title: s.title || "",
                snippet: decodeHtmlEntities((s.snippet || "").replace(/<[^>]+>/g, "")).substring(0, 300),
                url: wikiUrl(s.title),
                wordcount: s.wordcount,
            })),
        };
    }

    // Parse API: data.parse (handles both text and wikitext props)
    if (data.parse) {
        let text = "";

        // prop=text → HTML content
        if (data.parse.text?.["*"]) {
            text = data.parse.text["*"]
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }
        // prop=wikitext → raw wiki markup
        else if (data.parse.wikitext?.["*"]) {
            text = data.parse.wikitext["*"]
                .replace(/\{\{[^}]*\}\}/g, "")                       // Remove templates {{...}}
                .replace(/\[\[File:[^\]]*\]\]/gi, "")                 // Remove file embeds
                .replace(/\[\[Category:[^\]]*\]\]/gi, "")             // Remove categories
                .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")     // [[link|text]] → text
                .replace(/'{2,}/g, "")                                // Bold/italic markers
                .replace(/={2,}[^=]+=+/g, "")                        // Section headers
                .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")           // Remove refs
                .replace(/<ref[^/>]*\/>/gi, "")                       // Self-closing refs
                .replace(/<[^>]+>/g, " ")                             // HTML tags
                .replace(/\s+/g, " ")
                .trim();
        }

        return {
            title: data.parse.title || "",
            extract: text.substring(0, 3000),
            url: wikiUrl(data.parse.title || ""),
        };
    }

    // REST API format
    if (data.extract || data.title) {
        return {
            title: data.title || "",
            extract: (data.extract || data.extract_html || "").substring(0, 2000),
            thumbnail: data.thumbnail?.source || data.originalimage?.source || "",
            description: data.description || "",
        };
    }

    return filterGeneric(data);
}

/**
 * Extract usable data from a single Wiki page object.
 * Handles: extract, revisions, and basic info formats.
 */
function extractWikiPage(page: any): any {
    // Best case: has extract (from prop=extracts)
    if (page.extract) {
        return {
            title: page.title || "",
            extract: page.extract.substring(0, 2000),
            thumbnail: page.thumbnail?.source || page.original?.source || "",
            description: page.description || "",
            url: page.fullurl || page.canonicalurl || "",
        };
    }

    // Revisions API: raw wikitext in page.revisions[0]["*"]
    if (page.revisions && Array.isArray(page.revisions) && page.revisions.length > 0) {
        const rawContent = page.revisions[0]?.["*"] || page.revisions[0]?.content || "";

        // Detect Wikipedia redirect pages: #REDIRECT [[Target Page]]
        const redirectMatch = rawContent.match(/^#REDIRECT\s*\[\[(.+?)\]\]/i);
        if (redirectMatch) {
            const target = redirectMatch[1];
            return { _redirect: target, title: page.title };
        }

        // Strip wiki markup to get readable text
        const cleanText = rawContent
            .replace(/\{\{[^}]*\}\}/g, "")          // Remove templates {{...}}
            .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1") // [[link|text]] → text
            .replace(/'{2,}/g, "")                   // Bold/italic markers
            .replace(/={2,}[^=]+=+/g, "")            // Section headers
            .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "") // Remove refs
            .replace(/<ref[^/>]*\/>/gi, "")           // Self-closing refs
            .replace(/<[^>]+>/g, " ")                 // HTML tags
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 2000);

        return {
            title: page.title || "",
            extract: cleanText,
            url: page.fullurl || page.canonicalurl || `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title || "").replace(/ /g, "_"))}`,
        };
    }

    // Minimal info only
    return {
        title: page.title || "",
        url: page.fullurl || page.canonicalurl || "",
        description: page.description || "",
    };
}

// ─── Generic Filter ─────────────────────────────────────────

function filterGeneric(data: any): any {
    // ─── Step 1: Auto-unwrap deeply nested structures ────────
    // Many APIs wrap real content in `data`, `data.children`, `results`, etc.
    // Detect and flatten these before cleaning, so the AI sees the actual items.
    const unwrapped = autoUnwrap(data);
    return cleanObject(unwrapped, 0);
}

/**
 * Auto-detect and extract the "real" content from wrapper objects.
 * Handles patterns like:
 *   { data: { children: [{ data: {...} }] } }   (Reddit)
 *   { data: { items: [...] } }                    (generic)
 *   { response: { results: [...] } }              (generic)
 *   { result: { data: [...] } }                   (generic)
 */
function autoUnwrap(data: any): any {
    if (!data || typeof data !== "object" || Array.isArray(data)) return data;

    // Pattern: { data: { children: [{ kind, data: {...} }] } } (Reddit-like)
    if (data.data?.children && Array.isArray(data.data.children)) {
        const items = data.data.children
            .slice(0, 10)
            .map((c: any) => (c.data && typeof c.data === "object") ? c.data : c)
            .map((item: any) => flattenShallow(item));
        return { items, _total: data.data.children.length };
    }

    // Pattern: wrapper with single array at path data.items / data.results / results / items / entries
    const ARRAY_KEYS = ["items", "results", "entries", "records", "data", "hits", "posts", "list", "feed"];

    // Check 1-deep: data.{key}
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
        for (const key of ARRAY_KEYS) {
            if (Array.isArray(data.data[key])) {
                const meta: Record<string, any> = {};
                // Preserve non-array metadata siblings
                for (const [k, v] of Object.entries(data.data)) {
                    if (k !== key && typeof v !== "object") meta[k] = v;
                }
                return { ...meta, items: data.data[key].slice(0, 10) };
            }
        }
    }

    // Check 0-deep: {key} at root
    for (const key of ARRAY_KEYS) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
            const meta: Record<string, any> = {};
            for (const [k, v] of Object.entries(data)) {
                if (k !== key && typeof v !== "object") meta[k] = v;
            }
            return { ...meta, items: data[key].slice(0, 10) };
        }
    }

    // Check: response / result wrapper
    for (const wrapper of ["response", "result", "payload", "body"]) {
        if (data[wrapper] && typeof data[wrapper] === "object") {
            return autoUnwrap(data[wrapper]);
        }
    }

    return data;
}

/**
 * Flatten a shallow object: keep primitive fields + 1 level of nested objects.
 * Removes deeply nested sub-objects and very long strings.
 */
function flattenShallow(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (STRIP_FIELDS.has(key)) continue;
        if (value === null || value === undefined) continue;
        if (typeof value === "string") {
            result[key] = value.length > 500 ? value.substring(0, 300) + "..." : value;
        } else if (typeof value === "number" || typeof value === "boolean") {
            result[key] = value;
        } else if (Array.isArray(value)) {
            // Keep small arrays of primitives, skip large/nested arrays
            if (value.length <= 5 && value.every(v => typeof v !== "object")) {
                result[key] = value;
            }
        } else if (typeof value === "object") {
            // Keep 1 level of nesting for simple objects (e.g. { src: { medium: "url" } })
            const subEntries = Object.entries(value).filter(([, v]) => typeof v !== "object");
            if (subEntries.length > 0 && subEntries.length <= 8) {
                result[key] = Object.fromEntries(subEntries);
            }
        }
    }
    return result;
}

/**
 * Recursively cleans an object:
 * - Strips blacklisted fields
 * - Limits arrays to MAX_ARRAY_ITEMS
 * - Limits recursion depth to 5
 */
function cleanObject(obj: any, depth: number): any {
    if (depth > 5) return typeof obj === "string" ? obj.substring(0, 200) : obj;
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.slice(0, MAX_ARRAY_ITEMS).map((item) => cleanObject(item, depth + 1));
    }

    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (STRIP_FIELDS.has(key)) continue;
        // Skip very long strings (base64 data, embeddings, etc.)
        if (typeof value === "string" && value.length > 2000) {
            cleaned[key] = value.substring(0, 200) + "... (truncated)";
            continue;
        }
        cleaned[key] = cleanObject(value, depth + 1);
    }
    return cleaned;
}

// ─── Helpers ────────────────────────────────────────────────

function hasField(data: any, field: string): boolean {
    if (!data || typeof data !== "object") return false;
    return field in data;
}

/** Decode common HTML entities */
function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&#0?39;/g, "'")
        .replace(/&#0?34;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, ""); // strip remaining numeric entities
}

/** Construct a Wikipedia URL from a page title */
function wikiUrl(title: string): string {
    if (!title) return "";
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}
