// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Central Model Configuration (Kinetic Sonar Edition)
// ============================================================
// All models are OpenRouter IDs — prefix format: "provider/model-name"
// Single source of truth. To change a model: edit here only.
//
// VISION-FIRST STACK (as of March 2026):
//
//   AGENT (primary)  → gemini-2.5-flash        Fast loop, 1M ctx, vision ✅
//   AGENT (fallback) → claude-sonnet-4-5        Best accuracy, agentic tool use ✅
//   AGENT (premium)  → claude-opus-4-5          Deep reasoning, complex tasks
//   ROUTING          → gemini-2.5-flash-lite    Ultra-cheap intent classification
//   TRANSCRIBE       → gemini-2.5-flash         Same model, avoids double billing
//   TTS              → openai/tts-1             No vision equivalent yet
//   EMBEDDINGS       → google/text-embedding-004 Best quality on OpenRouter
// ============================================================

// ── Fast, cheap model — high-volume loops, routing, classification ─────────
// gemini-2.5-flash-lite is NOT vision-capable — only for text classification.
export const MODEL_FAST = "google/gemini-2.5-flash-lite";

// ── Primary Vision Agent — the workhorse of Lura ───────────────────────────
// gemini-2.5-flash:
//   ✅ Vision (screenshot understanding)
//   ✅ 1M token context window (long agent sessions)
//   ✅ ~3x faster than Claude Sonnet
//   ✅ Configurable thinking budget (balanced speed vs. accuracy)
//   ✅ Supports function calling (tool use)
//   💰 ~$0.075/1M input tokens (10x cheaper than Claude)
export const MODEL_THINKING = "google/gemini-2.5-flash";

/** Agent default — vision-capable, fast loop, huge context */
export const MODEL_DEFAULT = MODEL_THINKING;

// ── High-Accuracy Fallback — used when Gemini fails or task is complex ─────
// claude-sonnet-4-5:
//   ✅ Vision (best-in-class UI element recognition)
//   ✅ Best agentic instruction following
//   ✅ Superior for ambiguous / multi-step tasks
//   💰 ~$3/1M input tokens (40x more expensive — reserve for hard tasks)
export const MODEL_AGENT_PRECISE = "anthropic/claude-sonnet-4-5";

// ── Premium Deep-Reasoning — only for extremely complex orchestration ───────
// claude-opus-4-5:
//   ✅ Best reasoning for multi-domain / multi-agent orchestration
//   💰 ~$15/1M input tokens — use sparingly
export const MODEL_AGENT_PREMIUM = "anthropic/claude-opus-4-5";

// ── Voice Transcription ─────────────────────────────────────────────────────
// Reuse the primary agent model — Gemini 2.5 Flash handles audio natively
export const MODEL_TRANSCRIBE = "google/gemini-2.5-flash";

// ── Text-to-Speech ──────────────────────────────────────────────────────────
export const MODEL_TTS = "openai/tts-1";

// ── Block / Integration Suggestions ────────────────────────────────────────
// Gemini 2.0 Flash is still available and good for fast template generation
export const MODEL_BLOCK_SUGGEST = "google/gemini-2.0-flash-001";
