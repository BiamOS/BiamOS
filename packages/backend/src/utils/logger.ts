// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Structured Logger
// ============================================================
// Thin wrapper around console that can be silenced in production.
// Usage:  import { log } from "../utils/logger.js";
//         log.debug("message");   // only in dev
//         log.info("message");    // always
//         log.warn("message");    // always
//         log.error("message");   // always
// ============================================================

const IS_PROD = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PROD ? "info" : "debug");

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const currentLevel = LEVELS[LOG_LEVEL as keyof typeof LEVELS] ?? LEVELS.debug;

export const log = {
    /** Debug logs — silenced in production unless LOG_LEVEL=debug */
    debug: (...args: unknown[]) => {
        if (currentLevel <= LEVELS.debug) console.log(...args);
    },

    /** Informational logs — always shown unless LOG_LEVEL > info */
    info: (...args: unknown[]) => {
        if (currentLevel <= LEVELS.info) console.log(...args);
    },

    /** Warnings — always shown unless LOG_LEVEL > warn */
    warn: (...args: unknown[]) => {
        if (currentLevel <= LEVELS.warn) console.warn(...args);
    },

    /** Errors — always shown */
    error: (...args: unknown[]) => {
        console.error(...args);
    },
};
