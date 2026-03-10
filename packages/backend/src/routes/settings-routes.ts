// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Settings Routes
// ============================================================
// CRUD for system_settings key-value store + data audit/purge.
// ============================================================

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { usageLogs, systemSettings, capsules } from "../db/schema.js";
import { log } from "../utils/logger.js";

const settingsRoutes = new Hono();

// ─── GET /settings — Read all settings ──────────────────────

settingsRoutes.get("/", async (c) => {
    try {
        const rows = await db.select().from(systemSettings);
        const settings: Record<string, string> = {};
        for (const row of rows) {
            if (row.key !== "OPENROUTER_API_KEY") {
                settings[row.key] = row.value;
            }
        }
        return c.json({ settings });
    } catch (err) {
        return c.json({ error: "Failed to load settings" }, 500);
    }
});

// ─── POST /settings — Update a single setting ──────────────

settingsRoutes.post("/", async (c) => {
    try {
        const body = await c.req.json<{ key: string; value: string }>();
        if (!body.key || typeof body.value !== "string") {
            return c.json({ error: "key and value required" }, 400);
        }

        await db.run(sql`
            INSERT INTO system_settings (key, value) VALUES (${body.key}, ${body.value})
            ON CONFLICT(key) DO UPDATE SET value = ${body.value}
        `);

        return c.json({ ok: true, key: body.key, value: body.value });
    } catch (err) {
        return c.json({ error: "Failed to save setting" }, 500);
    }
});

// ─── POST /key — Update OpenRouter API Key ──────────────────

settingsRoutes.post("/key", async (c) => {
    try {
        const body = await c.req.json<{ key: string }>();
        if (!body.key || body.key.trim().length < 10) {
            return c.json({ error: "Ungültiger API-Key" }, 400);
        }

        await db.run(sql`
            INSERT INTO system_settings (key, value) VALUES ('OPENROUTER_API_KEY', ${body.key.trim()})
            ON CONFLICT(key) DO UPDATE SET value = ${body.key.trim()}
        `);

        return c.json({
            biam_protocol: "2.0",
            action: "key_updated",
            message: "API-Key erfolgreich aktualisiert",
        });
    } catch (err) {
        log.error("💥 Key update error:", err);
        return c.json({ error: "Key konnte nicht gespeichert werden" }, 500);
    }
});

// ─── GET /audit — Data Audit ────────────────────────────────

settingsRoutes.get("/audit", async (c) => {
    try {
        const apiKeyRows = await db
            .select()
            .from(systemSettings)
            .where(sql`key = 'OPENROUTER_API_KEY'`);
        const hasApiKey = apiKeyRows.length > 0 && apiKeyRows[0].value.length > 0;

        const allSettings = await db.select().from(systemSettings);
        const settingsData = allSettings.map((s) => ({
            key: s.key,
            value: s.key === "OPENROUTER_API_KEY"
                ? (s.value.length > 8
                    ? s.value.slice(0, 4) + "•".repeat(Math.min(s.value.length - 8, 20)) + s.value.slice(-4)
                    : "••••••••")
                : s.value,
            sensitive: s.key === "OPENROUTER_API_KEY",
        }));

        const logs = await db.select().from(usageLogs);
        const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

        const allCapsules = await db.select().from(capsules);
        const integrationSummary = allCapsules.map((cap) => ({
            name: cap.name,
            group: cap.group_name,
            hasApiUrl: !!cap.api_endpoint,
            type: cap.integration_type || "api",
        }));

        return c.json({
            audit: {
                api_key: {
                    stored: hasApiKey,
                    info: hasApiKey ? "OpenRouter API key is saved in the database" : "No API key stored",
                },
                settings: { count: allSettings.length, items: settingsData },
                usage_logs: {
                    count: logs.length,
                    last_query: lastLog ? { intent: lastLog.intent, date: lastLog.timestamp } : null,
                    info: `${logs.length} API call logs stored`,
                },
                integrations: {
                    count: allCapsules.length,
                    items: integrationSummary,
                    info: `${allCapsules.length} integration endpoints configured`,
                },
                electron_session: {
                    info: "Webview cookies & login sessions stored in Electron userData (persist:BiamOS partition)",
                    location: "Managed by Electron — use 'Clear Browser Data' button to wipe",
                },
            },
        });
    } catch (err) {
        log.error("💥 Audit error:", err);
        return c.json({ error: "Audit failed" }, 500);
    }
});

// ─── DELETE /data — Purge ALL personal data ─────────────────

settingsRoutes.delete("/data", async (c) => {
    try {
        await db.run(sql`DELETE FROM system_settings`);
        await db.run(sql`DELETE FROM usage_logs`);
        await db.run(sql`UPDATE agents SET total_calls = 0, total_tokens_used = 0`);
        await db.run(sql`DELETE FROM capsules`);
        await db.run(sql`DELETE FROM health_checks`);

        return c.json({
            ok: true,
            message: "All data has been deleted",
            cleared: [
                "API key", "User settings (language, preferences)",
                "Usage logs (query history)", "Agent usage stats",
                "All integrations", "Health check history",
            ],
            note: "Electron browser sessions (cookies, logins) must be cleared via the app button.",
        });
    } catch (err) {
        log.error("💥 Data purge error:", err);
        return c.json({ error: "Data purge failed" }, 500);
    }
});

export { settingsRoutes };
