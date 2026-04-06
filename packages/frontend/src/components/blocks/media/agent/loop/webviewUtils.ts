// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — WebView Utilities (Kinetic Sonar Edition)
// ============================================================
// PHASE 1 PURGE: Removed (-350 lines):
//   - harvestClickablePointerElements() — recursive JS shadow-DOM injection
//   - Spatial Context Map (modal detection via JS injection)
//
// UPGRADED:
//   - MAX_ELEMENTS: 400 → 80 (only what matters)
//   - SoM box color: #FF00FF → #FF3333 (maximum LLM contrast)
//   - Badge background: #CC00CC → #1A1A1A (black, white text)
//
// RETAINED:
//   captureDomSnapshot() — uses CDP DOMSnapshot.captureSnapshot
//     - Zero JS injection into the guest process
//     - Automatically pierces ALL iframes
//     - Z-index occlusion culling via paintOrder
//     - Sequential SoM IDs 1..N (never hash-based)
//   captureVisionFrame() — Ghost-Compositing (upgraded colors)
//     - Captures raw wv screenshot
//     - Burns SoM neon-red boxes in RAM (off-screen canvas)
//     - Exports as JPEG 0.85 (saves ~60% LLM tokens vs PNG)
//   waitForPageReady() — unchanged (MutationObserver based)
//   buildSomLegend() — capped at 40 entries (semantic anchor)
// ============================================================

import { debug } from '../../../../../utils/debug';
import type { SomEntry, SomMap } from '../types';
import React from 'react';

// ─── Constants ───────────────────────────────────────────────

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY']);

// AX roles that indicate interactivity (used in AXTree fallback)
const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox',
    'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'tab', 'listbox', 'option', 'slider', 'spinbutton', 'switch',
    'treeitem', 'columnheader', 'rowheader',
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
                else if ((attrKey === 'data-placeholder' || attrKey === 'aria-placeholder') && attrVal && !name) { name = attrVal; }
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

            if (isContentEditable || INTERACTIVE_ROLES.has(roleAttr)) {
                isInteractive = true;
            }

            // Extract innerText
            let innerText = '';
            const textIdx = layout.text?.[li];
            if (typeof textIdx === 'number') {
                innerText = strings[textIdx] ?? '';
            }

            if (!name && innerText) { name = innerText; }

            const cleanName = name.replace(/\s+/g, ' ').trim();
            const cleanText = innerText.replace(/\s+/g, ' ').trim();

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
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
                out.push({ isInteractive: false, text: cleanText.substring(0, 200) });
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
        if (resolved >= 80) break;
        const role = node.role?.value ?? '';
        if (!INTERACTIVE_ROLES.has(role)) continue;
        const name = node.name?.value ?? '';
        const backendNodeId = node.backendDOMNodeId;
        if (!backendNodeId) continue;
        try {
            const r = await electronAPI.cdpSend(wcId, 'DOM.getBoxModel', { backendNodeId });
            if (!r.ok || !r.result?.model) continue;
            const { content } = r.result.model;
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

// ─── captureDomSnapshot (CDP Edition) ────────────────────────
// Populates stepSomRef with the new SomMap for this step.
// Returns the text SoM string — NOT sent to LLM, used internally
// to give captureVisionFrame() the coordinates for box-drawing.
//
// MAX_ELEMENTS: 80 (Kinetic Sonar — only what the eye sees matters)

// Global offset generator to prevent LLM "ID Muscle Memory" (ReAct Amnesia)
// Every new snapshot bumps IDs by 100 (e.g., 101-180 -> 201-280 -> 301-380).
// If the LLM tries to reuse id=105 on step 2, it will hit an immediate "ID not found"
// error instead of silently clicking an innocous background element.
let globalSnapshotOffset = 0;

export async function captureDomSnapshot(
    wv: any,
    wcId: number,
    stepSomRef: React.MutableRefObject<SomMap>,
    lastFailedId: number | null = null,
): Promise<string> {
    const electronAPI = (window as any).electronAPI;

    // Reset the SoM for this step and bump the ephemeral ID namespace
    stepSomRef.current = new Map();
    globalSnapshotOffset = (globalSnapshotOffset + 100) % 9000;
    if (globalSnapshotOffset === 0) globalSnapshotOffset = 100;
    let idCounter = globalSnapshotOffset;

    if (!electronAPI?.cdpSend || !wcId) {
        debug.log('⚠️ [CDP] cdpSend unavailable — no DOM snapshot');
        return '[DOM snapshot unavailable: running outside Electron or CDP not ready]';
    }

    let nodes: ParsedDomNode[] = [];

    // ── Try DOMSnapshot.captureSnapshot first ───────────────
    try {
        const resp = await electronAPI.cdpSend(wcId, 'DOMSnapshot.captureSnapshot', {
            computedStyles: [],
            includePaintOrder: true,
            includeDOMRects: true,
        });
        if (resp.ok && resp.result) {
            nodes = parseDomSnapshot(resp.result);
            debug.log(`🔌 [CDP] DOMSnapshot: ${nodes.length} nodes across all frames`);
        } else {
            throw new Error(resp.error ?? 'DOMSnapshot failed');
        }
    } catch (e1) {
        debug.log(`⚠️ [CDP] DOMSnapshot failed (${e1}), trying AXTree fallback...`);
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
    const MAX_ELEMENTS = 80; // Kinetic Sonar: lean and precise
    const lines: string[] = [];

    // ── Fetch scroll offset AND device pixel ratio ─────────
    let pageScrollX = 0;
    let pageScrollY = 0;
    let contentDpr = 1;
    try {
        const raw = await wv.executeJavaScript(`JSON.stringify({
            x: Math.round(window.scrollX),
            y: Math.round(window.scrollY),
            dpr: window.devicePixelRatio || 1
        })`, true);
        const parsed = JSON.parse(raw);
        pageScrollX = parsed.x ?? 0;
        pageScrollY = parsed.y ?? 0;
        contentDpr = parsed.dpr ?? 1;
    } catch { /* use defaults */ }

    if (pageScrollX !== 0 || pageScrollY !== 0 || contentDpr !== 1) {
        debug.log(`📍 [SoM] Corrections: scrollX=${pageScrollX} scrollY=${pageScrollY} DPR=${contentDpr.toFixed(2)}`);
    }

    for (const node of nodes) {
        if (node.isInteractive) {
            if (idCounter > MAX_ELEMENTS) continue;

            const entry: SomEntry = {
                id: idCounter,
                x: Math.round(((node.x ?? 0) - pageScrollX) / contentDpr),
                y: Math.round(((node.y ?? 0) - pageScrollY) / contentDpr),
                w: Math.round((node.w ?? 0) / contentDpr),
                h: Math.round((node.h ?? 0) / contentDpr),
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
            lines.push(`  "${node.text}"`);
        }
    }

    // ── Minimap header (Viewport Radar) ─────────────────────
    const scrollInfo = await getScrollInfo(wv);
    const radarBar = scrollInfo.atBottom
        ? `[ SCROLL: ${scrollInfo.pct}% | AT BOTTOM ]`
        : `[ SCROLL: ${scrollInfo.pct}% | MORE CONTENT BELOW ]`;
    const minimap = `[PAGE RADAR] ${radarBar}\nSoM elements: ${idCounter - 1}\n⚠️ IDs are EPHEMERAL — only valid for THIS step.\n${'─'.repeat(48)}\n`;

    return minimap + lines.join('\n');
}

function formatSomLine(e: SomEntry): string {
    const roleOrTag = e.role || e.tag?.toLowerCase() || '?';
    const nameStr = e.name ? ` "${e.name}"` : '';
    return `[${e.id}] ${roleOrTag}${nameStr} (x:${e.x} y:${e.y} w:${e.w} h:${e.h})`;
}

async function getScrollInfo(wv: any): Promise<{ pct: number; atBottom: boolean; pageH: number; viewH: number; scrollX: number; scrollY: number }> {
    try {
        const raw = await wv.executeJavaScript(`JSON.stringify({
            scrollX: Math.round(window.scrollX),
            scrollY: Math.round(window.scrollY),
            maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            pageH: document.documentElement.scrollHeight,
            viewH: window.innerHeight,
        })`, true);
        const { scrollX, scrollY, maxScroll, pageH, viewH } = JSON.parse(raw);
        const pct = maxScroll > 0 ? Math.round((scrollY / maxScroll) * 100) : 100;
        return { pct, atBottom: scrollY >= maxScroll - 10, pageH, viewH, scrollX: scrollX ?? 0, scrollY: scrollY ?? 0 };
    } catch { return { pct: 0, atBottom: false, pageH: 0, viewH: 0, scrollX: 0, scrollY: 0 }; }
}

// ─── buildSomLegend (40-entry Semantic Anchor) ───────────────
// Compact legend that accompanies the screenshot in the LLM prompt.
// Format: "[id] role "name"" — one entry per interactive element, max 40.
// Sorted by paintOrder (modals/overlays first — highest visual priority).
// This is the "semantic bridge": 100-150 tokens for 100% ID certainty.

export function buildSomLegend(somMap: SomMap, maxEntries = 40): string {
    const lines: string[] = [];

    // Sort visually salient items (modals/overlays) to the TOP
    const entries = Array.from(somMap.entries()).sort((a, b) => {
        const paintA = a[1].paintOrder ?? 0;
        const paintB = b[1].paintOrder ?? 0;
        return paintB - paintA; // Descending: highest paintOrder first
    });

    let count = 0;
    for (const [id, entry] of entries) {
        if (count >= maxEntries) break;
        const roleStr = entry.role || entry.tag?.toLowerCase() || 'element';
        const nameStr = entry.name ? ` "${entry.name}"` : '';
        lines.push(`[${id}] ${roleStr}${nameStr}`);
        count++;
    }
    return lines.join('\n');
}

// ─── captureVisionFrame (Ghost-Compositing, Kinetic Sonar) ───
// Burns SoM bounding boxes into the screenshot in RAM.
// The page DOM is NEVER touched. CSP cannot block this.
// Exports as JPEG 0.85 — saves ~60% tokens vs PNG.
//
// COLOR UPGRADE (Phase 1):
//   Box stroke: #FF3333 (bright red — max LLM contrast vs white/gray UI)
//   Badge bg:   #1A1A1A (near-black — white text pops cleanly)
//   Failed ID:  #FF0000 (pure red, with dark-red border)

export async function captureVisionFrame(wv: any, somMap: SomMap, lastFailedId: number | null = null): Promise<string> {
    if (!wv?.capturePage) return '';

    // ── Black Frame Detection + Retry ─────────────────────────
    // capturePage() can return a solid-black frame when the webview GPU surface
    // hasn't composited yet (e.g. first frame after navigation, or webview
    // momentarily off-screen). We detect this and retry once after a brief wait.
    const captureWithBlackCheck = async (): Promise<{ img: any; isBlack: boolean }> => {
        const nativeImg = await wv.capturePage();
        if (!nativeImg || nativeImg.isEmpty()) return { img: null, isBlack: true };

        // Sample 16 pixels spread across the image to detect solid-black frames
        const sample = nativeImg.resize({ width: 8, height: 8 });
        const buf: Buffer = sample.toBitmap();
        let brightPixels = 0;
        for (let i = 0; i < buf.length; i += 4) {
            const r = buf[i], g = buf[i + 1], b = buf[i + 2];
            if (r + g + b > 30) brightPixels++; // Any non-near-black pixel counts
        }
        const brightRatio = brightPixels / (buf.length / 4);
        return { img: nativeImg, isBlack: brightRatio < 0.05 }; // <5% bright = black frame
    };

    try {
        let { img: nativeImg, isBlack } = await captureWithBlackCheck();

        if (isBlack) {
            debug.log('⚠️ [captureVisionFrame] Black frame detected — waiting 600ms and retrying');
            await new Promise(r => setTimeout(r, 600));
            const retry = await captureWithBlackCheck();
            nativeImg = retry.img;
            isBlack = retry.isBlack;
        }

        if (!nativeImg || isBlack) {
            debug.log('⚠️ [captureVisionFrame] Frame still black after retry — returning empty');
            return ''; // Engine will send no screenshot — LLM will be told page not rendered
        }

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

                const cssWidth = (wv as any).__cssWidth ?? img.width;
                const dpr = img.width / cssWidth;

                if (somMap.size > 0) {
                    ctx.font = `bold ${11 * dpr}px monospace`;
                    ctx.textBaseline = 'top';

                    const occupiedBadges: { bx: number; by: number; bw: number; bh: number }[] = [];

                    for (const [id, entry] of somMap.entries()) {
                        const cx = entry.x * dpr;
                        const cy = entry.y * dpr;
                        const w = entry.w * dpr;
                        const h = entry.h * dpr;

                        // ── Box: bright red for maximum LLM contrast ──
                        ctx.lineWidth = 2 * dpr;
                        ctx.strokeStyle = lastFailedId === id ? '#FF0000' : '#FF3333';
                        ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

                        // Badge
                        const badgeW = (String(id).length * 8 + 6) * dpr;
                        const badgeH = 16 * dpr;
                        let badgeX = cx - w / 2;
                        let badgeY = cy - h / 2 - badgeH;

                        // Anti-collision: shift right if overlapping a previous badge
                        let attempts = 0;
                        while (attempts < 8) {
                            const collision = occupiedBadges.some(ob =>
                                badgeX < ob.bx + ob.bw && badgeX + badgeW > ob.bx &&
                                badgeY < ob.by + ob.bh && badgeY + badgeH > ob.by
                            );
                            if (!collision) break;
                            badgeX += badgeW + 2 * dpr;
                            attempts++;
                        }
                        occupiedBadges.push({ bx: badgeX, by: badgeY, bw: badgeW, bh: badgeH });

                        if (lastFailedId === id) {
                            // Failed: pure red badge
                            ctx.fillStyle = '#FF0000';
                            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
                            ctx.lineWidth = 3 * dpr;
                            ctx.strokeStyle = '#8B0000';
                            ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
                            ctx.fillStyle = '#FFFFFF';
                        } else {
                            // Normal: near-black badge, white text
                            ctx.fillStyle = '#1A1A1A';
                            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
                            ctx.fillStyle = '#FFFFFF';
                        }
                        ctx.fillText(String(id), badgeX + 3 * dpr, badgeY + 2 * dpr);
                    }
                }

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
// MutationObserver-based DOM silence check.
// silenceMs is adaptive: 150ms (scroll), 200ms (type), 300ms (click), 1200ms (navigate).

export async function waitForPageReady(wv: any, label: string, silenceMs = 800): Promise<boolean> {
    if (!wv) return false;
    const tag = `⏳ [waitForPageReady:${label}]`;
    const MAX_WAIT_MS = 8000;
    const start = Date.now();

    // Phase 1: wait for isLoading() = false
    while (wv.isLoading?.() && Date.now() - start < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, 200));
    }

    // Phase 2: wait for DOM silence — always race against a hard timeout
    const phase2Cap = Math.min(silenceMs * 3, 3000);
    try {
        await Promise.race([
            wv.executeJavaScript(`
                new Promise(resolve => {
                    if (document.readyState === 'complete') {
                        let t = null;
                        const obs = new MutationObserver(() => {
                            clearTimeout(t);
                            t = setTimeout(() => { obs.disconnect(); resolve(true); }, ${silenceMs});
                        });
                        obs.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true });
                        t = setTimeout(() => { obs.disconnect(); resolve(true); }, ${silenceMs});
                    } else {
                        window.addEventListener('load', () => resolve(true), { once: true });
                    }
                })
            `, true),
            new Promise<void>(r => setTimeout(r, phase2Cap)),
        ]);
    } catch {
        // Page navigated mid-wait — fine
    }

    debug.log(`${tag} ready in ${Date.now() - start}ms`);
    return true;
}

// ─── captureScreenshot (plain, no SoM overlay) ───────────────
// Used for step history / ask_user thumbnails.

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
