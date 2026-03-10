// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Hono Backend Server
// ============================================================
// Slim orchestrator: bootstraps DB, runs self-healing, mounts
// route modules, starts the HTTP server. All business logic
// lives in routes/ and services/.
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { bootstrapDatabase } from "./db/bootstrap.js";
import { runSelfHealing, runBackgroundTasks } from "./self-healing.js";
import { integrationRoutes } from "./routes/integration-routes.js";
import { builderRoutes } from "./routes/builder-routes.js";
import { intentRoutes } from "./routes/intent-routes.js";
import { systemRoutes } from "./routes/system-routes.js";
import { blockRoutes } from "./routes/block-routes.js";
import { agentRoutes } from "./routes/agent-routes.js";
import { pinnedRoutes, refreshAllPins } from "./routes/pinned-routes.js";
import { contextRoutes } from "./routes/context-routes.js";
import { summarizeRoutes } from "./routes/summarize-routes.js";
import { selectorRoutes } from "./routes/selector-routes.js";
import { autopilotRoutes } from "./routes/autopilot-routes.js";
import { db } from "./db/db.js";
import { agents } from "./db/schema.js";
import { sql, eq } from "drizzle-orm";
import { log } from "./utils/logger.js";

// ─── Ensure Required Pipeline Agents ────────────────────────
// Auto-inserts agents needed by the intent pipeline if missing.
// This runs on every server startup to prevent pipeline failures.

async function ensureRequiredAgents() {
    const REQUIRED = [
        {
            name: "classifier",
            display_name: "🏷️ Intent Classifier",
            description: "Classifies user intent into type + entity",
            pipeline: "intent",
            step_order: 2,
            model: "google/gemini-2.5-flash-lite",
            prompt: `You are an intent classifier for a multi-API dashboard. Classify the user's query into type + entity.
OUTPUT FORMAT (JSON only):
{"type": "DATA|SEARCH|ARTICLE|IMAGE|IMAGES|VIDEO|ACTION|NAVIGATE|TOOL", "entity": "extracted entity", "modifier": null}
TYPE RULES:
- DATA: retrieving specific data points (weather, prices, stats, metrics)
- SEARCH: finding items in a list/catalog (search results, listings)
- ARTICLE: detailed information about a topic (wiki, documentation)
- IMAGE: single image request
- IMAGES: multiple images/gallery
- VIDEO: video content
- ACTION: performing an action (send, create, update, delete)
- NAVIGATE: open a website/URL
- TOOL: open an interactive tool (calculator, converter)
ENTITY EXTRACTION:
- Extract the core subject, stripping action words (show, get, find)
- Preserve proper nouns exactly as typed
- Include location/context if relevant (e.g. "weather Vienna" → entity: "Vienna")
Output ONLY valid JSON, nothing else.`,
        },
        {
            name: "param-extractor",
            display_name: "📋 Param Extractor",
            description: "Extracts API parameters from user entity based on endpoint param_schema",
            pipeline: "intent",
            step_order: 4,
            model: "google/gemini-2.5-flash-lite",
            prompt: `You are a parameter extractor. Given an entity and an API endpoint's parameter schema, extract the correct parameter values.
RULES:
1. Output ONLY a JSON object with parameter names as keys and extracted values as strings.
2. For location/city parameters: extract the city/location name from the entity.
3. For search/query parameters: use the relevant part of the entity as the search term.
4. Strip action words (show, get, find, search) — keep only the data subject.
5. Preserve proper nouns exactly as typed.
6. If a parameter has options, pick the closest match.
7. For date parameters, use ISO format (YYYY-MM-DD).
Output ONLY valid JSON, nothing else.`,
        },
    ];

    let inserted = 0;
    for (const agent of REQUIRED) {
        try {
            const existing = await db.select({ name: agents.name }).from(agents).where(eq(agents.name, agent.name));
            if (existing.length === 0) {
                await db.run(sql`INSERT INTO agents (name, display_name, description, pipeline, step_order, prompt, model, is_active, temperature, max_tokens, total_calls, total_tokens_used) VALUES (${agent.name}, ${agent.display_name}, ${agent.description}, ${agent.pipeline}, ${agent.step_order}, ${agent.prompt}, ${agent.model}, 1, 0, 256, 0, 0)`);
                log.info(`  ✅ Auto-inserted missing agent: ${agent.display_name}`);
                inserted++;
            }
        } catch (err) {
            log.error(`  ⚠️ Failed to ensure agent "${agent.name}":`, err);
        }
    }
    if (inserted === 0) {
        log.info(`  ✅ All required pipeline agents present`);
    }
}

// ─── App Setup ──────────────────────────────────────────────

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin?.startsWith("http://localhost") ? origin : "http://localhost:5173",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })
);

// ─── Health Check ───────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({ status: "ok", protocol: "BiamOS 1.0" });
});

// ─── Mount Route Modules ────────────────────────────────────

app.route("/api/integrations", integrationRoutes);
app.route("/api/builder", builderRoutes);
app.route("/api/intent", intentRoutes);
app.route("/api/system", systemRoutes);
app.route("/api/blocks", blockRoutes);
app.route("/api/agents", agentRoutes);
app.route("/api/pinned", pinnedRoutes);
app.route("/api/context", contextRoutes);
app.route("/api/scrape", summarizeRoutes);
app.route("/api/scrapers", selectorRoutes);
app.route("/api/autopilot", autopilotRoutes);

// Changelog
import { changelogRoutes } from "./routes/changelog-routes.js";
app.route("/api/changelog", changelogRoutes);

// ─── Start Server ───────────────────────────────────────────

const PORT = 3001;

log.info(`
╔══════════════════════════════════════════════╗
║       BiamOS — Backend Server                ║
║       Base for Intent & AI Middleware         ║
╚══════════════════════════════════════════════╝
`);

bootstrapDatabase()
  .then(() => runSelfHealing())
  .then(() => ensureRequiredAgents())
  .then(() => {
    serve(
      { fetch: app.fetch, port: PORT },
      (info) => {
        log.info(`🚀 Server running at http://localhost:${info.port}`);
      }
    );

    // Background: Pin refresh timer (every 15 minutes)
    setInterval(() => {
      refreshAllPins().catch((err) => {
        log.warn("[Pinned] Background refresh error:", err);
      });
    }, 15 * 60 * 1000);

    // Background: Embedding health check (non-blocking)
    runBackgroundTasks().catch(() => {});
  });
