// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Navigation Actions ─────────────────────────────────────

import type { ActionContext, ActionResult } from "../types";

export async function navigate(args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const { wv, waitForPageReady } = ctx;
    const url = args.url || '';
    try {
        await wv.executeJavaScript(
            'window.onbeforeunload=null;window.location.href=' + JSON.stringify(url) + ';', true
        );
    } catch {
        wv.loadURL(url).catch(() => { });
    }
    await waitForPageReady('navigate');
    const actualUrl = wv.getURL?.() || 'unknown';
    console.log(`🧭 Navigate: wanted=${url} → actual=${actualUrl}`);

    let pageContent = '';
    try {
        pageContent = await wv.executeJavaScript(
            '(document.title + " " + (document.body?.innerText?.substring(0, 300) || "")).toLowerCase()', true
        );
    } catch { /* */ }

    const errorPatterns = [
        "can't be reached", 'cannot be reached', 'not be reached',
        'err_name_not_resolved', 'err_connection_refused', 'err_connection_timed_out',
        'dns_probe', 'took too long to respond', 'no internet',
        'refused to connect', 'is not available', 'nxdomain',
    ];
    if (errorPatterns.some(p => pageContent.includes(p))) {
        console.log(`🧭 Navigate FAILED: ${url} → error page detected`);
        return { logMessage: `Navigation FAILED: "${url}" could not be loaded — the site cannot be reached. The URL may be MISSPELLED. Use search_web to find the correct URL.` };
    }
    return { logMessage: `✓ Navigated to ${url} (Resolved to: ${actualUrl})`, didNavigate: true };
}

export async function go_back(_args: Record<string, any>, ctx: ActionContext): Promise<ActionResult> {
    const { wv, waitForPageReady } = ctx;
    let deadEndUrl = '';
    try { deadEndUrl = await wv.executeJavaScript('window.location.href', true); } catch { /* */ }

    wv.goBack();
    await waitForPageReady('go_back');
    console.log(`🧭 Go back: ${deadEndUrl} → ${wv.getURL?.() || 'unknown'}`);

    const taintWarning = deadEndUrl
        ? ` ⚠️ TAINTED: You just left "${deadEndUrl}" — it was a dead end. Do NOT click that domain again! Choose a DIFFERENT result (prefer: app.*, login.*, docs.*, kb.* subdomains).`
        : '';
    return { logMessage: `✓ Navigated back to previous page.${taintWarning}`, didNavigate: true };
}
