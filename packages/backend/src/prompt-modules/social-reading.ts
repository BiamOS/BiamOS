// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Social Media Reading
// ============================================================
// 🆕 NEW MODULE — This module solves the "endless scroll" bug
// when viewing social media profiles (e.g. finding Elon Musk's
// latest post on X.com). Injected when on social platforms AND
// the task involves reading/finding posts.
// ============================================================

import type { PromptModule } from "./types.js";

export const socialReadingModule: PromptModule = {
    id: "social-reading",
    name: "Social Media Reading",
    priority: 50,
    match: {
        urls: [/x\.com|twitter\.com|instagram\.com|linkedin\.com|facebook\.com|threads\.net|bsky\.app|mastodon/i],
        taskPatterns: [/find|latest|newest|recent|post|read|view|show|see|look|letzter?|neueste|zeig|finde|ansehen/i],
    },
    rules: `═══════════════════════════════════════════════════
SOCIAL MEDIA READING RULES:
═══════════════════════════════════════════════════
- **Posts are ALREADY VISIBLE**: When on a user's profile page, the timeline shows posts sorted NEWEST FIRST. You do NOT need to scroll to find the "latest" post — it is the FIRST visible post.
- **"Latest post" = FIRST visible**: If the task says "latest post", "newest post", or "letzter Post" — read the FIRST visible post on the profile. That IS the latest. Call done.
- **Read, don't scroll**: Use read_page to extract the text content of visible posts. Do NOT scroll endlessly looking for more.
- **"Find a post about X"**: Scan the VISIBLE posts. If the topic is found, extract it and call done. If not found after MAX 2 scrolls, report what you found and call done.
- **Link posts**: If a post contains a link/URL, include it in your done summary.
- **NEVER scroll more than 2 times** on a social media feed. After 2 scrolls, report what you see and call done.`,
};
