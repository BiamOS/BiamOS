// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Database Connection (libSQL / SQLite)
// ============================================================

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, "../../data");
const DB_PATH = resolve(DB_DIR, "BiamOS.db");

// Ensure the data directory exists
mkdirSync(DB_DIR, { recursive: true });

const client = createClient({
    url: `file:${DB_PATH}`,
});
console.log(`  📂 [DB] Using database: ${DB_PATH}`);

let _db = drizzle(client, { schema });

/**
 * Proxy that always delegates to the current `_db` reference.
 * This allows tests to swap in an in-memory DB via `__setDb()`.
 */
export const db: ReturnType<typeof drizzle> = new Proxy({} as any, {
    get(_target, prop) {
        return (_db as any)[prop];
    },
});

/**
 * Replace the DB instance (used only by tests).
 * @internal
 */
export function __setDb(newDb: any) {
    _db = newDb;
}

// ─── Auto-Migration: add columns if missing ─────────────────
// Safe to run every startup — ALTER TABLE with IF NOT EXISTS
// SQLite doesn't have IF NOT EXISTS for columns, so we catch errors.

async function ensureColumns() {
    const migrations = [
        "ALTER TABLE capsules ADD COLUMN allowed_blocks TEXT",
        "ALTER TABLE capsules ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE capsules ADD COLUMN template_category TEXT",
        "ALTER TABLE capsules ADD COLUMN template_description TEXT",
        "ALTER TABLE capsules ADD COLUMN status TEXT NOT NULL DEFAULT 'live'",
        "ALTER TABLE capsules ADD COLUMN integration_type TEXT NOT NULL DEFAULT 'api'",
        "ALTER TABLE capsules ADD COLUMN health_status TEXT DEFAULT 'unchecked'",
        "ALTER TABLE capsules ADD COLUMN health_reason TEXT",
        "ALTER TABLE capsules ADD COLUMN health_message TEXT",
        "ALTER TABLE capsules ADD COLUMN health_checked_at TEXT",
        "ALTER TABLE pinned_intents ADD COLUMN related_queries TEXT",
        "ALTER TABLE pinned_intents ADD COLUMN pin_type TEXT NOT NULL DEFAULT 'intent'",
        "ALTER TABLE pinned_intents ADD COLUMN url TEXT",
    ];
    for (const sql of migrations) {
        try {
            await client.execute(sql);
        } catch {
            // Column already exists — safe to ignore
        }
    }
}

ensureColumns().catch(() => { });

