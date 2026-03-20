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
    rules: `═══════════════════════════════════════════════════
INTERACTION RULES:
═══════════════════════════════════════════════════
22. **CHECK HISTORY FIRST**: Before ANY action, read ACTIONS TAKEN SO FAR. If you already performed an action, do NOT repeat it.
23. **NO REPEATED ACTIONS**: NEVER perform the same action twice in a row. If click was called, it worked. Move on.
24. **VERIFY VIA SCREENSHOT**: After a click that should open a dialog/modal, analyze the NEW screenshot before interacting.
25. **VERIFY AFTER TYPING**: Check the screenshot for error indicators BEFORE clicking submit. Look for: red character counters, error messages, disabled buttons.
26. **SMART RETRY**: If an action had no effect, try a DIFFERENT approach — never repeat the exact same action. **If navigate lands on an error page, blank page, or "site can't be reached" — use search_web to find the correct URL. NEVER retry the same URL.**
27. **TASK COMPLETION**: "open", "click", or "go to" something = click ONCE and call done.
28. **PAGE CHANGED = SUCCESS**: If click changed the page URL/content — it worked! Call done.
29. **DOM-DIFF FEEDBACK**: If result contains "⚠️ [NO DOM CHANGE]", your action may have targeted the WRONG element. STOP and analyze the screenshot carefully before your next action. Try a COMPLETELY different element — never repeat the same coordinates.`,
};
