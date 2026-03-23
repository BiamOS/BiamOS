// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Grid/Ruler Overlay for Vision-based Agent Clicks
// ============================================================
// Injects a neon-green ruler (canvas-based, no DOM pollution)
// at the top and left edges of the webview, captures a page
// screenshot, then removes the ruler. This lets vision LLMs
// (Gemini, GPT-4o) read precise %-coordinates via "cross-sighting".
// ============================================================

const INJECT_RULER_SCRIPT = `
  (function() {
    if (document.getElementById('__biamos_ruler')) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement('canvas');
    canvas.id = '__biamos_ruler';
    canvas.style.cssText = 'position:fixed; top:0; left:0; z-index:2147483647; pointer-events:none;';

    // Use physical pixels for Retina sharpness
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const BAR_SIZE = 24;
    const PRIMARY_COLOR = '#00FF41'; // Neon green — best LLM extraction color
    const BG_COLOR = 'rgba(15, 15, 15, 0.85)';

    // Draw ruler backgrounds (strips only, NOT full-screen grid)
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, BAR_SIZE); // Top ruler strip
    ctx.fillRect(0, 0, BAR_SIZE, h); // Left ruler strip

    ctx.fillStyle = PRIMARY_COLOR;
    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'middle';

    // ─── Top Ruler (X-axis, % values) ───────────────────────
    ctx.textAlign = 'center';
    for (let i = 1; i < 100; i++) {
      const x = (w * i) / 100;
      if (i % 10 === 0) {
        ctx.fillRect(x - 1, 0, 2, 10);      // Major tick
        ctx.fillText(i.toString(), x, 17);   // Label at 10% intervals
      } else if (i % 5 === 0) {
        ctx.fillRect(x, 0, 1, 7);            // Medium tick
      } else {
        ctx.fillRect(x, 0, 1, 4);            // Minor tick
      }
    }

    // ─── Left Ruler (Y-axis, % values) ──────────────────────
    ctx.textAlign = 'left';
    for (let i = 1; i < 100; i++) {
      const y = (h * i) / 100;
      if (i % 10 === 0) {
        ctx.fillRect(0, y - 1, 10, 2);       // Major tick
        ctx.fillText(i.toString(), 12, y);   // Label at 10% intervals
      } else if (i % 5 === 0) {
        ctx.fillRect(0, y, 7, 1);            // Medium tick
      } else {
        ctx.fillRect(0, y, 4, 1);            // Minor tick
      }
    }

    document.body.appendChild(canvas);
  })();
`;

const REMOVE_RULER_SCRIPT = `
  const __r = document.getElementById('__biamos_ruler');
  if (__r) __r.remove();
`;

/**
 * Captures a screenshot of the webview with the ruler overlay injected.
 * Returns a base64 PNG string (without the data:image/png;base64, prefix).
 * The ruler is removed immediately after capture.
 */
export async function captureScreenshotWithRuler(wv: any): Promise<string> {
    if (!wv?.executeJavaScript || !wv?.capturePage) {
        return '';
    }
    try {
        await wv.executeJavaScript(INJECT_RULER_SCRIPT);
        // Give the canvas a frame to render (rAF timing)
        await new Promise(r => setTimeout(r, 100));

        const nativeImage = await wv.capturePage();
        await wv.executeJavaScript(REMOVE_RULER_SCRIPT);

        if (nativeImage && !nativeImage.isEmpty()) {
            const size = nativeImage.getSize();
            // Cap at 1200px wide to avoid huge base64 payloads while keeping Retina legibility
            const resized = size.width > 1200 ? nativeImage.resize({ width: 1200 }) : nativeImage;
            return resized.toDataURL().replace(/^data:image\/\w+;base64,/, '');
        }
    } catch (err) {
        // Graceful fallback — non-fatal
        console.warn('[gridOverlay] captureWithRuler failed:', err);
        try { await wv.executeJavaScript(REMOVE_RULER_SCRIPT); } catch { /* ignore cleanup error */ }
    }
    return '';
}
