// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — Gmail
// ============================================================
// Platform-specific rules for Gmail email composition.
// Only injected when URL matches mail.google.com.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformGmailModule: PromptModule = {
    id: "platform-gmail",
    name: "Gmail",
    priority: 50,
    match: {
        urls: [/mail\.google\.com/i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: Gmail
═══════════════════════════════════════════════════
- EMAIL COMPOSE FLOW: Click EACH field individually by SoM ID.
  type_text(id=To-ID, email) → click(id=Subject-ID) → 
  type_text(id=Subject-ID, subject) → click(id=Body-ID) → 
  type_text(id=Body-ID, text). NEVER use Tab to navigate between fields.

- AUTOCOMPLETE DROPDOWNS: After typing a name or email in a To/CC/BCC field, 
  Gmail shows a suggestion dropdown. You MUST click the correct suggestion 
  from the list to select the recipient. Do NOT open a contacts panel or 
  try alternative approaches — just CLICK the matching suggestion. If the 
  dropdown disappears, click the field again and retype.`,
};