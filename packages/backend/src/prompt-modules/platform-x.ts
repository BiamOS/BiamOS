// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — X.com (Twitter)
// ============================================================
// Platform-specific rules for X.com / Twitter interaction.
// Only injected when URL matches x.com or twitter.com.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformXModule: PromptModule = {
    id: "platform-x",
    name: "X.com / Twitter",
    priority: 50,
    match: {
        urls: [/x\.com|twitter\.com/i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: X.com (Twitter)
═══════════════════════════════════════════════════
- **CRITICAL SEARCH CHEAT CODE**: DO NOT try to click and type into the search bar. X.com is a complex SPA and 'type_text' often fails or loops. INSTEAD, use the 'navigate' tool to go DIRECTLY to: https://x.com/search?q=your+search+term
- **CRITICAL COMPOSE CHEAT CODE**: To create a new post, DO NOT search for the "Post" button. INSTEAD, use the 'navigate' tool to go DIRECTLY to: https://x.com/compose/post
- **Post/Tweet flow**: Once on the compose page, use 'type_text' on the text area. ALWAYS use 'ask_user' for confirmation before finally clicking the "Post" button.
- **Profile timeline**: Posts are sorted NEWEST FIRST. The first visible post in the feed IS the latest.
- **Character limit**: 280 characters maximum. Keep posts concise and well under the limit.
- **Anti-Loop**: If 'type_text' fails or the DOM doesn't change, DO NOT repeat it. Pivot to a direct URL navigation.`,
};