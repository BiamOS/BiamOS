// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — System Settings Schema
// ============================================================

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Stores system-wide settings as key-value pairs. */
export const systemSettings = sqliteTable("system_settings", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});
