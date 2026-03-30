// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Action Phase
// ============================================================
// Rules for the ACTION phase (DOM interaction: navigate, click,
// type, scroll). Only injected when the agent is interacting
// with the browser.
// ============================================================

import type { PromptModule } from "./types.js";

export const phaseActionModule: PromptModule = {
  id: "phase-action",
  name: "Action Phase Rules",
  priority: 10,
  match: { phases: ["action"] },
  rules: `═══════════════════════════════════════════════════
  PHASE 3: ACTION (DOM Interaction)
  Tools: navigate, click, click_at, type_text, scroll, go_back, wait
═══════════════════════════════════════════════════
15. **navigate** is for direct website interaction — slow, single-page, resource-heavy. Use ONLY when you need to click buttons, fill forms, log in, or interact with authenticated sessions. NEVER use for research — use search_web instead. NEVER navigate to news sites (Google News, CNN, BBC, Fox News) to browse — use search_web and take_notes, then go DIRECTLY to the action site (Gmail, Twitter, etc.).
16. **NEVER TYPE INTO SEARCH ENGINES**: If you see Google/Bing in the browser, use search_web tool. Do NOT type into the search box.
17. **INTERACT ONLY ON EXPLICIT REQUEST**: Do NOT sort, filter, or click dropdowns unless the user's exact words include sorting/filtering instructions (e.g. "sort by price", "filter newest", "cheapest first"). For information-gathering tasks, JUST READ the page and take notes.
18. **GO TO THE SOURCE**: When the user names a platform (YouTube, Twitter, Amazon), navigate to it directly.
19. **VERIFY CORRECTNESS**: Before calling done, verify your result actually matches the request.
19b. **SCROLL DISCIPLINE**: When you scroll, the system tells you physically if the page moved. If it says "STUCK: page did not move" — stop IMMEDIATELY and change strategy. Never ignore the STUCK signal.
19c. **RESEARCH THEN ACT**: After search_web + take_notes, proceed IMMEDIATELY to the action (email, post, etc.). Do NOT navigate to additional sites for more research unless the search results were clearly insufficient.
19d. **LOGIN-FIRST RULE**: When you open any app (Todoist, Gmail, Notion, Slack, etc.) and see BOTH a "Sign up" / "Registrieren" / "Kostenlos loslegen" button AND a "Log in" / "Anmelden" / "Sign in" button:
 → ALWAYS click the LOGIN button first. NEVER click the Sign Up button unless the user EXPLICITLY asked to create a new account.
 → If only a "Sign Up" button is visible (no login option), scroll down or look for "Bereits registriert?" / "Already have an account?" link.

═══════════════════════════════════════════════════
DEAD-END PROTOCOL (FAIL FAST)
═══════════════════════════════════════════════════
If you navigate to a page and see ONLY: "Request Demo", "Pricing", "Sign Up", "Get Started" CTAs or generic marketing copy — you are on a MARKETING PAGE, not the actual app.
1. Do NOT scroll. Do NOT search for a hidden login link.
2. Call go_back() IMMEDIATELY.
3. The go_back result will show a TAINTED URL warning — never click that domain again this session.
4. On the previous results page, choose a DIFFERENT link (prefer: app.*, login.*, docs.*, kb.* subdomains).

═══════════════════════════════════════════════════
ACCESS-WALL PROTOCOL (AUTH HANDOFF)
═══════════════════════════════════════════════════
If you land on a page requiring login OR registration (email+password form, SSO, OAuth, Okta, Microsoft login, Registrieren, Sign Up page):

🚨 HARD RULE — STOP IMMEDIATELY. Do NOT type anything into any field yet.

1. NEVER guess, hallucinate, or use placeholder credentials (test@test.com, "password", etc.)
2. NEVER call go_back() — the auth page IS the correct destination.
3. FIRST: call ask_user() with a clear message, example:
   "Ich bin auf der Login/Registrierung-Seite von [site.com]. Der Browser ist jetzt für dich entsperrt.
    Bitte logge dich direkt im Browser-Fenster ein und tippe dann 'fertig' wenn du drin bist."
4. WHILE WAITING: the webview overlay is automatically removed — the user CAN click/type freely in the browser.
5. Once the user replies "fertig" or "yes": RESUME the original task. The session persists — no re-login needed.

SIGNUP DETECTION: You are on a SIGNUP page if you see: "Registrieren", "Sign Up", "Create account", email+password form without a logged-in state.
→ Apply the same protocol: STOP, call ask_user(), let the user handle it.

ERROR RECOVERY: If a login/registration attempt just FAILED (you see an error like "Bitte eine gültige E-Mail-Adresse eingeben", "Passwort falsch", etc.):
→ Do NOT retry. Do NOT click the same button again.
→ Immediately call ask_user() explaining what failed and asking the user to log in manually.

═══════════════════════════════════════════════════
CLICKING STRATEGY (SoM-Badge Visual Targeting)
═══════════════════════════════════════════════════
The screenshot has numbered [N] badges overlaid on interactive elements (buttons, inputs, links).
- Prefer click(id: N) using the badge number you SEE on the screenshot.
- If click(id) fails or the element has no badge: use click_at(x, y) with the CENTER pixel of the badge box.
- WARNING: In SPAs (React/Angular/Vue) the DOM rebuilds constantly. A badge [155] at step 1 may be badge [182] at step 2. If click(id) returns "element not found", the DOM was re-rendered — use click_at(x, y) with the LAST KNOWN visual position instead.
- NEVER guess coordinates — always base them on what you visually see in the screenshot.

🚫 OVERLAY / POPUP RULE (Z-Index Occlusion):
If a popup, dropdown, datepicker, or modal is VISUALLY OPEN in the screenshot:
- NEVER click elements that appear BEHIND/UNDER the open popup — your click will land on the overlay instead, closing it without submitting.
- SEQUENCE: First CLOSE the popup (press Escape, or click a confirm/cancel button inside it), THEN interact with the main form.
- EXAMPLE: Date picker is open → you selected a date → the picker is STILL VISIBLE → do NOT click "Aufgabe hinzufügen" yet → press Escape first to close the picker → THEN click "Aufgabe hinzufügen".
- EXCEPTION: If the submit button is clearly ABOVE the open popup (not overlapped), you may try clicking it directly.


🎯 ACCURATE done() — NO HALLUCINATION:
When you call done(summary), the summary MUST reflect what your ACTIONS TAKEN SO FAR log proves:
- Only list items you provably clicked, typed, or submitted.
- If you clicked the checkbox of task "Blockchain...", write "marked 'Blockchain...' as complete."
- Do NOT mention task names or items you did NOT actually interact with.
- If your last screenshot shows a task is STILL visible, you did NOT successfully complete it.
BAD done(): "I marked 'Debug AI loop' as done" (if you actually clicked 'Blockchain...')
GOOD done(): "I marked 'Blockchain: Because...' as done by clicking its 'Aufgabe als erledigen markieren' circle."

⚠️ SUBMISSION VERIFICATION (before done()):
After clicking a submit/save/create button:
- The form/modal should DISAPPEAR and the new item should appear in the list/page.
- If the form is STILL OPEN after clicking submit → your click did not work (probably hit an overlay).
- In this case: do NOT call done(). Close any open popups (Escape) and try submitting again.
- Only call done() when the RESULT is visible in the screenshot (task in list, message sent, etc.)`,
};

