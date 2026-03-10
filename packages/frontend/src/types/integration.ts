// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Types
// ============================================================
// Consolidated types for integration-related components.
// ============================================================

import type { IntegrationBase } from "@biamos/shared";

// ─── Status Config (shared across Card, EditModal, GroupCard) ─

export const STATUS_CONFIG = {
    live: { color: "#00dc64", label: "Live" },
    pending: { color: "#ffb300", label: "Pending" },
    auth_needed: { color: "#ff5252", label: "Auth Needed" },
    inactive: { color: "#666", label: "Inactive" },
} as const;

export type IntegrationStatus = keyof typeof STATUS_CONFIG;

// ─── Health Status ───────────────────────────────────────────

export const HEALTH_COLORS = {
    healthy: { color: "#00dc64", label: "Healthy" },
    degraded: { color: "#ffb300", label: "Degraded" },
    offline: { color: "#ff5252", label: "Offline" },
    unchecked: { color: "#666", label: "Unchecked" },
} as const;

export type HealthStatusType = keyof typeof HEALTH_COLORS;

// ─── Integration Item (DB row + computed fields) ─────────────

export interface IntegrationItem extends IntegrationBase {
    has_embedding: boolean;
    human_triggers?: string | null;
    http_method?: string;
    status: IntegrationStatus;
    health_status?: HealthStatusType;
    health_message?: string | null;
    health_checked_at?: string | null;
    integration_type?: "api" | "web";
    allowed_blocks?: string[] | null;
}

// ─── Filter Type ─────────────────────────────────────────────

export type FilterType = "all" | "auth" | "noauth" | "auto" | "manual";

// ─── Display Item (grouped or single, for grid rendering) ────

export type DisplayItem =
    | { kind: "group"; groupName: string; integrations: IntegrationItem[] }
    | { kind: "single"; integration: IntegrationItem };

// ─── Health Result ───────────────────────────────────────────

export interface HealthResult {
    status: string;
    responseTime: number;
    message?: string;
}

// ─── Health History Entry ────────────────────────────────────

export interface HealthHistoryEntry {
    status: string;
    response_time: number;
    checked_at: string;
}
