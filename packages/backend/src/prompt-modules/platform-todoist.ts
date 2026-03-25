// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — Todoist
// ============================================================
// Platform-specific rules for Todoist interaction.
// Only injected when URL matches todoist.com or app.todoist.com.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformTodoistModule: PromptModule = {
    id: "platform-todoist",
    name: "Todoist",
    priority: 55,
    match: {
        urls: [/todoist\.com/i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: Todoist
═══════════════════════════════════════════════════

## NAVIGATION
- The **landing page** (todoist.com/de or todoist.com) is the MARKETING PAGE. 
  Click "Todoist öffnen" button to enter the actual app.
- The **app** lives at app.todoist.com. You are on the app when you see the sidebar with "Heute", "Eingang", project lists.

## COMPLETING / CHECKING OFF TASKS
- To mark a task as DONE: click the **circular checkbox** on the LEFT of the task name.
  - The circle is a small round button, typically 20-24px diameter, left-aligned.
  - DO NOT click on the task name text — that OPENS the task detail view (wrong!).
  - After clicking the circle, the task should disappear from the list (it's archived).
- RULE: If you see a task detail view opened after clicking, you clicked the title, not the circle. Press Escape and try again by clicking further LEFT on the circle icon.

## ADDING TASKS
- Click the "+ Aufgabe hinzufügen" button at the bottom of the task list.
- Type the task name in the appearing input field.
- To set a DUE DATE: click the "Datum" button in the task creation form.
- To set PRIORITY: click the "Priorität" button (flag icon) — a dropdown opens:
  - "Priorität 1" = highest priority (red flag) 
  - "Priorität 2" = orange/yellow
  - "Priorität 3" = blue
  - "Priorität 4" = default/no priority
  - Click the desired priority option in the dropdown. WAIT for the dropdown to open fully before clicking.
- Click "Aufgabe hinzufügen" (red button) to confirm.

## MODALS & POPUPS
- If a modal/popup appears while interacting (e.g. "Nie wieder eine Deadline verpassen", upsell modals), DISMISS it first before continuing.
  Look for a close button (×) or "Schließen"/"Vielleicht später" text and click it.
- After dismissing, re-attempt the interrupted action.

## PRIORITY SELECTION CAUTION
- The priority dropdown is a small contextual menu that appears near the "Priorität" button.
- Items are stacked vertically: P1 at top, P4 at bottom. Each item is ~36px tall.
- Click PRECISELY on the text of the desired priority. Small clicks errors pick the wrong level.
- If the dropdown closes without selection, click "Priorität" again and try once more.

## GENERAL RULES  
- Always read the current page state from the screenshot before acting.
- If you accidentally open a task detail (right panel / full-screen view opens), press Escape or click the × close button to go back, then target the circular checkbox.`,
};
