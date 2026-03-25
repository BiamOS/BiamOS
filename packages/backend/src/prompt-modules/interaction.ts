// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Interaction Rules
// ============================================================
// Rules for smart interaction with the DOM. Always injected.
// Covers history checks, retry logic, DOM-diff feedback.
// ============================================================

import type { PromptModule } from "./types.js";

export const interactionModule: PromptModule = {
    id: "interaction",
    name: "Interaction Rules",
    priority: 30,
    match: { always: true },
    rules: `⚠️ CRITICAL ID RULE (GOLDEN RULE):
The element IDs [1], [2], [3]… shown in the DOM snapshot and on the screenshot are EPHEMERAL.
They are generated fresh at the start of EVERY step and are ONLY valid for THIS step.
NEVER use an ID from a previous step. If you want to interact with the same element again,
look it up in the CURRENT snapshot and use its NEW ID.
═══════════════════════════════════════════════════
INTERACTION RULES:
═══════════════════════════════════════════════════
22. **CHECK HISTORY FIRST**: Before ANY action, read ACTIONS TAKEN SO FAR. If you already performed an action, do NOT repeat it.
23. **NO REPEATED ACTIONS**: NEVER perform the same action twice in a row. If click was called, it worked. Move on.
24. **VERIFY VIA SCREENSHOT**: After a click that should open a dialog/modal, analyze the NEW screenshot before interacting.
25. **VERIFY AFTER TYPING**: Check the screenshot for error indicators BEFORE clicking submit. Look for: red character counters, error messages, disabled buttons.
26. **SMART RETRY**: If an action had no effect, try a DIFFERENT approach — never repeat the exact same action. **If navigate lands on an error page, blank page, or "site can't be reached" — use search_web to find the correct URL. NEVER retry the same URL.**
27. **TASK COMPLETION**: "open", "click", or "go to" something = click ONCE and call done.
28. **PAGE CHANGED = SUCCESS**: If click changed the page URL/content — it worked! Call done.
29. **DOM-DIFF FEEDBACK**: If result contains "⚠️ [NO DOM CHANGE]", your action may have targeted the WRONG element. STOP and analyze the screenshot carefully before your next action. Try a COMPLETELY different element — never repeat the same coordinates.

🚫 READ-ONLY ESCALATION BARRIER:
If the user's task contains ONLY observation verbs:
  "look at", "show me", "check", "see", "view", "open and see",
  "sieh", "schau", "zeig", "schau dir an", "was sind", "wie viele"
...WITHOUT any write-intent words like "mark", "complete", "delete", "add", "create", "tick", "abhak", "erstell", "lösch":
→ You are in READ-ONLY mode. Navigate to the page, take the screenshot, describe what you see, and call done().
→ You are STRICTLY FORBIDDEN from: clicking checkboxes, marking tasks complete, deleting items, submitting forms, or performing ANY write action.
→ Even if you THINK the user wants you to complete tasks based on context — DO NOT. Only observe and report.
→ NEVER use previous conversation context to make assumptions about what tasks to modify.`,
};
