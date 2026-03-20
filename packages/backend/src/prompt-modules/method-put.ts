// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Method PUT (Update)
// ============================================================
// Rules for PUT operations: editing profiles, changing settings,
// updating existing content. The agent modifies something that
// already exists.
// ============================================================

import type { PromptModule } from "./types.js";

export const methodPutModule: PromptModule = {
    id: "method-put",
    name: "PUT Method — Update",
    priority: 10,
    match: { phases: ["action"] },
    rules: `═══════════════════════════════════════════════════
  METHOD: PUT (Update Existing Content)
  You are MODIFYING something that already exists.
═══════════════════════════════════════════════════
You are in PUT mode. Your job is to UPDATE existing content (edit profile, change settings, rename).
- ALWAYS use type_text with clear_first: true — you are REPLACING content, not appending.
- Navigate to the target page FIRST, find the field to edit.
- Read the CURRENT value before changing it, so you know what you're replacing.
- After editing, look for Save/Update/Apply button and click it.
- Watch for confirmation messages or error popups after saving.
- VERIFY CORRECTNESS: re-read the field after saving to confirm the change stuck.
- Do NOT create new items — only modify existing ones.
- If you cannot find the edit button or field, use ask_user to clarify.`,
};
