// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Database Bootstrap (Table Creation + Migrations)
// ============================================================
// Creates all required database tables on first run and applies
// column migrations for backwards compatibility. This module
// is idempotent — safe to call on every server start.
// ============================================================

import { sql } from "drizzle-orm";
import { db } from "./db.js";

// ─── Table Definitions ──────────────────────────────────────

const TABLE_CAPSULES = sql`
  CREATE TABLE IF NOT EXISTS capsules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    intent_description TEXT NOT NULL,
    api_endpoint TEXT NOT NULL,
    embedding TEXT,
    is_auto_generated INTEGER NOT NULL DEFAULT 0,
    api_config TEXT,
    group_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    endpoint_tags TEXT,
    normalized_tags TEXT,
    http_method TEXT NOT NULL DEFAULT 'GET',
    param_schema TEXT,
    group_embedding TEXT,
    sidebar_icon TEXT,
    sidebar_label TEXT,
    human_triggers TEXT,
    api_triggers TEXT,
    response_mapping TEXT,
    response_type TEXT,
    supported_intents TEXT,
    is_generic INTEGER NOT NULL DEFAULT 0
  );
`;

const TABLE_SYSTEM_SETTINGS = sql`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const TABLE_USAGE_LOGS = sql`
  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    intent TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    model_name TEXT NOT NULL
  );
`;

const TABLE_AGENTS = sql`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    pipeline TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash-lite',
    is_active INTEGER NOT NULL DEFAULT 1,
    temperature REAL NOT NULL DEFAULT 0,
    max_tokens INTEGER NOT NULL DEFAULT 200,
    total_calls INTEGER NOT NULL DEFAULT 0,
    total_tokens_used INTEGER NOT NULL DEFAULT 0
  );
`;

const TABLE_PINNED_INTENTS = sql`
  CREATE TABLE IF NOT EXISTS pinned_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    endpoint_id INTEGER,
    params TEXT,
    refresh_minutes INTEGER NOT NULL DEFAULT 15,
    last_data TEXT,
    last_layout TEXT,
    last_refreshed TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    related_queries TEXT,
    pin_type TEXT NOT NULL DEFAULT 'intent',
    url TEXT,
    created_at TEXT NOT NULL
  );
`;

const TABLE_SCRAPER_ENDPOINTS = sql`
  CREATE TABLE IF NOT EXISTS scraper_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    url_pattern TEXT NOT NULL,
    css_selector TEXT NOT NULL,
    xpath_selector TEXT,
    text_anchor TEXT,
    extract_type TEXT NOT NULL DEFAULT 'text',
    instruction TEXT,
    last_result TEXT,
    last_scraped TEXT,
    created_at TEXT NOT NULL
  );
`;

// ─── Column Migrations ──────────────────────────────────────
// Safe — fails silently if column already exists.
// Kept for backwards compatibility with pre-existing databases.

const CAPSULE_COLUMN_MIGRATIONS = [
    "embedding TEXT", "is_auto_generated INTEGER NOT NULL DEFAULT 0",
    "api_config TEXT", "group_name TEXT", "is_active INTEGER NOT NULL DEFAULT 1",
    "endpoint_tags TEXT", "normalized_tags TEXT", "http_method TEXT NOT NULL DEFAULT 'GET'",
    "param_schema TEXT", "group_embedding TEXT", "sidebar_icon TEXT", "sidebar_label TEXT",
    "human_triggers TEXT", "api_triggers TEXT", "response_mapping TEXT",
    "response_type TEXT", "supported_intents TEXT", "is_generic INTEGER NOT NULL DEFAULT 0",
    "status TEXT NOT NULL DEFAULT 'live'",
    "integration_type TEXT NOT NULL DEFAULT 'api'",
    "health_status TEXT DEFAULT 'unchecked'",
    "health_reason TEXT",
    "allowed_blocks TEXT",
] as const;

const PINNED_COLUMN_MIGRATIONS = [
    "related_queries TEXT",
    "pin_type TEXT NOT NULL DEFAULT 'intent'",
    "url TEXT",
] as const;

// ─── Bootstrap Entry Point ──────────────────────────────────

/**
 * Idempotent database bootstrap:
 * 1. Creates all tables (IF NOT EXISTS)
 * 2. Applies column migrations (ALTER TABLE ADD COLUMN, silent on conflict)
 */
export async function bootstrapDatabase(): Promise<void> {
    // Create tables
    await db.run(TABLE_CAPSULES);
    await db.run(TABLE_SYSTEM_SETTINGS);
    await db.run(TABLE_USAGE_LOGS);
    await db.run(TABLE_AGENTS);
    await db.run(TABLE_PINNED_INTENTS);
    await db.run(TABLE_SCRAPER_ENDPOINTS);

    // Changelog table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        date TEXT NOT NULL,
        entries TEXT NOT NULL,
        created_at TEXT
      );
    `);

    // Column migrations
    for (const col of CAPSULE_COLUMN_MIGRATIONS) {
        try { await db.run(sql.raw(`ALTER TABLE capsules ADD COLUMN ${col}`)); } catch { }
    }
    for (const col of PINNED_COLUMN_MIGRATIONS) {
        try { await db.run(sql.raw(`ALTER TABLE pinned_intents ADD COLUMN ${col}`)); } catch { }
    }
}
