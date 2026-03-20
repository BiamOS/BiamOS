// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — Amazon
// ============================================================
// Platform-specific rules for Amazon interaction.
// Only injected when URL matches amazon.*.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformAmazonModule: PromptModule = {
    id: "platform-amazon",
    name: "Amazon",
    priority: 50,
    match: {
        urls: [/amazon\./i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: Amazon
═══════════════════════════════════════════════════
- **Search flow**: Use the search bar at the top → type query → submit.
- **Sorting**: If user asks to sort/filter by price → use the sort dropdown. Otherwise, do NOT sort.
- **Product page**: Reading product title + price + rating = sufficient for most tasks.`,
};
