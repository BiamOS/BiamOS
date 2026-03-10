// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
import { db } from "./db/db.js";
import { sql } from "drizzle-orm";

async function migrate() {
    try {
        await db.run(sql`ALTER TABLE capsules ADD COLUMN integration_type TEXT NOT NULL DEFAULT 'api'`);
        console.log("✅ Column integration_type added");
    } catch (e: any) {
        console.log("ℹ️", e.message);
    }
    process.exit(0);
}

migrate();
