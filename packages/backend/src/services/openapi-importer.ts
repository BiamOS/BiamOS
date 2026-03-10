// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — OpenAPI / Swagger Importer
// ============================================================
// Parses an OpenAPI 2.0 (Swagger) or 3.x spec and auto-creates
// integrations for each endpoint.
//
// Input: URL to swagger.json / openapi.json
// Output: Array of capsule definitions ready for DB insertion
// ============================================================

import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { enrichIntegration } from "./enrichment-service.js";
import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

export interface ImportedEndpoint {
    name: string;
    method: string;
    path: string;
    description: string;
    tags: string[];
    paramSchema: ParamDef[];
}

interface ParamDef {
    name: string;
    type: string;
    required: boolean;
    in: "path" | "query" | "body" | "header";
    description?: string;
}

export interface ImportResult {
    integrationName: string;
    baseUrl: string;
    authType: string;
    endpoints: ImportedEndpoint[];
    created: number;
    errors: string[];
}

// ─── Spec Fetching ──────────────────────────────────────────

/**
 * Fetches and parses an OpenAPI/Swagger spec from a URL.
 */
async function fetchSpec(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    // Try JSON first, then YAML-like
    try {
        return JSON.parse(text);
    } catch {
        // Very basic YAML parsing for simple specs
        throw new Error("Only JSON OpenAPI specs are supported. YAML support coming soon.");
    }
}

// ─── Spec Parsing ───────────────────────────────────────────

/**
 * Detect version and extract base URL from the spec.
 */
function extractBaseUrl(spec: any): string {
    // OpenAPI 3.x
    if (spec.openapi && spec.servers?.length > 0) {
        return spec.servers[0].url.replace(/\/$/, "");
    }

    // Swagger 2.0
    if (spec.swagger) {
        const scheme = spec.schemes?.[0] || "https";
        const host = spec.host || "localhost";
        const basePath = spec.basePath || "";
        return `${scheme}://${host}${basePath}`.replace(/\/$/, "");
    }

    return "";
}

/**
 * Extract auth type from the spec's security definitions.
 */
function extractAuthType(spec: any): string {
    // OpenAPI 3.x
    const securitySchemes = spec.components?.securitySchemes || {};
    // Swagger 2.0
    const securityDefs = spec.securityDefinitions || {};

    const schemes = { ...securitySchemes, ...securityDefs };

    for (const [, def] of Object.entries<any>(schemes)) {
        if (def.type === "apiKey") return "apikey";
        if (def.type === "http" && def.scheme === "bearer") return "bearer";
        if (def.type === "http" && def.scheme === "basic") return "basic";
        if (def.type === "oauth2") return "oauth2";
    }

    return "none";
}

/**
 * Extract integration name from spec info.
 */
function extractName(spec: any): string {
    return spec.info?.title || "UnknownAPI";
}

/**
 * Parse all endpoints from the spec's paths.
 */
function parseEndpoints(spec: any): ImportedEndpoint[] {
    const endpoints: ImportedEndpoint[] = [];
    const paths = spec.paths || {};

    for (const [path, methods] of Object.entries<any>(paths)) {
        for (const [method, operation] of Object.entries<any>(methods)) {
            // Skip non-HTTP methods (like "parameters" at path level)
            if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

            // Build a clean name from operationId or path
            const rawName = operation.operationId
                || `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
            const name = rawName
                .replace(/[^a-zA-Z0-9_]/g, "")
                .replace(/^_+|_+$/g, "")
                .replace(/_+/g, "_")
                // CamelCase
                .split("_")
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join("");

            // Extract params
            const params: ParamDef[] = [];

            // Path-level parameters
            const pathParams = (paths[path]?.parameters || []) as any[];
            // Operation-level parameters
            const opParams = (operation.parameters || []) as any[];

            for (const p of [...pathParams, ...opParams]) {
                params.push({
                    name: p.name,
                    type: p.type || p.schema?.type || "string",
                    required: p.required ?? (p.in === "path"),
                    in: p.in as ParamDef["in"],
                    description: p.description,
                });
            }

            // For OpenAPI 3.x, extract request body params
            if (operation.requestBody) {
                const content = operation.requestBody.content;
                const jsonSchema = content?.["application/json"]?.schema;
                if (jsonSchema?.properties) {
                    for (const [propName, propDef] of Object.entries<any>(jsonSchema.properties)) {
                        params.push({
                            name: propName,
                            type: propDef.type || "string",
                            required: (jsonSchema.required || []).includes(propName),
                            in: "body",
                            description: propDef.description,
                        });
                    }
                }
            }

            // Build tags — combine operation tags + summary + description
            const tags = [
                ...(operation.tags || []),
                operation.summary || "",
                operation.description?.substring(0, 100) || "",
            ].filter(Boolean);

            endpoints.push({
                name,
                method: method.toUpperCase(),
                path,
                description: operation.summary || operation.description || name,
                tags,
                paramSchema: params,
            });
        }
    }

    return endpoints;
}

// ─── Metadata Derivation Helpers ────────────────────────────

/**
 * Derive supported_intents from HTTP method.
 * GET → DATA (most common), POST → ACTION, DELETE → ACTION, etc.
 */
function deriveIntentFromMethod(method: string): string {
    switch (method.toUpperCase()) {
        case "GET": return "DATA";
        case "POST": return "ACTION";
        case "PUT": return "ACTION";
        case "PATCH": return "ACTION";
        case "DELETE": return "ACTION";
        default: return "DATA";
    }
}

/**
 * Derive response_type from endpoint shape.
 * Endpoints with "list", "search", "all" in name/tags → "list"
 * Single-entity GET endpoints → "object"
 */
function deriveResponseType(ep: ImportedEndpoint): string {
    const hint = `${ep.name} ${ep.description} ${ep.tags.join(" ")}`.toLowerCase();
    if (/\b(list|search|all|find|query|index|browse|catalog|collection)\b/.test(hint)) return "list";
    if (/\b(image|photo|picture|avatar|thumbnail)\b/.test(hint)) return "image";
    if (/\b(article|wiki|text|content|description|readme)\b/.test(hint)) return "article";
    if (/\b(get|fetch|show|detail|single|by.?id)\b/.test(hint)) return "mixed";
    // Path heuristic: /items/{id} → mixed (single), /items → list
    if (/\{[^}]+\}/.test(ep.path)) return "mixed";
    if (ep.method === "GET") return "list";
    return "data";
}

// ─── Main Import Function ───────────────────────────────────

/**
 * Import an OpenAPI spec from a URL:
 * 1. Fetch and parse the spec
 * 2. Extract endpoints, auth, params
 * 3. Create capsules in DB
 * 4. Run enrichment on each capsule
 *
 * Returns ImportResult with summary + errors.
 */
export async function importOpenAPI(
    specUrl: string,
    apiKey: string,
    options?: {
        maxEndpoints?: number;
        groupName?: string;
    }
): Promise<ImportResult> {
    const spec = await fetchSpec(specUrl);

    const integrationName = options?.groupName || extractName(spec);
    const baseUrl = extractBaseUrl(spec);
    const authType = extractAuthType(spec);
    const allEndpoints = parseEndpoints(spec);

    // Limit endpoints if requested
    const maxEp = options?.maxEndpoints || 50;
    const endpoints = allEndpoints.slice(0, maxEp);

    // ─── Derive group-level metadata (once per import) ──────
    // Sidebar icon: favicon from base URL domain
    let sidebarIcon = "✨";
    if (baseUrl) {
        try {
            const hostname = new URL(baseUrl).hostname;
            const domain = hostname.replace(/^api\./i, "");
            const faviconOk = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
                method: "HEAD", signal: AbortSignal.timeout(2000),
            }).then(r => r.ok && (r.headers.get("content-length") ?? "999") !== "0")
                .catch(() => false);
            if (faviconOk) sidebarIcon = domain;
        } catch { /* use default */ }
    }

    // Sidebar label: short name (max 20 chars)
    const sidebarLabel = integrationName.length > 20
        ? integrationName.slice(0, 20).trim()
        : integrationName;

    // Description from spec
    const specDescription = spec.info?.description || `API integration for ${integrationName}`;

    // Default allowed blocks for API integrations
    const defaultAllowedBlocks = JSON.stringify([
        "title", "text", "divider", "spacer", "callout",
        "hero", "key_value", "metric_row", "stat_bar",
        "chip_list", "list", "badge_row", "link_list",
    ]);

    const errors: string[] = [];
    let created = 0;

    for (const ep of endpoints) {
        try {
            const fullUrl = `${baseUrl}${ep.path}`;
            const intentText = `${ep.name}: ${ep.description} ${ep.tags.join(" ")}`;

            // Check if capsule already exists
            const existing = await db.select().from(capsules).where(sql`name = ${ep.name}`);
            if (existing.length > 0) {
                continue;
            }

            // Create capsule
            const tagsStr = ep.tags.join(", ");
            const [inserted] = await db.insert(capsules).values({
                name: ep.name,
                intent_description: intentText,
                api_endpoint: fullUrl,
                is_auto_generated: true,
                http_method: ep.method,
                group_name: integrationName,
                param_schema: JSON.stringify(ep.paramSchema),
                api_config: authType !== "none"
                    ? JSON.stringify({ requiresAuth: true, authType })
                    : null,
                endpoint_tags: tagsStr,
                human_triggers: ep.tags.join(" | "),
                api_triggers: tagsStr,
                supported_intents: deriveIntentFromMethod(ep.method),
                response_type: deriveResponseType(ep),
                integration_type: "api",
                status: authType !== "none" ? "auth_needed" : "live",
                sidebar_icon: sidebarIcon,
                sidebar_label: sidebarLabel,
                allowed_blocks: defaultAllowedBlocks,
                template_category: "data",
                template_description: specDescription,
            }).returning();


            // Enrich with tags + embedding (non-blocking)
            try {
                await enrichIntegration({
                    integrationId: inserted.id,
                    name: ep.name,
                    intentDescription: intentText,
                    apiEndpoint: fullUrl,
                    groupName: integrationName,
                    httpMethod: ep.method,
                }, apiKey);
            } catch (enrichErr) {
                log.warn(`[OpenAPI] Enrichment failed for ${ep.name}:`, enrichErr);
            }

            created++;
        } catch (epErr) {
            const msg = `${ep.name}: ${epErr instanceof Error ? epErr.message : "Failed"}`;
            errors.push(msg);
        }
    }


    return {
        integrationName,
        baseUrl,
        authType,
        endpoints,
        created,
        errors,
    };
}
