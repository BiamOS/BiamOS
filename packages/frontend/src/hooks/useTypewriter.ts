// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Typewriter Hook
// ============================================================
// Renders text character-by-character with a blinking cursor.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";

interface TypewriterResult {
    /** The currently visible portion of the text */
    displayText: string;
    /** Whether the typewriter is still animating */
    isTyping: boolean;
    /** Skip ahead to show the full text immediately */
    skip: () => void;
}

/**
 * Typewriter effect hook — reveals text character by character.
 *
 * @param text   Full text to reveal
 * @param speed  Milliseconds per character (default: 25)
 */
export function useTypewriter(text: string, speed = 25): TypewriterResult {
    const [charIndex, setCharIndex] = useState(0);
    const [skipped, setSkipped] = useState(false);
    const prevTextRef = useRef(text);

    // Reset when text changes
    useEffect(() => {
        if (text !== prevTextRef.current) {
            setCharIndex(0);
            setSkipped(false);
            prevTextRef.current = text;
        }
    }, [text]);

    // Advance one character at a time
    useEffect(() => {
        if (skipped || charIndex >= text.length) return;

        const timer = setTimeout(() => {
            setCharIndex((prev) => prev + 1);
        }, speed);

        return () => clearTimeout(timer);
    }, [charIndex, text, speed, skipped]);

    const skip = useCallback(() => {
        setSkipped(true);
        setCharIndex(text.length);
    }, [text.length]);

    return {
        displayText: skipped ? text : text.slice(0, charIndex),
        isTyping: !skipped && charIndex < text.length,
        skip,
    };
}
