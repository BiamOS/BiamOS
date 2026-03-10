// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Database Reset Script
// ============================================================
// Wipes all integrations and usage logs.
// Run with: npx tsx reset-db.ts
// ============================================================

import { db } from "./src/db/db.js";
import { sql } from "drizzle-orm";

console.log("🗑️  Resetting BiamOS database...\n");

// Clear all integrations
await db.run(sql`DELETE FROM capsules`);
console.log("   ✅ All integrations deleted.");

// Clear usage logs  
await db.run(sql`DELETE FROM usage_logs`);
console.log("   ✅ All usage logs deleted.");

// Reset auto-increment counters
await db.run(sql`DELETE FROM sqlite_sequence WHERE name IN ('capsules', 'usage_logs')`);
console.log("   ✅ Auto-increment counters reset.");

console.log("\n" + "═".repeat(40));
console.log("✅ Database wiped. Ready for fresh start.");
console.log("═".repeat(40));
