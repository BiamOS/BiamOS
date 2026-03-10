// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 2: Intent Classifier (Context-Aware)
// ============================================================
// Classifies user intent into a closed enum of types.
// Anti-hallucination: output is constrained to 7 fixed types.
// Context-aware: knows which integrations are available.
// ============================================================

import { runAgentJSON } from "../agent-runner.js";
import { getClassifierContext } from "../../services/integration-context.js";
import type { IntentType } from "@biamos/shared";

// ─── Types ──────────────────────────────────────────────────

export type { IntentType };

export interface ClassifierResult {
    type: IntentType;
    entity: string;
    modifier: string | null;
}

// Valid intent types (closed enum)
const VALID_TYPES = new Set<string>(["ARTICLE", "IMAGE", "IMAGES", "SEARCH", "DATA", "VIDEO", "ACTION", "NAVIGATE", "TOOL"]);

// ─── Main Function ──────────────────────────────────────────

/**
 * Classify the user's English text into intent type + entity.
 * Context-aware: knows which integrations are available.
 * Returns a strongly-typed ClassifierResult.
 */
export async function classifyIntent(englishText: string): Promise<ClassifierResult> {
    // Build integration context
    const context = await getClassifierContext();

    const result = await runAgentJSON<ClassifierResult>(
        "classifier",
        englishText,
        context || undefined
    );

    if (result.skipped) {
        // Fallback: treat as ARTICLE if classifier is disabled
        return { type: "ARTICLE", entity: englishText, modifier: null };
    }

    const output = result.output;

    // Validate the type is in our closed enum
    if (!output.type || !VALID_TYPES.has(output.type)) {
        output.type = "ARTICLE";
    }

    // Ensure entity exists
    if (!output.entity || typeof output.entity !== "string") {
        output.entity = englishText;
    }



    return {
        type: output.type as IntentType,
        entity: output.entity,
        modifier: output.modifier ?? null,
    };
}
