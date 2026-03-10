// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Splash Screen (React bridge)
// ============================================================
// The actual splash is in index.html (native HTML for instant
// render). This component just fades it out once React is ready.
// ============================================================

import { useEffect } from "react";

interface SplashScreenProps {
    onComplete: () => void;
    minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 2800 }: SplashScreenProps) {
    useEffect(() => {
        const splash = document.getElementById("native-splash");
        if (!splash) {
            onComplete();
            return;
        }

        const fadeTimer = setTimeout(() => {
            splash.classList.add("fade-out");
        }, minDuration);

        const removeTimer = setTimeout(() => {
            splash.remove();
            onComplete();
        }, minDuration + 600);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(removeTimer);
        };
    }, [onComplete, minDuration]);

    return null; // No React rendering — the native splash is in index.html
}
