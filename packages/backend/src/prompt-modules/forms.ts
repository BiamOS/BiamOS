// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Form & Text Rules
// ============================================================
// Rules for typing, form filling, email composition, and
// contextual writing. Injected during action phase only.
// ============================================================

import type { PromptModule } from "./types.js";

export const formsModule: PromptModule = {
    id: "forms",
    name: "Form & Text Rules",
    priority: 40,
    match: { phases: ["action"] },
    rules: `═══════════════════════════════════════════════════
FORM & TEXT RULES:
═══════════════════════════════════════════════════
30. **COMPLETE TEXT IN ONE CALL**: Write the COMPLETE text in ONE type_text call. NEVER split text across multiple calls. CRITICAL: clear_first is FALSE by default — text is APPENDED. To REPLACE existing text, explicitly pass clear_first: true.
31. **NO RE-TYPING (CRITICAL)**: If a type_text result shows "✓ COMPLETE (N chars)", ALL N characters were typed successfully. That field is DONE — do NOT type into it again. Move to the NEXT step. Re-typing causes DUPLICATION which is a FATAL ERROR. The preview may be truncated but the FULL text was inserted.
32. **TYPE BY ID (MANDATORY)**: ALWAYS use type_text(id=N) with the Set-of-Mark ID from the DOM snapshot. This guarantees correct element targeting. NEVER use type_text without an id.
34. **SEARCH BAR SUBMISSION**: When typing into search bars, ALWAYS set submit_after=true.
35. **CONTEXTUAL WRITING (CRITICAL)**: When typing emails, tweets, or posts, ALWAYS use REAL DATA from the COLLECTED DATA section below. NEVER write placeholders like "[Insert summary here]" or generic text. Summarize the ACTUAL search results you collected. Match the language of the user's original request.
36. **CLICK BEFORE BODY**: Rich-text editors (email body, comment boxes, editors) REQUIRE a click to activate. ALWAYS click the body/editor area FIRST, then type_text in the NEXT step.
37. **FIND COMPOSE AREAS**: Look for [role=textbox], [contenteditable], or placeholder text.
38. **TYPING VERIFICATION**: If type_text returns "⚠️ Text did not appear", your text went into the WRONG element. STOP — click the CORRECT field and try again. Check the "→ field:" tag in the result to confirm you typed into the right element.
39. **CROSS-REFERENCE OUTPUTS**: When a task requires MULTIPLE outputs (e.g. email + social post), each output should build on the SAME collected data. A social media post should SUMMARIZE the key facts from your research — not just echo the user's meta-instruction. Write substantive content that showcases the actual information.
40. **PLATFORM CHARACTER LIMITS**: Before posting on ANY social media platform, check for character limits. Common limits: X/Twitter=280, LinkedIn post=3000, Instagram caption=2200. Keep posts WELL under the limit (10+ char buffer). If you see a character counter on the page showing negative numbers, your text is too long — delete and rewrite shorter. Be concise — prioritize impact over length.`,
};
