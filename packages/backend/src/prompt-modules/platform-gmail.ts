// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — Gmail
// ============================================================
// Platform-specific rules for Gmail email composition.
// Only injected when URL matches mail.google.com.
// ============================================================

import type { PromptModule } from "./types.js";

export const platformGmailModule: PromptModule = {
  id: "platform-gmail",
  name: "Gmail",
  priority: 50,
  match: {
    urls: [/mail\.google\.com/i],
  },
  rules: `═══════════════════════════════════════════════════
PLATFORM: Gmail
═══════════════════════════════════════════════════
- **CRITICAL COMPOSE CHEAT CODE**: To start a new email, DO NOT click "Compose" multiple times. You can use 'navigate' to go directly to: https://mail.google.com/mail/u/0/#inbox?compose=new. If a compose window is already open, DO NOT open another one.
- **COMPOSE WINDOW TIMING**: After navigating to ?compose=new, the compose window takes 500-1500ms to render. If the DOM snapshot shows NO "To", "Subject", or "Message Body" fields with the expected aria-labels, call wait(ms: 1000, reason: "Waiting for compose window to fully render") before attempting to type. Do NOT try to type into a field that is not yet in the DOM.
- **MULTIPLE WINDOWS GUARD**: If you see multiple "New Message" windows open in the DOM, this will confuse your targeting. Always target the fields of the ACTIVE or most completely filled window.
- **THE 'TO' FIELD (CHIPS)**: Gmail's 'To' field expects a chip. Use 'type_text' to enter the EXACT full email address. If a dropdown suggestion appears, you MUST use the 'click' tool to select the correct dropdown item so it turns into a contact chip.
- **SUBJECT & BODY SEQUENCING**: Target the exact SoM ID for the Subject line and use 'type_text'. Then, target the exact SoM ID for the large message Body and use 'type_text'. NEVER try to navigate between them using the Tab key.
- **ANTI-LOOP**: If typing into a field fails, do not repeat it endlessly. Click the field first to ensure it has focus, then type.
- **SENDING**: ALWAYS use the 'ask_user' tool to request final confirmation before clicking the blue "Send" button. Never send an email without user consent.`,
};