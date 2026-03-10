// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Drizzle ORM Schema (Barrel Re-export)
// ============================================================
// All table definitions live in ./schema/ subdirectory.
// This barrel file re-exports everything for backwards
// compatibility — existing imports of "../db/schema.js" still work.
// ============================================================

export { capsules } from "./schema/capsule.schema.js";
export type { Integration, NewIntegration } from "./schema/capsule.schema.js";

export { agents } from "./schema/agent.schema.js";
export type { Agent, NewAgent } from "./schema/agent.schema.js";

export { systemSettings } from "./schema/settings.schema.js";

export { usageLogs } from "./schema/usage.schema.js";

export { pinnedIntents } from "./schema/pinned.schema.js";
export type { PinnedIntent, NewPinnedIntent } from "./schema/pinned.schema.js";

export { scraperEndpoints } from "./schema/scraper.schema.js";
export type { ScraperEndpoint, NewScraperEndpoint } from "./schema/scraper.schema.js";

export { healthChecks } from "./schema/health.schema.js";
export type { HealthCheck } from "./schema/health.schema.js";

export { changelog } from "./schema/changelog.schema.js";
export type { ChangelogEntry, NewChangelogEntry } from "./schema/changelog.schema.js";
