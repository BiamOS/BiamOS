// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Navigation Context
// ============================================================
// Provides an onNavigate(url, title?) callback to all block
// components. Links open as new iframe canvas cards instead of
// navigating to an external browser.
// ============================================================

import { createContext, useContext, useCallback, type ReactNode } from "react";

// ─── Context ────────────────────────────────────────────────

type NavigateFn = (url: string, title?: string, sourceGroupName?: string) => void;

const NavigationContext = createContext<NavigateFn>(() => {
    // Default: fall back to window.open if no provider
    // (shouldn't happen in practice)
});

export function useNavigation(): NavigateFn {
    return useContext(NavigationContext);
}

// ─── Provider ───────────────────────────────────────────────

interface NavigationProviderProps {
    onNavigate: NavigateFn;
    children: ReactNode;
}

export function NavigationProvider({ onNavigate, children }: NavigationProviderProps) {
    // Stable callback that also supports Ctrl+click for external open
    const handleNavigate = useCallback(
        (url: string, title?: string, sourceGroupName?: string) => {
            onNavigate(url, title, sourceGroupName);
        },
        [onNavigate]
    );

    return (
        <NavigationContext.Provider value={handleNavigate}>
            {children}
        </NavigationContext.Provider>
    );
}
