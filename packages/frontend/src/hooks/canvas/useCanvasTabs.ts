// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Tabs Hook
// ============================================================
// Manages tab lifecycle: change, close, grouping, and
// in-app link navigation (addIframeCard). Also handles
// Chrome-like live tab title updates via event bus.
// ============================================================

import { useCallback, useEffect } from "react";
import type { CanvasItem, BiamPayload } from "../../types/canvas";
import { findSlotForWebview } from "../../types/canvas";
import { debug } from "../../utils/debug";
import { saveActiveTab } from "../pin-storage";
import type { SafeSetItems } from "./useCanvasState";

// ─── Types ──────────────────────────────────────────────────

export interface CanvasTabsAPI {
    handleTabChange: (cardId: string, tabIndex: number) => void;
    handleTabClose: (cardId: string, tabIndex: number) => void;
    addTabToGroup: (groupName: string, result: BiamPayload, query: string) => boolean;
    addIframeCard: (url: string, title?: string, sourceGroupName?: string, sourceUrl?: string, customId?: string) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useCanvasTabs(
    itemsRef: React.MutableRefObject<CanvasItem[]>,
    safeSetItems: SafeSetItems,
): CanvasTabsAPI {

    // ─── Tab Change ─────────────────────────────────────────
    const handleTabChange = useCallback((cardId: string, tabIndex: number) => {
        safeSetItems((prev) => prev.map((item) => {
            if (item._id !== cardId || !item.tabs) return item;
            const tab = item.tabs[tabIndex];
            if (!tab) return item;
            // Save active tab index for pinned cards
            if (item._pinned && item._pinnedId) {
                saveActiveTab(`pin-${item._pinnedId}`, tabIndex);
            }
            return { ...item, activeTabIndex: tabIndex, payload: tab.payload };
        }));
    }, [safeSetItems]);

    // ─── Tab Close ──────────────────────────────────────────
    const handleTabClose = useCallback((cardId: string, tabIndex: number) => {
        safeSetItems((prev) => {
            const item = prev.find(i => i._id === cardId);
            if (!item?.tabs) return prev;

            // Last tab → remove the whole card
            if (item.tabs.length <= 1) {
                return prev.filter(i => i._id !== cardId);
            }

            // Remove the tab
            const newTabs = item.tabs.filter((_, i) => i !== tabIndex);
            let newActiveIdx = item.activeTabIndex ?? 0;
            if (tabIndex <= newActiveIdx) {
                newActiveIdx = Math.max(0, newActiveIdx - 1);
            }
            const activePayload = newTabs[newActiveIdx]?.payload ?? item.payload;

            return prev.map(i =>
                i._id === cardId
                    ? {
                        ...i,
                        tabs: newTabs,
                        activeTabIndex: newActiveIdx,
                        payload: activePayload,
                        _query: activePayload._query || i._query,
                    }
                    : i
            );
        });
    }, [safeSetItems]);

    // ─── Tab Grouping: add a result as tab to existing card ──
    const addTabToGroup = useCallback((groupName: string, result: BiamPayload, query: string): boolean => {
        const existingIdx = itemsRef.current.findIndex(
            (item) => !item._loading && item._groupName === groupName
        );
        if (existingIdx < 0) return false;

        const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const tabLabel = (result as any)._intent?.entity || query;
        safeSetItems((prev) => prev.map((item) => {
            if (item._groupName !== groupName || item._loading) return item;
            const existingTabs = item.tabs ?? [{
                id: "tab-original",
                label: item._query,
                payload: item.payload,
            }];
            const newTab = { id: tabId, label: tabLabel, payload: { ...result, _query: query } };
            const newTabs = [...existingTabs, newTab];

            // Auto-sync: if this card is pinned, PATCH related_queries
            if (item._pinned && item._pinnedId) {
                const relatedQueries = newTabs
                    .slice(1)  // skip original tab
                    .map(t => t.payload?._query || t.label)
                    .filter(Boolean);
                debug.log(`📌 [Pin Sync] Saving ${relatedQueries.length} tab(s) for pin #${item._pinnedId}:`, relatedQueries);
                fetch(`http://localhost:3001/api/pinned/${item._pinnedId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ related_queries: relatedQueries }),
                })
                    .then(r => r.json())
                    .then(r => debug.log(`📌 [Pin Sync] PATCH result:`, r))
                    .catch(err => debug.warn(`📌 [Pin Sync] PATCH failed:`, err));
            }

            return {
                ...item,
                tabs: newTabs,
                activeTabIndex: newTabs.length - 1,
                payload: { ...result, _query: query },
                _query: query,
                _pendingTabLoading: false,
                layout: { ...item.layout, h: Math.max(item.layout.h, 14) },
            };
        }));
        return true;
    }, [itemsRef, safeSetItems]);

    // ─── In-app link navigation ─────────────────────────────
    const addIframeCard = useCallback((url: string, title?: string, sourceGroupName?: string, sourceUrl?: string, customId?: string) => {
        let hostname = url;
        try { hostname = new URL(url).hostname.replace("www.", ""); } catch { /* keep raw */ }

        // ─── URL Dedup for standalone navigation ────────────
        // If this is a standalone call (e.g. "open gmail" from Omnibar)
        // and a card with the same domain already exists → just focus it.
        //
        // IMPORTANT: skip dedup when:
        // - customId is set: this is a programmatic spawn (BIAMOS_CREATE_EMPTY_CARD) where the
        //   exact cardId is required for the subsequent action event targeting. Deduping would
        //   silently drop the card and the action event would fire into the void.
        // - URL is about:blank: hostname resolves to "" which matches ALL blank cards.
        if (!sourceGroupName && !sourceUrl && !customId && url !== 'about:blank') {
            const existingCard = itemsRef.current.find((item) => {
                if (item._loading || item.payload?.integration_id !== "web-view") return false;
                // Check all tabs + main payload for matching domain
                const allPayloads = item.tabs
                    ? item.tabs.map(t => t.payload)
                    : [item.payload];
                return allPayloads.some(p => {
                    const blockUrl = (p?.layout as any)?.blocks?.[0]?.url || "";
                    try {
                        return new URL(blockUrl).hostname.replace("www.", "") === hostname;
                    } catch { return false; }
                });
            });
            if (existingCard) {
                debug.log(`🔗 [Dedup] Card for "${hostname}" already exists → focusing "${existingCard._id}"`);
                // Dispatch focus event to scroll to / highlight the existing card
                window.dispatchEvent(new CustomEvent("biamos:focus-card", {
                    detail: { cardId: existingCard._id },
                }));
                return; // Don't create a duplicate!
            }
        }


        // Base payload — agent-enabled (for standalone webview cards)
        const iframePayload: BiamPayload = {
            action: "render_layout",
            integration_id: "web-view",
            _query: title || hostname,
            layout: {
                blocks: [{ type: "iframe", url, title: title || hostname }],
            },
        } as BiamPayload;

        // Tab payload — agent-disabled (for link-opened passive tabs)
        const tabPayload: BiamPayload = {
            action: "render_layout",
            integration_id: "web-view",
            _query: title || hostname,
            layout: {
                blocks: [{ type: "iframe", url, title: title || hostname, agentDisabled: true }],
            },
        } as BiamPayload;

        // ─── Try to add as tab to an existing card ──────────
        // 1) by group name, 2) by source URL (New Tab button)
        let sourceCard: CanvasItem | null = null;
        if (sourceGroupName) {
            sourceCard = itemsRef.current.find(
                (item) => !item._loading && item._groupName === sourceGroupName
            ) ?? null;
        } else if (sourceUrl) {
            // Find the webview card whose active tab URL matches sourceUrl
            const normalizedSource = sourceUrl.replace(/\/+$/, "");
            sourceCard = itemsRef.current.find((item) => {
                if (item._loading || item.payload?.integration_id !== "web-view") return false;
                const activeIdx = item.activeTabIndex ?? 0;
                const activePayload = item.tabs?.[activeIdx]?.payload ?? item.payload;
                const blockUrl = (activePayload?.layout as any)?.blocks?.[0]?.url || "";
                return blockUrl.replace(/\/+$/, "") === normalizedSource;
            }) ?? null;
        }

        // 3) Fallback: find any card with an iframe block (the webview card)
        //    ONLY when a sourceGroupName or sourceUrl was provided (link clicks),
        //    NOT for standalone navigation (Omnibar "öffne gmail").
        if (!sourceCard && (sourceGroupName || sourceUrl)) {
            sourceCard = [...itemsRef.current].reverse().find((item) => {
                if (item._loading) return false;
                // Check main payload
                const bl = item.payload?.layout?.blocks;
                if (Array.isArray(bl) && bl.some((b: any) => b.type === "iframe")) return true;
                // Check tabs
                if (item.tabs) {
                    return item.tabs.some((t) => {
                        const tbl = t.payload?.layout?.blocks;
                        return Array.isArray(tbl) && tbl.some((b: any) => b.type === "iframe");
                    });
                }
                return false;
            }) ?? null;
        }

        if (sourceCard) {
            // Adding as tab → use tabPayload (agent disabled)
            const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            safeSetItems((prev) => prev.map((item) => {
                if (item._id !== sourceCard._id) return item;
                const existingTabs = item.tabs || [{
                    id: `tab-original-${item._id}`,
                    label: item._query || "Original",
                    payload: item.payload,
                }];
                const newTab = { id: tabId, label: title || hostname, payload: tabPayload };
                const newTabs = [...existingTabs, newTab];
                return {
                    ...item,
                    tabs: newTabs,
                    activeTabIndex: newTabs.length - 1,
                    layout: { ...item.layout, h: Math.max(item.layout.h, 18) },
                };
            }));
            return;
        }

        // ─── No existing card → create standalone web-view card ─
        const id = customId || `card-${Date.now()}-nav-${Math.random().toString(36).slice(2, 6)}`;
        const slot = findSlotForWebview(itemsRef.current, 4, 18);
        const card: CanvasItem = {
            _id: id,
            _query: title || hostname,
            payload: iframePayload,
            layout: { x: slot.x, y: slot.y, w: slot.w, h: 18 },
            _loading: false,
        };
        safeSetItems((prev) => [...prev, card]);
    }, [itemsRef, safeSetItems]);

    // ─── Live Tab Title Updates (Chrome-like) ────────────────
    useEffect(() => {
        const handler = (e: Event) => {
            const { url, title, cardId } = (e as CustomEvent<{
                url: string; title: string; cardId?: string;
            }>).detail;
            if (!url || !title) return;

            const shortLabel = title.length > 25 ? title.substring(0, 23) + '…' : title;

            const tryHostname = (inputUrl: string) => {
                try { return new URL(inputUrl).hostname; } catch { return inputUrl; }
            };

            safeSetItems(prev => prev.map(item => {
                if (item.payload?.integration_id !== 'web-view') return item;
                if (cardId && item._id !== cardId) return item;

                // ── Standalone card (no tabs) ──
                if (!item.tabs) {
                    const blocks = item.payload?.layout?.blocks ?? [];
                    return {
                        ...item,
                        _query: shortLabel,
                        payload: {
                            ...item.payload,
                            _query: shortLabel,
                            layout: {
                                ...item.payload.layout,
                                blocks: blocks.map((b: any) =>
                                    b.type === 'iframe' ? { ...b, url, title: shortLabel } : b
                                ),
                            },
                        },
                    };
                }

                // ── Tab-group card ──
                let matchedIdx = -1;
                for (let i = 0; i < item.tabs.length; i++) {
                    const tabBlocks = item.tabs[i].payload?.layout?.blocks ?? [];
                    const tabUrl = (tabBlocks.find((b: any) => b.type === 'iframe') as any)?.url || '';
                    if (tabUrl === url || tryHostname(tabUrl) === tryHostname(url)) {
                        matchedIdx = i;
                        break;
                    }
                }
                if (matchedIdx === -1) matchedIdx = item.activeTabIndex ?? 0;
                if (!item.tabs[matchedIdx]) return item;

                const newTabs = item.tabs.map((t, i) =>
                    i === matchedIdx
                        ? {
                            ...t,
                            label: shortLabel,
                            payload: {
                                ...t.payload,
                                _query: shortLabel,
                                layout: {
                                    ...t.payload.layout,
                                    blocks: t.payload.layout?.blocks?.map((b: any) =>
                                        b.type === 'iframe' ? { ...b, url, title: shortLabel } : b
                                    ) ?? [],
                                },
                            },
                        }
                        : t
                );
                const isActiveTab = matchedIdx === (item.activeTabIndex ?? 0);
                return { ...item, tabs: newTabs, ...(isActiveTab ? { _query: shortLabel } : {}) };
            }));
        };
        window.addEventListener('biamos:tab-title-update', handler);
        return () => window.removeEventListener('biamos:tab-title-update', handler);
    }, [safeSetItems]);

    return {
        handleTabChange,
        handleTabClose,
        addTabToGroup,
        addIframeCard,
    };
}
