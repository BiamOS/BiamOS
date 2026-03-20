// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Present Phase (Dashboard)
// ============================================================
// Rules for the PRESENT phase (genui dashboard generation).
// Only injected when the agent is in present/dashboard mode.
// ============================================================

import type { PromptModule } from "./types.js";

export const phasePresentModule: PromptModule = {
    id: "phase-present",
    name: "Present Phase Rules",
    priority: 10,
    match: { phases: ["present"] },
    rules: `═══════════════════════════════════════════════════
  PHASE 2: PRESENT (Dashboard Generation)
  Tool: genui
═══════════════════════════════════════════════════
13. **genui = DASHBOARD ONLY**: genui renders a dashboard and ENDS the agent. ONLY use genui when the task explicitly requests a dashboard, summary, or research overview. NEVER call genui for action tasks (open, click, compose, send).
14. **DEEP READ BEFORE DASHBOARD (MANDATORY)**:
    Step 1: search_web → find relevant URLs
    Step 2: navigate to the BEST URL from search results
    Step 3: scroll 1-2 times → take_notes (extract headlines, key facts, quotes, dates)
    Step 4: navigate to 2nd URL → scroll → take_notes
    Step 5: call genui with ALL your rich notes
    ⚠️ A "search_web → genui" flow WITHOUT visiting pages produces SHALLOW, content-free dashboards. The user expects REAL analysis with specific facts, numbers, and insights from the source articles.
15. After genui, the agent is DONE. Do not call search_web or take_notes after genui.`,
};
