// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Orchestrator API
// ============================================================
// Originally useIntentHandler.
// Rebuilt in Phase 2B to only manage canvas state after the
// Universal Router (in FloatingOmnibar) has dispatched events.
// ============================================================

import { useState, useCallback } from "react";
import { useCanvasItems } from "./useCanvasItems";

export function useIntentHandler(options?: { speak?: (text: string) => void }) {
    const speak = options?.speak;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeGroups, setActiveGroups] = useState<string[]>([]);
    
    // Ghost Chat removed: Chat is now strictly local to ContextSidebar in V2

    const canvas = useCanvasItems();

    // ─── Legacy Intent Hook API (Keep signature for App.tsx) ───────
    // The FloatingOmnibar now handles intents via API router and events.
    // This function only remains for fallback single-string commands
    // handled synchronously in App.tsx (e.g. compound query splits).
    const handleIntent = useCallback(async (text: string): Promise<any> => {
        // Fallback for simple "open google" compound splits
        // Full intent routing is now in FloatingOmnibar -> backend/Universal Router
        setIsLoading(true);
        setError(null);
        try {
           // We just delegate backwards to the Omnibar event
           window.dispatchEvent(
               new CustomEvent('biamos:event', { 
                   detail: { type: 'BIAMOS_GLOBAL_INTENT', query: text }
               })
           );
        } catch {
            setError("Fallback intent dispatch failed");
        } finally {
            setIsLoading(false);
        }
        return null;
    }, []);

    // ─── Ghost Chat Stubs (Keep signatures to avoid breaking App.tsx)
    const handleChatSend = useCallback((answer: string) => {
        handleIntent(answer);
    }, [handleIntent]);

    const handleSuggestionClick = useCallback((suggestion: string) => {
        handleIntent(suggestion);
    }, [handleIntent]);

    const toggleChat = useCallback(() => {}, []);
    const clearChat = useCallback(() => {}, []);
    const clearError = useCallback(() => setError(null), []);

    return {
        items: canvas.items,
        isLoading,
        error,
        activeGroups,
        setActiveGroups,
        gridLayouts: canvas.gridLayouts,
        // Ghost Chat Stubs
        chatMessages: [],
        chatOpen: false,
        pipelineStep: null,
        handleIntent,
        handleChatSend,
        handleSuggestionClick,
        toggleChat,
        clearChat,
        // Canvas API
        handleRemove: canvas.handleRemove,
        handleClearAll: canvas.handleClearAll,
        handleLayoutChange: canvas.handleLayoutChange,
        handleDragStart: canvas.handleDragStart,
        handleDragStop: canvas.handleDragStop,
        handleTabChange: canvas.handleTabChange,
        handleTabClose: canvas.handleTabClose,
        clearError,
        addIframeCard: canvas.addIframeCard,
        onCardLayoutChange: canvas.onCardLayoutChange,
    };
}
