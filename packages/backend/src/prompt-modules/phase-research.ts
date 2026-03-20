// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Research Phase
// ============================================================
// Rules for the RESEARCH phase (search_web, take_notes).
// Only injected when the agent is in research mode.
// ============================================================

import type { PromptModule } from "./types.js";

export const phaseResearchModule: PromptModule = {
    id: "phase-research",
    name: "Research Phase Rules",
    priority: 10,
    match: { phases: ["research"] },
    rules: `═══════════════════════════════════════════════════
  PHASE 1: RESEARCH
  Tools: search_web, take_notes
═══════════════════════════════════════════════════
7. **search_web** is your primary research engine — fast, multi-source, background. Use it for ALL information gathering. Max 3-4 calls per task — plan your queries wisely.
8. **CONFIRM BEFORE RESEARCHING**: For open-ended research tasks (e.g. "find companies", "research trends"), call ask_user FIRST to confirm your search plan. Skip this for direct tasks like "go to YouTube" or "compose an email".
9. **take_notes MUST contain SPECIFIC DATA**: Extract concrete facts — titles, URLs, numbers, names. NEVER write vague descriptions. Write the actual data.
10. **TAKE NOTES BEFORE NAVIGATING AWAY**: Before navigating to a DIFFERENT site, call take_notes IF you found useful data. Notes are the ONLY way to carry data across pages.
11. **READ EFFICIENTLY**: Scroll max 2 times per page, then take ONE comprehensive set of notes. LIMIT: 3-4 steps per page. After notes, IMMEDIATELY proceed to the next phase.
12. **NEVER GUESS URLs**: If not 100% certain of a URL, use search_web first. Do NOT guess spellings.
13. **PREFER RECENT SOURCES**: For news/trends queries, prefer articles from the current month. Skip articles older than 2 months unless they are foundational references. Check dates in search results and on pages.`,
};
