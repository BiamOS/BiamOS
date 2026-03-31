// BiamOS — Kinetic Sonar Memory Reset
// Clears ONLY: agent_workflows + domain_knowledge
// Keeps: integrations, settings, agents, usage_logs, pinned intents
// Run: npm run tsx reset-memory.ts  (from packages/backend/)

import { db } from "./src/db/db.js";
import { sql } from "drizzle-orm";

console.log("\n🔊 Kinetic Sonar — Memory Reset\n" + "═".repeat(40));

// 1. Clear all learned workflows (DOM-era, poisoned)
const wfBefore = await db.run(sql`SELECT COUNT(*) as n FROM agent_workflows`);
await db.run(sql`DELETE FROM agent_workflows`);
await db.run(sql`DELETE FROM sqlite_sequence WHERE name = 'agent_workflows'`);
console.log(`   ✅ agent_workflows cleared`);

// 2. Clear all domain knowledge (Base Rules, Learned, Knowledge tabs)
const dkBefore = await db.run(sql`SELECT COUNT(*) as n FROM domain_knowledge`);
await db.run(sql`DELETE FROM domain_knowledge`);
await db.run(sql`DELETE FROM sqlite_sequence WHERE name = 'domain_knowledge'`);
console.log(`   ✅ domain_knowledge cleared`);

console.log("\n" + "═".repeat(40));
console.log("✅ Memory Tabula Rasa. Bereit für erste Kinetic Sonar Runs.");
console.log("   Integrations, Settings, Agents: UNBERÜHRT.");
console.log("═".repeat(40) + "\n");

process.exit(0);
