// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — YouTube
// ============================================================
// Platform-specific rules for YouTube interaction.
// Only injected when URL matches youtube.com.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformYoutubeModule: PromptModule = {
    id: "platform-youtube",
    name: "YouTube",
    priority: 50,
    match: {
        urls: [/youtube\.com/i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: YouTube
═══════════════════════════════════════════════════
- **Channel flow**: Search for channel → click channel page → click "Videos" tab → click first video (newest by default).
- **Search bar**: Use the search input at the top. Type query and set submit_after=true.
- **Video page**: If task is to find/watch a video, navigating to the video page = SUCCESS. Call done.`,
};
