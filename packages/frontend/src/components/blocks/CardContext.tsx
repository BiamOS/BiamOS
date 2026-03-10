// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Card Context
// ============================================================
// Enables inter-block communication within a single canvas card.
// FormGroupBlock writes API responses → result blocks re-render.
// ============================================================

import React, { createContext, useContext, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────

export interface CardState {
    /** API response data keyed by resultBlockId */
    results: Record<string, any>;
    /** Loading state per resultBlockId */
    loading: Record<string, boolean>;
    /** Error messages per resultBlockId */
    errors: Record<string, string | null>;
}

interface CardContextValue extends CardState {
    setResult: (blockId: string, data: any) => void;
    setLoading: (blockId: string, loading: boolean) => void;
    setError: (blockId: string, error: string | null) => void;
}

// ─── Context ────────────────────────────────────────────────

const CardCtx = createContext<CardContextValue | null>(null);

export function useCardContext(): CardContextValue | null {
    return useContext(CardCtx);
}

// ─── Provider ───────────────────────────────────────────────

export function CardContextProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<CardState>({
        results: {},
        loading: {},
        errors: {},
    });

    const setResult = useCallback((blockId: string, data: any) => {
        setState(prev => ({
            ...prev,
            results: { ...prev.results, [blockId]: data },
            loading: { ...prev.loading, [blockId]: false },
            errors: { ...prev.errors, [blockId]: null },
        }));
    }, []);

    const setLoading = useCallback((blockId: string, isLoading: boolean) => {
        setState(prev => ({
            ...prev,
            loading: { ...prev.loading, [blockId]: isLoading },
        }));
    }, []);

    const setError = useCallback((blockId: string, error: string | null) => {
        setState(prev => ({
            ...prev,
            errors: { ...prev.errors, [blockId]: error },
            loading: { ...prev.loading, [blockId]: false },
        }));
    }, []);

    return (
        <CardCtx.Provider value={{ ...state, setResult, setLoading, setError }}>
            {children}
        </CardCtx.Provider>
    );
}
