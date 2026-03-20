// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module Routes (Prompt Library API)
// ============================================================
// CRUD for user-created prompt modules + AI-assisted rule
// generation. Mounted at /api/prompt-modules in server.ts.
// ============================================================

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/db.js";
import { userPromptModules } from "../db/schema.js";
import { assembler } from "../prompt-modules/prompt-assembler.js";
import type { PromptModule, PromptPhase } from "../prompt-modules/types.js";
import { log } from "../utils/logger.js";

const promptModuleRoutes = new Hono();

// ─── Helper: Convert DB row → PromptModule ──────────────────

function dbRowToPromptModule(row: typeof userPromptModules.$inferSelect): PromptModule {
    const urlPatterns = JSON.parse(row.url_patterns) as string[];
    const phases = row.phases ? JSON.parse(row.phases) as PromptPhase[] : undefined;
    const taskPatterns = row.task_patterns ? JSON.parse(row.task_patterns) as string[] : undefined;

    return {
        id: row.module_id,
        name: row.name,
        priority: row.priority,
        match: {
            urls: urlPatterns.map(p => new RegExp(p, "i")),
            phases,
            taskPatterns: taskPatterns?.map(p => new RegExp(p, "i")),
        },
        rules: row.rules,
    };
}

// ─── GET / — List all user modules ──────────────────────────

promptModuleRoutes.get("/", async (c) => {
    try {
        const modules = await db.select().from(userPromptModules).orderBy(desc(userPromptModules.id));

        // Also list built-in modules for the "Built-in" tab
        const builtinModules = assembler.getModules()
            .filter(m => !m.id.startsWith("user-"))
            .map(m => ({
                module_id: m.id,
                name: m.name,
                priority: m.priority,
                is_builtin: true,
                is_active: true,
                url_patterns: m.match.urls?.map(r => r.source) || [],
                phases: m.match.phases || [],
                has_task_patterns: !!(m.match.taskPatterns && m.match.taskPatterns.length > 0),
                always: !!m.match.always,
                rules_preview: m.rules.substring(0, 200),
                rules: m.rules,
            }));

        const stats = {
            total: modules.length + builtinModules.length,
            custom: modules.length,
            builtin: builtinModules.length,
            active: modules.filter(m => m.is_active).length + builtinModules.length,
        };

        return c.json({ modules, builtinModules, stats });
    } catch (err) {
        log.error("[PromptModules] GET error:", err);
        return c.json({ message: "Failed to load modules" }, 500);
    }
});

// ─── POST / — Create a new user module ──────────────────────

promptModuleRoutes.post("/", async (c) => {
    try {
        const body = await c.req.json<{
            name: string;
            url_patterns: string[];
            rules: string;
            priority?: number;
            task_patterns?: string[];
            phases?: string[];
            source?: string;
            source_url?: string;
        }>();

        if (!body.name || !body.url_patterns?.length || !body.rules) {
            return c.json({ message: "name, url_patterns, and rules are required" }, 400);
        }

        // Generate module_id from name
        const moduleId = "user-" + body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

        const now = new Date().toISOString();
        const [inserted] = await db.insert(userPromptModules).values({
            module_id: moduleId,
            name: body.name,
            priority: body.priority ?? 50,
            url_patterns: JSON.stringify(body.url_patterns),
            task_patterns: body.task_patterns ? JSON.stringify(body.task_patterns) : null,
            phases: body.phases ? JSON.stringify(body.phases) : null,
            rules: body.rules,
            source: body.source ?? "manual",
            source_url: body.source_url ?? null,
            created_at: now,
            updated_at: now,
        }).returning();

        // Live-register in the assembler
        const promptModule = dbRowToPromptModule(inserted);
        assembler.register(promptModule);
        log.info(`  📚 [PromptLibrary] Registered new module: ${inserted.module_id}`);

        return c.json({ message: "Module created", module: inserted }, 201);
    } catch (err: any) {
        if (err?.message?.includes("UNIQUE")) {
            return c.json({ message: "A module with this name already exists" }, 409);
        }
        log.error("[PromptModules] POST error:", err);
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

// ─── PATCH /:id — Update a user module ──────────────────────

promptModuleRoutes.patch("/:id", async (c) => {
    try {
        const id = parseInt(c.req.param("id"));
        const body = await c.req.json<{
            name?: string;
            url_patterns?: string[];
            rules?: string;
            priority?: number;
            is_active?: boolean;
            task_patterns?: string[] | null;
            phases?: string[] | null;
        }>();

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) updates.name = body.name;
        if (body.url_patterns !== undefined) updates.url_patterns = JSON.stringify(body.url_patterns);
        if (body.rules !== undefined) updates.rules = body.rules;
        if (body.priority !== undefined) updates.priority = body.priority;
        if (body.is_active !== undefined) updates.is_active = body.is_active;
        if (body.task_patterns !== undefined) updates.task_patterns = body.task_patterns ? JSON.stringify(body.task_patterns) : null;
        if (body.phases !== undefined) updates.phases = body.phases ? JSON.stringify(body.phases) : null;

        await db.update(userPromptModules).set(updates).where(eq(userPromptModules.id, id));

        // Re-fetch and re-register in assembler
        const [updated] = await db.select().from(userPromptModules).where(eq(userPromptModules.id, id));
        if (updated) {
            if (updated.is_active) {
                assembler.register(dbRowToPromptModule(updated));
            } else {
                assembler.unregister(updated.module_id);
            }
        }

        return c.json({ message: "Updated", module: updated });
    } catch (err) {
        log.error("[PromptModules] PATCH error:", err);
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

// ─── DELETE /:id — Delete a user module ─────────────────────

promptModuleRoutes.delete("/:id", async (c) => {
    try {
        const id = parseInt(c.req.param("id"));

        // Get module_id before deleting (for assembler cleanup)
        const [row] = await db.select({ module_id: userPromptModules.module_id })
            .from(userPromptModules)
            .where(eq(userPromptModules.id, id));

        await db.delete(userPromptModules).where(eq(userPromptModules.id, id));

        if (row) {
            assembler.unregister(row.module_id);
            log.info(`  📚 [PromptLibrary] Unregistered module: ${row.module_id}`);
        }

        return c.json({ message: "Deleted" });
    } catch (err) {
        log.error("[PromptModules] DELETE error:", err);
        return c.json({ message: `Failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

// ─── POST /analyze — AI-assisted rule generation ────────────

promptModuleRoutes.post("/analyze", async (c) => {
    try {
        const { url, pageText } = await c.req.json<{
            url: string;
            pageText: string;
        }>();

        if (!url || !pageText) {
            return c.json({ message: "url and pageText are required" }, 400);
        }

        // Extract hostname for module naming
        let hostname = url;
        try { hostname = new URL(url).hostname.replace("www.", ""); } catch { }

        // Call LLM to generate rules
        const { getProviderConfig, getChatUrl, getHeaders } = await import("../services/llm-provider.js");
        const config = await getProviderConfig();
        if (!config.apiKey && config.requiresAuth) {
            return c.json({ message: "No LLM provider configured" }, 503);
        }

        const analysisPrompt = `You are a web automation expert analyzing a website for an AI browser agent.

The agent navigates websites using Set-of-Mark IDs (like [0], [1], [2]) that are assigned to DOM elements at runtime. Your rules should NEVER reference specific IDs, CSS selectors, XPath, or coordinates. Instead, describe patterns semantically.

Page content from ${url} (extracted from rendered DOM):
${pageText.substring(0, 6000)}

Generate rules that describe:
1. NAVIGATION: Where are the main menu items? How does the site organize content?
2. SEARCH: Where is the search bar? Does it use autocomplete? Press Enter or click a button?
3. FORMS: What's the field sequence for common actions (login, signup, compose)?
4. QUIRKS: Any modals, cookie banners, or autocomplete dropdowns the agent should expect?
5. CONTENT LAYOUT: How is content sorted? (newest first, alphabetical, etc.)

DO NOT include:
- CSS selectors, XPath, or data-testid attributes
- Pixel coordinates or screen positions
- React/Vue/Angular component names
- Hardcoded element IDs

Output ONLY valid JSON (no markdown, no code fences):
{
  "name": "${hostname}",
  "url_patterns": ["${hostname.replace(/\./g, "\\\\.")}"],
  "suggested_rules": "═══════════════════════════════════════════════════\\nPLATFORM: ${hostname}\\n═══════════════════════════════════════════════════\\n- Navigation: ...\\n- Search: ...\\n- Forms: ...\\n- Quirks: ..."
}

Write rules as short, imperative bullet points. Max 10 points. Use the ═══ header format.`;

        const chatUrl = await getChatUrl();
        const headers = await getHeaders("prompt-library");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                    { role: "system", content: "You are a web automation expert. Output only valid JSON." },
                    { role: "user", content: analysisPrompt },
                ],
                temperature: 0.3,
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return c.json({ message: `LLM error: ${response.status} — ${errText.substring(0, 200)}` }, 502);
        }

        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content || "";

        // Parse JSON from LLM response (strip markdown fences if present)
        let parsed: any;
        try {
            const jsonStr = content.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
            parsed = JSON.parse(jsonStr);
        } catch {
            return c.json({
                message: "LLM returned invalid JSON",
                raw: content,
                fallback: {
                    name: hostname,
                    url_patterns: [hostname.replace(/\./g, "\\.")],
                    suggested_rules: `═══════════════════════════════════════════════════\nPLATFORM: ${hostname}\n═══════════════════════════════════════════════════\n- [AI could not analyze this page — please add rules manually]`,
                },
            }, 200);
        }

        log.info(`  📚 [PromptLibrary] AI analyzed ${hostname} → ${parsed.suggested_rules?.split("\\n").length || 0} rules`);

        return c.json({
            name: parsed.name || hostname,
            url_patterns: parsed.url_patterns || [hostname.replace(/\./g, "\\.")],
            suggested_rules: parsed.suggested_rules || "",
            source_url: url,
        });
    } catch (err) {
        log.error("[PromptModules] ANALYZE error:", err);
        return c.json({ message: `Analysis failed: ${err instanceof Error ? err.message : err}` }, 500);
    }
});

export { promptModuleRoutes };
