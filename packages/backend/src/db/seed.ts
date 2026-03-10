// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Database Seed (Integrations + Agents)
// ============================================================
// Seeds both the legacy integration library AND the new
// multi-agent pipeline with 4 default agents (Smart Router replaced 3).
// ============================================================

import { db } from "./db.js";
import { agents } from "./schema.js";
import { SEED_AGENTS } from "../agents/agent-defaults.js";

// ─── Seed Function ──────────────────────────────────────────

async function seed() {
    console.log("🌱 Seeding BiamOS agents...\n");
    console.log("\n  🤖 Agents:");
    for (const agent of SEED_AGENTS) {
        await db
            .insert(agents)
            .values(agent)
            .onConflictDoUpdate({
                target: agents.name,
                set: {
                    prompt: agent.prompt,
                    model: agent.model,
                    temperature: agent.temperature,
                    max_tokens: agent.max_tokens,
                },
            });
        console.log(`    ✅ ${agent.display_name} (${agent.pipeline} #${agent.step_order})`);
    }

    console.log("\n🎉 Seeding complete.");
    process.exit(0);
}

seed();
