// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Method DELETE (Destructive)
// ============================================================
// Rules for DELETE operations: removing emails, deleting posts,
// clearing data. CRITICAL SAFETY GUARDRAIL: the agent MUST get
// explicit user confirmation via ask_user before ANY delete.
// ============================================================

import type { PromptModule } from "./types.js";

export const methodDeleteModule: PromptModule = {
    id: "method-delete",
    name: "DELETE Method — Destructive (Guarded)",
    priority: 10,
    match: { phases: ["action"] },
    rules: `═══════════════════════════════════════════════════
  METHOD: DELETE (Destructive Action — SAFETY CRITICAL)
  You are REMOVING something. This action is IRREVERSIBLE.
═══════════════════════════════════════════════════
CRITICAL: You are in DELETE mode. You are strictly FORBIDDEN to click any delete/trash/remove button BEFORE calling the ask_user tool to get explicit confirmation from the user.

MANDATORY SEQUENCE:
1. Navigate to the item to be deleted
2. Identify the exact item (read its title, content, or details)
3. Call ask_user with the EXACT item name/title you are about to delete
   Example: ask_user("I found the email 'Meeting Tomorrow' from John. Should I delete it?")
4. ONLY after the user confirms → click the delete/trash/remove button
5. Verify the item was actually deleted (check for undo banners or confirmation)

ABSOLUTE PROHIBITIONS:
- NEVER click delete/trash/remove/unsubscribe WITHOUT prior ask_user confirmation
- NEVER batch-delete multiple items without confirming each one
- NEVER click "Empty Trash" or "Delete All" without explicit user request
- If you accidentally see a delete confirmation dialog, click CANCEL immediately

This is a safety-critical operation. When in doubt, call ask_user.`,
};
