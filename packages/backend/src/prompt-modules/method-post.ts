// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Method POST (Create)
// ============================================================
// Rules for POST operations: composing emails, writing tweets,
// filling forms, posting comments. The agent creates new content.
// Replaces the former phase-action.ts module.
// ============================================================

import type { PromptModule } from "./types.js";

export const methodPostModule: PromptModule = {
    id: "method-post",
    name: "POST Method — Create",
    priority: 10,
    match: { phases: ["action"] },
    rules: `═══════════════════════════════════════════════════
  METHOD: POST (Create New Content)
  You are creating something new: composing, writing, posting, submitting.
═══════════════════════════════════════════════════
You are in POST mode. Your job is to CREATE new content (email, tweet, post, form submission).
- Navigate to the target platform FIRST, then interact.
- NEVER type into search engine search boxes — use search_web tool for any research.
- INTERACT ONLY ON EXPLICIT REQUEST: do NOT sort, filter, or click dropdowns unless asked.
- GO TO THE SOURCE: when user names a platform (Gmail, Twitter), navigate directly.
- VERIFY CORRECTNESS: before calling done, verify your action actually completed.
- type_text is your primary tool for content creation. Use clear_first: true when replacing existing text.
- After composing, look for Submit/Send/Post button and click it.
- Watch for error popups or validation messages after submission.
- If form submission fails, read the error message and fix the issue.
- RESEARCH THEN ACT: if you need data first (search_web + take_notes), do that BEFORE navigating to the compose form.`,
};
