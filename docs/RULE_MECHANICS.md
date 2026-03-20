# Rule Mechanics — Deep Dive

> How platform rules are generated, injected, and translated into browser actions.

---

## 1. The Analysis Phase (`POST /analyze`)

### What the LLM Should Look For

The LLM receives **rendered page text** (via `buildExtractionScript()`) — not raw HTML. It sees headings, labels, breadcrumbs, and structured content. From this, it should identify:

| Look For | Example | Why |
|----------|---------|-----|
| **Navigation patterns** | "Top nav has Home, Explore, Notifications" | Tells agent WHERE things are |
| **Search mechanics** | "Search bar is at top, uses autocomplete" | Prevents blind coordinate clicking |
| **Form submission flows** | "Login: email field → password field → Sign In button" | Sequencing matters |
| **Hidden UI quirks** | "GitHub uses a command palette (Ctrl+K)" | Saves the agent from guessing |
| **Modal/popup behavior** | "Cookie consent banner appears on first visit" | Agent knows to dismiss it first |
| **Content layout** | "Posts are sorted newest-first in the feed" | Agent knows which item is "latest" |

### What It Should NOT Look For

| ❌ Avoid | Why |
|----------|-----|
| CSS selectors (`div.header > nav > ul > li:nth-child(3)`) | Breaks on any DOM change |
| XPath expressions (`//div[@class="xyz"]/span[2]`) | Same fragility issue |
| Pixel coordinates (`click at x:340, y:120`) | Breaks on any viewport/layout change |
| Implementation details (`React component name`, `data-testid`) | Internal, can change without notice |

### Why Semantic-Only Rules Win

The agent already receives the **live DOM snapshot** with Set-of-Mark (SoM) IDs at execution time:

```
[0] NAV
  [1] A "Home"
  [2] A "Explore"
  [3] INPUT placeholder="Search GitHub"
  [4] A "Sign in"
[5] MAIN
  [6] H1 "Build and ship software on a single, collaborative platform"
  [7] A "Sign up for GitHub"
```

The LLM doesn't need CSS selectors because it can **see the real DOM in every step**. The platform rule just tells it the *strategy*:

```
Rule: "To search, use the search input at the top → type query → press Enter"
DOM:  [3] INPUT placeholder="Search GitHub"
LLM:  → type_text(id: 3, text: "my query", submit_after: true)
```

The rule provides the **WHAT** (use the search input). The live DOM provides the **WHERE** (it's element [3]). The LLM bridges the gap.

---

## 2. Anatomy of the Perfect Rule

### ✅ Excellent Rule (Gmail)

```
═══════════════════════════════════════════════════
PLATFORM: Gmail
═══════════════════════════════════════════════════
- EMAIL COMPOSE FLOW: Click EACH field individually by SoM ID.
  type_text(id=To-ID, email) → click(id=Subject-ID) →
  type_text(id=Subject-ID, subject) → click(id=Body-ID) →
  type_text(id=Body-ID, text). NEVER use Tab to navigate between fields.
- AUTOCOMPLETE DROPDOWNS: After typing a name or email in a To/CC/BCC field,
  Gmail shows a suggestion dropdown. You MUST click the correct suggestion.
```

**Why it's excellent:**
- Describes the **flow** (sequence of actions), not specific elements
- Warns about a **platform quirk** (autocomplete dropdowns)
- Tells the agent what **NOT to do** (don't use Tab — this is a known Gmail issue)
- Uses SoM ID **references** (`id=To-ID`) as a pattern, not hardcoded values

### ❌ Bad Rule

```
═══════════════════════════════════════════════════
PLATFORM: Gmail
═══════════════════════════════════════════════════
- Click div.T-I.T-I-KE.L3 to compose a new email
- The To field is at input[name="to"] with aria-label="To recipients"
- Click the blue button at coordinates (1150, 680) to send
```

**Why it's terrible:**
- `div.T-I.T-I-KE.L3` — CSS class names change with Gmail updates
- Hardcoded `aria-label` — Gmail A/B tests different labels
- Pixel coordinates — different on every screen size
- No **flow description** — just a list of brittle pointers

### What Platform Rules Need vs. What `base.ts` Covers

| Already in `base.ts` (skip in platform rules) | Needed in platform rules |
|---|---|
| "Use click(id: N) for SoM elements" | Platform-specific UI flows |
| "One tool call per step" | Search bar location/behavior |
| "Analyze screenshot + DOM" | Form submission sequences |
| "DONE = fully complete" | Hidden quirks (autocomplete, modals) |
| Task type detection (ACTION vs RESEARCH) | Content layout (newest first, etc.) |
| Safety: ask_user before destructive actions | Platform-specific terminology |

**Rule of thumb:** If `base.ts` already teaches the agent *how to use tools*, platform rules teach it *how this specific website works*.

---

## 3. The Execution Flow (Rule → Tool Call)

### Complete chain: User says "Log me in" on aineeds.io

```
Step 1: Frontend sends to backend:
├── task: "Log me in"
├── page_url: "https://aineeds.io"
├── dom_snapshot: "[0] NAV [1] A 'Home' [2] A 'Pricing' [3] A 'Log in' [4] MAIN ..."
├── screenshot: <base64 PNG>
└── method: "POST" (from classifier — login = write action)

Step 2: Backend builds system prompt:
├── assembler.assemble({ url: "aineeds.io", task: "Log me in", phase: "action" })
│   ├── Resolves matching modules:
│   │   ├── [0]  base (always) — core rules + SoM instructions
│   │   ├── [10] method-post — POST/create safety rules
│   │   ├── [20] safety (always) — ask_user guardrails
│   │   ├── [30] interaction (always) — click/type best practices
│   │   ├── [40] forms (always) — form filling rules
│   │   └── [50] user-aineeds (from DB!) — "Login button is in the top-right nav"
│   └── Concatenates all .rules strings into system prompt

Step 3: System prompt + DOM + screenshot → LLM:
│   System: "You are BiamOS Agent... [base rules] [POST rules] [safety] [forms] [aineeds rules]"
│   User:   "DOM Snapshot: [0] NAV [1] A 'Home' ... [3] A 'Log in' ... Task: Log me in"
│   + Screenshot image

Step 4: LLM reasoning (internal):
│   "The user wants to log in. My platform rules say 'Login button is in the top-right nav.'
│    Looking at the DOM... [3] A 'Log in' is in the NAV. That matches.
│    → I should click element [3]."

Step 5: LLM returns tool call:
│   { "name": "click", "arguments": { "id": 3, "description": "Click the Log in button" } }

Step 6: Frontend executes click on SoM element [3]
```

### The Critical Bridge: Rule Text ↔ DOM IDs

The LLM performs **semantic matching** between:

1. **Platform rule** (static English text): *"The login button is in the top-right navigation"*
2. **Live DOM** (dynamic, changes every page load): `[3] A "Log in"` inside `[0] NAV`

The LLM understands that:
- "login button" ≈ `A "Log in"` (semantic similarity)
- "top-right navigation" ≈ inside `NAV` element (layout understanding)
- Therefore → `click(id: 3)`

This works because modern LLMs are excellent at **natural language grounding** — connecting descriptions to structured data. This is exactly what makes semantic rules superior to CSS selectors.

---

## 4. Resilience and Fallbacks

### Scenario: Rule says "Login", button now says "Sign In"

```
Rule:    "Click the Login button in the navigation"
Actual:  [7] BUTTON "Sign In"  (website renamed the button)
```

**Result: The LLM handles this perfectly.** ✅

The LLM understands that "Login" and "Sign In" are semantically identical. It sees `[7] BUTTON "Sign In"` in the DOM, matches it to the rule's intent, and calls `click(id: 7)`.

This is the **entire point** of semantic rules — they survive UI updates because they describe *intent*, not *implementation*.

### When Rules Break (and What to Do)

| Scenario | Result | Mitigation |
|----------|--------|------------|
| Button renamed: "Login" → "Sign In" | ✅ LLM bridges semantically | No action needed |
| Button moved: nav → sidebar | ✅ LLM finds it in DOM snapshot | No action needed |
| Flow changed: login → opens modal now | ⚠️ May need rule update | Rule should say "may open a modal" |
| Entire page redesigned | ⚠️ Rules become stale | Re-analyze with AI |
| Site requires 2FA step | ❌ Rule didn't mention it | Add "2FA may appear after password" |

### The Fallback Chain

```
1. Platform rule matches? → Agent follows the described flow
2. No platform rule? → Agent falls back to base.ts generic rules
3. Generic rules unclear? → Agent uses screenshot + DOM analysis
4. Still stuck? → self-healing kicks in (fresh screenshot + retry)
5. Completely blocked? → ask_user
```

The agent is **never** 100% dependent on platform rules. Rules are **accelerators** — they make the agent faster and more reliable, but it can still function without them via the base rules + visual reasoning.

---

## 5. Optimized `/analyze` Prompt

Based on these mechanics, here is the ideal system prompt for the `/analyze` endpoint:

```
You are a web automation expert analyzing a website for an AI browser agent.

The agent navigates websites using Set-of-Mark IDs (like [0], [1], [2]) that are
assigned to DOM elements at runtime. Your rules should NEVER reference specific
IDs, CSS selectors, XPath, or coordinates. Instead, describe patterns semantically.

Generate rules that describe:
1. NAVIGATION: Where are the main menu items? How does the site organize content?
2. SEARCH: Where is the search bar? Does it use autocomplete? Press Enter or click a button?
3. FORMS: What's the field sequence for common actions (login, signup, compose)?
4. QUIRKS: Any modals, cookie banners, or autocomplete dropdowns the agent should expect?
5. CONTENT LAYOUT: How is content sorted? (newest first, alphabetical, etc.)

DO NOT include:
- CSS selectors, XPath, or data-testid attributes
- Pixel coordinates or screen positions
- React/Vue/Angular component names
- Hardcoded element IDs

Write rules as short, imperative bullet points. Max 10 points.
Use the ═══ header format for the platform name.
```

---

## 6. Summary: The Rule Writing Guide for Users

When users create rules in the Prompt Library UI, they should follow these principles:

| ✅ Do | ❌ Don't |
|-------|----------|
| "Search bar is at the top of the page" | `input#search.header-search` |
| "Click the compose/new button to start" | `div.T-I.T-I-KE.L3` |
| "Posts are sorted newest-first" | "The first `div.feed-item` is the newest" |
| "After typing email, click the suggestion dropdown" | "Click at coordinates (450, 320)" |
| "Login flow: email → password → submit" | "aria-label='Sign in'" |
| "Cookie banner may appear — dismiss it first" | "Close the `div.cc-banner` element" |

**The golden rule:** *Write rules as if you're explaining to a smart colleague who has never used this website — describe the flow, not the DOM.*
