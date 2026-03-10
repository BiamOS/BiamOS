// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Database Migration (libSQL)
// ============================================================

import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./db.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("🔄 Running BiamOS database migrations...");

await migrate(db, {
    migrationsFolder: resolve(__dirname, "../../drizzle"),
});

console.log("✅ Migrations complete.");
process.exit(0);
