// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Builder Routes (Agent Pipeline)
// ============================================================
// Integration creation: magic-fill (Agent 6+7), OpenAPI import, direct DB insert.
// No more TSX code generation — all capsules use JSON layouts.
// ============================================================

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { getApiKey } from "../server-utils.js";
import { importOpenAPI } from "../services/openapi-importer.js";
import { enrichIntegration } from "../services/enrichment-service.js";
import { zValidator } from "@hono/zod-validator";
import { magicFillSchema, importOpenApiSchema, buildSchema } from "../validators/schemas.js";
import { generateBlueprint } from "../agents/builder/6-blueprint-generator.js";
import { verifyBlueprint } from "../agents/builder/7-docs-verifier.js";
import { invalidateConciergeCache } from "../agents/intent/0-concierge.js";
import { clearRoutingCache } from "../services/routing-cache.js";
import { log } from "../utils/logger.js";

const builderRoutes = new Hono();

// ─── POST /builder/magic-fill — Smart Blueprint ─────────────

builderRoutes.post("/magic-fill",
    zValidator("json", magicFillSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: result.error.issues.map((i) => i.message).join(", "),
            }, 400);
        }
    }),
    async (c) => {
        try {
            const { tool_name } = c.req.valid("json");

            // Agent 6: Generate blueprint
            let spec = await generateBlueprint(tool_name);

            // Agent 7: Verify against real docs
            spec = await verifyBlueprint(spec);

            // ─── Post-Process: fill metadata for pipeline ────
            // Fix human_triggers format: pipe → comma
            if (spec.human_triggers) {
                spec.human_triggers = spec.human_triggers.replace(/\s*\|\s*/g, ", ");
            }

            // Generate description if missing
            const enrichedSpec: any = { ...spec };
            if (!enrichedSpec.description) {
                enrichedSpec.description = `API integration for ${spec.integration_name}`;
            }

            // Favicon from base_url — validate before storing
            if (spec.base_url && (!enrichedSpec.sidebar_icon || enrichedSpec.sidebar_icon === "✨")) {
                try {
                    const hostname = new URL(spec.base_url).hostname;
                    const domain = hostname.replace(/^api\./i, "");
                    // Quick validation: check if direct favicon exists
                    const faviconOk = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
                        method: "HEAD", signal: AbortSignal.timeout(2000),
                    }).then(r => r.ok && (r.headers.get("content-length") ?? "999") !== "0")
                        .catch(() => false);
                    enrichedSpec.sidebar_icon = faviconOk ? domain : "✨";
                } catch { enrichedSpec.sidebar_icon = "✨"; }
            }

            // Per-endpoint enrichment
            for (const ep of enrichedSpec.endpoints) {
                // endpoint_tags from semantic_triggers
                if (!ep.endpoint_tags && ep.semantic_triggers?.length) {
                    ep.endpoint_tags = ep.semantic_triggers.join(", ");
                }
                // response_type: derive from endpoint name/description
                if (!ep.response_type) {
                    const hint = `${ep.name || ""} ${ep.description || ""} ${(ep.semantic_triggers || []).join(" ")}`.toLowerCase();
                    if (/\b(list|search|all|find|query|index|browse|catalog|collection|filter)\b/.test(hint)) {
                        ep.response_type = "list";
                    } else if (/\b(image|photo|picture|avatar|thumbnail)\b/.test(hint)) {
                        ep.response_type = "image_list";
                    } else if (/\b(get|fetch|show|detail|single|by.?id|random)\b/.test(hint)) {
                        ep.response_type = "mixed";
                    } else {
                        ep.response_type = "mixed";
                    }
                }
                // supported_intents: derive from method + name
                if (!ep.supported_intents) {
                    const method = (ep.method || "GET").toUpperCase();
                    const hint = `${ep.name || ""} ${ep.description || ""}`.toLowerCase();
                    if (method !== "GET") {
                        ep.supported_intents = "ACTION";
                    } else if (/\b(search|find|query|filter|browse|list)\b/.test(hint)) {
                        ep.supported_intents = "SEARCH|DATA";
                    } else if (/\b(image|photo|picture|gallery)\b/.test(hint)) {
                        ep.supported_intents = "IMAGE|DATA";
                    } else {
                        ep.supported_intents = "DATA";
                    }
                }
            }

            // Default allowed_blocks
            if (!enrichedSpec.allowed_blocks) {
                enrichedSpec.allowed_blocks = [
                    "title", "key_value", "text", "hero", "hero_image",
                    "metric_row", "list", "divider", "spacer",
                ];
            }

            return c.json({
                biam_protocol: "2.0",
                action: "magic_fill_result",
                spec: enrichedSpec,
            });
        } catch (err) {
            log.error("💥 Magic Fill error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Magic Fill fehlgeschlagen",
            }, 500);
        }
    });

// ─── POST /builder/import-openapi — Swagger Import ──────────

builderRoutes.post("/import-openapi",
    zValidator("json", importOpenApiSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: result.error.issues.map((i) => i.message).join(", "),
            }, 400);
        }
    }),
    async (c) => {
        try {
            const { specUrl, groupName } = c.req.valid("json");

            const apiKey = await getApiKey();

            const result = await importOpenAPI(specUrl, apiKey, {
                groupName: groupName?.trim() || undefined,
            });

            invalidateConciergeCache();
            clearRoutingCache();

            return c.json({
                biam_protocol: "2.0",
                action: "openapi_imported",
                integration_name: result.integrationName,
                base_url: result.baseUrl,
                auth_type: result.authType,
                endpoints_found: result.endpoints.length,
                created: result.created,
                errors: result.errors,
            }, 201);
        } catch (err) {
            // Invalidate cache even on partial success (some endpoints may have been created)
            invalidateConciergeCache();
            clearRoutingCache();
            log.error("💥 OpenAPI Import error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Import failed",
            }, 500);
        }
    });

// ─── POST /builder/build — Creator Studio Build ─────────────
// Direct DB insert — no TSX generation, all capsules use JSON layouts.

builderRoutes.post("/build",
    zValidator("json", buildSchema, (result, c) => {
        if (!result.success) {
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: result.error.issues.map((i) => i.message).join(", "),
            }, 400);
        }
    }),
    async (c) => {
        try {
            const body = c.req.valid("json");


            // Derive a PascalCase capsule name
            const integrationName = body.name
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join("") + "Widget";

            const intentDesc = (body.triggers && body.triggers.length > 0)
                ? body.triggers.join(" | ")
                : body.intent;

            const httpMethod = body.method || "GET";
            const apiEndpoint = body.apiEndpoint || `auto-builder://${integrationName}`;
            const apiConfig = body.apiConfig
                ? JSON.stringify(body.apiConfig)
                : body.authMethod
                    ? JSON.stringify({ requiresAuth: true, authType: body.authMethod })
                    : null;

            // Insert directly into DB
            await db.run(sql`
            INSERT INTO capsules (name, intent_description, api_endpoint, api_config,
                                  http_method, group_name, sidebar_icon, sidebar_label,
                                  is_active, is_auto_generated, human_triggers, api_triggers, param_schema,
                                  endpoint_tags, response_type, supported_intents, allowed_blocks,
                                  integration_type, status, template_description, template_category)
            VALUES (${integrationName}, ${intentDesc}, ${apiEndpoint}, ${apiConfig},
                    ${httpMethod}, ${body.groupName || null}, ${body.sidebarIcon || null},
                    ${body.sidebarLabel || null}, 1, 1,
                    ${body.humanTriggers || null}, ${body.apiTriggers || null},
                    ${body.paramSchema ? JSON.stringify(body.paramSchema) : null},
                    ${body.endpointTags || body.apiTriggers || null},
                    ${body.responseType || null},
                    ${body.supportedIntents || null},
                    ${body.allowedBlocks ? JSON.stringify(body.allowedBlocks) : null},
                    ${"api"}, ${"live"},
                    ${(body as any).description || null},
                    ${(body as any).category || null})
            ON CONFLICT(name) DO UPDATE SET
                intent_description = ${intentDesc},
                api_endpoint = ${apiEndpoint},
                api_config = ${apiConfig},
                http_method = ${httpMethod},
                group_name = ${body.groupName || null},
                sidebar_icon = ${body.sidebarIcon || null},
                sidebar_label = ${body.sidebarLabel || null},
                human_triggers = ${body.humanTriggers || null},
                api_triggers = ${body.apiTriggers || null},
                param_schema = ${body.paramSchema ? JSON.stringify(body.paramSchema) : null},
                endpoint_tags = ${body.endpointTags || body.apiTriggers || null},
                response_type = ${body.responseType || null},
                supported_intents = ${body.supportedIntents || null},
                allowed_blocks = ${body.allowedBlocks ? JSON.stringify(body.allowedBlocks) : null},
                template_description = ${(body as any).description || null},
                template_category = ${(body as any).category || null}
        `);


            // Get the new capsule for enrichment
            const [newItem] = await db.select().from(capsules).where(sql`name = ${integrationName}`).limit(1);

            // Enrich with embeddings (non-blocking)
            if (newItem) {
                try {
                    const enrichApiKey = await getApiKey();
                    await enrichIntegration({
                        integrationId: newItem.id,
                        name: newItem.name,
                        intentDescription: intentDesc,
                        apiEndpoint,
                        groupName: body.groupName ?? undefined,
                        httpMethod,
                    }, enrichApiKey);
                } catch (enrichErr) {
                    log.warn("[Builder] enrichment failed:", enrichErr);
                }
            }

            invalidateConciergeCache();
            clearRoutingCache();

            return c.json({
                biam_protocol: "2.0",
                action: "integration_built",
                integration_id: integrationName,
                id: newItem?.id,
                message: `Integration "${integrationName}" created successfully.`,
            }, 201);
        } catch (err) {
            log.error("💥 Creator Studio error:", err);
            return c.json({
                biam_protocol: "2.0", action: "error",
                message: err instanceof Error ? err.message : "Build fehlgeschlagen",
            }, 500);
        }
    });

// ─── POST /builder/test-endpoint — Live URL Validation ──────

builderRoutes.post("/test-endpoint", async (c) => {
    try {
        const body = await c.req.json();
        const { base_url, path, test_params, auth_config } = body;

        if (!base_url || !path) {
            return c.json({ pass: false, error: "base_url and path are required" }, 400);
        }

        // Resolve {param} placeholders with test_params
        let resolvedPath = path;
        if (test_params && typeof test_params === "object") {
            for (const [key, value] of Object.entries(test_params)) {
                resolvedPath = resolvedPath.replace(
                    new RegExp(`\\{${key}\\}`, "g"),
                    encodeURIComponent(String(value))
                );
            }
        }

        const fullUrl = `${base_url}${resolvedPath}`;

        // Build headers
        const headers: Record<string, string> = { "User-Agent": "BiamOS/2.0" };
        if (auth_config?.authKey) {
            const headerName = auth_config.authHeaderName || "Authorization";
            const prefix = auth_config.authPrefix ? `${auth_config.authPrefix} ` : "";
            headers[headerName] = `${prefix}${auth_config.authKey}`;
        }

        const response = await fetch(fullUrl, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(8000),
        });

        const contentType = response.headers.get("content-type") || "";
        const bodyText = await response.text();
        const isJson = contentType.includes("json") || bodyText.trimStart().startsWith("{") || bodyText.trimStart().startsWith("[");

        const result = {
            pass: response.ok && isJson,
            status: response.status,
            content_type: contentType,
            is_json: isJson,
            body_size: bodyText.length,
            body_preview: bodyText.substring(0, 200),
            tested_url: fullUrl,
        };

        if (result.pass) {
        } else {
        }

        return c.json(result);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Test failed";
        return c.json({
            pass: false,
            error: msg,
            status: 0,
            is_json: false,
            body_size: 0,
        });
    }
});

// ─── POST /builder/fix-endpoint — AI Fix for Failed Tests ───

builderRoutes.post("/fix-endpoint", async (c) => {
    try {
        const body = await c.req.json();
        const { endpoint, base_url, docs_url, error, integration_name } = body;

        if (!endpoint || !base_url || !error) {
            return c.json({ pass: false, error: "endpoint, base_url, and error are required" }, 400);
        }


        // Try to fetch docs for context
        let docsContext = "";
        if (docs_url) {
            const { tryFetchDocs } = await import("../agents/builder/7-docs-verifier.js");
            const docsResult = await tryFetchDocs(docs_url);
            if (docsResult) {
                docsContext = `\n\nREAL API DOCUMENTATION:\n${docsResult.text}`;
            }
        }

        // Build the fix prompt
        const fixPrompt = `An API endpoint test FAILED. Fix the endpoint.

INTEGRATION: ${integration_name || "Unknown"}
BASE URL: ${base_url}

FAILING ENDPOINT:
- Name: ${endpoint.name}
- Method: ${endpoint.method}
- Path: ${endpoint.path}
- Test Params: ${JSON.stringify(endpoint.test_params || {})}
- Full URL tested: ${error.tested_url || `${base_url}${endpoint.path}`}

ERROR:
- HTTP Status: ${error.status}
- Response: ${error.body_preview || error.error || "No response"}

YOUR TASK:
1. Diagnose WHY this endpoint failed (wrong path? wrong params? missing version prefix?)
2. Return the CORRECTED endpoint as JSON

Output ONLY valid JSON:
{
  "name": "${endpoint.name}",
  "path": "/corrected/path/{param}",
  "method": "${endpoint.method}",
  "description": "...",
  "param_schema": [...],
  "semantic_triggers": ${JSON.stringify(endpoint.semantic_triggers || [])},
  "test_params": { ... },
  "fix_reasoning": "Explanation of what was wrong and what was fixed"
}${docsContext}`;

        // Use the docs-verifier agent for the fix
        const { runAgent } = await import("../agents/agent-runner.js");
        const result = await runAgent("docs-verifier", fixPrompt);

        if (result.skipped) {
            return c.json({ fixed: false, error: "Docs verifier agent is disabled" }, 500);
        }

        let fixedEndpoint: any;
        if (typeof result.output === "string") {
            try {
                fixedEndpoint = JSON.parse(result.raw);
            } catch {
                return c.json({ fixed: false, error: "Agent did not return valid JSON", raw: result.raw.substring(0, 300) }, 500);
            }
        } else {
            fixedEndpoint = result.output;
        }

        const reasoning = fixedEndpoint.fix_reasoning || "Endpoint corrected";
        delete fixedEndpoint.fix_reasoning;

        // Log the changes
        const changes: string[] = [];
        if (fixedEndpoint.path !== endpoint.path) {
            changes.push(`path: ${endpoint.path} → ${fixedEndpoint.path}`);
        }
        if (JSON.stringify(fixedEndpoint.test_params) !== JSON.stringify(endpoint.test_params)) {
            changes.push(`test_params updated`);
        }


        return c.json({
            fixed: true,
            endpoint: fixedEndpoint,
            changes,
            reasoning,
        });
    } catch (err) {
        log.error("💥 Fix Endpoint error:", err);
        return c.json({
            fixed: false,
            error: err instanceof Error ? err.message : "Fix failed",
        }, 500);
    }
});

export { builderRoutes };
