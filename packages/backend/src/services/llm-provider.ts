// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — LLM Provider Service
// ============================================================
// Central provider abstraction for multi-LLM support.
// Supports: OpenRouter (cloud), Ollama (local), LM Studio (local),
// and any custom OpenAI-compatible endpoint.
// ============================================================

import { db } from "../db/db.js";
import { systemSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────

export type LLMProvider = "openrouter" | "ollama" | "lmstudio" | "custom";

export interface ProviderConfig {
    provider: LLMProvider;
    baseUrl: string;
    apiKey: string;
    requiresAuth: boolean;
}

// ─── Provider Defaults ──────────────────────────────────────

const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; requiresAuth: boolean }> = {
    openrouter: { baseUrl: "https://openrouter.ai/api/v1", requiresAuth: true },
    ollama: { baseUrl: "http://localhost:11434/v1", requiresAuth: false },
    lmstudio: { baseUrl: "http://localhost:1234/v1", requiresAuth: false },
    custom: { baseUrl: "http://localhost:8080/v1", requiresAuth: false },
};

// ─── Settings Helpers ───────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
    try {
        const [row] = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, key))
            .limit(1);
        return row?.value ?? null;
    } catch {
        return null;
    }
}

// ─── Provider Config Resolution ─────────────────────────────

/**
 * Resolve the current LLM provider configuration.
 * Reads from system_settings: LLM_PROVIDER, LLM_BASE_URL, OPENROUTER_API_KEY
 */
export async function getProviderConfig(): Promise<ProviderConfig> {
    const providerStr = await getSetting("LLM_PROVIDER");
    const provider: LLMProvider =
        providerStr && providerStr in PROVIDER_DEFAULTS
            ? (providerStr as LLMProvider)
            : "openrouter";

    const defaults = PROVIDER_DEFAULTS[provider];

    // For custom provider, use custom URL; otherwise use provider default
    let baseUrl = defaults.baseUrl;
    if (provider === "custom") {
        const customUrl = await getSetting("LLM_BASE_URL");
        if (customUrl) baseUrl = customUrl;
    }

    // API key: always read from DB/env (used for OpenRouter + potentially custom)
    let apiKey = "";
    if (provider === "openrouter") {
        const dbKey = await getSetting("OPENROUTER_API_KEY");
        apiKey = dbKey || process.env.OPENROUTER_API_KEY || "";
    } else if (provider === "custom") {
        // Custom provider may optionally need an API key
        const customKey = await getSetting("LLM_CUSTOM_API_KEY");
        apiKey = customKey || "";
    }

    return {
        provider,
        baseUrl,
        apiKey,
        requiresAuth: defaults.requiresAuth || !!apiKey,
    };
}

// ─── URL Helpers ────────────────────────────────────────────

/** Get the chat completions URL for the current provider */
export async function getChatUrl(): Promise<string> {
    const config = await getProviderConfig();
    return `${config.baseUrl}/chat/completions`;
}

/** Get the embeddings URL (always OpenRouter if available, else current provider) */
export async function getEmbeddingsUrl(): Promise<string> {
    const config = await getProviderConfig();

    // Embeddings: prefer OpenRouter if we have a key, since local providers
    // often don't support the embeddings endpoint
    if (config.provider !== "openrouter") {
        const orKey = await getSetting("OPENROUTER_API_KEY");
        if (orKey) {
            return "https://openrouter.ai/api/v1/embeddings";
        }
    }
    return `${config.baseUrl}/embeddings`;
}

/** Get headers for LLM API calls */
export async function getHeaders(agentName?: string): Promise<Record<string, string>> {
    const config = await getProviderConfig();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    // OpenRouter-specific headers
    if (config.provider === "openrouter" && agentName) {
        headers["X-Title"] = `BiamOS Agent: ${agentName}`;
    }

    return headers;
}

/** Get headers specifically for embedding calls (may differ from chat) */
export async function getEmbeddingHeaders(): Promise<Record<string, string>> {
    const config = await getProviderConfig();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    // If using a local provider, try to use OpenRouter for embeddings
    if (config.provider !== "openrouter") {
        const orKey = await getSetting("OPENROUTER_API_KEY");
        if (orKey) {
            headers["Authorization"] = `Bearer ${orKey}`;
            headers["X-Title"] = "BiamOS Embedding Service";
            return headers;
        }
    }

    if (config.apiKey) {
        headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    if (config.provider === "openrouter") {
        headers["X-Title"] = "BiamOS Embedding Service";
    }

    return headers;
}

/**
 * Get the models list URL for the current provider.
 * Different providers have different model list endpoints.
 */
export async function getModelsUrl(): Promise<string> {
    const config = await getProviderConfig();

    switch (config.provider) {
        case "ollama":
            // Ollama uses a non-standard endpoint
            // But also supports /v1/models for OpenAI compat
            return `${config.baseUrl}/models`;
        case "openrouter":
        case "lmstudio":
        case "custom":
        default:
            return `${config.baseUrl}/models`;
    }
}

/**
 * Check if embeddings are available with current provider setup.
 * Local providers usually don't support embeddings unless OpenRouter key is available.
 */
export async function hasEmbeddingSupport(): Promise<boolean> {
    const config = await getProviderConfig();
    if (config.provider === "openrouter") return true;

    // Check if we have an OpenRouter key as fallback
    const orKey = await getSetting("OPENROUTER_API_KEY");
    return !!orKey;
}
