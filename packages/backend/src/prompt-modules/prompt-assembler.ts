// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Assembler (Dynamic Context Injection)
// ============================================================
// Central engine that composes the agent's system prompt from
// modular prompt modules based on current context (URL, task,
// phase). Replaces the 577-line monolithic prompt in
// agent-actions.ts with a dynamic, composable system.
//
// KEY DESIGN DECISIONS:
// - Modules are statically imported (no dynamic filesystem scan)
//   for type safety and tree-shaking.
// - Tool merging deduplicates by function.name — higher priority
//   modules override lower priority ones.
// - The assembler is a singleton for the process lifetime.
// ============================================================

import { log } from "../utils/logger.js";
import type { PromptModule, PromptPhase, ToolDefinition, AssemblerContext } from "./types.js";

// ── Module Imports ──────────────────────────────────────────
import { baseModule } from "./base.js";
import { soulModule } from "./soul.js";
// Legacy phase modules removed — superseded by method-* CRUD modules
import { phaseActionModule } from "./phase-action.js"; // kept for backward compat during transition
import { safetyModule } from "./safety.js";
import { interactionModule } from "./interaction.js";
import { formsModule } from "./forms.js";
import { cookiesModule } from "./cookies.js";
import { platformXModule } from "./platform-x.js";
import { platformYoutubeModule } from "./platform-youtube.js";
import { platformGmailModule } from "./platform-gmail.js";
import { platformAmazonModule } from "./platform-amazon.js";
import { platformN8nModule } from "./platform-n8n.js";
import { platformTodoistModule } from "./platform-todoist.js";
import { socialReadingModule } from "./social-reading.js";
import { methodGetModule } from "./method-get.js";
import { methodPostModule } from "./method-post.js";
import { methodPutModule } from "./method-put.js";
import { methodDeleteModule } from "./method-delete.js";

// ── Prompt Assembler ────────────────────────────────────────

export class PromptAssembler {
    private modules: PromptModule[] = [];

    /** Register a single module */
    register(module: PromptModule): void {
        // Prevent duplicate IDs
        this.modules = this.modules.filter(m => m.id !== module.id);
        this.modules.push(module);
    }

    /** Register multiple modules at once */
    registerAll(modules: PromptModule[]): void {
        for (const m of modules) this.register(m);
    }

    /** Unregister a module by ID */
    unregister(moduleId: string): void {
        this.modules = this.modules.filter(m => m.id !== moduleId);
    }

    /** Get all registered modules (for testing) */
    getModules(): readonly PromptModule[] {
        return this.modules;
    }

    /**
     * Resolve which modules match the given context.
     * Returns modules sorted by priority (low → high).
     */
    resolve(url: string, task: string, phase: PromptPhase): PromptModule[] {
        const matched = this.modules.filter(m => {
            // Always-on modules
            if (m.match.always) return true;

            let phaseMatch = true;
            let urlMatch = true;
            let taskMatch = true;

            // Phase filter: if specified, must match
            if (m.match.phases && m.match.phases.length > 0) {
                phaseMatch = m.match.phases.includes(phase);
            }

            // URL filter: if specified, at least one must match
            if (m.match.urls && m.match.urls.length > 0) {
                urlMatch = m.match.urls.some(pattern => pattern.test(url));
            } else {
                // No URL constraint — doesn't restrict
                urlMatch = true;
            }

            // Task filter: if specified, at least one must match
            if (m.match.taskPatterns && m.match.taskPatterns.length > 0) {
                taskMatch = m.match.taskPatterns.some(pattern => pattern.test(task));
            } else {
                // No task constraint — doesn't restrict
                taskMatch = true;
            }

            // Module matches if ALL specified constraints are satisfied
            // For URL+task modules (like social-reading): both must match
            return phaseMatch && urlMatch && taskMatch;
        });

        // Sort by priority ascending
        return matched.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Debug: explain which modules would be loaded for a context.
     * Returns human-readable list of module names.
     */
    explain(url: string, task: string, phase: PromptPhase): string[] {
        return this.resolve(url, task, phase).map(m => `[${m.priority}] ${m.id} — ${m.name}`);
    }

    /**
     * Merge tools from active modules with the base tool set.
     * Deduplicates by function.name — higher priority modules
     * override lower priority ones (since modules are sorted
     * low→high, later entries win).
     */
    mergeTools(activeModules: PromptModule[], baseTools: ToolDefinition[]): ToolDefinition[] {
        const toolMap = new Map<string, ToolDefinition>();

        // Base tools first (lowest priority)
        for (const t of baseTools) {
            toolMap.set(t.function.name, t);
        }

        // Module tools override by name (sorted by priority, higher priority = later = wins)
        for (const mod of activeModules) {
            if (mod.tools) {
                for (const t of mod.tools) {
                    toolMap.set(t.function.name, t);
                }
            }
        }

        return Array.from(toolMap.values());
    }

    /**
     * Assemble the final system prompt from matching modules + runtime context.
     */
    assemble(ctx: AssemblerContext): string {
        const activeModules = this.resolve(ctx.url, ctx.task, ctx.phase);

        // Log which modules are active (for debugging)
        const moduleIds = activeModules.map(m => m.id);
        log.debug(`  🧩 Prompt modules: [${moduleIds.join(", ")}]`);

        // ── Build header ────────────────────────────────────
        const stepsRemaining = Math.max(0, ctx.maxSteps - ctx.stepNumber);
        const urgency = stepsRemaining <= 3 ? " ⚠️ WRAPPING UP — call done or ask_user soon!" : "";

        const header = `You are BiamOS Agent — an AI that controls a web browser to complete tasks for the user.
You can see a screenshot of the current page and a snapshot of the interactive DOM elements.

CURRENT PAGE: ${ctx.url} (${ctx.task})
USER TASK: "${ctx.task}"
📅 TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
📊 STEP ${ctx.stepNumber} of ${ctx.maxSteps} (${stepsRemaining} remaining)${urgency}${ctx.nextStepHint || ""}
${ctx.historyBlock}`;

        // ── Assemble module rules ───────────────────────────
        const moduleRules = activeModules
            .map(m => m.rules)
            .join("\n\n");

        // ── Append runtime context (at END for recency attention) ──
        const contextSection = ctx.contextData ? "\n" + ctx.contextData + "\n" : "";

        return `${header}
${moduleRules}
${contextSection}${ctx.collectedData}`;
    }
}

// ── Singleton Instance ──────────────────────────────────────

export const assembler = new PromptAssembler();

// Register all built-in modules
assembler.registerAll([
    soulModule,       // Priority 5  — always first: identity before everything
    baseModule,
    // CRUD method modules (matched via detectPhase → CRUD mapping)
    // Legacy phase-research + phase-present removed (superseded by method-*)
    // phase-action kept for edge cases where method detection fails
    phaseActionModule,
    methodGetModule,
    methodPostModule,
    methodPutModule,
    methodDeleteModule,
    // Always-on modules
    safetyModule,
    interactionModule,  // ← includes Golden ID Rule
    formsModule,
    cookiesModule,
    // Platform-specific modules
    platformXModule,
    platformYoutubeModule,
    platformGmailModule,
    platformAmazonModule,
    platformN8nModule,
    platformTodoistModule,
    socialReadingModule,
]);

// ── Load User Modules from DB ───────────────────────────────

/**
 * Load user-created prompt modules from the database and
 * register them in the assembler. Called on server startup
 * and after creating/updating modules via the API.
 */
export async function loadUserModules(): Promise<void> {
    try {
        const { db } = await import("../db/db.js");
        const { userPromptModules } = await import("../db/schema.js");
        const { eq } = await import("drizzle-orm");

        const rows = await db.select()
            .from(userPromptModules)
            .where(eq(userPromptModules.is_active, true));

        for (const row of rows) {
            const urlPatterns = JSON.parse(row.url_patterns) as string[];
            const phases = row.phases ? JSON.parse(row.phases) as PromptPhase[] : undefined;
            const taskPatterns = row.task_patterns ? JSON.parse(row.task_patterns) as string[] : undefined;

            const module: PromptModule = {
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

            assembler.register(module);
        }

        log.debug(`  📚 Loaded ${rows.length} user prompt modules from DB`);
    } catch (err) {
        log.warn(`  ⚠️ Failed to load user prompt modules:`, err);
    }
}
