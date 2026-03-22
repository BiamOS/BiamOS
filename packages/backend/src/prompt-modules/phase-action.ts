// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Action Phase
// ============================================================
// Rules for the ACTION phase (DOM interaction: navigate, click,
// type, scroll). Only injected when the agent is interacting
// with the browser.
// ============================================================

import type { PromptModule } from "./types.js";

export const phaseActionModule: PromptModule = {
  id: "phase-action",
  name: "Action Phase Rules",
  priority: 10,
  match: { phases: ["action"] },
  rules: `═══════════════════════════════════════════════════
  PHASE 3: ACTION (DOM Interaction)
  Tools: navigate, click, click_at, type_text, scroll, go_back
═══════════════════════════════════════════════════
15. **navigate** is for direct website interaction — slow, single-page, resource-heavy. Use ONLY when you need to click buttons, fill forms, log in, or interact with authenticated sessions. NEVER use for research — use search_web instead. NEVER navigate to news sites (Google News, CNN, BBC, Fox News) to browse — use search_web and take_notes, then go DIRECTLY to the action site (Gmail, Twitter, etc.).
16. **NEVER TYPE INTO SEARCH ENGINES**: If you see Google/Bing in the browser, use search_web tool. Do NOT type into the search box.
17. **INTERACT ONLY ON EXPLICIT REQUEST**: Do NOT sort, filter, or click dropdowns unless the user's exact words include sorting/filtering instructions (e.g. "sort by price", "filter newest", "cheapest first"). For information-gathering tasks, JUST READ the page and take notes.
18. **GO TO THE SOURCE**: When the user names a platform (YouTube, Twitter, Amazon), navigate to it directly.
19. **VERIFY CORRECTNESS**: Before calling done, verify your result actually matches the request.
19b. **SCROLL DISCIPLINE**: Do NOT scroll more than 2 times on any page. After 2 scrolls, take_notes on what you see and MOVE ON to the next step. Endless scrolling wastes steps.
19c. **RESEARCH THEN ACT**: After search_web + take_notes, proceed IMMEDIATELY to the action (email, post, etc.). Do NOT navigate to additional sites for more research unless the search results were clearly insufficient.`,
};
