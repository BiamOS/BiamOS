// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Constants ────────────────────────────────────────

/** Hard stop: no task should ever need more steps */
export const MAX_STEPS = 30;

/** 3x same action+description in a row = hallucination loop */
export const MAX_REPEAT = 3;

// ─── DOM Snapshot Script ────────────────────────────────────
// Injected into the webview to extract interactive elements.
// Builds a Set-of-Mark (SoM) map with center coordinates by ID.

export const DOM_SNAPSHOT_SCRIPT = `
(function() {
    var MAX_ELEMENTS = 120;
    var result = [];
    var somMap = {};
    var usedIds = {};
    
    var selectors = [
        'a[href]',
        'button',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[role="textbox"]',
        '[onclick]',
        '[contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        '[data-text="true"]',
    ];
    
    // Simple numeric hash from string — deterministic across runs
    function stableHash(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h + str.charCodeAt(i)) | 0;
        }
        // Map to range 0-999 for readable IDs
        return ((h % 1000) + 1000) % 1000;
    }
    
    // Build a fingerprint from stable element attributes
    function fingerprint(el) {
        var tag = el.tagName || '';
        var name = el.getAttribute('name') || '';
        var id = el.id || '';
        var role = el.getAttribute('role') || '';
        var type = el.getAttribute('type') || '';
        var ariaLabel = el.getAttribute('aria-label') || '';
        var placeholder = el.getAttribute('placeholder') || '';
        var dataTestId = el.getAttribute('data-testid') || '';
        return tag + '|' + name + '|' + id + '|' + role + '|' + type + '|' + ariaLabel + '|' + placeholder + '|' + dataTestId;
    }
    
    var seen = new Set();
    for (var si = 0; si < selectors.length; si++) {
        var sel = selectors[si];
        var els = document.querySelectorAll(sel);
        for (var ei = 0; ei < els.length; ei++) {
            var el = els[ei];
            if (seen.has(el) || result.length >= MAX_ELEMENTS) continue;
            seen.add(el);
            
            var rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
            var style = window.getComputedStyle(el);
            if (style.opacity === '0' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
            
            // Generate stable ID from element fingerprint
            var fp = fingerprint(el);
            var baseId = stableHash(fp);
            var somId = baseId;
            
            // Handle collisions: increment until free slot
            while (usedIds[somId]) {
                somId = (somId + 1) % 1000;
            }
            usedIds[somId] = true;
            
            var cx = Math.round(rect.x + rect.width / 2);
            var cy = Math.round(rect.y + rect.height / 2);
            
            // Extract element attributes FIRST (needed for selector + output)
            var tag = el.tagName.toLowerCase();
            var type = el.getAttribute('type') || '';
            var role = el.getAttribute('role') || '';
            var ariaLabel = el.getAttribute('aria-label') || '';
            var name = el.getAttribute('name') || '';
            
            // Build a unique CSS selector for direct element targeting
            // Priority: name > aria-label > data-testid > id
            // name/aria-label/data-testid are clean strings.
            // id is LAST because Gmail uses IDs like ":r5:" which need CSS.escape
            // and the escaped backslashes break when embedded in template literals.
            var elSel = '';
            if (name) {
                elSel = tag + '[name="' + name + '"]';
            } else if (ariaLabel) {
                elSel = tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';
            } else if (el.getAttribute('data-testid')) {
                elSel = '[data-testid="' + el.getAttribute('data-testid') + '"]';
            } else if (el.id && el.id.indexOf(':') === -1 && el.id.indexOf('.') === -1) {
                // Only use id-based selectors for CLEAN ids (no colons, dots)
                elSel = '#' + el.id;
            }
            // No fallback — elements without unique attributes use coordinate targeting
            
            somMap[somId] = { x: cx, y: cy, w: Math.round(rect.width), h: Math.round(rect.height), sel: elSel };
            
            // Safe attribute reads — getAttribute returns null on some elements,
            // so always fall back to '' to prevent crashes on unsanitized pages.
            var placeholder = el.getAttribute('placeholder') || '';
            var title = el.getAttribute('title') || '';
            var altAttr = el.getAttribute('alt') || '';
            var text = (el.textContent || placeholder || altAttr || title || '').trim().substring(0, 60);
            var href = el.getAttribute('href') || '';
            
            // Build semantic annotation: only include non-empty attributes, max 3.
            // aria-label > placeholder > role — these are what the LLM needs to
            // distinguish "Search mail" from "To" from "Message Body" without guessing.
            var semanticParts = [];
            if (ariaLabel) semanticParts.push('aria-label: "' + ariaLabel.replace(/"/g, "'") + '"');
            if (placeholder && !ariaLabel) semanticParts.push('placeholder: "' + placeholder.replace(/"/g, "'") + '"');
            if (role && semanticParts.length < 2) semanticParts.push('role: "' + role + '"');
            var semantic = semanticParts.length > 0 ? ' (' + semanticParts.join(', ') + ')' : '';
            
            var visibleLabel = ariaLabel || placeholder || text;
            var line = '[' + somId + '] ' + tag;
            if (type) line += '[' + type + ']';
            if (name) line += '[name=' + name + ']';
            if (visibleLabel) line += ' "' + visibleLabel.replace(/"/g, "'").substring(0, 60) + '"';
            line += semantic;
            if (href) line += ' href="' + href.substring(0, 80) + '"';
            line += ' (x:' + cx + ' y:' + cy + ' w:' + Math.round(rect.width) + ' h:' + Math.round(rect.height) + ')';
            
            result.push(line);
        }
    }
    
    window.__biamos_som = somMap;
    
    return result.join('\\\\n');
})()`;
