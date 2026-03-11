// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Items Hook
// ============================================================
// Extracted from useIntentHandler.ts — manages canvas item
// state, layout changes, tab management, and iframe cards.
// Now also handles pinned items (persist across restarts).
// ============================================================

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { debug } from "../utils/debug";
import type { BiamPayload, CanvasItem, GridLayoutItem } from "../types/canvas";
import { smartCardSize, findNextSlot } from "../types/canvas";
import { CARD_CONSTRAINTS } from "../theme/theme";
import {
    getSavedPinLayouts,
    savePinLayouts,
    removeSavedPinLayout,
    getSavedActiveTabs,
    saveActiveTab,
} from "./pin-storage";

const PIN_API = "http://localhost:3001/api/pinned";

// ============================================================
// Hook
// ============================================================

export function useCanvasItems() {
    const [items, rawSetItems] = useState<CanvasItem[]>([]);

    // ─── Removal tracking (prevents race with RGL and other setItems callers) ──
    const removedIdsRef = useRef<Set<string>>(new Set());

    // Safe setItems wrapper: always filters out removed card IDs
    const safeSetItems: typeof rawSetItems = useCallback((updater) => {
        rawSetItems((prev) => {
            const result = typeof updater === 'function' ? updater(prev) : updater;
            // Filter out any items that have been removed
            if (removedIdsRef.current.size === 0) return result;
            const filtered = result.filter((item) => !removedIdsRef.current.has(item._id));
            return filtered;
        });
    }, []);

    // Ref that always holds current items (avoids stale closure in callbacks)
    const itemsRef = useRef<CanvasItem[]>([]);
    useEffect(() => { itemsRef.current = items; }, [items]);


    // ─── Load Pinned Items on Startup ───────────────────────
    const pinsLoadedRef = useRef(false);
    useEffect(() => {
        if (pinsLoadedRef.current) return;
        pinsLoadedRef.current = true;

        fetch(PIN_API)
            .then((r) => r.json())
            .then((data) => {
                const pins = data.pins;
                if (!Array.isArray(pins) || pins.length === 0) return;

                const pinCards: CanvasItem[] = pins
                    .filter((p: any) => p.last_layout || p.pin_type === "webview")
                    .map((p: any, i: number) => {
                        // Restore saved grid position from localStorage
                        const savedLayouts = getSavedPinLayouts();
                        const savedLayout = savedLayouts[`pin-${p.id}`];

                        // ─── Webview pin ──────────────────────────
                        if (p.pin_type === "webview" && p.url) {
                            let hostname = p.url;
                            try { hostname = new URL(p.url).hostname.replace("www.", ""); } catch { /* */ }
                            const wvCard: CanvasItem = {
                                _id: `pin-${p.id}`,
                                _query: p.query || hostname,
                                payload: {
                                    action: "render_layout",
                                    integration_id: "web-view",
                                    _query: p.query || hostname,
                                    layout: {
                                        blocks: [{ type: "iframe", url: p.url, title: p.query || hostname }],
                                    },
                                } as BiamPayload,
                                layout: savedLayout ?? {
                                    x: (i % 2) * 6,
                                    y: Math.floor(i / 2) * 20,
                                    w: 6,
                                    h: 20,
                                },
                                _pinned: true,
                                _pinnedId: p.id,
                            };

                            // Restore webview tabs from related_queries (URLs)
                            if (Array.isArray(p.related_queries) && p.related_queries.length > 0) {
                                // Deduplicate related_queries against main URL
                                const mainNorm = p.url?.replace(/\/+$/, "") || "";
                                const seen = new Set<string>();
                                if (mainNorm) seen.add(mainNorm);
                                const dedupedQueries = p.related_queries.filter((tabUrl: string) => {
                                    const norm = tabUrl.replace(/\/+$/, "");
                                    if (seen.has(norm)) return false;
                                    seen.add(norm);
                                    return true;
                                });

                                if (dedupedQueries.length > 0) {
                                    const mainTab = {
                                        id: `wv-main-${p.id}`,
                                        label: p.query || hostname,
                                        payload: wvCard.payload,
                                    };
                                    const extraTabs = dedupedQueries.map((tabUrl: string, ti: number) => {
                                        let tHost = tabUrl;
                                        try { tHost = new URL(tabUrl).hostname.replace("www.", ""); } catch { /* */ }
                                        return {
                                            id: `wv-tab-${p.id}-${ti}`,
                                            label: tHost,
                                            payload: {
                                                action: "render_layout",
                                                integration_id: "web-view",
                                                _query: tHost,
                                                layout: {
                                                    blocks: [{ type: "iframe", url: tabUrl, title: tHost }],
                                                },
                                            } as BiamPayload,
                                        };
                                    });
                                    wvCard.tabs = [mainTab, ...extraTabs];
                                    // Restore saved active tab index
                                    const savedTabs = getSavedActiveTabs();
                                    wvCard.activeTabIndex = savedTabs[`pin-${p.id}`] ?? 0;
                                    if (wvCard.activeTabIndex >= wvCard.tabs.length) wvCard.activeTabIndex = 0;
                                    const aTab = wvCard.tabs[wvCard.activeTabIndex];
                                    if (aTab) wvCard.payload = aTab.payload;
                                    debug.log(`📌 [Restore] Webview pin #${p.id}: ${dedupedQueries.length} extra tab(s), active=${wvCard.activeTabIndex}`);
                                }
                            }

                            return wvCard;
                        }

                        // ─── Intent pin (normal API card) ────────
                        const card: CanvasItem = {
                            _id: `pin-${p.id}`,
                            _query: p.query,
                            payload: {
                                action: "render_layout",
                                layout: p.last_layout,
                                integration_id: p.last_data?.integration_id,
                                _query: p.query,
                                _pinnable: { query: p.query, endpoint_id: p.endpoint_id, params: p.params },
                            } as BiamPayload,
                            layout: savedLayout ?? {
                                x: (i % 3) * 4,
                                y: Math.floor(i / 3) * 8,
                                w: 4,
                                h: 8,
                            },
                            _pinned: true,
                            _pinnedId: p.id,
                            _groupName: p.last_data?._group_name,
                        };

                        // ─── Restore tabs from related_queries ───
                        if (Array.isArray(p.related_queries) && p.related_queries.length > 0) {
                            const originalTab = {
                                id: `tab-original-pin-${p.id}`,
                                label: p.query,
                                payload: card.payload,
                            };
                            card.tabs = [originalTab];
                            // Will set to saved index once all tabs are loaded
                            card.activeTabIndex = 0;

                            // Fetch each related query in background → add as tab
                            const totalToRestore = p.related_queries.length;
                            let restored = 0;
                            const savedActiveIdx = getSavedActiveTabs()[`pin-${p.id}`] ?? 0;
                            for (const rq of p.related_queries) {
                                fetch("http://localhost:3001/api/intent", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ text: rq }),
                                })
                                    .then(r => r.json())
                                    .then(result => {
                                        // /api/intent returns multi_result wrapper — unwrap it
                                        let payload = result;
                                        if (result.action === "multi_result" && Array.isArray(result.results) && result.results.length > 0) {
                                            payload = result.results[0];
                                        }
                                        if (payload.action !== "render_layout") {
                                            debug.warn(`📌 [Tab Restore] Skipping "${rq}" — action=${payload.action}`);
                                            return;
                                        }
                                        debug.log(`📌 [Tab Restore] Adding tab "${rq}" to pin ${card._id}`);
                                        const tabPayload = {
                                            ...payload,
                                            _query: rq,
                                        } as BiamPayload;
                                        const tabId = `tab-rq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                        safeSetItems(prev => prev.map(item => {
                                            if (item._id !== card._id) return item;
                                            const tabs = item.tabs || [originalTab];
                                            const newTabs = [...tabs, { id: tabId, label: rq, payload: tabPayload }];
                                            restored++;
                                            // Apply saved active tab once all tabs are loaded
                                            if (restored >= totalToRestore && savedActiveIdx > 0 && savedActiveIdx < newTabs.length) {
                                                return {
                                                    ...item,
                                                    tabs: newTabs,
                                                    activeTabIndex: savedActiveIdx,
                                                    payload: newTabs[savedActiveIdx].payload,
                                                };
                                            }
                                            return { ...item, tabs: newTabs };
                                        }));
                                    })
                                    .catch(err => { debug.warn(`📌 [Tab Restore] Failed for "${rq}":`, err); });
                            }
                        }

                        return card;
                    });

                if (pinCards.length > 0) {
                    safeSetItems((prev) => {
                        // Prevent duplicates (e.g. from React strict mode)
                        const existingIds = new Set(prev.map((i) => i._id));
                        const newPins = pinCards.filter((c) => !existingIds.has(c._id));
                        return newPins.length > 0 ? [...newPins, ...prev] : prev;
                    });
                }
            })
            .catch(() => { /* ignore */ });
    }, []);

    // ─── Listen for pin events from Whitebox ────────────────
    useEffect(() => {
        const handlePinCard = (e: Event) => {
            const { cardId, pinnedId } = (e as CustomEvent).detail ?? {};
            if (!cardId || !pinnedId) return;

            safeSetItems((prev) => prev.map((item) => {
                if (item._id !== cardId) return item;
                const pinned = { ...item, _pinned: true, _pinnedId: pinnedId };
                // Save position immediately
                savePinLayouts({ [`pin-${pinnedId}`]: item.layout });
                return pinned;
            }));
        };

        window.addEventListener("biamos:pin-card", handlePinCard);
        return () => window.removeEventListener("biamos:pin-card", handlePinCard);
    }, []);

    // ─── Auto-save pinned state (webview URLs + tab queries) ─
    useEffect(() => {
        const savePinnedState = () => {
            const items = itemsRef.current;
            const pinnedItems = items.filter(i => i._pinned && i._pinnedId);
            if (pinnedItems.length === 0) return;
            debug.log(`📌 [Auto-save] ${pinnedItems.length} pinned item(s):`, pinnedItems.map(i => ({
                id: i._id, pinnedId: i._pinnedId, isWebview: i.payload?.integration_id === "web-view",
                hasTabs: !!i.tabs, tabCount: i.tabs?.length ?? 0, groupName: i._groupName,
            })));

            for (const item of pinnedItems) {
                const isWebview = item.payload?.integration_id === "web-view";

                if (isWebview) {
                    // Get the main URL from the active tab's first block (most accurate)
                    const activeIdx = item.activeTabIndex ?? 0;
                    const activePayload = item.tabs?.[activeIdx]?.payload ?? item.payload;
                    const mainUrl = (activePayload?.layout as any)?.blocks?.[0]?.url || "";

                    // Collect extra tab URLs (skip the active/main tab), deduplicated
                    const tabUrls: string[] = [];
                    const seen = new Set<string>();
                    if (mainUrl) seen.add(mainUrl.replace(/\/+$/, ""));  // exclude main URL
                    if (item.tabs && item.tabs.length > 1) {
                        for (let t = 0; t < item.tabs.length; t++) {
                            if (t === activeIdx) continue; // skip the main/active tab
                            const tabUrl = (item.tabs[t].payload?.layout as any)?.blocks?.[0]?.url;
                            if (tabUrl) {
                                const normalized = tabUrl.replace(/\/+$/, "");
                                if (!seen.has(normalized)) {
                                    seen.add(normalized);
                                    tabUrls.push(tabUrl);
                                }
                            }
                        }
                    }

                    let pageTitle = mainUrl;
                    try { pageTitle = new URL(mainUrl).hostname.replace("www.", ""); } catch { /* */ }
                    debug.log(`📌 [Auto-save] Webview pin #${item._pinnedId}: ${mainUrl}, tabs: [${tabUrls.join(", ")}]`);
                    fetch(`http://localhost:3001/api/pinned/${item._pinnedId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url: mainUrl,
                            query: pageTitle,
                            related_queries: tabUrls,
                        }),
                    }).catch(() => { /* */ });
                }

                // Save tab queries for API cards
                if (!isWebview && item.tabs && item.tabs.length > 1) {
                    const relatedQueries = item.tabs
                        .slice(1)
                        .map(t => t.payload?._query || t.label)
                        .filter(Boolean);
                    debug.log(`📌 [Auto-save] API pin #${item._pinnedId}: ${relatedQueries.length} tab query(ies):`, relatedQueries);
                    fetch(`http://localhost:3001/api/pinned/${item._pinnedId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ related_queries: relatedQueries }),
                    })
                        .then(r => r.json())
                        .then(r => debug.log(`📌 [Auto-save] PATCH result:`, r))
                        .catch(err => debug.warn(`📌 [Auto-save] PATCH failed:`, err));
                } else if (!isWebview) {
                    debug.log(`📌 [Auto-save] API pin #${item._pinnedId}: no tabs (tabs=${item.tabs?.length ?? 'none'})`);
                }

                // Always save position + active tab
                savePinLayouts({ [`pin-${item._pinnedId}`]: item.layout });
                if (item.tabs && item.activeTabIndex != null) {
                    saveActiveTab(`pin-${item._pinnedId}`, item.activeTabIndex);
                }
            }
        };

        // Save on close
        window.addEventListener("beforeunload", savePinnedState);
        // Save when window loses focus / minimizes (more reliable than beforeunload in Electron)
        const handleVisibility = () => { if (document.hidden) savePinnedState(); };
        document.addEventListener("visibilitychange", handleVisibility);
        // Auto-save every 10 seconds (reduced from 30s for better reliability)
        const timer = setInterval(savePinnedState, 10_000);
        return () => {
            window.removeEventListener("beforeunload", savePinnedState);
            document.removeEventListener("visibilitychange", handleVisibility);
            clearInterval(timer);
        };
    }, []);

    // ─── Update webview tab labels when page title changes ───
    useEffect(() => {
        const handleTitleUpdate = (e: Event) => {
            const { title, url } = (e as CustomEvent).detail ?? {};
            if (!title || !url) return;
            safeSetItems((prev) => prev.map((item) => {
                // Update standalone webview cards (no tabs)
                if (!item.tabs && item.payload?.integration_id === "web-view") {
                    const blockUrl = (item.payload?.layout as any)?.blocks?.[0]?.url;
                    if (blockUrl && url.startsWith(blockUrl.replace(/\/$/, ''))) {
                        return { ...item, _query: title };
                    }
                }
                // Update tab labels in tabbed cards
                if (item.tabs) {
                    let changed = false;
                    const updatedTabs = item.tabs.map(tab => {
                        const tabBlockUrl = (tab.payload?.layout as any)?.blocks?.[0]?.url;
                        if (tabBlockUrl && url.startsWith(tabBlockUrl.replace(/\/$/, '')) && tab.label !== title) {
                            changed = true;
                            return { ...tab, label: title };
                        }
                        return tab;
                    });
                    if (changed) {
                        // Also update _query if active tab was renamed
                        const activeTab = updatedTabs[item.activeTabIndex ?? 0];
                        return { ...item, tabs: updatedTabs, _query: activeTab?.label || item._query };
                    }
                }
                return item;
            }));
        };
        window.addEventListener("biamos:webview-title-updated", handleTitleUpdate);
        return () => window.removeEventListener("biamos:webview-title-updated", handleTitleUpdate);
    }, []);

    // ─── Drag guard (prevents layout thrashing during drag) ──
    const isDraggingRef = useRef(false);
    const handleDragStart = useCallback(() => { isDraggingRef.current = true; }, []);
    const handleDragStop = useCallback(() => { isDraggingRef.current = false; }, []);

    // ─── Item Management ─────────────────────────────────────────
    const handleRemove = useCallback((id: string) => {
        debug.log(`🗑️ [Canvas] handleRemove: ${id}`);
        // Track removal so handleLayoutChange doesn't re-add via stale RGL events
        removedIdsRef.current.add(id);
        // If pinned, also delete from backend
        const item = itemsRef.current.find((i) => i._id === id);
        if (item?._pinned && item._pinnedId) {
            fetch(`${PIN_API}/${item._pinnedId}`, { method: "DELETE" }).catch(() => { });
            // Clean up localStorage
            removeSavedPinLayout(id);
        }
        safeSetItems((prev) => {
            const next = prev.filter((item) => item._id !== id);
            debug.log(`🗑️ [Canvas] setItems: ${prev.length} → ${next.length} items`);
            return next;
        });
    }, []);

    const handleClearAll = useCallback(() => {
        // Keep pinned items, remove everything else
        safeSetItems((prev) => prev.filter((item) => item._pinned));
    }, []);

    const handleLayoutChange = useCallback((newLayout: readonly GridLayoutItem[]) => {
        // During active drag: don't sync layout (RGL fires onChange continuously)
        if (isDraggingRef.current) return;
        safeSetItems((prev) => {
            let hasChanges = false;
            const updated = prev.map((item) => {
                // Skip layout sync for streaming cards — prevents RGL from fighting with block updates
                if ((item as any)._streaming) return item;
                const layoutItem = newLayout.find((l) => l.i === item._id);
                if (!layoutItem) return item;
                const { x, y, w, h } = layoutItem;
                if (item.layout.x === x && item.layout.y === y && item.layout.w === w && item.layout.h === h) return item;
                hasChanges = true;
                debug.log(`🔄 [Layout] RGL changed "${item._id}": (${item.layout.x},${item.layout.y},${item.layout.w}x${item.layout.h}) → (${x},${y},${w}x${h})`);
                // Also update the layout cache so RGL doesn't fight back
                const cached = layoutCacheRef.current[item._id];
                if (cached) { cached.x = x; cached.y = y; cached.w = w; cached.h = h; }
                return { ...item, layout: { x, y, w, h } };
            });

            // Save pinned card positions to localStorage
            if (hasChanges) {
                const pinLayouts: Record<string, { x: number; y: number; w: number; h: number }> = {};
                for (const item of updated) {
                    if (item._pinned) {
                        pinLayouts[item._id] = item.layout;
                    }
                }
                if (Object.keys(pinLayouts).length > 0) {
                    savePinLayouts(pinLayouts);
                }
            }

            return hasChanges ? updated : prev;
        });
    }, []);

    // ─── Tab Management ─────────────────────────────────────
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
    }, []);

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
    }, []);

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
            };
        }));
        return true;
    }, []);

    // ─── In-app link navigation ─────────────────────────────
    const addIframeCard = useCallback((url: string, title?: string, sourceGroupName?: string, sourceUrl?: string) => {
        let hostname = url;
        try { hostname = new URL(url).hostname.replace("www.", ""); } catch { /* keep raw */ }

        const iframePayload: BiamPayload = {
            action: "render_layout",
            integration_id: "web-view",
            _query: title || hostname,
            layout: {
                blocks: [{ type: "iframe", url, title: title || hostname }],
            },
        } as BiamPayload;

        // ─── Try to add as tab to an existing card ──────────
        // 1) by group name, 2) by source URL (New Tab button), 3) standalone
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

        if (sourceCard) {
            const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            safeSetItems((prev) => prev.map((item) => {
                if (item._id !== sourceCard._id) return item;
                const existingTabs = item.tabs || [{
                    id: `tab-original-${item._id}`,
                    label: item._query || "Original",
                    payload: item.payload,
                }];
                const newTab = { id: tabId, label: title || hostname, payload: iframePayload };
                const newTabs = [...existingTabs, newTab];
                return {
                    ...item,
                    tabs: newTabs,
                    activeTabIndex: newTabs.length - 1,
                    payload: iframePayload,
                    _query: title || hostname,
                    layout: { ...item.layout, w: Math.max(item.layout.w, 6), h: Math.max(item.layout.h, 20) },
                };
            }));
            return;
        }

        // ─── No existing card → create standalone web-view card ─
        const id = `card-${Date.now()}-nav-${Math.random().toString(36).slice(2, 6)}`;
        const card: CanvasItem = {
            _id: id,
            _query: title || hostname,
            payload: iframePayload,
            layout: { ...findNextSlot(itemsRef.current, 6, 20), w: 6, h: 20 },
            _loading: false,
        };
        safeSetItems((prev) => [...prev, card]);
    }, []);

    // ─── Live Tab Title Updates (Chrome-like) ─────────────
    useEffect(() => {
        const handler = (e: Event) => {
            const { url, title, sourceUrl } = (e as CustomEvent<{ url: string; title: string; sourceUrl?: string }>).detail;
            if (!url || !title) return;

            // Derive a short label from the title (max 25 chars)
            const shortLabel = title.length > 25 ? title.substring(0, 23) + '…' : title;

            safeSetItems(prev => prev.map(item => {
                if (item.payload?.integration_id !== 'web-view') return item;

                // ── Standalone card (no tabs) ──
                if (!item.tabs) {
                    const blocks = item.payload?.layout?.blocks ?? [];
                    const blockUrl = (blocks[0] as any)?.url || '';
                    // Only update if this card matches the source URL
                    if (sourceUrl && blockUrl !== sourceUrl) return item;
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
                // Find the active tab and update it if it matches the source
                const activeIdx = item.activeTabIndex ?? 0;
                const activeTab = item.tabs[activeIdx];
                if (!activeTab) return item;

                // Scope: only update the card whose active tab URL matches sourceUrl
                if (sourceUrl) {
                    const blocks = activeTab.payload?.layout?.blocks ?? [];
                    const tabUrl = (blocks[0] as any)?.url || '';
                    if (tabUrl !== sourceUrl) return item; // not this card
                }

                const newTabs = item.tabs.map((t, i) =>
                    i === activeIdx
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
                return { ...item, tabs: newTabs, _query: shortLabel };
            }));
        };
        window.addEventListener('biamos:tab-title-update', handler);
        return () => window.removeEventListener('biamos:tab-title-update', handler);
    }, []);

    // ─── Stable grid layouts (only changes on card add/remove) ─
    // RGL's Responsive component calls compact() every time layouts
    // prop changes. We must keep the layouts REFERENCE STABLE unless
    // the set of card IDs actually changes.
    const layoutCacheRef = useRef<Record<string, { i: string; x: number; y: number; w: number; h: number; minW: number; minH: number; maxW?: number }>>(
        {}
    );
    const prevIdSetRef = useRef<string>("");

    const gridLayouts = useMemo(() => {
        // Build current ID set
        const currentIds = items.map(i => i._id).sort().join(",");

        // Only recompute if the set of card IDs has changed
        if (currentIds !== prevIdSetRef.current) {
            prevIdSetRef.current = currentIds;

            // Remove entries for cards that no longer exist
            const activeIds = new Set(items.map(i => i._id));
            for (const key of Object.keys(layoutCacheRef.current)) {
                if (!activeIds.has(key)) delete layoutCacheRef.current[key];
            }

            // Add entries for NEW cards (cards not yet in cache)
            for (const item of items) {
                if (!layoutCacheRef.current[item._id]) {
                    const isIframe = item.payload?.integration_id === "web-view" ||
                        item.payload?.layout?.blocks?.some((b: any) => b.type === "iframe");
                    const constraints = isIframe
                        ? { minW: 4, minH: 12, maxW: 12 }
                        : CARD_CONSTRAINTS;
                    layoutCacheRef.current[item._id] = {
                        i: item._id,
                        ...item.layout,
                        ...constraints,
                    };
                    debug.log(`📦 [Layout Cache] NEW card "${item._id}" → (${item.layout.x},${item.layout.y},${item.layout.w}x${item.layout.h})`);
                }
            }
        }

        return Object.values(layoutCacheRef.current);
    }, [items]);

    // Update cache when handleLayoutChange fires (drag/resize)
    const updateLayoutCache = useCallback((id: string, layout: { x: number; y: number; w: number; h: number }) => {
        const entry = layoutCacheRef.current[id];
        if (entry) {
            entry.x = layout.x;
            entry.y = layout.y;
            entry.w = layout.w;
            entry.h = layout.h;
        }
    }, []);

    // ─── Single-card layout change (DragCanvas drag/resize) ──
    const onCardLayoutChange = useCallback((id: string, layout: { x: number; y: number; w: number; h: number }) => {
        debug.log(`📐 [DragCanvas] Card "${id}" moved/resized to (${layout.x},${layout.y},${layout.w}x${layout.h})`);
        // Update layout cache
        updateLayoutCache(id, layout);
        // Update items state
        safeSetItems((prev) => prev.map((item) => {
            if (item._id !== id) return item;
            if (item.layout.x === layout.x && item.layout.y === layout.y && item.layout.w === layout.w && item.layout.h === layout.h) return item;
            return { ...item, layout };
        }));
    }, [updateLayoutCache]);

    return {
        items,
        itemsRef,
        setItems: safeSetItems,
        gridLayouts,
        handleRemove,
        handleClearAll,
        handleLayoutChange,
        handleDragStart,
        handleDragStop,
        handleTabChange,
        handleTabClose,
        addTabToGroup,
        addIframeCard,
        onCardLayoutChange,
    };
}
