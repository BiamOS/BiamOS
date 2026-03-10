// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Autopilot Routes (Phase 4)
// ============================================================
// POST /api/autopilot/plan  — Generate an automation plan
// POST /api/autopilot/step  — Generate JS for a single step
// ============================================================

import { Hono } from "hono";
import { generateAutopilotPlan, generateStepScript } from "../services/autopilot-engine.js";
import type { AutopilotStep } from "../services/autopilot-engine.js";

export const autopilotRoutes = new Hono();

// ─── POST /plan — Generate automation plan from instruction ─

autopilotRoutes.post("/plan", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body", steps: [] }, 400);
    }

    const { instruction, url, dom_snapshot } = body as {
        instruction?: string;
        url?: string;
        dom_snapshot?: string;
    };

    if (!instruction || typeof instruction !== "string" || instruction.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'instruction' field", steps: [] }, 400);
    }
    if (!url || typeof url !== "string" || url.trim().length === 0) {
        return c.json({ error: "Missing or invalid 'url' field", steps: [] }, 400);
    }

    const snapshot = typeof dom_snapshot === "string" ? dom_snapshot : "";

    const plan = await generateAutopilotPlan(
        instruction.trim(),
        url.trim(),
        snapshot
    );

    return c.json(plan);
});

// ─── POST /step — Generate executable JS for a single step ──

autopilotRoutes.post("/step", async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid request body" }, 400);
    }

    const step = body as Partial<AutopilotStep>;

    if (!step.action || !step.selector) {
        return c.json({ error: "Missing 'action' or 'selector'" }, 400);
    }

    const script = generateStepScript({
        step: step.step || 1,
        action: step.action as AutopilotStep["action"],
        selector: step.selector,
        value: step.value,
        wait_ms: step.wait_ms,
        description: step.description || "",
    });

    return c.json({ script });
});
