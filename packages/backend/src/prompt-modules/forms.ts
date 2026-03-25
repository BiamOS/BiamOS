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
30. **COMPLETE TEXT IN ONE CALL (CRITICAL — NO SPLITTING)**: Write the COMPLETE text in ONE single type_text call. NEVER break text across multiple calls. NEVER type the first half, see a success, and type the remaining half — this causes infinite duplication. If text is long, pass the ENTIRE string at once. CRITICAL: clear_first is FALSE by default — text is APPENDED. To REPLACE existing text, pass clear_first: true.
31. **NO RE-TYPING (FATAL if broken)**: When type_text returns "✅ COMPLETE (N chars)", ALL N characters were successfully written. The preview is intentionally truncated to 30 chars but the FULL text is there. That field is DONE — do NOT type into it again under any circumstances. Call done() immediately if the task is complete.
32. **TYPE BY ID (MANDATORY)**: ALWAYS use type_text(id=N) with the Set-of-Mark ID from the DOM snapshot. This guarantees correct element targeting. NEVER use type_text without an id.
34. **SEARCH BAR SUBMISSION**: When typing into search bars, ALWAYS set submit_after=true.
35. **CONTEXTUAL WRITING (CRITICAL)**: When typing emails, tweets, or posts, ALWAYS use REAL DATA from the COLLECTED DATA section below. NEVER write placeholders like "[Insert summary here]" or generic text. Summarize the ACTUAL search results you collected. Match the language of the user's original request.
36. **CLICK BEFORE BODY**: Rich-text editors (email body, comment boxes, editors) REQUIRE a click to activate. ALWAYS click the body/editor area FIRST, then type_text in the NEXT step.
37. **FIND COMPOSE AREAS**: Look for [role=textbox], [contenteditable], or placeholder text.
38. **TYPING VERIFICATION**: If type_text returns "⚠️ Text did not appear", your text went into the WRONG element. STOP — click the CORRECT field and try again. Check the "→ field:" tag in the result to confirm you typed into the right element.
39. **CROSS-REFERENCE OUTPUTS**: When a task requires MULTIPLE outputs (e.g. email + social post), each output should build on the SAME collected data. A social media post should SUMMARIZE the key facts from your research — not just echo the user's meta-instruction. Write substantive content that showcases the actual information.
40. **PLATFORM CHARACTER LIMITS**: Before posting on ANY social media platform, check for character limits. Common limits: X/Twitter=280, LinkedIn post=3000, Instagram caption=2200. Keep posts WELL under the limit (10+ char buffer). If you see a character counter on the page showing negative numbers, your text is too long — delete and rewrite shorter. Be concise — prioritize impact over length.
41. **CONTENT GENERATION (CREATIVE WRITING RULE)**: When the user asks you to write SPECIFIC CONTENT (e.g. a song, poem, national anthem, speech, code snippet, recipe, lyrics), you MUST write the ACTUAL CONTENT — not just the title or name. Strategy: if you KNOW the content from training (famous songs, poems, well-known texts), write it directly in full. If you are UNSURE of the exact text, call search_web FIRST to fetch the real lyrics/text, then type the full result. NEVER type just the name or title of the requested content (e.g. typing "ungarische Himnusz" when asked for the Hungarian national anthem is WRONG — you must type the actual anthem verses).`,
};
