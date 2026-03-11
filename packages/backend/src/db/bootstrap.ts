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
    is_generic INTEGER NOT NULL DEFAULT 0,
    health_message TEXT,
    health_checked_at TEXT,
    is_template INTEGER NOT NULL DEFAULT 0,
    template_category TEXT,
    template_description TEXT
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

const TABLE_HEALTH_CHECKS = sql`
  CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_id INTEGER NOT NULL,
    group_name TEXT,
    status TEXT NOT NULL,
    response_time INTEGER,
    status_code INTEGER,
    message TEXT,
    checked_at TEXT NOT NULL
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
    "health_message TEXT",
    "health_checked_at TEXT",
    "allowed_blocks TEXT",
    "is_template INTEGER NOT NULL DEFAULT 0",
    "template_category TEXT",
    "template_description TEXT",
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
    await db.run(TABLE_HEALTH_CHECKS);
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

    // Seed default changelog entries (only on first run)
    // Seed changelog entries — insert any that don't exist yet
    // (idempotent: skips entries whose version+date already exist)
    const SEED_CHANGELOG = [
        {
            version: "0.9.0",
            date: "2026-03-08",
            entries: JSON.stringify([
                { type: "feature", text: "Added Changelog panel with timeline UI and version tracking" },
                { type: "feature", text: "Version badge (v0.9.0) displayed in BiamOS header bar" },
            ]),
        },
        {
            version: "0.9.0",
            date: "2026-03-10",
            entries: JSON.stringify([
                { type: "feature", text: "Copilot Buddy: Completely rewritten system prompt - now acts as a smart research buddy with source links, proper formatting, and quantity-aware answers" },
                { type: "feature", text: "Copilot Buddy: Answers now include clickable source links (like deep research) for every web search result" },
                { type: "feature", text: "Copilot Buddy: Quantity Rule - asking for 'top 10' now returns exactly 10 items as a numbered list" },
                { type: "feature", text: "Copilot Buddy: max_tokens increased from 800 to 1500+ for longer, more detailed answers" },
                { type: "feature", text: "BiamOS Assistant: Now describes all 3 capabilities (API integrations, web browser, AI copilot) when asked 'what can you do?'" },
                { type: "feature", text: "BiamOS Assistant: Added language rule - responds in the same language the user writes in" },
            ]),
        },
        {
            version: "0.9.2",
            date: "2026-03-10",
            entries: JSON.stringify([
                { type: "feature", text: "Copilot shows a friendly message when no specific context is detected on a page" },
                { type: "feature", text: "Privacy notice: Auto-analysis paused with clear explanation instead of blocked warning" },
                { type: "feature", text: "Open as Card button only shows for integration-backed hints" },
                { type: "feature", text: "Webview session persistence: logins now survive app restarts" },
                { type: "improvement", text: "Context sidebar clears properly when navigating to a new URL in the same tab" },
            ]),
        },
        {
            version: "0.9.3",
            date: "2026-03-10",
            entries: JSON.stringify([
                { type: "feature", text: "Webview-only zoom: Ctrl+Scroll and Ctrl+/- now only zoom the website content, sidebar stays fixed" },
                { type: "feature", text: "Zoom percentage indicator in browser toolbar (click to reset)" },
                { type: "feature", text: "Browser toolbar: larger icons and text for better readability" },
                { type: "feature", text: "Onboarding: new AI-Native Workspace OS story across all 4 slides" },
                { type: "feature", text: "Onboarding: Ollama, LM Studio, and Custom providers marked as not yet tested" },
                { type: "feature", text: "LLM warning: red indicator dot on Settings sidebar when no AI provider is configured" },
                { type: "feature", text: "LLM warning: setup prompt above search bar when no API key is set" },
                { type: "improvement", text: "Delete All Data now also clears pinned blocks, scraper endpoints, and changelog" },
                { type: "improvement", text: "Page reloads after data purge to fully reset the UI" },
                { type: "improvement", text: "Empty integration sidebar shows a subtle placeholder instead of being blank" },
                { type: "fix", text: "All 8 agents are now auto-seeded on fresh install (previously only 2)" },
                { type: "fix", text: "Changelog entries are pre-populated on first startup" },
            ]),
        },
        {
            version: "0.9.4",
            date: "2026-03-11",
            entries: JSON.stringify([
                { type: "fix", text: "Fresh install: health_checks table is now auto-created on first startup (previously caused 500 error on Integrations page)" },
                { type: "fix", text: "Fresh install: missing capsule columns (health_message, health_checked_at, is_template, template_category, template_description) added to bootstrap" },
                { type: "improvement", text: "Database bootstrap now creates all tables needed for a fully working fresh install" },
                { type: "improvement", text: "Changelog entries are now auto-synced on every startup (new versions appear without needing a fresh DB)" },
            ]),
        },
        {
            version: "0.9.5",
            date: "2026-03-11",
            entries: JSON.stringify([
                { type: "feature", text: "Browsing History: webview navigations are now tracked with URL, title, favicon, and visit count" },
                { type: "feature", text: "URL Autocomplete: clicking the URL bar shows recent history as suggestions, typing filters live" },
                { type: "feature", text: "History button (🕐) in webview toolbar shows full browsing history dropdown" },
                { type: "feature", text: "Refresh button (🔄) on all canvas cards: manually re-fetch fresh API data with one click" },
                { type: "feature", text: "Pinned cards auto-refresh: stale data is automatically updated based on refresh_minutes interval" },
                { type: "feature", text: "Copilot suggestion chips: auto-detected context now shows as compact clickable chips instead of cards" },
                { type: "feature", text: "Clear Chat button: clears manual chat messages while keeping auto-detected suggestions" },
                { type: "improvement", text: "Pinned dashboard polls backend every 60s, only refreshes pins older than their refresh_minutes" },
                { type: "improvement", text: "Startup auto-refresh: stale pinned cards refresh 3 seconds after app start" },
                { type: "improvement", text: "Debug logs now OFF by default — enable via localStorage.setItem('biamos_debug', '1')" },
                { type: "fix", text: "Copilot chat no longer clears unexpectedly when switching tabs or during auto-detection cycles" },
                { type: "fix", text: "Context Engine confidence threshold lowered to 0.4 for better suggestion detection" },
                { type: "fix", text: "Duplicate 'Copy' button removed from Copilot sidebar" },
            ]),
        },
    ];

    for (const entry of SEED_CHANGELOG) {
        const exists = await db.get<{ cnt: number }>(sql`SELECT COUNT(*) as cnt FROM changelog WHERE version = ${entry.version} AND date = ${entry.date}`);
        if (!exists || exists.cnt === 0) {
            await db.run(sql`INSERT INTO changelog (version, date, entries, created_at) VALUES (${entry.version}, ${entry.date}, ${entry.entries}, ${new Date().toISOString()})`);
        } else {
            // Update existing entry with latest content (in case types/text were corrected)
            await db.run(sql`UPDATE changelog SET entries = ${entry.entries} WHERE version = ${entry.version} AND date = ${entry.date}`);
        }
    }

    // Browsing history table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS browsing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT DEFAULT '',
        hostname TEXT DEFAULT '',
        visit_count INTEGER DEFAULT 1,
        last_visited TEXT NOT NULL,
        created_at TEXT NOT NULL
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
