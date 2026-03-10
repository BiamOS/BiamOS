// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Health Checks Schema
// ============================================================

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Stores health check history for integration endpoints. */
export const healthChecks = sqliteTable("health_checks", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    integration_id: integer("integration_id").notNull(),
    group_name: text("group_name"),
    status: text("status").notNull(),
    response_time: integer("response_time"),
    status_code: integer("status_code"),
    message: text("message"),
    checked_at: text("checked_at").notNull(),
});

export type HealthCheck = typeof healthChecks.$inferSelect;
