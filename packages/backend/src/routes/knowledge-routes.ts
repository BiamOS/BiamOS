// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Knowledge Routes (D8: Domain Brain API)
// ============================================================
// Exposes the Domain Brain's ingest and retrieval capabilities
// as a clean HTTP API. All response bodies follow the standard
// BiamOS envelope: { data } | { error }.
//
// Routes:
//   POST   /api/knowledge          — Ingest a knowledge chunk
//   GET    /api/knowledge/search   — Retrieve chunks (2-stage RAG)
//   DELETE /api/knowledge/:id      — Manually delete a chunk
//   POST   /api/knowledge/prune    — Sweep expired auto_trajectories
//   GET    /api/knowledge          — List all chunks for a domain
// ============================================================

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db/db.js";
import { domainKnowledge } from "../db/schema.js";
import {
    ingestKnowledge,
    retrieveKnowledge,
    invalidateTrajectory,
    pruneExpiredKnowledge,
    formatKnowledgeBlock,
} from "../services/domain-knowledge.service.js";
import type { KnowledgeType } from "../services/domain-knowledge.service.js";
import { matchCartridge, PLATFORM_CARTRIDGES } from "../data/platform-cartridges.js";
import { extractDomain, lookupWorkflow } from "../services/agent-memory.js";
import { log } from "../utils/logger.js";
import type { PromptModule } from "../prompt-modules/types.js";
import { bootstrapDomainPrompt } from "../services/domain-bootstrap.service.js";

// Platform PromptModules moved to DB (V4 AI-Ready). No hardcoded modules.
const PLATFORM_PROMPT_MODULES: PromptModule[] = [];


export const knowledgeRoutes = new Hono();

// ─── Root Domain Helper ──────────────────────────────────────
function extractRootDomain(domain: string): string {
    const parts = domain.split('.');
    return parts.length >= 3 ? parts.slice(1).join('.') : domain;
}

// ─── Cartridge Name Lookup ───────────────────────────────────
function getCartridgeName(domain: string): string | null {
    const testUrl = `https://${domain}`;
    const combined = ` ${testUrl}`;

    // 1. Check hardcoded PLATFORM_CARTRIDGES
    for (const [name, c] of Object.entries(PLATFORM_CARTRIDGES)) {
        if (c.domains.some(d => combined.includes(d.toLowerCase())) || combined.includes(name)) {
            return name;
        }
    }

    // 2. Fall back to PLATFORM_PROMPT_MODULES (Todoist, YouTube, Gmail etc.)
    const mod = PLATFORM_PROMPT_MODULES.find(m => m.match.urls?.some(r => r.test(testUrl)));
    return mod ? mod.name : null;
}

// ─── POST /api/knowledge ─────────────────────────────────────
// Ingest a new knowledge chunk into the Domain Brain.
//
// Body: { domain, type, content, source?, recoverySteps? }

knowledgeRoutes.post("/", async (c) => {
    try {
        const body = await c.req.json();
        const { domain, type, content, source, recoverySteps } = body;

        if (!domain || !type || !content) {
            return c.json({ error: "Missing required fields: domain, type, content" }, 400);
        }

        const validTypes: KnowledgeType[] = ["user_instruction", "selector_rule", "auto_trajectory", "api_doc", "avoid_rule"];
        if (!validTypes.includes(type)) {
            return c.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, 400);
        }

        const id = await ingestKnowledge({
            domain,
            subdomain: body.subdomain,
            path_pattern: body.path_pattern,
            type,
            content,
            source: source ?? "user",
            recoverySteps: recoverySteps ?? 0,
        });

        if (id === null) {
            return c.json({ data: { accepted: false, reason: "auto_trajectory rejected: recovery_steps > 0" } }, 200);
        }

        log.info(`  📚 [KB:Ingest] domain=${domain} type=${type} source=${source ?? "user"} id=${id}`);
        return c.json({ data: { id, accepted: true } }, 201);
    } catch (err) {
        log.error("[KnowledgeRoutes] POST / error:", err);
        return c.json({ error: "Failed to ingest knowledge" }, 500);
    }
});


// ─── POST /api/knowledge/auto-pattern ────────────────────────
// Auto-Learn endpoint: called by the agent engine after success-after-failure.
// Creates an avoid_rule with review_status='pending' (needs user approval).
//
// Body: { domain, path_pattern?, what_failed, what_worked, url }

knowledgeRoutes.post("/auto-pattern", async (c) => {
    try {
        const body = await c.req.json();
        const { domain, path_pattern, what_failed, what_worked, url } = body;

        if (!domain || !what_failed || !what_worked) {
            return c.json({ error: "Missing required: domain, what_failed, what_worked" }, 400);
        }

        const content = [
            `AVOID: ${what_failed}`,
            `INSTEAD: ${what_worked}`,
            url ? `Observed on: ${url}` : null,
        ].filter(Boolean).join("\n");

        const id = randomUUID();
        const now = new Date().toISOString();
        const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db.run(sql`
            INSERT INTO domain_knowledge
                (id, domain, path_pattern, type, content, confidence, source, version, created_at, expires_at, review_status)
            VALUES
                (${id}, ${domain}, ${path_pattern ?? null}, 'avoid_rule', ${content}, 0.85, 'auto', 1, ${now}, ${expires}, 'pending')
        `);

        log.info(`  🧠 [AutoLearn] Pattern pending review — domain=${domain} path=${path_pattern ?? '*'}`);
        return c.json({ data: { id, status: "pending" } }, 201);
    } catch (err) {
        log.error("[KnowledgeRoutes] POST /auto-pattern error:", err);
        return c.json({ error: "Failed to save auto-pattern" }, 500);
    }
});


// ─── POST /api/knowledge/:id/review ──────────────────────────
// User approves or rejects an auto-learned pattern from the KB UI.
// Body: { action: "approve" | "reject" }

knowledgeRoutes.post("/:id/review", async (c) => {
    try {
        const id = c.req.param("id");
        const { action } = await c.req.json();

        if (action !== "approve" && action !== "reject") {
            return c.json({ error: "action must be 'approve' or 'reject'" }, 400);
        }

        const newStatus = action === "approve" ? "active" : "rejected";
        await db.run(sql`
            UPDATE domain_knowledge SET review_status = ${newStatus} WHERE id = ${id}
        `);

        log.info(`  🧠 [AutoLearn] Pattern ${newStatus}: id=${id}`);
        return c.json({ data: { id, review_status: newStatus } });
    } catch (err) {
        log.error("[KnowledgeRoutes] POST /:id/review error:", err);
        return c.json({ error: "Review failed" }, 500);
    }
});


// ─── GET /api/knowledge/pending ──────────────────────────────
// Returns all pending auto-learned patterns for the "Learned" tab.
// Query params: domain? (filter by domain)

knowledgeRoutes.get("/pending", async (c) => {
    try {
        const domain = c.req.query("domain");
        const rows = domain
            ? await db.all(sql`SELECT * FROM domain_knowledge WHERE review_status = 'pending' AND domain = ${domain} ORDER BY created_at DESC`)
            : await db.all(sql`SELECT * FROM domain_knowledge WHERE review_status != 'active' ORDER BY created_at DESC`);
        return c.json({ data: rows });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET /pending error:", err);
        return c.json({ error: "Failed to fetch pending patterns" }, 500);
    }
});



// ─── GET /api/knowledge/domains ──────────────────────────────
// Returns all distinct domains that have knowledge in the DB.
// Used by the CommandCenter autocomplete to suggest known sites.

knowledgeRoutes.get("/domains", async (c) => {
    try {
        const rows = await db
            .selectDistinct({ domain: domainKnowledge.domain })
            .from(domainKnowledge)
            .orderBy(domainKnowledge.domain);
        const domains = rows.map(r => r.domain);
        return c.json({ data: domains });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET /domains error:", err);
        return c.json({ error: "Failed to fetch domains" }, 500);
    }
});


// ─── GET /api/knowledge/search ───────────────────────────────
// V3 Hierarchical retrieval: domain + 4-tier path cascade.
//
// Query params: domain (required), query (required),
//              url? (full URL for path-aware retrieval, tier-1 path matching)
//              limit? (default 5), format? ('xml'|'json')

knowledgeRoutes.get("/search", async (c) => {
    try {
        const domain = c.req.query("domain");
        const query = c.req.query("query");
        const url = c.req.query("url");       // V3: full URL for path-aware retrieval
        const limit = parseInt(c.req.query("limit") ?? "5", 10);
        const format = c.req.query("format") ?? "json";

        if (!domain || !query) {
            return c.json({ error: "Missing required query params: domain, query" }, 400);
        }

        // Pass full URL when available (enables tier-1 path matching)
        const chunks = await retrieveKnowledge(url ?? domain, query, limit);

        if (format === "xml") {
            const block = formatKnowledgeBlock(domain, chunks);
            return c.text(block, 200, { "Content-Type": "text/plain; charset=utf-8" });
        }

        return c.json({ data: { domain, count: chunks.length, chunks } });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET /search error:", err);
        return c.json({ error: "Retrieval failed" }, 500);
    }
});


// ─── GET /api/knowledge ──────────────────────────────────────
// List all (non-expired) knowledge entries for a specific domain.
//
// Query params: domain (required)

knowledgeRoutes.get("/", async (c) => {
    try {
        const domain = c.req.query("domain");
        if (!domain) {
            return c.json({ error: "Missing required query param: domain" }, 400);
        }

        const now = new Date().toISOString();
        const entries = await db.all(sql`
            SELECT id, domain, type, content, confidence, source, version, created_at, expires_at
            FROM domain_knowledge
            WHERE domain = ${domain}
              AND (expires_at IS NULL OR expires_at > ${now})
            ORDER BY
              CASE type
                WHEN 'selector_rule'    THEN 1
                WHEN 'user_instruction' THEN 2
                WHEN 'auto_trajectory'  THEN 3
                WHEN 'api_doc'          THEN 4
                ELSE 5
              END ASC,
              created_at DESC
        `);

        return c.json({ data: { domain, count: entries.length, entries } });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET / error:", err);
        return c.json({ error: "Failed to list knowledge" }, 500);
    }
});

// ─── DELETE /api/knowledge/:id ───────────────────────────────
// Manually delete a knowledge entry by ID.
// Also accepts ?invalidate=true to only delete auto_trajectories (self-cleaning).

knowledgeRoutes.delete("/:id", async (c) => {
    try {
        const id = c.req.param("id");
        const invalidateOnly = c.req.query("invalidate") === "true";

        if (invalidateOnly) {
            // Self-cleaning mode: only deletes auto_trajectories (safe guard)
            await invalidateTrajectory(id);
        } else {
            await db.run(sql`DELETE FROM domain_knowledge WHERE id = ${id}`);
        }

        return c.json({ data: { deleted: id } });
    } catch (err) {
        log.error("[KnowledgeRoutes] DELETE /:id error:", err);
        return c.json({ error: "Delete failed" }, 500);
    }
});

// ─── GET /api/knowledge/domains ──────────────────────────────
// Returns all known domains with their knowledge entry counts.
// Used by the Memory Tab UI to populate the domain browser.

knowledgeRoutes.get("/domains", async (c) => {
    try {
        const now = new Date().toISOString();
        const rows = await db.all<{ domain: string; count: number }>(sql`
            SELECT domain, COUNT(*) as count
            FROM domain_knowledge
            WHERE expires_at IS NULL OR expires_at > ${now}
            GROUP BY domain
            ORDER BY count DESC, domain ASC
        `);

        return c.json({ data: { domains: rows } });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET /domains error:", err);
        return c.json({ error: "Failed to list domains" }, 500);
    }
});

// ─── POST /api/knowledge/prune ───────────────────────────────
// Sweeps all expired entries (auto_trajectory TTL, 30 days).
// Safe to call from any cron job or admin trigger.

knowledgeRoutes.post("/prune", async (c) => {
    try {
        const count = await pruneExpiredKnowledge();
        return c.json({ data: { pruned: count } });
    } catch (err) {
        log.error("[KnowledgeRoutes] POST /prune error:", err);
        return c.json({ error: "Pruning failed" }, 500);
    }
});

// ─── GET /api/knowledge/all-domains ──────────────────────────
// Returns unified domain list from BOTH domain_knowledge AND agent_workflows.
// Used by the Knowledge Base Hub sidebar to show all "known" domains.

knowledgeRoutes.get("/all-domains", async (c) => {
    try {
        const now = new Date().toISOString();

        // Domains from domain_knowledge
        const knowledgeDomains = await db.all<{ domain: string; count: number }>(sql`
            SELECT domain, COUNT(*) as count
            FROM domain_knowledge
            WHERE (expires_at IS NULL OR expires_at > ${now})
            GROUP BY domain
            ORDER BY count DESC
        `);

        // Domains from agent_workflows
        const workflowDomains = await db.all<{ domain: string; count: number }>(sql`
            SELECT domain, COUNT(*) as count
            FROM agent_workflows
            GROUP BY domain
            ORDER BY count DESC
        `);

        // Merge: union both domain sets, summing counts
        const domainMap = new Map<string, { knowledgeCount: number; workflowCount: number; cartridge: string | null }>();

        for (const row of knowledgeDomains) {
            const existing = domainMap.get(row.domain) ?? { knowledgeCount: 0, workflowCount: 0, cartridge: null };
            existing.knowledgeCount = row.count;
            existing.cartridge = getCartridgeName(row.domain);
            domainMap.set(row.domain, existing);
        }
        for (const row of workflowDomains) {
            const existing = domainMap.get(row.domain) ?? { knowledgeCount: 0, workflowCount: 0, cartridge: null };
            existing.workflowCount = row.count;
            if (!existing.cartridge) existing.cartridge = getCartridgeName(row.domain);
            domainMap.set(row.domain, existing);
        }

        // NOTE: We intentionally do NOT auto-inject cartridge domains that have no DB entries.
        // This means: deleting a domain removes it from the sidebar permanently (until new entries are saved).
        // Cartridge info is still shown in the /profile endpoint when the user navigates to a domain.

        const domains = Array.from(domainMap.entries()).map(([domain, stats]) => ({
            domain,
            ...stats,
        }));

        return c.json({ data: { domains } });
    } catch (err) {
        log.error("[KnowledgeRoutes] GET /all-domains error:", err);
        return c.json({ error: "Failed to fetch domain list" }, 500);
    }
});

// ─── GET /api/knowledge/profile?domain=X ─────────────────────
// Full domain "dossier": cartridge + RAG knowledge + workflows.
// Powers the right-panel of the Knowledge Base Hub.

knowledgeRoutes.get("/profile", async (c) => {
    const domain = c.req.query("domain");
    if (!domain) return c.json({ error: "domain query param required" }, 400);

    try {
        const now = new Date().toISOString();
        const rootDomain = extractRootDomain(domain);

        // 1. Cartridge — try PLATFORM_CARTRIDGES first, then PromptModule fallback
        const testUrl = `https://${domain}`;
        const cartridgeMatch = matchCartridge("", testUrl);
        const cartridgeName = getCartridgeName(domain);

        let cartridgeData: { name: string; editor_type: string; navigation_style: string; preview: string } | null = null;

        if (cartridgeMatch) {
            cartridgeData = {
                name: cartridgeName ?? domain,
                editor_type: cartridgeMatch.editor_type,
                navigation_style: cartridgeMatch.navigation_style,
                preview: cartridgeMatch.system_prompt_injection,
            };
            log.debug(`  🗒️ [KB:Profile] domain=${domain} cartridge=PLATFORM_CARTRIDGES:${cartridgeName}`);
        } else {
            const promptMod = PLATFORM_PROMPT_MODULES.find(
                m => m.match.urls?.some(pattern => pattern.test(testUrl))
            );
            if (promptMod) {
                cartridgeData = {
                    name: promptMod.name,
                    editor_type: "native",
                    navigation_style: "spa",
                    preview: promptMod.rules,
                };
                log.debug(`  🗒️ [KB:Profile] domain=${domain} cartridge=PROMPT_MODULE:${promptMod.name}`);
            } else {
                log.debug(`  🗒️ [KB:Profile] domain=${domain} cartridge=none`);
            }
        }

        // 2. Knowledge entries (exact + root domain)
        const knowledge = await db.all<any>(sql`
            SELECT id, domain, subdomain, path_pattern, type, content, confidence, source, created_at
            FROM domain_knowledge
            WHERE domain IN (${domain}, ${rootDomain})
              AND (expires_at IS NULL OR expires_at > ${now})
            ORDER BY
              CASE type
                WHEN 'selector_rule'    THEN 1
                WHEN 'user_instruction' THEN 2
                WHEN 'auto_trajectory'  THEN 3
                WHEN 'api_doc'          THEN 4
                ELSE 5
              END ASC,
              created_at DESC
        `);

        // 3. Learned workflows (top 15 by success, ordered by recency)
        const workflowRows = await db.all<any>(sql`
            SELECT id, domain, intent_text, steps_json, success_count, fail_count, verified, updated_at
            FROM agent_workflows
            WHERE domain IN (${domain}, ${rootDomain})
            ORDER BY success_count DESC, updated_at DESC
            LIMIT 15
        `);

        const workflows = workflowRows.map((w: any) => {
            let steps: any[] = [];
            try { steps = JSON.parse(w.steps_json) ?? []; } catch { /* empty */ }
            return {
                id: w.id,
                domain: w.domain,
                intent_text: w.intent_text,
                steps_count: steps.length,
                steps,
                success_count: w.success_count,
                fail_count: w.fail_count,
                verified: !!w.verified,
                updated_at: w.updated_at,
            };
        });

        // 4. Domain Bootstrap — trigger if no base rule and no prior bootstrap
        const hasBaseRule = knowledge.some(
            (k: any) => k.source === 'base_rule' || k.source === 'auto_bootstrap'
        );
        let bootstrapping = false;
        if (!hasBaseRule && !cartridgeData) {
            // Fire-and-forget: generate a smart base prompt in the background
            bootstrapDomainPrompt(domain).catch(() => { /* non-critical */ });
            bootstrapping = true;
            log.info(`  🌱 [Bootstrap] Triggered for new domain: ${domain}`);
        }

        return c.json({ data: { domain, cartridge: cartridgeData, knowledge, workflows, bootstrapping } });
    } catch (err) {
        log.error(`[KnowledgeRoutes] GET /profile error for domain=${domain}:`, err);
        return c.json({ error: "Failed to fetch domain profile" }, 500);
    }
});

// ─── POST /api/knowledge/workflows/:id/verify ────────────────
// Mark a workflow as human-verified (trusted for future replays).

knowledgeRoutes.post("/workflows/:id/verify", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid workflow id" }, 400);
    try {
        const now = new Date().toISOString();
        await db.run(sql`UPDATE agent_workflows SET verified = 1, updated_at = ${now} WHERE id = ${id}`);
        return c.json({ data: { ok: true } });
    } catch (err) {
        log.error(`[KnowledgeRoutes] POST /workflows/${id}/verify error:`, err);
        return c.json({ error: "Verify failed" }, 500);
    }
});

// ─── DELETE /api/knowledge/workflows/:id ─────────────────────
// Remove a workflow from agent memory.

knowledgeRoutes.delete("/workflows/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "Invalid workflow id" }, 400);
    try {
        await db.run(sql`DELETE FROM agent_workflows WHERE id = ${id}`);
        return c.json({ data: { ok: true } });
    } catch (err) {
        log.error(`[KnowledgeRoutes] DELETE /workflows/${id} error:`, err);
        return c.json({ error: "Delete failed" }, 500);
    }
});

// ─── DELETE /api/knowledge/domain/:domain ────────────────────
// Wipes ALL knowledge entries + workflows for a given domain.
// Used by the Knowledge Base Hub "Delete domain" button.

knowledgeRoutes.delete("/domain/:domain", async (c) => {
    const domain = c.req.param("domain");
    if (!domain) return c.json({ error: "domain required" }, 400);
    try {
        const kbResult = await db.run(sql`DELETE FROM domain_knowledge WHERE domain = ${domain}`);
        const wfResult = await db.run(sql`DELETE FROM agent_workflows WHERE domain = ${domain}`);
        const kbCount = (kbResult as any).changes ?? '?';
        const wfCount = (wfResult as any).changes ?? '?';
        log.info(`  🗑️ [KB:DeleteDomain] domain=${domain} knowledge_deleted=${kbCount} workflows_deleted=${wfCount}`);
        return c.json({ data: { ok: true, domain } });
    } catch (err) {
        log.error(`[KnowledgeRoutes] DELETE /domain/${domain} error:`, err);
        return c.json({ error: "Delete failed" }, 500);
    }
});
// ─── POST /api/memory/lookup ─────────────────────────────────
// Used by Phase 3A Neuro-Symbolic Compiled Execution in engine.ts.
// Returns the best verified workflow for a domain+task combination.
// Frontend checks verified=true to decide whether to execute without LLM.

knowledgeRoutes.post("/memory/lookup", async (c) => {
    try {
        const body = await c.req.json();
        const { domain, task } = body;

        if (!domain || !task) {
            return c.json({ error: "Missing required fields: domain, task" }, 400);
        }

        const workflow = await lookupWorkflow(domain, task);
        return c.json({ data: { workflow } });
    } catch (err) {
        log.error("[MemoryRoutes] POST /memory/lookup error:", err);
        return c.json({ error: "Lookup failed" }, 500);
    }
});
