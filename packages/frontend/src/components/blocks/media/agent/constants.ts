// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Agent Constants ─────────────────────────────────────────

/** Hard stop: no task should ever need more steps */
export const MAX_STEPS = 100;

// ── Kinetic Sonar Architecture (Vision-First) ─────────────────
// DOM_SNAPSHOT_SCRIPT permanently deleted (-170 lines).
// All page-state is captured via CDP DOMSnapshot.captureSnapshot (webviewUtils.ts).
// The LLM receives ONLY the annotated SoM screenshot + a 40-entry semantic legend.
// Zero HTML/DOM text is ever sent to the LLM.
// ──────────────────────────────────────────────────────────────