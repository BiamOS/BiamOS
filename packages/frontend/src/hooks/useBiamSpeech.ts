// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Lura Speech Hook (TTS)
// ============================================================
// Text-to-speech using the best available browser voice.
// Prefers Microsoft Online/Neural voices on Windows.
// ============================================================

import { useState, useCallback, useEffect } from "react";
import { debug } from "../utils/debug";

interface useBiamSpeechOptions {
    enabled?: boolean;
}

interface BiamSpeechHook {
    speak: (text: string) => void;
    stop: () => void;
    isSpeaking: boolean;
}

// Strip emojis, markdown, and special chars for cleaner TTS
function cleanForSpeech(text: string): string {
    return text
        .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, "")
        .replace(/[*_~`#]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Cache the best voice once found
let cachedVoice: SpeechSynthesisVoice | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
    if (cachedVoice) return cachedVoice;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // Log available voices for debugging
    debug.log("[TTS] Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(", "));

    // Priority order (best first):
    // 1. Microsoft Online/Neural English voices (best quality on Windows)
    // 2. Google English voices (good in Chromium)
    // 3. Any English female voice
    // 4. Any English voice
    const pick =
        voices.find(v => /Microsoft.*Online/i.test(v.name) && v.lang.startsWith("en")) ??
        voices.find(v => /Microsoft.*(Jenny|Aria|Sara)/i.test(v.name)) ??
        voices.find(v => /Google.*US.*Female/i.test(v.name)) ??
        voices.find(v => /Google.*UK.*Female/i.test(v.name)) ??
        voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) ??
        voices.find(v => v.name.includes("Zira") || v.name.includes("Hazel")) ??
        voices.find(v => v.lang.startsWith("en") && !v.name.includes("David")) ??
        voices.find(v => v.lang.startsWith("en")) ??
        voices[0];

    if (pick) {
        cachedVoice = pick;
        debug.log("[TTS] Selected voice:", pick.name, pick.lang);
    }
    return pick;
}

export function useBiamSpeech({ enabled = true }: useBiamSpeechOptions = {}): BiamSpeechHook {
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Pre-load voices
    useEffect(() => {
        if (!window.speechSynthesis) return;
        // Voices are loaded async in some browsers
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            cachedVoice = null; // Reset cache when voices change
            getBestVoice();
        };
        return () => { window.speechSynthesis?.cancel(); };
    }, []);

    const speak = useCallback((text: string) => {
        if (!enabled || !window.speechSynthesis) return;

        window.speechSynthesis.cancel();

        const cleaned = cleanForSpeech(text);
        if (!cleaned) return;

        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.85;

        const voice = getBestVoice();
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    }, [enabled]);

    const stop = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    }, []);

    return { speak, stop, isSpeaking };
}
