// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Central Model Configuration
// ============================================================
// Single source of truth for LLM model IDs.
// All agents and services MUST import from here.
// To change a model, update it here — no hunting through files.
// ============================================================

/** Fast, cheap model — no thinking, good for simple tasks */
export const MODEL_FAST = "google/gemini-2.5-flash-lite";

/** Thinking-capable model — reasoning, complex tasks */
export const MODEL_THINKING = "google/gemini-2.5-flash";

/** Default model for new agents */
export const MODEL_DEFAULT = MODEL_FAST;

/** Model for voice-to-text transcription */
export const MODEL_TRANSCRIBE = "google/gemini-2.5-flash";

/** Model for text-to-speech */
export const MODEL_TTS = "openai/tts-1";

/** Model for block suggestion (integration templates) */
export const MODEL_BLOCK_SUGGEST = "google/gemini-2.0-flash-001";
