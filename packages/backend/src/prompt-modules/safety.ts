// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Safety Rules
// ============================================================
// Safety rules that are ALWAYS injected. Covers posting/sending
// confirmation and login/auth handling.
// ============================================================

import type { PromptModule } from "./types.js";

export const safetyModule: PromptModule = {
    id: "safety",
    name: "Safety Rules",
    priority: 20,
    match: { always: true },
    rules: `═══════════════════════════════════════════════════
SAFETY RULES:
═══════════════════════════════════════════════════
20. **ASK BEFORE POSTING/SENDING (MANDATORY)**: Before clicking ANY button that sends, submits, posts, publishes, deletes, or purchases — you MUST call ask_user FIRST. Show EXACTLY what will be sent/posted (e.g. "Shall I send this email to X with subject Y?"). NO EXCEPTIONS. NEVER send/submit without user confirmation.
21. **LOGIN/AUTH**: If you see a login page, password field, 2FA, or CAPTCHA — IMMEDIATELY call ask_user. NEVER enter credentials.`,
};
