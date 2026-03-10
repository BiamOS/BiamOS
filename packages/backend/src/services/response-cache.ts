// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Response Cache (In-Memory LRU with TTL)
// ============================================================
// Caches LLM responses to avoid redundant API calls.
// - Translation cache: queryText → translatedText (TTL: 1h)
// - Layout cache: integration+data hash → layout JSON (TTL: 5min)
// ============================================================

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class ResponseCache<T = string> {
    private cache = new Map<string, CacheEntry<T>>();
    private readonly maxSize: number;
    private readonly ttlMs: number;

    constructor(maxSize = 500, ttlSeconds = 3600) {
        this.maxSize = maxSize;
        this.ttlMs = ttlSeconds * 1000;
    }

    get(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        // Move to end (LRU refresh)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key: string, value: T): void {
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.ttlMs,
        });
    }

    get size(): number {
        return this.cache.size;
    }

    clear(): void {
        this.cache.clear();
    }
}

// ─── Pre-configured Caches ──────────────────────────────────

/** Translation cache: 1 hour TTL, 500 entries */
export const translationCache = new ResponseCache<string>(500, 3600);

/** Layout cache: 5 minute TTL, 200 entries */
export const layoutCache = new ResponseCache<object>(200, 300);
