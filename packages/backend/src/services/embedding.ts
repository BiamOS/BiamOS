// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Local Embedding Service (Semantic Intent Matching)
// ============================================================
// Uses Transformers.js to compute sentence embeddings locally
// via the all-MiniLM-L6-v2 ONNX model. No external API needed.
// Model auto-downloads on first use (~23MB), cached afterwards.
// ============================================================

import { log } from "../utils/logger.js";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// ─── Cache directory for ONNX models ────────────────────────
// Store models alongside the database in data/models/
const MODEL_CACHE = join(process.cwd(), "data", "models");

// Lazy-loaded pipeline — model loads only on first call
let _pipeline: any = null;
let _loading: Promise<any> | null = null;

/**
 * Get or initialize the feature-extraction pipeline.
 * Uses singleton pattern: model loads once, reused forever.
 */
async function getPipeline() {
    if (_pipeline) return _pipeline;
    if (_loading) return _loading;

    _loading = (async () => {
        try {
            // Ensure cache directory exists
            if (!existsSync(MODEL_CACHE)) {
                mkdirSync(MODEL_CACHE, { recursive: true });
            }

            log.info(`  🧠 Embedding: loading all-MiniLM-L6-v2 model...`);
            log.info(`  🧠 Embedding: cache dir = ${MODEL_CACHE}`);

            // Set HuggingFace cache env BEFORE importing
            process.env.HF_HOME = MODEL_CACHE;
            process.env.TRANSFORMERS_CACHE = MODEL_CACHE;

            const { pipeline, env } = await import("@huggingface/transformers");

            // Configure Transformers.js cache and settings
            env.cacheDir = MODEL_CACHE;
            env.allowLocalModels = true;
            env.allowRemoteModels = true;

            _pipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
                // @ts-ignore — revision for stable ONNX model
                revision: "main",
                cache_dir: MODEL_CACHE,
            });

            log.info("  🧠 Embedding: model loaded successfully ✅");
            return _pipeline;
        } catch (err) {
            log.error(`  🧠 Embedding: failed to load model: ${err}`);
            _loading = null; // Allow retry on next call
            throw err;
        }
    })();

    return _loading;
}

/**
 * Compute a 384-dimensional embedding vector for a text string.
 * Returns null if the model fails to load.
 */
export async function computeEmbedding(text: string): Promise<Float32Array | null> {
    try {
        const pipe = await getPipeline();
        const result = await pipe(text, { pooling: "mean", normalize: true });
        // result.data is a Float32Array of shape [1, 384]
        return new Float32Array(result.data);
    } catch (err) {
        log.error(`  🧠 Embedding: compute error: ${err}`);
        return null;
    }
}

/**
 * Cosine similarity between two embedding vectors.
 * Both must be normalized (which they are from the pipeline).
 * Returns value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
    }
    return dot; // Already normalized, so dot product = cosine similarity
}

/**
 * Serialize Float32Array to base64 for SQLite TEXT storage.
 */
export function embeddingToBase64(embedding: Float32Array): string {
    const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    return buf.toString("base64");
}

/**
 * Deserialize base64 string back to Float32Array.
 */
export function base64ToEmbedding(b64: string): Float32Array {
    const buf = Buffer.from(b64, "base64");
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Check if the embedding model is ready (loaded).
 */
export function isModelReady(): boolean {
    return _pipeline !== null;
}

/**
 * Pre-load the model in the background (fire-and-forget).
 * Called at server startup so first query is fast.
 */
export function preloadModel(): void {
    getPipeline().catch(() => {
        // Silently ignore — will retry on first actual use
    });
}
