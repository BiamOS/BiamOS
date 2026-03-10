// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Enrichment Service
// ============================================================
// Write-time enrichment: when a capsule is saved, this service:
//   1. Translates any-language tags → normalized English tags
//   2. Generates endpoint_tags for LLM selection
//   3. Creates embedding vector for the group
// ============================================================

import { db } from "../db/db.js";
import { MODEL_FAST } from "../config/models.js";
import { capsules } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { embedText, storeGroupEmbedding } from "./embedding-service.js";
import { getChatUrl, getHeaders } from "./llm-provider.js";

// ─── Types ──────────────────────────────────────────────────

interface EnrichmentInput {
    integrationId: number;
    name: string;
    intentDescription: string;
    apiEndpoint: string;
    groupName?: string;
    httpMethod?: string;
}

interface EnrichmentResult {
    normalizedTags: string;
    endpointTags: string;
    embeddingStored: boolean;
}

// ─── Tag Normalization Prompt ───────────────────────────────

const NORMALIZE_PROMPT = `You are a tag normalizer for an API integration platform.

Given a capsule name, its intent description (which may be in ANY language), and its API endpoint, generate TWO things:

1. NORMALIZED_TAGS: A comma-separated list of English keywords that describe what this integration does.
   These are used for semantic search. Be comprehensive — include synonyms, related concepts.
   
2. ENDPOINT_TAGS: A comma-separated list of English phrases that describe SPECIFICALLY what this
   endpoint does (not the whole integration). These help distinguish between endpoints in the same group.

RULES:
- ALL output must be in English
- Include both technical terms and natural language phrases
- For ENDPOINT_TAGS: focus on the ACTION this specific endpoint performs
- Output ONLY the two lines in exact format below, nothing else

FORMAT:
NORMALIZED_TAGS: tag1, tag2, tag3, ...
ENDPOINT_TAGS: phrase1, phrase2, phrase3, ...

EXAMPLES:
Input: Name="GetCurrent", Intent="wetter temperatur wind", Endpoint="api.open-meteo.com/forecast"
NORMALIZED_TAGS: weather, forecast, temperature, wind, rain, snow, climate, meteorology, current conditions
ENDPOINT_TAGS: current weather, live temperature, weather right now, real-time conditions, today's weather

Input: Name="GetForecast", Intent="vorhersage morgen nächste woche", Endpoint="api.open-meteo.com/forecast?daily=true"
NORMALIZED_TAGS: weather, forecast, prediction, tomorrow, next week, daily, weekly, future weather
ENDPOINT_TAGS: weather forecast, tomorrow's weather, next days, weekly prediction, future forecast`;

// ─── Core Enrichment ────────────────────────────────────────

/**
 * Enriches a capsule with normalized tags, endpoint tags, and embedding.
 * Called at write-time (create/update).
 */
export async function enrichIntegration(
    input: EnrichmentInput,
    apiKey: string
): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
        normalizedTags: "",
        endpointTags: "",
        embeddingStored: false,
    };

    // Step 1: Normalize tags via LLM
    try {
        const userMessage = `Name="${input.name}", Intent="${input.intentDescription}", Endpoint="${input.apiEndpoint}", Method="${input.httpMethod || "GET"}"`;

        const chatUrl = await getChatUrl();
        const llmHeaders = await getHeaders("enrichment");
        const response = await fetch(
            chatUrl,
            {
                method: "POST",
                headers: llmHeaders,
                body: JSON.stringify({
                    model: MODEL_FAST,
                    messages: [
                        { role: "system", content: NORMALIZE_PROMPT },
                        { role: "user", content: userMessage },
                    ],
                    temperature: 0,
                    max_tokens: 512,
                }),
            }
        );

        if (response.ok) {
            const data = await response.json();
            const content =
                data.choices?.[0]?.message?.content?.trim() ?? "";

            // Parse the two lines
            const normalizedMatch = content.match(
                /NORMALIZED_TAGS:\s*(.+)/i
            );
            const endpointMatch = content.match(
                /ENDPOINT_TAGS:\s*(.+)/i
            );

            if (normalizedMatch) {
                result.normalizedTags = normalizedMatch[1].trim();
            }
            if (endpointMatch) {
                result.endpointTags = endpointMatch[1].trim();
            }
        }
    } catch {
    }

    // Step 2: Update capsule with tags
    await db
        .update(capsules)
        .set({
            normalized_tags: result.normalizedTags || null,
            endpoint_tags: result.endpointTags || null,
        })
        .where(sql`id = ${input.integrationId}`);

    // Step 3: Generate and store group embedding
    try {
        const groupKey = input.groupName || input.name;

        // Build embedding text from all normalized tags in the group
        const groupIntegrations = await db
            .select()
            .from(capsules)
            .where(
                input.groupName
                    ? sql`group_name = ${input.groupName}`
                    : sql`name = ${input.name}`
            );

        // Combine all tags for a rich embedding
        const allTags = groupIntegrations
            .map(
                (c: { normalized_tags: string | null; intent_description: string }) =>
                    c.normalized_tags ||
                    c.intent_description
            )
            .join(", ");

        const embeddingText = `${groupKey}: ${allTags}`;

        const embedding = await embedText(embeddingText, apiKey);
        await storeGroupEmbedding(groupKey, embedding);

        result.embeddingStored = true;
    } catch {
    }

    return result;
}
