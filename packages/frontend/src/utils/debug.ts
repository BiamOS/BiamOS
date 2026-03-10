// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Frontend Debug Logger
// ============================================================
// Conditional logger that only outputs in development mode.
// In production builds, all debug calls are silent no-ops.
//
// Usage:
//   import { debug } from "../utils/debug";
//   debug.log("🧠 [Context]", "message", data);
//   debug.warn("⚠️ Warning:", error);
// ============================================================

const IS_DEV = import.meta.env?.DEV ?? (typeof process !== "undefined" && process.env?.NODE_ENV !== "production");

/* eslint-disable no-console */
const noop = (..._args: any[]) => {};

export const debug = {
    log: IS_DEV ? console.log.bind(console) : noop,
    warn: IS_DEV ? console.warn.bind(console) : noop,
    error: console.error.bind(console), // errors always log
};
