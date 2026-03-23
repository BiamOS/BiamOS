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

// Additional hoisted routes
import { changelogRoutes } from "./routes/changelog-routes.js";
import { historyRoutes } from "./routes/history-routes.js";
import { researchRoutes } from "./routes/research-routes.js";
import { classifyRoutes } from "./routes/classify-routes.js";
import { universalRouter } from "./routes/universal-router.js";
import { promptModuleRoutes } from "./routes/prompt-module-routes.js";
import { chatRoutes } from "./routes/chat-routes.js";

import { db } from "./db/db.js";
import { agents } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { log } from "./utils/logger.js";
import { SEED_AGENTS } from "./agents/agent-defaults.js";

// ─── Ensure All Pipeline Agents ─────────────────────────────
// Auto-inserts ALL agents from SEED_AGENTS if missing.
// This runs on every server startup so fresh installs get the
// full agent set without needing a manual `npm run db:seed`.

async function ensureRequiredAgents() {
    let inserted = 0;
    for (const agent of SEED_AGENTS) {
        try {
            const existing = await db.select({ name: agents.name }).from(agents).where(eq(agents.name, agent.name));
            if (existing.length === 0) {
                await db.insert(agents).values(agent);
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
    origin: (origin) => {
        if (!origin || origin === "null" || origin.startsWith("file://")) return "*";
        return origin.startsWith("http://localhost") ? origin : "http://localhost:5173";
    },
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

// Specific Intent Routes MUST come before generic "/api/intent"
app.route("/api/intent/classify", classifyRoutes);
app.route("/api/intent/route", universalRouter);
app.route("/api/intent", intentRoutes);

app.route("/api/system", systemRoutes);
app.route("/api/blocks", blockRoutes);
app.route("/api/agents", agentRoutes);
app.route("/api/pinned", pinnedRoutes);
app.route("/api/context", contextRoutes);
app.route("/api/scrape", summarizeRoutes);
app.route("/api/scrapers", selectorRoutes);
app.route("/api/autopilot", autopilotRoutes);
app.route("/api/changelog", changelogRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/research", researchRoutes);
app.route("/api/prompt-modules", promptModuleRoutes);
app.route("/api/chat", chatRoutes);

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
  .then(async () => {
    // Load user-created prompt modules from DB into the assembler
    const { loadUserModules } = await import("./prompt-modules/prompt-assembler.js");
    await loadUserModules();
  })
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

    // Background: Pre-load embedding model for semantic intent matching
    import("./services/embedding.js").then(m => m.preloadModel()).catch(() => {});
  })
  .catch((err) => {
      log.error("❌ FATAL: Server failed to start!", err);
      process.exit(1);
  });
