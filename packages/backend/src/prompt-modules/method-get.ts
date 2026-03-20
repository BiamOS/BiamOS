// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Method GET (Read Only)
// ============================================================
// Rules for GET operations: reading pages, finding info, research.
// The agent may observe but NOT modify anything.
// Replaces the former phase-research.ts module.
// ============================================================

import type { PromptModule } from "./types.js";

export const methodGetModule: PromptModule = {
    id: "method-get",
    name: "GET Method — Read Only",
    priority: 10,
    match: { phases: ["research", "present"] },
    rules: `═══════════════════════════════════════════════════
  METHOD: GET (Read Only)
  You are in READ-ONLY mode. Observe, search, and extract information.
═══════════════════════════════════════════════════
CRITICAL: You are in GET mode. You may READ pages but must NOT modify anything.
- You are FORBIDDEN from typing into any form field, composing messages, or submitting forms.
- Use search_web for broad information gathering (max 3-4 calls).
- Use take_notes to capture structured data from pages.
- Use click and scroll only for NAVIGATION (clicking links, tabs, expanding sections).
- NEVER type into search boxes on websites — use the search_web tool instead.
- NEVER GUESS URLs: if not 100% certain, use search_web first.
- PREFER RECENT SOURCES: for news/trends, prefer articles from the current month.
- SCROLL DISCIPLINE: max 2 scrolls per page, then take_notes and move on.
- After gathering enough data, call genui for dashboards OR call done.`,
};
