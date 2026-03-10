// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Types
// ============================================================

export interface TemplateEndpoint {
    name: string;
    method: string;
    path: string;
    intent_description: string;
    endpoint_tags: string;
    param_schema: string;
    response_type?: string;
    supported_intents?: string; // e.g. "DATA|SEARCH"
}

export interface IntegrationTemplate {
    id: string;
    name: string;
    icon: string;
    label: string;
    description: string;
    category: "data" | "content" | "tools" | "web";
    auth_type: "none" | "apikey" | "bearer";
    auth_hint?: string;
    endpoints: TemplateEndpoint[];
    human_triggers: string;
    allowed_blocks: string[];
}
