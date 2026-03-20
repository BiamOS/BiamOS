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
        {
            version: "0.9.6",
            date: "2026-03-14",
            entries: JSON.stringify([
                { type: "feature", text: "Stream-into-Tab: second query for the same integration streams directly into a new tab instead of creating a separate card" },
                { type: "feature", text: "Backend group_hint SSE event: enables language-independent group matching (e.g. German 'wetter' correctly groups with English 'Weather' card)" },
                { type: "feature", text: "Webview dynamic width: iframe cards fill remaining row space; if row is >70% full, wraps to next row at full width" },
                { type: "feature", text: "Smart Card Sizing: content-aware width and height — cards start compact and only expand when content demands it" },
                { type: "improvement", text: "Card width default reduced from 3 to 2 columns for a more compact canvas layout" },
                { type: "improvement", text: "Card height capped at 18 grid rows (~70% viewport) — overflow content is scrollable" },
                { type: "improvement", text: "Streaming cards no longer jump in width when final result arrives" },
                { type: "improvement", text: "Pinned cards use smartCardSize for fallback dimensions instead of hardcoded values" },
                { type: "fix", text: "Delete All Data no longer removes changelog entries (system data preserved)" },
                { type: "fix", text: "LLM warning banner disappears after configuring API key (re-checks on settings close)" },
                { type: "fix", text: "Ollama and LM Studio providers no longer trigger the 'No API Key' warning" },
            ]),
        },
        {
            version: "0.9.7",
            date: "2026-03-14",
            entries: JSON.stringify([
                { type: "feature", text: "Per-Tab Webview Architecture: each tab now has its own independent webview (Chrome model) — no more shared state, reload flashes, or cross-tab contamination" },
                { type: "feature", text: "URL Omnibox search: suggestions now match both URL and page title (typing 'gmail' finds Gmail pages)" },
                { type: "improvement", text: "Tab switching is instant — no page reload, each tab preserves its own navigation history and scroll position" },
                { type: "improvement", text: "URL bar shows recent history when input is cleared (Chrome-like omnibox)" },
                { type: "improvement", text: "Pinned webview cards now save the active tab's URL instead of the first tab's URL" },
                { type: "fix", text: "Fixed double page load when navigating in webview (WebviewWithLogging no longer re-renders on URL prop changes)" },
                { type: "fix", text: "Fixed tab title updates contaminating other tabs within the same card" },
                { type: "fix", text: "Removed obsolete tab-switch code: lastUrlByTabRef, prevInitialUrlRef, activeTabIdxRef" },
            ]),
        },
        {
            version: "0.9.8",
            date: "2026-03-14",
            entries: JSON.stringify([
                { type: "feature", text: "AI Browser Agent: the Copilot can now click, type, and scroll inside any webview — type /act followed by a task to start (e.g. '/act find the most important email and open it')" },
                { type: "feature", text: "Agent Visual Overlay: pulsing cyan border, animated cursor dot at click targets, and status bar with step counter during agent activity" },
                { type: "feature", text: "Human-in-the-loop safety: agent pauses and asks for confirmation before sending, submitting, or deleting anything" },
                { type: "improvement", text: "Coordinate-based clicking (elementFromPoint) instead of CSS selectors — works reliably on complex SPAs like Gmail and YouTube" },
                { type: "improvement", text: "Contextual text composition: agent matches language, tone, and style of surrounding conversation when writing replies" },
                { type: "improvement", text: "Webview readiness polling: agent waits for page transitions to complete before interacting (handles Gmail/SPA navigation)" },
            ]),
        },
        {
            version: "1.0.0-alpha",
            date: "2026-03-14",
            entries: JSON.stringify([
                { type: "feature", text: "AI Agent — Background Web Search: new search_web tool lets the agent search the web (via DuckDuckGo) without leaving the current page — finds YouTube videos, news, and facts while staying on Gmail" },
                { type: "feature", text: "AI Agent — Go Back Navigation: new go_back tool acts like the browser back button, enabling multi-site flows (Gmail → YouTube → go_back → Gmail)" },
                { type: "feature", text: "AI Agent — Smart Email Composition: Tab-based navigation between form fields (To → Tab → Subject → Tab → Body) instead of unreliable coordinate clicking" },
                { type: "feature", text: "AI Agent — Search API Endpoint: POST /api/agents/search returns real web search results with clean, decoded URLs and descriptions" },
                { type: "improvement", text: "AI Agent — Auto-retry: if an element isn't editable yet (e.g. Gmail Subject after Tab), the agent waits 1.5s and retries automatically up to 3 times — saves 2+ LLM API calls per email" },
                { type: "improvement", text: "AI Agent — Anti-Loop Rules: strengthened prompt rules prevent the agent from re-typing text that's already been entered (was causing infinite loops)" },
                { type: "improvement", text: "AI Agent — Step Display: agent step results are now truncated to 80 chars in the sidebar for cleaner overview" },
                { type: "improvement", text: "Copilot sidebar: word-break/wrap for long text content — no more horizontal overflow" },
                { type: "improvement", text: "Navigation: switched from loadURL (blocked by Gmail's beforeunload) to window.location.href injected via executeJavaScript" },
                { type: "fix", text: "Navigate from Gmail: Gmail's draft save warning no longer blocks webview navigation" },
                { type: "fix", text: "DuckDuckGo search URLs are now decoded from redirect format to clean, readable links" },
            ]),
        },

        {
            version: "1.0.1-alpha",
            date: "2026-03-15",
            entries: JSON.stringify([
                { type: "feature", text: "AI Agent — Set-of-Mark Click System: each DOM element gets a numeric ID ([0], [1], [2]...). Agent now calls click(id: 7) instead of guessing x,y coordinates — dramatically more reliable" },
                { type: "feature", text: "AI Agent — Intelligent Page Readiness: replaced all hardcoded setTimeout waits (2.5s, 4s, 5s) with MutationObserver-based DOM silence detection — pages are ready in ~400ms instead of 5s" },
                { type: "feature", text: "AI Agent — take_notes Tool: agent can save observations before navigating away — notes persist in action history across page navigations, enabling multi-site research tasks" },
                { type: "feature", text: "AI Agent — Navigation Failure Detection: DNS errors and unreachable sites are now reported back to the agent instead of silently claiming success — prevents infinite retry loops" },
                { type: "improvement", text: "AI Agent — Pre-Flight Z-Index Check: agent verifies target element is topmost before clicking — detects cookie banners, modals, and overlays that would block the click" },
                { type: "improvement", text: "AI Agent — Hover Injection: dispatches mousemove → mouseenter → mouseover before click sequence — activates lazy-loaded handlers and hover-dependent UI elements" },
                { type: "improvement", text: "AI Agent — Compact DOM Format: snapshot output reduced by ~50% tokens (from JSON to text format with SoM IDs)" },
                { type: "improvement", text: "AI Agent — Planning Rules: agent now plans multi-step tasks, reads pages efficiently (max 4-5 steps), and uses search_web for unknown URLs instead of guessing" },
                { type: "improvement", text: "AI Agent — Safety: mandatory ask_user before any post/send/submit/delete action, screenshot verification after typing for error indicators (character limits, warnings)" },
                { type: "fix", text: "Context panel no longer clears agent progress when navigating between sites during an agent task" },
            ]),
        },

        {
            version: "1.1.0-alpha",
            date: "2026-03-16",
            entries: JSON.stringify([
                { type: "feature", text: "Agent Memory System: the AI agent now learns from verified tasks — stores workflows as 'muscle memory' and replays them as reflexes on similar future requests" },
                { type: "feature", text: "Memory Manager UI: new Settings → Memory panel shows all learned workflows with stat cards, expandable step details, verify/unverify toggle, delete, and clear all functions" },
                { type: "feature", text: "Semantic Intent Matching: agent recognizes similar tasks even with completely different wording (e.g. 'open YouTube and find newest KD CSapat video' matches 'show me latest KD CSapat video')" },
                { type: "feature", text: "Workflow Deduplication: similar verified workflows are automatically merged instead of creating duplicates — success count increases on the best existing workflow" },
                { type: "feature", text: "AI Agent — submit_after: new type_text flag that auto-presses Enter after typing — eliminates stuck search bar loops on YouTube, Twitter, Google" },
                { type: "feature", text: "AI Agent — Self-Healing Loop: when the agent repeats the same failing action twice, it auto-scrolls the page, injects a recovery instruction, and retries with a fresh approach instead of aborting" },
                { type: "improvement", text: "Cross-domain workflow lookup: semantic matching searches all domains, not just the current page's domain" },
                { type: "improvement", text: "Local embedding model (all-MiniLM-L6-v2) runs entirely on-device for semantic matching — no API calls needed" },
                { type: "improvement", text: "Agent prompt rule 27 updated: LLM now instructed to always use submit_after=true for search bars" },
                { type: "fix", text: "Memory API routes moved before /:name wildcard — GET /agents/memory was being caught by the agent name parameter route" },
                { type: "fix", text: "Intent hash now strips /act prefix before hashing — prevents command artifacts from interfering with workflow matching" },
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

    // Agent memory table (Local Action Memory — Phase 1)
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS agent_workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        intent_hash TEXT NOT NULL,
        intent_text TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        success_count INTEGER NOT NULL DEFAULT 1,
        fail_count INTEGER NOT NULL DEFAULT 0,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(domain, intent_hash)
      );
    `);

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

    // Agent memory V2: semantic embedding column
    try { await db.run(sql.raw(`ALTER TABLE agent_workflows ADD COLUMN intent_embedding TEXT DEFAULT ''`)); } catch { }

    // User prompt modules table (Prompt Library — Phase 3)
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS user_prompt_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        url_patterns TEXT NOT NULL,
        task_patterns TEXT,
        phases TEXT,
        rules TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'manual',
        source_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
}
