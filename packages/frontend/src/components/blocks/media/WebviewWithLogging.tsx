// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — WebviewWithLogging
// ============================================================
// A pure, never-re-rendering Electron <webview> wrapper.
// Attaches all lifecycle listeners once (listenersAttachedRef
// guard) and safely auto-dismisses cookie banners without
// touching normal page content (no ghost navigation!).
// ============================================================

import React, { useRef, useCallback } from "react";
import { debug } from "../../../utils/debug";

// ─── Blocklist (iframe fallback for non-Electron) ───────────
// Sites that break inside a plain <iframe> due to X-Frame-Options.
// IframeBlock shows a LinkCard for these in browser mode.

export const IFRAME_BLOCKLIST = new Set([
    "youtube.com", "www.youtube.com",
    "google.com", "www.google.com",
    "twitter.com", "x.com",
    "facebook.com", "www.facebook.com",
    "instagram.com", "www.instagram.com",
    "linkedin.com", "www.linkedin.com",
    "github.com",
    "reddit.com", "www.reddit.com",
    "amazon.com", "www.amazon.com",
    "netflix.com", "www.netflix.com",
    "twitch.tv", "www.twitch.tv",
    "tiktok.com", "www.tiktok.com",
    "discord.com", "discord.gg",
]);

export function isBlockedSite(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return IFRAME_BLOCKLIST.has(host);
    } catch {
        return false;
    }
}

// ─── Safe Cookie-Dismiss Scripts ────────────────────────────
// SECURITY: These scripts NEVER do a global querySelectorAll
// on buttons/links. They ALWAYS scope to known banner/consent
// containers first. <a> tags with real hrefs are excluded
// globally to avoid ghost navigation.

const COOKIE_KEYWORDS = [
    'einverstanden', 'akzeptieren', 'accept all', 'accept cookies',
    'alle akzeptieren', 'accept', 'agree', 'zustimmen',
    'i agree', 'got it', 'allow all', 'allow cookies',
    'alle cookies akzeptieren', 'consent',
    'accept & close', 'ich stimme zu', 'alles klar',
    'alle zulassen', "j'accepte", 'tout accepter',
];

/**
 * Returns an IIFE that:
 * - Searches only inside known consent/cookie/banner containers (Pass A)
 * - Falls back to z-index > 500 fixed/absolute overlay heuristic (Pass B)
 * - Never clicks <a> tags with real hrefs
 */
export function buildSafeCookieScript(): string {
    return `
(function() {
    var keywords = ${JSON.stringify(COOKIE_KEYWORDS)};

    function isInConsentContainer(el) {
        return !!el.closest(
            '[id*="consent"],[id*="cookie"],[id*="gdpr"],[id*="sp_message"],[id*="qc-cmp"],' +
            '[class*="consent"],[class*="cookie"],[class*="gdpr"],[class*="banner"],' +
            '[class*="notice"],[class*="privacy"],[class*="cmp"],[class*="cc-"],' +
            '[data-nosnippet],[aria-label*="cookie"],[aria-label*="consent"]'
        );
    }

    function isSafeToClick(el) {
        if (el.tagName === 'A') {
            var href = (el.getAttribute('href') || '').trim();
            if (href && href !== '#' && !href.startsWith('javascript:')) return false;
        }
        return true;
    }

    function isInOverlay(el) {
        var node = el;
        for (var depth = 0; depth < 8 && node && node !== document.body; depth++) {
            var cs = window.getComputedStyle(node);
            if ((cs.position === 'fixed' || cs.position === 'absolute') && parseInt(cs.zIndex || '0', 10) > 500) return true;
            node = node.parentElement;
        }
        return false;
    }

    // Pass A: scoped to known consent containers
    var containers = document.querySelectorAll(
        '[id*="consent"],[id*="cookie"],[id*="gdpr"],[id*="sp_message"],[id*="qc-cmp"],' +
        '[class*="consent"],[class*="cookie"],[class*="gdpr"],[class*="banner"],' +
        '[class*="notice"],[class*="cmp"],[class*="cc-"]'
    );
    for (var ci = 0; ci < containers.length; ci++) {
        var container = containers[ci];
        var cs0 = window.getComputedStyle(container);
        if (cs0.display === 'none' || cs0.visibility === 'hidden' || cs0.opacity === '0') continue;
        var btns = container.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],a');
        for (var bi = 0; bi < btns.length; bi++) {
            var el = btns[bi];
            if (!isSafeToClick(el)) continue;
            var text = (el.textContent || el.value || '').trim().toLowerCase();
            if (text.length < 60 && keywords.some(function(kw) { return text === kw || text.includes(kw); })) {
                el.click();
                console.log('\uD83C\uDF6A [Cookie] Accepted in container: ' + text);
                return true;
            }
        }
    }

    // Pass B: z-index overlay fallback (buttons only, never <a>)
    var overlayEls = document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]');
    for (var oi = 0; oi < overlayEls.length; oi++) {
        var el2 = overlayEls[oi];
        if (!isInConsentContainer(el2) && !isInOverlay(el2)) continue;
        var text2 = (el2.textContent || el2.value || '').trim().toLowerCase();
        if (text2.length < 60 && keywords.some(function(kw) { return text2 === kw || text2.includes(kw); })) {
            el2.click();
            console.log('\uD83C\uDF6A [Cookie] Accepted via overlay heuristic: ' + text2);
            return true;
        }
    }
    return false;
})();
`;
}

/**
 * Returns an IIFE that closes modal/popup overlays.
 * Only targets elements that are position:fixed/absolute with z-index > 100.
 */
export function buildSafeCloseScript(): string {
    return `
(function() {
    var closeKeywords = ['\u00d7','\u2715','\u2716','close','schlie\u00dfen','dismiss','no thanks','nein danke','later','sp\u00e4ter','skip','nicht jetzt','not now','maybe later','bleiben','stay'];

    var modalSelectors = [
        '[class*="modal"],[class*="popup"],[class*="overlay"],[class*="lightbox"]',
        '[class*="subscribe"],[class*="newsletter"],[class*="signup"],[class*="paywall"]',
        '[class*="ad-overlay"],[id*="subscribe"],[id*="newsletter"],[id*="popup"]',
    ].join(',');

    var modals = document.querySelectorAll(modalSelectors);
    for (var mi = 0; mi < modals.length; mi++) {
        var modal = modals[mi];
        var cs = window.getComputedStyle(modal);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
        var zi = parseInt(cs.zIndex || '0', 10);
        // Only process overlaid elements (fixed/absolute + z-index)
        if (cs.position !== 'fixed' && cs.position !== 'absolute' && zi < 100) continue;

        var closeBtns = modal.querySelectorAll('button,[role="button"],[class*="close"],[aria-label*="close"],[aria-label*="Close"]');
        for (var ci2 = 0; ci2 < closeBtns.length; ci2++) {
            var btn = closeBtns[ci2];
            var btnText = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
            if (btnText.length < 40 && closeKeywords.some(function(kw) { return btnText.includes(kw); })) {
                btn.click();
                console.log('\uD83D\uDEE1\uFE0F [Overlay] Dismissed: ' + btnText);
                return true;
            }
        }
    }

    // Fullscreen fixed overlay fallback
    var allFixed = document.querySelectorAll('div,section,aside');
    for (var fi = 0; fi < allFixed.length; fi++) {
        var fel = allFixed[fi];
        var fcs = window.getComputedStyle(fel);
        if (
            fcs.position === 'fixed' &&
            parseInt(fcs.zIndex || '0', 10) > 999 &&
            fel.offsetWidth > window.innerWidth * 0.5 &&
            fel.offsetHeight > window.innerHeight * 0.5
        ) {
            var closeBtn = fel.querySelector('button,[role="button"],[class*="close"],[aria-label*="close"]');
            if (closeBtn) { closeBtn.click(); console.log('\uD83D\uDEE1\uFE0F [Overlay] Dismissed fullscreen overlay'); return true; }
        }
    }
    return false;
})();
`;
}

// ─── WebviewWithLogging ──────────────────────────────────────
// Never re-renders (React.memo with () => true comparator).
// All webview event listeners are attached exactly once via
// the listenersAttachedRef guard.

export const WebviewWithLogging = React.memo(React.forwardRef<any, { src: string }>(
    function WebviewWithLogging({ src }, ref) {
        const localRef = useRef<any>(null);
        const listenersAttachedRef = useRef(false);
        const cookieDismissedUrlRef = useRef<string>('');

        const setRef = useCallback((el: any) => {
            localRef.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) (ref as any).current = el;
        }, [ref]);

        React.useEffect(() => {
            const wv = localRef.current;
            if (!wv) return;
            // Track CSS layout size for DPR computation in captureVisionFrame.
            // On Windows 125%/150% DPI, capturePage() returns physical pixels but
            // CDP coordinates are in CSS pixels. Without this, dpr defaults to 1.
            const obs = new ResizeObserver((entries) => {
                for (const e of entries) {
                    const { width, height } = e.contentRect;
                    (wv as any).__cssWidth = Math.round(width);
                    (wv as any).__cssHeight = Math.round(height);
                }
            });
            obs.observe(wv);
            return () => obs.disconnect();
        }, []);

        React.useEffect(() => {
            const wv = localRef.current;
            if (!wv || listenersAttachedRef.current) return;
            listenersAttachedRef.current = true;

            const tag = `\uD83C\uDF10 [Webview]`;
            try { wv.setMaxListeners?.(20); } catch { /* */ }

            let overlayTimeoutIds: ReturnType<typeof setTimeout>[] = [];

            // ── Lifecycle ─────────────────────────────────────────────
            wv.addEventListener('did-start-loading', () => {
                debug.log(`${tag} ⏳ Loading started...`);
            });

            wv.addEventListener('did-finish-load', () => {
                debug.log(`${tag} ✅ Loaded: ${wv.getURL?.() || 'unknown'}`);

                const currentUrl = wv.getURL?.() || '';
                if (currentUrl && !currentUrl.startsWith('data:') && !currentUrl.startsWith('about:')) {
                    let urlKey = currentUrl;
                    try { const u = new URL(currentUrl); urlKey = u.origin + u.pathname; } catch { /* */ }

                    if (cookieDismissedUrlRef.current === urlKey) {
                        debug.log(`${tag} \uD83C\uDF6A Skipping auto-dismiss — already attempted for ${urlKey}`);
                    } else {
                        cookieDismissedUrlRef.current = urlKey;
                        overlayTimeoutIds.forEach(id => clearTimeout(id));
                        overlayTimeoutIds = [];

                        const safeCookieScript = buildSafeCookieScript();
                        const safeCloseScript = buildSafeCloseScript();

                        // Pass 1: Cookie Consent (1.5s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try { wv.executeJavaScript(safeCookieScript, true).catch(() => { }); }
                            catch { /* page may have navigated away */ }
                        }, 1500));
                        // Pass 2: Other overlays / modals (3s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try { wv.executeJavaScript(safeCloseScript, true).catch(() => { }); }
                            catch { /* */ }
                        }, 3000));
                        // Pass 3: Retry Cookie (5s)
                        overlayTimeoutIds.push(setTimeout(() => {
                            try { wv.executeJavaScript(safeCookieScript, true).catch(() => { }); }
                            catch { /* */ }
                        }, 5000));
                    }
                }
            });

            wv.addEventListener('did-fail-load', (e: any) => {
                if (e.errorCode === -3) { debug.log(`${tag} ⚠️ Load aborted (ERR_ABORTED)`); return; }
                console.error(`${tag} ❌ Load FAILED: code=${e.errorCode} desc="${e.errorDescription}" url=${e.validatedURL}`);
            });

            wv.addEventListener('did-navigate', (e: any) => {
                debug.log(`${tag} \uD83D\uDD17 Navigated to: ${e.url}`);
                if (e.url && e.url !== 'about:blank') {
                    fetch('http://localhost:3001/api/history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: e.url }),
                    }).catch(() => { });
                }
            });

            wv.addEventListener('dom-ready', () => {
                debug.log(`${tag} \uD83D\uDCC4 DOM ready: ${wv.getURL?.() || 'unknown'}`);
            });

            wv.addEventListener('will-navigate', () => {
                overlayTimeoutIds.forEach(id => clearTimeout(id));
                overlayTimeoutIds = [];
            });

            wv.addEventListener('crashed', () => { console.error(`${tag} \uD83D\uDC80 CRASHED!`); });
            wv.addEventListener('destroyed', () => { console.warn(`${tag} \uD83D\uDDD1\uFE0F Destroyed`); });

            // ── Console-message bridge (BIAM_* protocol) ─────────────
            wv.addEventListener('console-message', (e: any) => {
                if (e.message?.startsWith('BIAM_PREFILL:')) {
                    window.dispatchEvent(new CustomEvent('biamos:prefill-command', {
                        detail: { command: e.message.replace('BIAM_PREFILL:', '').trim() },
                    }));
                    return;
                }
                if (e.message?.startsWith('BIAM_NAVIGATE:')) {
                    const url = e.message.replace('BIAM_NAVIGATE:', '').trim();
                    if (wv?.loadURL) wv.loadURL(url).catch(() => { });
                    return;
                }
                if (e.message?.startsWith('BIAM_INTENT:')) {
                    window.dispatchEvent(new CustomEvent('biamos:genui-intent', {
                        detail: { intent: e.message.replace('BIAM_INTENT:', '').trim() },
                    }));
                    return;
                }
                if (e.level === 2) debug.log(`${tag} \uD83D\uDCDF Page error: ${e.message?.substring(0, 150)}`);
            });

            // ── Navigation failure → agent feedback ──────────────────
            wv.addEventListener('did-fail-load', (e: any) => {
                const url = e.validatedURL || '';
                if (e.errorCode === -3) return;
                if (e.isMainFrame === false) return;
                console.warn(`${tag} ⚠️ Main frame navigation failed: ${url}`);
                window.dispatchEvent(new CustomEvent('biamos:agent-feedback', {
                    detail: { error: `[NAVIGATION FAILED] Could not reach ${url}. Use search_web instead.` },
                }));
                try { wv.loadURL('https://www.google.com'); } catch { /* */ }
            });

            wv.addEventListener('page-title-updated', (e: any) => {
                const newTitle = e.title || '';
                const currentUrl = wv.getURL?.() || '';
                if (newTitle && newTitle !== 'about:blank') {
                    debug.log(`${tag} \uD83D\uDCDD Title updated: "${newTitle}"`);
                    if (currentUrl) {
                        fetch('http://localhost:3001/api/history', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: currentUrl, title: newTitle }),
                        }).catch(() => { });
                    }
                }
            });
        }, []);

        return (
            <webview
                ref={setRef}
                src={src}
                // @ts-ignore
                partition="persist:lura"
                // @ts-ignore
                allowpopups="true"
                style={{ width: '100%', height: '100%', display: 'flex', flex: 1 }}
            />
        );
    }
), () => true);
