// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// Enrichment script — generates embeddings + normalized tags for all seeded integrations
import { db } from "./src/db/db.js";
import { integrations, systemSettings } from "./src/db/schema.js";
import { enrichIntegration } from "./src/services/enrichment-service.js";
import { eq } from "drizzle-orm";

// Get API key the same way server.ts does
let apiKey = "";
try {
    const rows = await db.select().from(systemSettings).where(eq(systemSettings.key, "OPENROUTER_API_KEY")).limit(1);
    if (rows.length > 0 && rows[0].value) apiKey = rows[0].value;
} catch { }
if (!apiKey) {
    apiKey = process.env.OPENROUTER_API_KEY ?? "";
}
console.log("🔑 API key ready.\n");

const allIntegrations = await db.select().from(integrations);
console.log(`🔄 Enriching ${allIntegrations.length} integrations...\n`);

let success = 0;
let failed = 0;

for (const int of allIntegrations) {
    // Skip if already enriched
    if (cap.group_embedding) {
        console.log(`   ⏭️  ${cap.group_name} → ${cap.name} (already enriched)`);
        success++;
        continue;
    }

    try {
        await enrichIntegration({
            integrationId: cap.id,
            name: cap.name,
            intentDescription: cap.intent_description,
            apiEndpoint: cap.api_endpoint,
            groupName: cap.group_name || cap.name,
            httpMethod: cap.http_method || "GET",
        }, apiKey);
        success++;
        console.log(`   ✅ ${cap.group_name} → ${cap.name}`);
    } catch (err) {
        failed++;
        console.log(`   ❌ ${cap.name}: ${err instanceof Error ? err.message : err}`);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
}

console.log(`\n══════════════════════════════════════════════════`);
console.log(`✅ Enriched: ${success}/${allIntegrations.length} (${failed} failed)`);
console.log(`══════════════════════════════════════════════════\n`);
