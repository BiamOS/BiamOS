// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Health Checker Service
// ============================================================
// Pings integration API endpoints to determine their status.
// Results stored in-memory (ephemeral, refreshed on demand).
// ============================================================

import { db } from "../db/db.js";
import { capsules, healthChecks } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { log } from "../utils/logger.js";

// ─── Types ──────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "offline" | "unchecked";

export interface HealthResult {
    integrationId: number;
    groupName: string;
    status: HealthStatus;
    responseTime: number;    // ms, -1 if offline
    statusCode: number;      // HTTP status, 0 if timeout
    checkedAt: string;       // ISO timestamp
    message?: string;
}

// ─── In-Memory Store ────────────────────────────────────────

const healthStore = new Map<number, HealthResult>();

const TIMEOUT_MS = 5000;

// ─── Persist to DB ──────────────────────────────────────────

async function persistHealthResult(integrationId: number, result: HealthResult) {
    try {
        // Update latest status on capsules table
        await db.update(capsules).set({
            health_status: result.status,
            health_message: result.message ?? null,
            health_checked_at: result.checkedAt,
        }).where(eq(capsules.id, integrationId));

        // Insert into history
        await db.insert(healthChecks).values({
            integration_id: integrationId,
            group_name: result.groupName,
            status: result.status,
            response_time: result.responseTime,
            status_code: result.statusCode,
            message: result.message ?? null,
            checked_at: result.checkedAt,
        });
    } catch (err) {
        log.error(`⚠️ Failed to persist health for integration ${integrationId}:`, err);
    }
}

// ─── Core: Check Single Integration ─────────────────────────

export async function checkIntegrationHealth(integration: {
    id: number;
    name: string;
    group_name: string | null;
    api_endpoint: string;
    integration_type: string | null;
    status: string | null;
}): Promise<HealthResult> {
    const groupName = integration.group_name || integration.name.replace(/Widget$/i, "");

    // Skip web integrations (iframes can't be health-checked via fetch)
    if (integration.integration_type === "web") {
        const result: HealthResult = {
            integrationId: integration.id,
            groupName,
            status: "healthy",
            responseTime: 0,
            statusCode: 200,
            checkedAt: new Date().toISOString(),
            message: "Web integration (iframe) — skipped",
        };
        healthStore.set(integration.id, result);
        await persistHealthResult(integration.id, result);
        return result;
    }

    // Skip inactive integrations
    if (integration.status === "inactive") {
        const result: HealthResult = {
            integrationId: integration.id,
            groupName,
            status: "unchecked",
            responseTime: -1,
            statusCode: 0,
            checkedAt: new Date().toISOString(),
            message: "Integration is inactive",
        };
        healthStore.set(integration.id, result);
        await persistHealthResult(integration.id, result);
        return result;
    }

    // Extract base URL (strip path params like {query})
    let testUrl = integration.api_endpoint;
    // Remove everything after first { placeholder
    const braceIdx = testUrl.indexOf("{");
    if (braceIdx > 0) {
        // Keep the URL up to the last / before the brace
        const lastSlash = testUrl.lastIndexOf("/", braceIdx);
        if (lastSlash > 8) { // after https://
            testUrl = testUrl.substring(0, lastSlash);
        }
    }
    // Remove query params
    const qIdx = testUrl.indexOf("?");
    if (qIdx > 0) testUrl = testUrl.substring(0, qIdx);

    const start = Date.now();

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const res = await fetch(testUrl, {
            method: "HEAD",
            signal: controller.signal,
            redirect: "follow",
        }).catch(async () => {
            // HEAD not supported? Try GET
            return fetch(testUrl, {
                method: "GET",
                signal: controller.signal,
                redirect: "follow",
            });
        });

        clearTimeout(timer);
        const elapsed = Date.now() - start;

        // Status logic:
        // - Any HTTP response (even 4xx) proves the server is alive and reachable
        // - 4xx = needs params/auth/correct method — still healthy
        // - 5xx = actual server error — offline
        // - Slow response (>3s) = degraded
        let status: HealthStatus;
        let message: string | undefined;

        if (res.status >= 500) {
            status = "offline";
            message = `HTTP ${res.status} (server error)`;
        } else if (elapsed > 3000) {
            status = "degraded";
            message = `Slow response (${elapsed}ms)`;
        } else {
            status = "healthy";
        }

        const result: HealthResult = {
            integrationId: integration.id,
            groupName,
            status,
            responseTime: elapsed,
            statusCode: res.status,
            checkedAt: new Date().toISOString(),
            message,
        };
        healthStore.set(integration.id, result);
        await persistHealthResult(integration.id, result);
        return result;

    } catch (err) {
        const elapsed = Date.now() - start;
        const isTimeout = err instanceof Error && err.name === "AbortError";

        const result: HealthResult = {
            integrationId: integration.id,
            groupName,
            status: "offline",
            responseTime: elapsed,
            statusCode: 0,
            checkedAt: new Date().toISOString(),
            message: isTimeout ? `Timeout (>${TIMEOUT_MS}ms)` : (err instanceof Error ? err.message : "Unknown error"),
        };
        healthStore.set(integration.id, result);
        await persistHealthResult(integration.id, result);
        return result;
    }
}

// ─── Check All Integrations ─────────────────────────────────

export async function checkAllHealth(): Promise<HealthResult[]> {
    const allIntegrations = await db.select({
        id: capsules.id,
        name: capsules.name,
        group_name: capsules.group_name,
        api_endpoint: capsules.api_endpoint,
        integration_type: capsules.integration_type,
        status: capsules.status,
        is_active: capsules.is_active,
    }).from(capsules);

    // Only check active integrations
    const activeIntegrations = allIntegrations.filter(i => i.is_active);

    // Clear stale health entries for deleted/inactive integrations
    const activeIds = new Set(activeIntegrations.map(i => i.id));
    for (const [id] of healthStore) {
        if (!activeIds.has(id)) healthStore.delete(id);
    }

    // Deduplicate by group — only check one endpoint per group
    const seen = new Set<string>();
    const toCheck = activeIntegrations.filter((i) => {
        const group = i.group_name || i.name;
        if (seen.has(group)) return false;
        seen.add(group);
        return true;
    });


    const results = await Promise.allSettled(
        toCheck.map((i) => checkIntegrationHealth(i))
    );

    const healthResults = results.map((r, idx) => {
        if (r.status === "fulfilled") return r.value;
        return {
            integrationId: toCheck[idx].id,
            groupName: toCheck[idx].group_name || toCheck[idx].name,
            status: "offline" as HealthStatus,
            responseTime: -1,
            statusCode: 0,
            checkedAt: new Date().toISOString(),
            message: "Check failed",
        };
    });

    // Apply group results to all integrations in the same group (batched)
    const persistPromises: Promise<void>[] = [];
    for (const integration of activeIntegrations) {
        const group = integration.group_name || integration.name;
        const groupResult = healthResults.find((r) => r.groupName === group);
        if (groupResult && !healthStore.has(integration.id)) {
            const cloned = { ...groupResult, integrationId: integration.id };
            healthStore.set(integration.id, cloned);
            persistPromises.push(persistHealthResult(integration.id, cloned));
        }
    }
    await Promise.all(persistPromises);

    const healthy = healthResults.filter((r) => r.status === "healthy").length;
    const degraded = healthResults.filter((r) => r.status === "degraded").length;
    const offline = healthResults.filter((r) => r.status === "offline").length;

    return healthResults;
}

// ─── Get Cached Results ─────────────────────────────────────

export function getHealthResults(): HealthResult[] {
    return Array.from(healthStore.values());
}

export function getHealthForIntegration(id: number): HealthResult | undefined {
    return healthStore.get(id);
}
