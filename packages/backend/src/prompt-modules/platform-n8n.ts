// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Prompt Module: Platform — n8n
// ============================================================
// Platform-specific rules for n8n workflow automation.
// Injected whenever the active URL matches a local or remote
// n8n instance (localhost:5678 or *.n8n.cloud).
// ============================================================

import type { PromptModule } from "./types.js";

export const platformN8nModule: PromptModule = {
    id: "platform-n8n",
    name: "n8n Workflow Automation",
    priority: 50,
    match: {
        urls: [/localhost:5678|\.n8n\.cloud|\.n8n\.io/i],
    },
    rules: `═══════════════════════════════════════════════════
PLATFORM: n8n Workflow Automation
═══════════════════════════════════════════════════

## UNDERSTANDING THE UI
- **Canvas**: The main area where nodes are placed and connected. Nodes are draggable boxes.
- **Node Panel (left sidebar)**: Contains all available node types grouped by category. Open it by clicking the "+" button on the canvas or in the top-right toolbar.
- **Execution Panel**: The "Executions" tab in the top bar shows run history.
- **Top Toolbar**: Contains "Execute Workflow" (▶ button), "Save" button, and "Publish" toggle.
- **Node Config Panel (right side)**: Opens when you click a node. Shows the node's parameters.

## PLANNING BEFORE ACTING — MANDATORY
Before clicking ANYTHING to build a flow, you MUST internally plan:
1. **What is the trigger?** (Schedule, Webhook, Manual, etc.)
2. **What are the steps?** List each node type and its config in order.
3. **How are nodes connected?** Which output connects to which input?
Only then start executing step by step.

## BUILDING A FLOW — STEP BY STEP
1. **Navigate** to the workflow editor: use 'navigate' to go to http://localhost:5678 if not already there.
2. **Create a new workflow**: Click the "+" button in the top area or sidebar, NOT on the canvas.
3. **Add the trigger node first**: Click the "+" on the canvas → search for the trigger type → click it.
4. **Add subsequent nodes**: Click the "+" icon that appears to the RIGHT of an existing node to chain the next one.
5. **Configure each node**: Click the node → a panel opens on the right → fill in parameters.
6. **Connect nodes manually if needed**: Drag from the round output dot (right side of node) to the input dot (left side of target node).
7. **Save**: Always click the "Save" button after adding or configuring nodes.
8. **Test**: Click "Execute Workflow" to do a test run. Check the output bubbles on each node.

## NODE TYPES — COMMON CHEAT SHEET
- **Schedule Trigger**: Runs on a cron schedule. Set via the "Trigger Times" field.
- **Webhook**: Receives HTTP requests. Gives you a URL to call.
- **HTTP Request**: Makes HTTP calls to any API. Set Method, URL, Auth, Body.
- **Set**: Assigns or transforms variables. Use to rename or reshape data.
- **If**: Splits the flow based on a condition (true/false branches).
- **Code**: Runs custom JavaScript. Use when no node fits.
- **Send Email**: Sends email via SMTP or Gmail.
- **Slack**: Posts messages to Slack channels.
- **Gmail**: Reads or sends Gmail messages.
- **GitHub**: Interacts with GitHub (issues, PRs, repos).
- **Notion**: Reads/writes Notion databases and pages.
- **AI Agent**: Runs an LLM-powered agent with tools. Needs a model sub-node.
- **OpenAI**: Direct OpenAI API calls (chat, completions).
- **Merge**: Combines two data streams into one.
- **Loop Over Items**: Iterates over an array of items.

## CONNECTING TO EXTERNAL SERVICES (CREDENTIALS)
When a node needs credentials (e.g., Slack, Gmail, OpenAI):
1. Click the node → in the right panel find "Credential" dropdown → click "Create new credential".
2. A credential modal appears. Ask the user for the required keys/tokens if not already provided.
3. ALWAYS use 'ask_user' before entering credentials, to confirm the user has them ready.

## ANTI-LOOP RULES
- **Node search**: If typing in the node search box doesn't filter results, click the search box first, clear it, then retype.
- **Canvas is unresponsive**: If clicks on the canvas do nothing, scroll the page or try clicking the background first to deselect.
- **Config panel not opening**: If clicking a node doesn't open its config, scroll the canvas to center the node and try again.
- **Do NOT drag nodes more than once** — if a drag fails, use the canvas zoom controls to orient yourself, then retry.

## SPATIAL VISION MODE (For nodes & connections when DOM fails)
When clicking on canvas NODES or DRAGGING CONNECTIONS, DOM selectors are unreliable because n8n renders nodes as unlabeled SVG/div elements. Use the SPATIAL VISION tools in these cases:

**When to use vision_* tools:**
- Clicking on a node body (not a button inside a panel)
- Dragging a connection from a node output port to another node input
- Hovering to reveal hidden connection ports

**workflow for connecting two nodes:**
1. vision_hover(centerX of source node, centerY) → ports appear on the node edges
2. vision_drag(port X, port Y → target node centerX, centerY) → cable snaps

**How to read the neon-green ruler:**
- TOP ruler = X% (horizontal)
- LEFT ruler = Y% (vertical)
- Cross-sight: extend a mental line from the top and left ruler ticks to find the exact position of what you want to click.

**ALWAYS vision_hover BEFORE vision_drag** — n8n hides connection ports until a node is hovered.`,
};
