// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Settings Types
// ============================================================
// Consolidated types shared between GeneralSettings and
// PersonalSettings panels.
// ============================================================

export interface AuditData {
    api_key: { stored: boolean; info: string };
    settings: { count: number; items: Array<{ key: string; value: string; sensitive: boolean }> };
    usage_logs: { count: number; last_query: { intent: string; date: string } | null; info: string };
    integrations: { count: number; info: string; items: Array<{ name: string; group: string; hasApiUrl: boolean; type: string }> };
    electron_session: { info: string; location: string };
}
