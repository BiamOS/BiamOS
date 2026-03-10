import { db } from "./db/db.js";
import { sql } from "drizzle-orm";

async function migrate() {
    try {
        await db.run(sql`ALTER TABLE capsules ADD COLUMN integration_type TEXT NOT NULL DEFAULT 'api'`);
        console.log("✅ Column integration_type added");
    } catch (e) {
        console.log("ℹ️", e.message);
    }
    process.exit(0);
}

migrate();
