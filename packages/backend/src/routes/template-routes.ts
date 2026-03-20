// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Template Routes
// ============================================================
// Template listing, installation, and web integration install.
// Path: /api/integrations/templates, /install-template, /install-web
// ============================================================

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { capsules } from "../db/schema.js";
import { INTEGRATION_TEMPLATES } from "../db/integration-templates.js";
import { invalidateConciergeCache } from "../agents/intent/0-concierge.js";
import { clearRoutingCache } from "../services/routing-cache.js";
import { log } from "../utils/logger.js";
import { MODEL_BLOCK_SUGGEST } from "../config/models.js";

const templateRoutes = new Hono();

// ─── GET /templates — List available templates ──────────────

templateRoutes.get("/templates", async (c) => {
    try {
        const allIntegrations = await db.select().from(capsules);
        const installedGroups = new Set(
            allIntegrations.map((i) => i.group_name).filter(Boolean)
        );

        const templates = INTEGRATION_TEMPLATES.map((t) => ({
            ...t,
            installed: installedGroups.has(t.name),
        }));

        return c.json({
            biam_protocol: "2.0",
            action: "list_templates",
            templates,
        });
    } catch (err) {
        log.error("💥 Error listing templates:", err);
        return c.json({ biam_protocol: "2.0", action: "error", message: "Failed to list templates" }, 500);
    }
});

// ─── POST /install-template — Install a template ────────────

templateRoutes.post("/install-template", async (c) => {
    try {
        const { templateId, apiKey } = await c.req.json<{ templateId: string; apiKey?: string }>();
        const template = INTEGRATION_TEMPLATES.find((t) => t.id === templateId);

        if (!template) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Template not found" }, 404);
        }

        const existing = await db.select().from(capsules)
            .where(eq(capsules.group_name, template.name));
        if (existing.length > 0) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "Template already installed" }, 409);
        }

        const apiConfig = template.auth_type === "none"
            ? JSON.stringify({ requiresAuth: false })
            : JSON.stringify({
                requiresAuth: true,
                authType: template.auth_type,
                ...(apiKey ? { apiKey } : {}),
            });

        const status = template.auth_type !== "none" && !apiKey ? "auth_needed" : "live";

        const insertedIds: number[] = [];
        for (const ep of template.endpoints) {
            const [inserted] = await db.insert(capsules).values({
                name: ep.name,
                intent_description: ep.intent_description,
                api_endpoint: ep.path,
                http_method: ep.method,
                group_name: template.name,
                sidebar_icon: template.icon,
                sidebar_label: template.label,
                human_triggers: template.human_triggers,
                api_triggers: ep.endpoint_tags,
                endpoint_tags: ep.endpoint_tags,
                param_schema: ep.param_schema,
                response_type: ep.response_type ?? null,
                supported_intents: ep.supported_intents ?? null,
                api_config: apiConfig,
                integration_type: "api",
                is_active: true,
                status,
                allowed_blocks: JSON.stringify(template.allowed_blocks),
                is_template: false,
                template_category: template.category,
                template_description: template.description,
            }).returning();
            insertedIds.push(inserted.id);
        }

        invalidateConciergeCache();
        clearRoutingCache();

        return c.json({
            biam_protocol: "2.0",
            action: "template_installed",
            template_name: template.name,
            endpoints_created: insertedIds.length,
            status,
            message: status === "auth_needed"
                ? `${template.name} installed! Add your API key to activate.`
                : `${template.name} installed! Try asking about ${template.label.toLowerCase()}.`,
        }, 201);
    } catch (err) {
        log.error("💥 Template install error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Install failed",
        }, 500);
    }
});

// ─── POST /install-web — One-click web integration install ──

templateRoutes.post("/install-web", async (c) => {
    try {
        const { url, title } = await c.req.json<{ url: string; title?: string }>();

        if (!url) {
            return c.json({ biam_protocol: "2.0", action: "error", message: "url is required" }, 400);
        }

        let domain: string;
        try { domain = new URL(url).hostname.replace("www.", ""); }
        catch { return c.json({ biam_protocol: "2.0", action: "error", message: "Invalid URL" }, 400); }

        const groupName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
        const widgetName = `${groupName}WebWidget`;

        const existing = await db.select().from(capsules)
            .where(eq(capsules.group_name, groupName));
        const webExisting = existing.filter(e => e.integration_type === "web");
        if (webExisting.length > 0) {
            return c.json({
                biam_protocol: "2.0",
                action: "web_already_installed",
                integration: webExisting[0],
                message: `${groupName} is already installed.`,
            });
        }

        const [inserted] = await db.insert(capsules).values({
            name: widgetName,
            intent_description: `Web integration for ${domain} — opens ${domain} pages as iframe cards`,
            api_endpoint: url,
            http_method: "GET",
            group_name: groupName,
            sidebar_icon: "🌐",
            sidebar_label: groupName,
            human_triggers: `${domain} | ${groupName.toLowerCase()} | open ${groupName.toLowerCase()}`,
            integration_type: "web",
            is_active: true,
            status: "live",
            api_config: JSON.stringify({ requiresAuth: false }),
            template_category: "web",
            template_description: `Browse ${domain} content directly in BiamOS`,
        }).returning();

        invalidateConciergeCache();
        clearRoutingCache();

        return c.json({
            biam_protocol: "2.0",
            action: "web_installed",
            integration: inserted,
            message: `🌐 ${groupName} installed as web integration!`,
        }, 201);
    } catch (err: any) {
        if (err?.message?.includes?.("UNIQUE")) {
            return c.json({
                biam_protocol: "2.0",
                action: "web_already_installed",
                message: "This domain is already registered.",
            });
        }
        log.error("💥 Web install error:", err);
        return c.json({
            biam_protocol: "2.0", action: "error",
            message: err instanceof Error ? err.message : "Install failed",
        }, 500);
    }
});

// ─── POST /suggest-blocks — AI-powered block selection ──────

templateRoutes.post("/suggest-blocks", async (c) => {
    try {
        const { endpoints } = await c.req.json<{
            endpoints: Array<{
                name: string;
                path: string;
                intent_description: string;
                response_type?: string;
                endpoint_tags?: string;
            }>;
        }>();

        if (!endpoints || endpoints.length === 0) {
            return c.json({ blocks: [] });
        }

        const { BLOCK_CATALOG } = await import("../prompts/block-catalog.js");
        const catalogSummary = BLOCK_CATALOG.map(
            (b) => `- "${b.type}" (${b.category}): ${b.when}`
        ).join("\n");

        const endpointSummary = endpoints.map(
            (ep) => `- ${ep.name}: ${ep.intent_description} [response: ${ep.response_type || "unknown"}] [tags: ${ep.endpoint_tags || "none"}] URL: ${ep.path}`
        ).join("\n");

        const prompt = `You are a UI block selector for a dashboard system. Given API endpoints and available UI blocks, select the 8-15 most appropriate blocks.

AVAILABLE BLOCKS (type — when to use):
${catalogSummary}

INTEGRATION ENDPOINTS:
${endpointSummary}

SELECTION RULES:
1. ALWAYS include: title, divider, spacer (basic layout)
2. Match blocks to the API data shape:
   - Numbers/metrics → hero, metric_row, stat_bar, progress_ring
   - Key-value data → key_value, table
   - Lists of items → list, feed, chip_list
   - URLs/links in data → link_list (PREFER over plain list when items have URLs)
   - Images → hero_image, image_grid, media_card
   - Text/articles → text, accordion, quote, callout
   - Ratings/scores → rating, stat_bar
   - Chronological data → timeline
3. Include complementary blocks (e.g. hero + metric_row for dashboards)
4. Do NOT include form blocks unless the API accepts POST/PUT input
5. Prefer richer blocks when data supports it (feed over list, link_list over list for URLs)

Respond ONLY with a JSON array of block type strings. Example: ["title", "hero", "key_value", "link_list", "divider", "spacer"]`;

        const { getChatUrl, getHeaders } = await import("../services/llm-provider.js");
        const chatUrl = await getChatUrl();
        const headers = await getHeaders("block-suggester");

        const response = await fetch(chatUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: MODEL_BLOCK_SUGGEST,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 500,
            }),
        });

        if (!response.ok) throw new Error(`LLM error ${response.status}`);

        const result = await response.json();
        let raw = (result.choices?.[0]?.message?.content ?? "").trim();
        raw = raw.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim();

        const blocks = JSON.parse(raw);
        if (!Array.isArray(blocks)) throw new Error("Not an array");

        const validTypes = new Set(BLOCK_CATALOG.map((b) => b.type));
        const filtered = blocks.filter((b: string) => validTypes.has(b));

        return c.json({ blocks: filtered });
    } catch (err) {
        log.error("💥 Block suggestion error:", err);
        return c.json({
            blocks: [
                "title", "text", "divider", "spacer", "callout",
                "hero", "key_value", "metric_row", "stat_bar",
                "chip_list", "list", "badge_row", "link_list",
            ],
        });
    }
});

// ─── GET /block-catalog — Dynamic block types ───────────────

templateRoutes.get("/block-catalog", async (c) => {
    const { BLOCK_CATALOG } = await import("../prompts/block-catalog.js");
    const categories: Record<string, string[]> = {};
    for (const entry of BLOCK_CATALOG) {
        if (!categories[entry.category]) categories[entry.category] = [];
        categories[entry.category].push(entry.type);
    }
    // Include custom blocks from CustomBlocks.tsx
    try {
        const { readFileSync, existsSync } = await import("fs");
        const { resolve } = await import("path");
        const customPath = resolve(import.meta.dirname, "../../../frontend/src/components/blocks/CustomBlocks.tsx");
        if (existsSync(customPath)) {
            const src = readFileSync(customPath, "utf-8");
            const regex = /\/\/ @block type=(\S+) component=\S+ category=(\S+) description=.+/g;
            let m;
            while ((m = regex.exec(src)) !== null) {
                const [, type, category] = m;
                if (!categories[category]) categories[category] = [];
                if (!categories[category].includes(type)) {
                    categories[category].push(type);
                }
            }
        }
    } catch { /* silently skip if custom blocks can't be read */ }
    return c.json({ categories });
});

export { templateRoutes };
