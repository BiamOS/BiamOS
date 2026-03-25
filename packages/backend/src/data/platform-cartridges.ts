// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Platform Cartridges ─────────────────────────────────────
// Hardcoded domain knowledge for known enterprise platforms.
// Loaded by Universal Router — injected at END of system prompt
// to avoid the "Lost-in-the-Middle" LLM problem.
//
// Cartridges contain BEHAVIORAL facts, not DOM selectors:
//   • How the editor works (TinyMCE, Quill, canvas)
//   • How navigation works (SPA, page-reload, hash-routing)
//   • Known UI gotchas (Leave-page dialogs, scroll requirements)

export interface PlatformCartridge {
    /** Matched against query text and current URL */
    domains: string[];
    /** Soft-load SPAs vs full page reloads */
    navigation_style: 'spa_soft_load' | 'spa' | 'full_reload';
    /** Editor type for form fields */
    editor_type: 'textarea' | 'iframe_tinymce' | 'quill' | 'canvas' | 'native';
    /** Injected at end of system prompt when this cartridge is active */
    system_prompt_injection: string;
}

export const PLATFORM_CARTRIDGES: Record<string, PlatformCartridge> = {

    // ── HaloITSM ─────────────────────────────────────────────
    haloitsm: {
        domains: ['haloitsm.com', 'halo.com/itsm', 'haloservicedesk'],
        navigation_style: 'spa_soft_load',
        editor_type: 'iframe_tinymce',
        system_prompt_injection: `
[PLATFORM: HaloITSM — inject at every step]
NAVIGATION: HaloITSM is a SPA. Clicking a ticket row does NOT reload the page.
After click_at on a ticket, wait for DOM change (more nodes / modal appears).
Do NOT wait for URL to change — it may stay the same.

EDITOR: The "Note" / "Action" text area is a TinyMCE iframe editor.
type_text will auto-inject via tinymce.activeEditor — no need to click inside first.
Do NOT attempt to click into the iframe manually.

FORM FLOW:
1. Click "Add Note" button
2. Scroll DOWN — the editor and Save button appear BELOW the fold
3. Use type_text to insert text (TinyMCE auto-handled)
4. Click "Save" or "Add Note" button to submit

CRITICAL: Do NOT press Escape — HaloITSM shows a "Leave page?" dialog.
If you see "Leave page?" / "Ungespeicherte Änderungen" → click "No" / "Abbrechen".
`.trim(),
    },

    // ── n8n ───────────────────────────────────────────────────
    n8n: {
        domains: ['localhost:5678', 'n8n.io', 'cloud.n8n.io'],
        navigation_style: 'spa',
        editor_type: 'canvas',
        system_prompt_injection: `
[PLATFORM: n8n Workflow Editor]
NAVIGATION: n8n is a SPA canvas editor. Most actions happen without page reloads.

ADDING NODES: Click the "+" button on a connection line or use the node panel.
After clicking "+", a search bar appears. Type the node name and click the result.

CONNECTING NODES: Hover over the OUTPUT dot (right side) of a node.
When it turns green, drag to the INPUT dot (left side) of the next node.

CONFIGURING: Click a node → side panel opens on the right.
Fill in fields in the panel, not on the canvas.

SAVE: Ctrl+S or click "Save" button in the top bar.
EXECUTE: Click "Test workflow" or "Execute workflow" button.
`.trim(),
    },

    // ── Notion ────────────────────────────────────────────────
    notion: {
        domains: ['notion.so', 'notion.com'],
        navigation_style: 'spa',
        editor_type: 'quill',
        system_prompt_injection: `
[PLATFORM: Notion]
EDITOR: Notion uses a block-based contenteditable editor (not TinyMCE).
Click at the end of a block to position cursor, then type_text.
Press Enter to create a new block. "/" opens the block type menu.

NAVIGATION: SPA — sidebar links change content without page reload.
Database views (Table/Board/Gallery) are toggled via tabs at the top.
`.trim(),
    },

    // ── Salesforce ────────────────────────────────────────────
    salesforce: {
        domains: ['salesforce.com', 'lightning.force.com', 'my.salesforce.com'],
        navigation_style: 'spa',
        editor_type: 'iframe_tinymce',
        system_prompt_injection: `
[PLATFORM: Salesforce Lightning]
NAVIGATION: Salesforce Lightning is a SPA. Use the App Launcher (9-dot grid) to switch apps.
Record navigation does not reload the page — wait for DOM change after clicking.

EDITOR: Description/Notes fields use a rich text editor (TinyMCE or Quill depending on config).
type_text will attempt TinyMCE injection automatically.

SAVING: Most records auto-save, or have a "Save" button in the action bar.
Do NOT navigate away before saving — unsaved data is lost.
`.trim(),
    },
};

// ─── Match cartridge by query text or URL ────────────────────

export function matchCartridge(
    query: string,
    currentUrl: string = '',
): PlatformCartridge | null {
    const combined = `${query} ${currentUrl}`.toLowerCase();
    for (const [name, cartridge] of Object.entries(PLATFORM_CARTRIDGES)) {
        if (cartridge.domains.some(d => combined.includes(d.toLowerCase()))) {
            return cartridge;
        }
        // Also match by name keyword (e.g. "haloitsm" in query)
        if (combined.includes(name.toLowerCase())) {
            return cartridge;
        }
    }
    return null;
}
