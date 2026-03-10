// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Page Content Extraction Script
// ============================================================
// Generates the JavaScript snippet injected into webview to
// extract page metadata + body text for context analysis.
// Includes loading detection, site-specific extractors,
// aggressive noise filtering, and deduplication for optimal
// LLM input quality.
// ============================================================

/**
 * Returns a JavaScript string that, when executed inside a webview,
 * extracts page metadata and body text and returns a PageData object.
 * Returns null if the page is still loading (skeleton/spinner detected).
 */
export function buildExtractionScript(): string {
    return `
        (function() {
            try {
                // ─── Loading Detection ──────────────────────────
                var loadingIndicators = document.querySelectorAll(
                    '.loading-spinner, .loading-overlay, .skeleton-loader, ' +
                    '.spinner, [class*="shimmer"], [aria-busy="true"]'
                );
                var visibleCount = 0;
                for (var li = 0; li < loadingIndicators.length; li++) {
                    if (loadingIndicators[li].offsetParent !== null) visibleCount++;
                }
                if (visibleCount > 5) return null;

                // ─── Meta Extraction ────────────────────────────
                var getMeta = function(sel) {
                    var el = document.querySelector(sel);
                    return el ? (el.getAttribute('content') || '') : '';
                };
                var ogTitle = getMeta('meta[property="og:title"]');
                var ogDesc = getMeta('meta[property="og:description"]');
                var metaDesc = getMeta('meta[name="description"]');
                var keywords = getMeta('meta[name="keywords"]');
                var author = getMeta('meta[name="author"]') || getMeta('meta[property="og:site_name"]');
                var ogType = getMeta('meta[property="og:type"]');
                var ogTags = [];
                try {
                    document.querySelectorAll('meta[property="og:video:tag"], meta[property="article:tag"]').forEach(function(m){
                        var c = m.getAttribute('content');
                        if (c) ogTags.push(c);
                    });
                } catch(e){}

                // ─── Build Structured Header ────────────────────
                var parts = [];
                parts.push('Title: ' + document.title);
                if (ogTitle && ogTitle.length > document.title.length && ogTitle !== document.title) {
                    parts.push('OG-Title: ' + ogTitle);
                }
                if (ogDesc) parts.push('Description: ' + ogDesc);
                else if (metaDesc) parts.push('Description: ' + metaDesc);
                if (keywords) parts.push('Keywords: ' + keywords);
                if (ogTags.length) parts.push('Tags: ' + ogTags.join(', '));
                if (author) parts.push('Author/Site: ' + author);
                if (ogType) parts.push('Type: ' + ogType);

                // ─── Site-Specific Extractors ────────────────────
                var hostname = location.hostname.replace('www.', '');
                var bodyText = '';

                // ── YouTube ──
                if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
                    var ytParts = [];
                    // Video title
                    var ytTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title, #title h1');
                    if (ytTitle) ytParts.push('Video: ' + ytTitle.textContent.trim());
                    // Channel
                    var ytChannel = document.querySelector('#channel-name a, ytd-channel-name a, #owner-name a');
                    if (ytChannel) ytParts.push('Channel: ' + ytChannel.textContent.trim());
                    // View count + date
                    var ytInfo = document.querySelector('#info-strings, .date, ytd-watch-info-text');
                    if (ytInfo) ytParts.push('Info: ' + ytInfo.textContent.trim().replace(/\\\\s+/g, ' '));
                    // Description
                    var ytDesc = document.querySelector('#description-inner, ytd-text-inline-expander #plain-snippet-text, #description .content, ytd-expander .ytd-text-inline-expander');
                    if (ytDesc) {
                        var descText = ytDesc.textContent.trim().substring(0, 1200);
                        if (descText.length > 20) ytParts.push('Video Description: ' + descText);
                    }
                    // Hashtags
                    var ytHashtags = document.querySelectorAll('a.yt-simple-endpoint[href^="/hashtag"]');
                    if (ytHashtags.length > 0) {
                        var tags = [];
                        ytHashtags.forEach(function(h){ tags.push(h.textContent.trim()); });
                        if (tags.length) ytParts.push('Hashtags: ' + tags.slice(0, 10).join(' '));
                    }
                    if (ytParts.length > 0) bodyText = ytParts.join('\\\\n');
                }

                // ── Twitter / X ──
                if (hostname === 'twitter.com' || hostname === 'x.com') {
                    var tweetEl = document.querySelector('[data-testid="tweetText"]');
                    if (tweetEl) bodyText = 'Tweet: ' + tweetEl.textContent.trim();
                    var tweetAuthor = document.querySelector('[data-testid="User-Name"]');
                    if (tweetAuthor) bodyText = 'Author: ' + tweetAuthor.textContent.trim() + '\\\\n' + bodyText;
                }

                // ── Generic Extraction (if no site-specific result) ──
                if (!bodyText) {
                    var mainEl = document.querySelector('article')
                        || document.querySelector('[role="main"]')
                        || document.querySelector('main')
                        || document.querySelector('#content');

                    var target = mainEl || document.body;
                    if (target) {
                        var clone = target.cloneNode(true);

                        // Aggressive noise removal
                        var noiseSelectors = [
                            'nav, footer, header, aside',
                            '[role="navigation"], [role="banner"], [role="complementary"], [role="contentinfo"]',
                            'script, style, noscript, iframe, svg, img, video, audio, canvas',
                            'button, select, input, textarea, form, label',
                            '[class*="cookie"], [class*="consent"], [class*="banner"], [class*="popup"]',
                            '[class*="modal"], [class*="overlay"], [class*="dropdown"]',
                            '[class*="sidebar"], [class*="related"], [class*="recommend"]',
                            '[class*="suggestion"], [class*="trending"], [class*="promoted"]',
                            '[class*="social"], [class*="share"], [class*="comment"]',
                            '[class*="footer"], [class*="header"]',
                            '[class*="ad-"], [class*="ads"], [id*="ad-"], [id*="ads"]',
                            '[class*="advert"], [class*="sponsor"]',
                            'ytd-compact-video-renderer, ytd-rich-item-renderer',
                            'ytd-watch-next-secondary-results-renderer, #related, #comments',
                            'ytd-mini-guide-renderer, ytd-guide-renderer',
                            'tp-yt-paper-dialog, ytd-popup-container',
                            'ytd-engagement-panel-section-list-renderer',
                            '[aria-hidden="true"], [hidden]',
                            '[class*="chip"], [class*="pill"]',
                        ].join(', ');

                        var noise = clone.querySelectorAll(noiseSelectors);
                        for (var i = 0; i < noise.length; i++) noise[i].remove();

                        // Extract breadcrumbs / navigation path (SPA dashboards)
                        var breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, [class*="breadcrumb"] span, [aria-label*="breadcrumb"] a');
                        if (breadcrumbs.length > 0) {
                            var crumbs = [];
                            breadcrumbs.forEach(function(b) {
                                var bt = (b.textContent || '').trim();
                                if (bt && bt.length > 1) crumbs.push(bt);
                            });
                            if (crumbs.length > 0) bodyText = 'Navigation: ' + crumbs.join(' > ') + '\\\\n';
                        }

                        // Extract structured text blocks with deduplication
                        // Lower threshold (10 chars) for SPA dashboards with short labels
                        var blocks = clone.querySelectorAll(
                            'p, h1, h2, h3, h4, h5, li, td, th, blockquote, figcaption, ' +
                            'dt, dd, span[class*="title"], div[class*="title"], ' +
                            '[class*="description"], [class*="summary"], [class*="abstract"], ' +
                            '[class*="label"], [class*="heading"], [class*="name"]'
                        );
                        if (blocks.length > 0) {
                            var seen = {};
                            var texts = [];
                            for (var j = 0; j < blocks.length; j++) {
                                var t = (blocks[j].textContent || '').trim();
                                if (t.length < 10) continue;
                                var tKey = t.substring(0, 60).toLowerCase();
                                if (seen[tKey]) continue;
                                seen[tKey] = true;
                                texts.push(t);
                                if (texts.join(' ').length > 4000) break;
                            }
                            bodyText += texts.join('\\\\n');
                        }

                        // Fallback: if structured extraction found very little, use innerText
                        if (bodyText.length < 200) {
                            var fallbackText = (clone.textContent || '').replace(/\\\\s{2,}/g, ' ').trim();
                            if (fallbackText.length > bodyText.length) {
                                bodyText = fallbackText.substring(0, 4000);
                            }
                        } else {
                            bodyText = (clone.textContent || '').replace(/\\\\s{3,}/g, '\\\\n').trim().substring(0, 3000);
                        }
                    }
                }

                // Collapse whitespace + limit
                bodyText = bodyText.replace(/\\\\s{3,}/g, '\\\\n').trim();
                parts.push(bodyText.substring(0, 4000));

                return {
                    url: location.href,
                    title: document.title,
                    description: ogDesc || metaDesc || '',
                    text: parts.join('\\\\n'),
                };
            } catch(err) {
                return { url: location.href, title: document.title, text: '' };
            }
        })()
    `;
}

/**
 * Returns the SPA detection injection script for History API patching
 * and <title> MutationObserver.
 */
export function buildSpaDetectionScript(): string {
    return `
        (function() {
            if (window.__luraContextWatcher) return;
            window.__luraContextWatcher = true;

            // Strategy 1: History API patching
            const origPush = history.pushState;
            const origReplace = history.replaceState;
            history.pushState = function() {
                origPush.apply(this, arguments);
                window.postMessage({ type: 'biamos:url-changed', url: location.href, title: document.title }, '*');
            };
            history.replaceState = function() {
                origReplace.apply(this, arguments);
                window.postMessage({ type: 'biamos:url-changed', url: location.href, title: document.title }, '*');
            };
            window.addEventListener('popstate', function() {
                window.postMessage({ type: 'biamos:url-changed', url: location.href, title: document.title }, '*');
            });

            // Strategy 2: MutationObserver on <title>
            var titleEl = document.querySelector('title');
            if (titleEl) {
                new MutationObserver(function() {
                    window.postMessage({ type: 'biamos:title-changed', url: location.href, title: document.title }, '*');
                }).observe(titleEl, { childList: true, characterData: true, subtree: true });
            }
        })();
    `;
}
