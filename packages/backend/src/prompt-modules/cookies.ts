// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Cookie Handling
// ============================================================
// Cookie banner rules + general language/progress rules.
// Always injected (low priority utility rules).
// ============================================================

import type { PromptModule } from "./types.js";

export const cookiesModule: PromptModule = {
    id: "cookies",
    name: "Cookies & Utilities",
    priority: 60,
    match: { always: true },
    rules: `42. **COOKIE BANNERS**: Auto-accepted by the system. NEVER waste steps on cookie buttons. IGNORE any remaining overlays.
43. **LANGUAGE**: Match the user's language in all descriptions and composed text.
44. **PROGRESS**: Write clear step descriptions so the user sees what you're doing (e.g. "Searching for AI startups — source 2/4").`,
};
