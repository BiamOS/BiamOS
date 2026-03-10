// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Request Validation Schemas (Zod)
// ============================================================
// Centralized input validation for all API routes.
// Used with @hono/zod-validator middleware.
// ============================================================

import { z } from "zod";

// ─── Intent Routes ──────────────────────────────────────────

export const intentSchema = z.object({
    text: z.string().min(1, "text is required"),
    groups: z.array(z.string()).optional(),
    existing_cards: z.array(z.object({
        id: z.string(),
        group_name: z.string().optional(),
        integration_id: z.string().optional(),
        query: z.string().optional(),
    })).optional(),
});

// ─── Builder Routes ─────────────────────────────────────────

export const magicFillSchema = z.object({
    tool_name: z.string().trim().min(1, "tool_name is required"),
});

export const importOpenApiSchema = z.object({
    specUrl: z.string().url("specUrl must be a valid URL"),
    groupName: z.string().optional(),
});

export const buildSchema = z.object({
    name: z.string().min(1, "name is required"),
    intent: z.string().min(1, "intent is required"),
    apiEndpoint: z.string().optional(),
    authMethod: z.string().optional(),
    triggers: z.array(z.string()).optional(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
    apiConfig: z.record(z.string(), z.unknown()).optional(),
    groupName: z.string().optional(),
    sidebarIcon: z.string().optional(),
    sidebarLabel: z.string().optional(),
    humanTriggers: z.string().optional(),
    apiTriggers: z.string().optional(),
    paramSchema: z.any().optional(),
    endpointTags: z.string().optional(),
    responseType: z.string().optional(),
    supportedIntents: z.string().optional(),
    allowedBlocks: z.array(z.string()).optional(),
});

// ─── Block Routes ───────────────────────────────────────────

export const validateCodeSchema = z.object({
    code: z.string().min(1, "code is required"),
});

export const generateBlockSchema = z.object({
    name: z.string().optional(),
    category: z.string().optional(),
    description: z.string().min(1, "description is required"),
    existingCode: z.string().optional(),
    modification: z.string().optional(),
});

export const createBlockSchema = z.object({
    type: z.string().min(1, "type is required"),
    component: z.string().min(1, "component is required"),
    category: z.string().min(1, "category is required"),
    description: z.string().min(1, "description is required"),
    code: z.string().min(1, "code is required"),
});

export const saveSourceSchema = z.object({
    source: z.string().min(1, "source is required"),
});

// ─── System Routes ──────────────────────────────────────────

export const setApiKeySchema = z.object({
    key: z.string().min(1, "API key is required"),
});

// ─── Integration Routes ─────────────────────────────────────

export const patchIntegrationSchema = z.object({
    name: z.string().min(1).optional(),
    intent_description: z.string().optional(),
    api_endpoint: z.string().optional(),
    api_config: z.record(z.string(), z.unknown()).nullable().optional(),
    group_name: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    status: z.enum(["live", "pending", "auth_needed", "inactive"]).optional(),
    sidebar_icon: z.string().nullable().optional(),
    sidebar_label: z.string().nullable().optional(),
    allowed_blocks: z.array(z.string()).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
});

export const createIntegrationSchema = z.object({
    name: z.string().min(1, "name is required"),
    intent_description: z.string().default(""),
    api_endpoint: z.string().min(1, "api_endpoint is required"),
    http_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    group_name: z.string().nullable().optional(),
    sidebar_icon: z.string().nullable().optional(),
    sidebar_label: z.string().nullable().optional(),
    human_triggers: z.string().nullable().optional(),
    api_triggers: z.string().nullable().optional(),
    param_schema: z.string().nullable().optional(),
    endpoint_tags: z.string().nullable().optional(),
    response_mapping: z.string().nullable().optional(),
    api_config: z.record(z.string(), z.unknown()).nullable().optional(),
    integration_type: z.enum(["api", "web"]).default("api"),
    is_active: z.boolean().default(true),
    status: z.enum(["live", "pending", "auth_needed", "inactive"]).optional(),
});

export const importBiamSchema = z.object({
    lura_format: z.string(),
    integration: z.object({
        name: z.string().min(1),
        intent_description: z.string().min(1),
        api_endpoint: z.string().min(1),
        api_config: z.any().nullable().optional(),
    }),
});

// ─── Agent Routes ───────────────────────────────────────────

export const updateAgentSchema = z.object({
    prompt: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    is_active: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().min(1).max(16384).optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
});
