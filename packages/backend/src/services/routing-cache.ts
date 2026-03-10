// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Routing Cache (Semantic)
// ============================================================
// In-memory cache: query → { endpointId, params }
// Uses exact string matching (fast) + fuzzy normalization.
//
// Cache hit = skip Smart Router entirely (0ms routing).
// ============================================================

import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

interface CacheEntry {
    endpointId: number;
    groupName: string;
    params: Record<string, string>;
    timestamp: number;
}

// ─── Cache Store ────────────────────────────────────────────

const MAX_ENTRIES = 500;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map<string, CacheEntry>();

// ─── Normalize query for cache key ──────────────────────────

function normalizeKey(query: string): string {
    return query
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        // Remove common filler words for broader matching
        .replace(/\b(please|can you|could you|show me|tell me|i want|i need)\b/g, "")
        .trim();
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Check if a query has a cached route result.
 */
export function getCachedRoute(query: string): CacheEntry | null {
    const key = normalizeKey(query);
    const entry = cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > TTL_MS) {
        cache.delete(key);
        return null;
    }

    log.debug(`  ⚡ Routing Cache HIT: "${query}" → endpoint #${entry.endpointId} (${entry.groupName})`);
    return entry;
}

/**
 * Store a successful route result in cache.
 */
export function setCachedRoute(
    query: string,
    endpointId: number,
    groupName: string,
    params: Record<string, string>,
): void {
    const key = normalizeKey(query);

    // Evict oldest entries if at capacity
    if (cache.size >= MAX_ENTRIES) {
        let oldestKey = "";
        let oldestTime = Infinity;
        for (const [k, v] of cache) {
            if (v.timestamp < oldestTime) {
                oldestTime = v.timestamp;
                oldestKey = k;
            }
        }
        if (oldestKey) cache.delete(oldestKey);
    }

    cache.set(key, {
        endpointId,
        groupName,
        params,
        timestamp: Date.now(),
    });
}

/**
 * Invalidate all cached routes (call after integration install/delete).
 */
export function clearRoutingCache(): void {
    cache.clear();
    log.debug("  🗑️ Routing cache cleared");
}

/**
 * Get cache stats for debugging.
 */
export function getRoutingCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return { size: cache.size, maxSize: MAX_ENTRIES, ttlMs: TTL_MS };
}
