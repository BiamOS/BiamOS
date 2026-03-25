// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — WebView Utilities (CDP Edition)
// ============================================================
// Phase 2 of CDP Rebuild:
//   captureDomSnapshot() — uses CDP DOMSnapshot.captureSnapshot
//     - Zero JS injection into the guest process
//     - Automatically pierces ALL iframes
//     - Z-index occlusion culling via paintOrder
//     - Sequential SoM IDs 1..N (never hash-based)
//   captureVisionFrame() — Ghost-Compositing
//     - Captures raw wv screenshot
//     - Burns SoM neon boxes in RAM (off-screen canvas)
//     - Exports as JPEG 0.85 (saves ~60% LLM tokens vs PNG)
//   waitForPageReady() — unchanged (MutationObserver based)
// ============================================================

import { debug } from '../../../../../utils/debug';
import type { SomEntry, SomMap } from '../types';
import React from 'react';

// ─── Constants ───────────────────────────────────────────────

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']);

// AX roles that indicate interactivity (used in AXTree fallback)
const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox',
    'radio', 'menuitem', 'tab', 'listbox', 'option', 'slider',
    'spinbutton', 'switch', 'treeitem',
]);

type ParsedDomNode = {
    isInteractive: boolean;
    text: string;
    // Interactive fields
    x?: number; y?: number; w?: number; h?: number;
    role?: string; name?: string; tag?: string;
    nodeId?: number; paintOrder?: number;
};

// ─── CDP DOM Snapshot Parser ─────────────────────────────────
// Parses the output of DOMSnapshot.captureSnapshot.
// Returns a flat list in Document Order containing BOTH:
// 1. Interactive elements (with coordinates)
// 2. Visible static text nodes (for LLM context, like "Ad" badges)

function parseDomSnapshot(result: any): ParsedDomNode[] {
    const strings: string[] = result.strings ?? [];
    const out: ParsedDomNode[] = [];

    // ── Iterate ALL documents (main + all iframes) ──────────
    for (const doc of result.documents ?? []) {
        const nodes = doc.nodes;
        const layout = doc.layout;
        const textBoxes = doc.textBoxes;
        if (!nodes || !layout) continue;

        // Build nodeIndex → layoutIndex map for this document
        const nodeToLayout = new Map<number, number>();
        for (let li = 0; li < (layout.nodeIndex?.length ?? 0); li++) {
            nodeToLayout.set(layout.nodeIndex[li], li);
        }

        // Iterate nodes in Document Order (DFS)
        for (let ni = 0; ni < (nodes.nodeType?.length ?? 0); ni++) {
            const li = nodeToLayout.get(ni);
            if (li === undefined) continue;

            const bounds = layout.bounds?.[li];
            if (!bounds || bounds.length < 4) continue;
            const [bx, by, bw, bh] = bounds;
            
            // Skip zero-size or off-screen elements
            if (bw <= 0 || bh <= 0) continue;
            if (by < -100) continue; 

            const tagIdx = nodes.nodeName?.[ni];
            const tag = typeof tagIdx === 'number' ? (strings[tagIdx] ?? '') : '';
            
            let isInteractive = INTERACTIVE_TAGS.has(tag);

            // Extract accessible properties from attributes
            let name = '';
            let roleAttr = '';
            let isContentEditable = false;
            let stateBadges = '';

            const attrs: number[] = nodes.attributes?.[ni] ?? [];
            for (let ai = 0; ai < attrs.length - 1; ai += 2) {
                const attrKey = strings[attrs[ai]]?.toLowerCase() ?? '';
                const attrVal = strings[attrs[ai + 1]] ?? '';
                
                if (attrKey === 'aria-label' && attrVal) { name = attrVal; }
                else if (attrKey === 'placeholder' && attrVal && !name) { name = attrVal; }
                else if (attrKey === 'title' && attrVal && !name) { name = attrVal; }
                else if (attrKey === 'value' && attrVal && !name && tag === 'INPUT') { name = attrVal; }
                else if (attrKey === 'role') { roleAttr = attrVal.toLowerCase(); }
                else if (attrKey === 'contenteditable' && attrVal !== 'false') { isContentEditable = true; }
                else if (attrKey === 'aria-pressed' && attrVal === 'true') { stateBadges += '[PRESSED] '; }
                else if (attrKey === 'aria-checked' && attrVal === 'true') { stateBadges += '[CHECKED] '; }
                else if (attrKey === 'aria-expanded' && attrVal === 'true') { stateBadges += '[EXPANDED] '; }
                else if (attrKey === 'aria-selected' && attrVal === 'true') { stateBadges += '[SELECTED] '; }
                else if (attrKey === 'disabled' || (attrKey === 'aria-disabled' && attrVal === 'true')) { stateBadges += '[DISABLED] '; }
            }

            // If it's a contenteditable div or has an explicitly interactive ARIA role, it's interactive!
            if (isContentEditable || INTERACTIVE_ROLES.has(roleAttr)) {
                isInteractive = true;
            }

            // Extract innerText
            let innerText = '';
            const textIdx = layout.text?.[li];
            if (typeof textIdx === 'number') {
                innerText = strings[textIdx] ?? '';
            }

            if (!name && innerText) {
                name = innerText;
            }

            const cleanName = name.replace(/\s+/g, ' ').trim();
            const cleanText = innerText.replace(/\s+/g, ' ').trim();
            
            // Merge name and text if they differ, so the LLM sees both the aria-label and the visible text (e.g., "Mag ich | 2430")
            let finalName = cleanName;
            if (cleanText && cleanName && !cleanName.includes(cleanText) && !cleanText.includes(cleanName)) {
                finalName = `${cleanName} | ${cleanText}`;
            } else if (!cleanName && cleanText) {
                finalName = cleanText;
            }

            if (stateBadges) {
                finalName = `${stateBadges.trim()} ${finalName}`.trim();
            }

            if (isInteractive) {
                out.push({
                    isInteractive: true,
                    text: cleanText.substring(0, 200),
                    x: Math.round(bx + bw / 2),
                    y: Math.round(by + bh / 2),
                    w: Math.round(bw),
                    h: Math.round(bh),
                    role: tag.toLowerCase(),
                    name: finalName.substring(0, 150),
                    tag,
                    nodeId: nodes.backendNodeId?.[ni],
                    paintOrder: layout.paintOrders?.[li] ?? 0,
                });
            } else if (cleanText && cleanText.length > 0) {
                // Ignore script/style text
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
                
                // Add visible static text as context
                out.push({
                    isInteractive: false,
                    text: cleanText.substring(0, 200)
                });
            }
        }
    }

    return out;
}

// ─── AXTree Fallback Parser ──────────────────────────────────
// Used when DOMSnapshot.captureSnapshot is unavailable.
// AXTree has no coordinates — each entry requires a follow-up
// DOM.getBoxModel call. We cap at 40 nodes to keep latency low.

async function resolveAxTreeCoords(
    electronAPI: any,
    wcId: number,
    nodes: any[],
): Promise<Omit<SomEntry, 'id'>[]> {
    const out: Omit<SomEntry, 'id'>[] = [];
    let resolved = 0;
    for (const node of nodes) {
        if (resolved >= 300) break;
        const role = node.role?.value ?? '';
        if (!INTERACTIVE_ROLES.has(role)) continue;
        const name = node.name?.value ?? '';
        const backendNodeId = node.backendDOMNodeId;
        if (!backendNodeId) continue;
        try {
            const r = await electronAPI.cdpSend(wcId, 'DOM.getBoxModel', { backendNodeId });
            if (!r.ok || !r.result?.model) continue;
            const { content } = r.result.model;
            // content = [x0,y0, x1,y1, x2,y2, x3,y3] quad
            if (!content || content.length < 8) continue;
            const bx = content[0], by = content[1];
            const bw = content[2] - content[0];
            const bh = content[5] - content[1];
            if (bw <= 0 || bh <= 0) continue;
            out.push({
                x: Math.round(bx + bw / 2), y: Math.round(by + bh / 2),
                w: Math.round(bw), h: Math.round(bh),
                role, name: name.substring(0, 60).trim(),
                nodeId: backendNodeId,
            });
            resolved++;
        } catch { /* skip unresolvable node */ }
    }
    return out;
}

// ─── captureDomSnapshot (CDP Edition) ───────────────────────
// Replaces the old executeJavaScript(DOM_SNAPSHOT_SCRIPT) approach.
// Populates stepSomRef with the new SomMap for this step.
// Returns the text SoM string that gets sent to the LLM.

export async function captureDomSnapshot(
    wv: any,
    wcId: number,
    stepSomRef: React.MutableRefObject<SomMap>,
    lastFailedId: number | null = null,
): Promise<string> {
    const electronAPI = (window as any).electronAPI;

    // Reset the SoM for this step
    stepSomRef.current = new Map();

    if (!electronAPI?.cdpSend || !wcId) {
        // Non-Electron / no CDP: fall back to empty snapshot with warning
        debug.log('⚠️ [CDP] cdpSend unavailable — no DOM snapshot');
        return '[DOM snapshot unavailable: running outside Electron or CDP not ready]';
    }

    let nodes: ParsedDomNode[] = [];

    // ── Try DOMSnapshot.captureSnapshot first ───────────────
    try {
        const resp = await electronAPI.cdpSend(wcId, 'DOMSnapshot.captureSnapshot', {
            computedStyles: [],
            includePaintOrder: true,   // Z-index occlusion culling
            includeDOMRects: true,
        });
        if (resp.ok && resp.result) {
            nodes = parseDomSnapshot(resp.result);
            debug.log(`🔌 [CDP] DOMSnapshot: ${nodes.length} nodes (interactive+static) across all frames`);
        } else {
            throw new Error(resp.error ?? 'DOMSnapshot failed');
        }
    } catch (e1) {
        debug.log(`⚠️ [CDP] DOMSnapshot failed (${e1}), trying AXTree fallback...`);
        // ── Fallback: Accessibility.getFullAXTree ───────────
        try {
            const axResp = await electronAPI.cdpSend(wcId, 'Accessibility.getFullAXTree', {});
            if (axResp.ok && axResp.result?.nodes) {
                const axNodes = await resolveAxTreeCoords(electronAPI, wcId, axResp.result.nodes);
                nodes = axNodes.map(n => ({ ...n, isInteractive: true, text: n.name }));
                debug.log(`🔌 [CDP] AXTree fallback: ${nodes.length} nodes resolved`);
            } else {
                throw new Error(axResp.error ?? 'AXTree failed');
            }
        } catch (e2) {
            debug.log(`❌ [CDP] Both DOMSnapshot and AXTree failed: ${e2}`);
            return '[DOM snapshot failed — page may still be loading. Wait and retry.]';
        }
    }

    // ── Assign sequential IDs 1..N to Interactive elements ───
    const MAX_ELEMENTS = 400;
    const lines: string[] = [];
    let idCounter = 1;

    for (const node of nodes) {
        if (node.isInteractive) {
            // Sort occlusion-style rendering for interactive ones if necessary, but here we just process in DFS order
            if (idCounter > MAX_ELEMENTS) continue; // skip assigning more interactive nodes, but keep reading text
            
            // We know it has all SomEntry fields
            const entry: SomEntry = {
                id: idCounter,
                x: node.x!, y: node.y!, w: node.w!, h: node.h!,
                role: node.role!, name: node.name!, tag: node.tag,
                nodeId: node.nodeId, paintOrder: node.paintOrder,
            };
            stepSomRef.current.set(idCounter, entry);
            let line = formatSomLine(entry);
            if (lastFailedId && lastFailedId === idCounter) {
                line = `[❌ FAILED LAST STEP] ${line}`;
            }
            lines.push(line);
            idCounter++;
        } else {
            // It's a static text node
            lines.push(`  "${node.text}"`);
        }
    }

    // ── Minimap header ───────────────────────────────────────
    const scrollInfo = await getScrollInfo(wv);
    const minimap = `[PAGE MINIMAP] Scroll: ${scrollInfo.pct}% | AtBottom: ${scrollInfo.atBottom ? 'YES — do NOT scroll more' : 'NO'} | SoM elements: ${lines.length}\n⚠️ IDs are EPHEMERAL — only valid for THIS step. Never reuse an ID from a previous step.\n${'─'.repeat(48)}\n`;

    return minimap + lines.join('\n');
}

function formatSomLine(e: SomEntry): string {
    const roleOrTag = e.role || e.tag?.toLowerCase() || '?';
    const nameStr = e.name ? ` "${e.name}"` : '';
    return `[${e.id}] ${roleOrTag}${nameStr} (x:${e.x} y:${e.y} w:${e.w} h:${e.h})`;
}

async function getScrollInfo(wv: any): Promise<{ pct: number; atBottom: boolean }> {
    try {
        const raw = await wv.executeJavaScript(`JSON.stringify({
            scrollY: Math.round(window.scrollY),
            maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        })`, true);
        const { scrollY, maxScroll } = JSON.parse(raw);
        const pct = maxScroll > 0 ? Math.round((scrollY / maxScroll) * 100) : 0;
        return { pct, atBottom: scrollY >= maxScroll - 10 };
    } catch { return { pct: 0, atBottom: false }; }
}

// ─── captureVisionFrame (Ghost-Compositing) ──────────────────
// Burns SoM bounding boxes into the screenshot in RAM.
// The page DOM is NEVER touched. CSP cannot block this.
// Exports as JPEG 0.85 — saves ~60% tokens vs PNG.

export async function captureVisionFrame(wv: any, somMap: SomMap, lastFailedId: number | null = null): Promise<string> {
    if (!wv?.capturePage) return '';
    try {
        const nativeImg = await wv.capturePage();
        if (!nativeImg || nativeImg.isEmpty()) return '';

        // Resize to max 1200px wide before compositing (LLM doesn't need full-res)
        const size = nativeImg.getSize();
        const resized = size.width > 1200 ? nativeImg.resize({ width: 1200 }) : nativeImg;
        const base64Data = resized.toDataURL();

        return await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(base64Data.replace(/^data:image\/\w+;base64,/, '')); return; }

                ctx.drawImage(img, 0, 0);

                // DPR factor: nativeImg may be @2x on Retina.
                // We get CSS pixel coords from CDP, so we need to scale them up.
                // img.width is the physical pixel width of the screenshot.
                // The webview CSS width is stored on wv.__cssWidth (set below).
                const cssWidth = (wv as any).__cssWidth ?? img.width;
                const dpr = img.width / cssWidth;

                if (somMap.size > 0) {
                    ctx.lineWidth = 2 * dpr;
                    ctx.font = `bold ${12 * dpr}px monospace`;
                    ctx.textBaseline = 'top';

                    for (const [id, entry] of somMap.entries()) {
                        const x = entry.x * dpr;
                        const y = entry.y * dpr;
                        const w = entry.w * dpr;
                        const h = entry.h * dpr;

                        // Bounding box — magenta for max LLM contrast
                        ctx.strokeStyle = '#FF00FF';
                        ctx.strokeRect(x - w / 2, y - h / 2, w, h);

                        // ID badge
                        const badgeW = 26 * dpr;
                        const badgeH = 18 * dpr;

                        if (lastFailedId === id) {
                            ctx.fillStyle = '#FF0000';
                            ctx.fillRect(x - w / 2, y - h / 2 - badgeH, badgeW, badgeH);
                            ctx.strokeStyle = '#8B0000'; // Dark red border for contrast
                            ctx.lineWidth = 4 * dpr;
                            ctx.strokeRect(x - w / 2, y - h / 2 - badgeH, badgeW, badgeH);
                            ctx.fillStyle = '#FFFFFF';
                        } else {
                            ctx.fillStyle = '#FF00FF';
                            ctx.fillRect(x - w / 2, y - h / 2 - badgeH, badgeW, badgeH);
                            ctx.fillStyle = '#FFFFFF';
                        }
                        ctx.fillText(String(id), x - w / 2 + 3 * dpr, y - h / 2 - badgeH + 2 * dpr);
                    }
                }

                // JPEG 0.85: imperceptible quality loss, ~60% smaller than PNG
                resolve(canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/\w+;base64,/, ''));
            };
            img.onerror = reject;
            img.src = base64Data;
        });
    } catch (err) {
        debug.log('⚠️ [captureVisionFrame] failed:', err);
        return '';
    }
}

// ─── waitForPageReady ────────────────────────────────────────
// Unchanged from previous version. MutationObserver-based DOM silence check.

export async function waitForPageReady(wv: any, label: string): Promise<boolean> {
    if (!wv) return false;
    const tag = `⏳ [waitForPageReady:${label}]`;
    const MAX_WAIT_MS = 30000;
    const DOM_SILENCE_MS = 800;
    const start = Date.now();

    // Phase 1: wait for isLoading() = false
    while (wv.isLoading?.() && Date.now() - start < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, 200));
    }

    // Phase 2: wait for DOM silence via executeJavaScript
    try {
        await wv.executeJavaScript(`
            new Promise(resolve => {
                if (document.readyState === 'complete') {
                    let t = null;
                    const obs = new MutationObserver(() => {
                        clearTimeout(t);
                        t = setTimeout(() => { obs.disconnect(); resolve(true); }, ${DOM_SILENCE_MS});
                    });
                    obs.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true });
                    t = setTimeout(() => { obs.disconnect(); resolve(true); }, ${DOM_SILENCE_MS});
                } else {
                    window.addEventListener('load', () => resolve(true), { once: true });
                }
            })
        `, true);
    } catch {
        // Page navigated mid-wait — that's fine
    }

    debug.log(`${tag} ready in ${Date.now() - start}ms`);
    return true;
}

// ─── Utility: capture a plain screenshot (no SoM overlay) ────
// Used for step history / ask_user thumbnails where SoM is irrelevant.

export async function captureScreenshot(wv: any): Promise<string> {
    if (!wv?.capturePage) return '';
    try {
        const img = await wv.capturePage();
        if (!img || img.isEmpty()) return '';
        const size = img.getSize();
        const resized = size.width > 800 ? img.resize({ width: 800 }) : img;
        return resized.toDataURL().replace(/^data:image\/\w+;base64,/, '');
    } catch { return ''; }
}
