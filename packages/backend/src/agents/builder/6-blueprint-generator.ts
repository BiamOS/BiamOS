// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent 6: Blueprint Generator
// ============================================================
// Generates API integration blueprints from simple tool names.
// Was: inline MAGIC_FILL_PROMPT in builder-routes.ts
// Now: centralized through agent-runner, prompt editable in UI.
// ============================================================

import { runAgent, type AgentResult } from "../agent-runner.js";

// ─── Types ──────────────────────────────────────────────────

export interface BlueprintEndpoint {
    name: string;
    path: string;
    method: string;
    description: string;
    param_schema?: Array<{
        name: string;
        in: string;
        type?: string;
        required?: boolean;
        description?: string;
        options?: string[];
    }>;
    semantic_triggers?: string[];
    api_triggers?: string;
    test_params?: Record<string, string>;
}

export interface Blueprint {
    integration_name: string;
    base_url: string;
    docs_url?: string;
    auth_type: "bearer" | "apikey" | "oauth" | "none";
    human_triggers?: string;
    endpoints: BlueprintEndpoint[];
}

// ─── Main Function ──────────────────────────────────────────

/**
 * Generate an API blueprint from a tool name.
 * Calls the "blueprint-generator" agent from DB.
 */
export async function generateBlueprint(toolName: string): Promise<Blueprint> {
    const result = await runAgent("blueprint-generator", `Tool: ${toolName}`);

    if (result.skipped) {
        throw new Error("Blueprint generator agent is disabled");
    }

    let spec: Blueprint;
    if (typeof result.output === "string") {
        // Try to parse the raw string
        spec = JSON.parse(result.raw);
    } else {
        spec = result.output;
    }

    // Auto-fix: sanitize base_url (strip path from base_url and prepend to paths)
    if (spec.base_url && spec.endpoints?.length) {
        try {
            const parsed = new URL(spec.base_url);
            if (parsed.pathname && parsed.pathname !== "/") {
                const basePath = parsed.pathname.replace(/\/$/, "");
                const cleanBase = `${parsed.protocol}//${parsed.host}`;
                spec.base_url = cleanBase;
                for (const ep of spec.endpoints) {
                    if (!ep.path.startsWith(basePath)) {
                        ep.path = basePath + ep.path;
                    }
                }
            }
        } catch { /* URL parse failed, skip sanitization */ }
    }

    // Detailed log
    for (const ep of spec.endpoints ?? []) {
        const fullUrl = `${spec.base_url}${ep.path}`;
    }

    return spec;
}
