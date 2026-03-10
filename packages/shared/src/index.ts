// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Shared Types & JSON Contract
// ============================================================

// ============================================================
// Intent Types (closed enum)
// ============================================================

export type IntentType = "ARTICLE" | "IMAGE" | "IMAGES" | "SEARCH" | "DATA" | "VIDEO" | "ACTION" | "NAVIGATE" | "TOOL";

// ============================================================
// API Request/Response Types
// ============================================================

/** POST /api/intent request body */
export interface IntentRequest {
    text: string;
    /** Optional: restrict matching to these group names (sidebar filter) */
    groups?: string[];
    /** Optional: existing cards on canvas for block targeting */
    existing_cards?: Array<{
        id: string;
        group_name?: string;
        integration_id?: string;
        query?: string;
    }>;
}

/** Error response shape */
export interface BiamErrorResponse {
    biam_protocol: "2.0";
    action: "error";
    message: string;
}

/** Successful single-intent layout response */
export interface BiamLayoutResponse {
    biam_protocol: "2.0";
    action: "render_layout";
    integration_id: string;
    layout: unknown;
    data?: unknown;
    _query: string;
    _intent?: { type: IntentType; entity: string };
    _resolved_params?: Record<string, string>;
    _group_name?: string;
    _api_endpoint?: string;
}

/** Multi-intent response (wraps multiple results) */
export interface BiamMultiResult {
    biam_protocol: "2.0";
    action: "multi_result";
    results: Array<BiamLayoutResponse | BiamErrorResponse>;
}

/** Clarification response — concierge asks user to refine query */
export interface BiamClarifyResponse {
    biam_protocol: "2.0";
    action: "clarify";
    question: string;
    suggestions: string[];
    original_query: string;
    matched_group?: string;
}

// ─── API Config Discriminated Union ─────────────────────────

export type ApiConfig =
    | { requiresAuth: false }
    | {
        requiresAuth: true;
        authType?: string;
        headerName?: string;
        authPrefix?: string;
        apiKey?: string;
    };

// ============================================================
// Integration Base Interface (shared FE/BE)
// ============================================================

export interface IntegrationBase {
    id: number;
    name: string;
    intent_description: string;
    api_endpoint: string;
    is_auto_generated: boolean;
    api_config: ApiConfig | null;
    group_name?: string | null;
    is_active: boolean;
    status: "live" | "pending" | "auth_needed" | "inactive";
    sidebar_icon?: string | null;
    sidebar_label?: string | null;
    integration_type?: string;
}

// ============================================================
// Agent Base Interface (shared FE/BE)
// ============================================================

export interface AgentBase {
    id: number;
    name: string;
    display_name: string;
    description: string;
    pipeline: string;
    step_order: number;
    prompt: string;
    model: string;
    is_active: boolean;
    temperature: number;
    max_tokens: number;
    total_calls: number;
    total_tokens_used: number;
}

