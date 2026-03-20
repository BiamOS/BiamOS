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
- **Search flow**: Use the search bar (magnifying glass icon or "Search" input) → type query → press Enter.
- **Profile timeline**: Posts are sorted NEWEST FIRST by default. The first visible post IS the latest.
- **Post/Tweet flow**: Click the compose/post button → type your text → ask_user before clicking "Post".
- **Character limit**: 280 characters maximum. Keep posts WELL under the limit.`,
};
