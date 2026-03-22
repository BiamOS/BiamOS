// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Canvas Pins Hook (Storage Worker)
// ============================================================
// Handles pinned item persistence:
// - Load pinned items from backend on startup
// - Auto-save (beforeunload, visibilitychange, interval)
// - Listen for pin/unpin events from Whitebox
// - Listen for GenUI blocks events
// ============================================================

import { useRef, useEffect } from "react";
import type { CanvasItem, BiamPayload } from "../../types/canvas";
import { smartCardSize } from "../../types/canvas";
import { debug } from "../../utils/debug";
import {
    getSavedPinLayouts,
    savePinLayouts,
    getSavedActiveTabs,
    saveActiveTab,
} from "../pin-storage";
import type { SafeSetItems } from "./useCanvasState";

const PIN_API = "http://localhost:3001/api/pinned";

// ─── Hook ───────────────────────────────────────────────────

export function useCanvasPins(
    items: CanvasItem[],
    itemsRef: React.MutableRefObject<CanvasItem[]>,
    safeSetItems: SafeSetItems,
): void {

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
                        const pinPayload = {
                            action: "render_layout",
                            layout: p.last_layout,
                            integration_id: p.last_data?.integration_id,
                            _query: p.query,
                            _pinnable: { query: p.query, endpoint_id: p.endpoint_id, params: p.params },
                        } as BiamPayload;
                        const pinSize = smartCardSize(pinPayload);
                        const card: CanvasItem = {
                            _id: `pin-${p.id}`,
                            _query: p.query,
                            payload: pinPayload,
                            layout: savedLayout ?? {
                                x: (i % 3) * 4,
                                y: Math.floor(i / 3) * 8,
                                ...pinSize,
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
                            card.activeTabIndex = 0;

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
                savePinLayouts({ [`pin-${pinnedId}`]: item.layout });
                return pinned;
            }));
        };

        window.addEventListener("biamos:pin-card", handlePinCard);
        return () => window.removeEventListener("biamos:pin-card", handlePinCard);
    }, [safeSetItems]);

    // ─── GenUI blocks → Tab in existing card ────────────────
    useEffect(() => {
        const handleGenUIBlocks = (e: Event) => {
            const { blocks, prompt, skeleton } = (e as CustomEvent).detail ?? {};
            if (!Array.isArray(blocks) || blocks.length === 0) return;

            const webviewIdx = itemsRef.current.findIndex((item) => {
                if (item._loading) return false;
                const bl = item.payload?.layout?.blocks;
                return Array.isArray(bl) && bl.some((b: any) => b.type === "iframe");
            });

            if (webviewIdx >= 0) {
                safeSetItems((prev) => prev.map((item, idx) => {
                    if (idx !== webviewIdx) return item;
                    const updatedBlocks = (item.payload?.layout?.blocks ?? []).map((b: any) =>
                        b.type === "iframe" ? { ...b, _genuiBlocks: blocks } : b
                    );
                    const tabTitle = skeleton
                        ? `🔍 ${prompt || "Researching..."}`
                        : `📊 ${prompt || "Dashboard"}`;
                    return {
                        ...item,
                        _query: tabTitle,
                        payload: {
                            ...item.payload,
                            layout: { ...item.payload.layout, blocks: updatedBlocks },
                        },
                    };
                }));
                debug.log(`🎨 [GenUI] ${skeleton ? 'Skeleton' : 'Final'} dashboard (${blocks.length} blocks)`);
            } else {
                debug.log(`🎨 [GenUI] No webview card found — ignoring`);
            }
        };

        window.addEventListener("biamos:genui-blocks", handleGenUIBlocks);
        return () => window.removeEventListener("biamos:genui-blocks", handleGenUIBlocks);
    }, [itemsRef, safeSetItems]);

    // ─── Auto-save pinned state (webview URLs + tab queries) ─
    useEffect(() => {
        const savePinnedState = () => {
            const currentItems = itemsRef.current;
            const pinnedItems = currentItems.filter(i => i._pinned && i._pinnedId);
            if (pinnedItems.length === 0) return;
            debug.log(`📌 [Auto-save] ${pinnedItems.length} pinned item(s)`);

            for (const item of pinnedItems) {
                const isWebview = item.payload?.integration_id === "web-view";

                if (isWebview) {
                    const activeIdx = item.activeTabIndex ?? 0;
                    const activePayload = item.tabs?.[activeIdx]?.payload ?? item.payload;
                    const mainUrl = (activePayload?.layout as any)?.blocks?.[0]?.url || "";

                    const tabUrls: string[] = [];
                    const seen = new Set<string>();
                    if (mainUrl) seen.add(mainUrl.replace(/\/+$/, ""));
                    if (item.tabs && item.tabs.length > 1) {
                        for (let t = 0; t < item.tabs.length; t++) {
                            if (t === activeIdx) continue;
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
                    fetch(`http://localhost:3001/api/pinned/${item._pinnedId}`, {
                        method: "PATCH",
                        keepalive: true,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            url: mainUrl,
                            query: pageTitle,
                            related_queries: tabUrls,
                        }),
                    }).catch(() => { /* */ });
                }

                if (!isWebview && item.tabs && item.tabs.length > 1) {
                    const relatedQueries = item.tabs
                        .slice(1)
                        .map(t => t.payload?._query || t.label)
                        .filter(Boolean);
                    fetch(`http://localhost:3001/api/pinned/${item._pinnedId}`, {
                        method: "PATCH",
                        keepalive: true,
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ related_queries: relatedQueries }),
                    }).catch(() => { /* */ });
                }

                // Always save position + active tab
                savePinLayouts({ [`pin-${item._pinnedId}`]: item.layout });
                if (item.tabs && item.activeTabIndex != null) {
                    saveActiveTab(`pin-${item._pinnedId}`, item.activeTabIndex);
                }
            }
        };

        window.addEventListener("beforeunload", savePinnedState);
        const handleVisibility = () => { if (document.hidden) savePinnedState(); };
        document.addEventListener("visibilitychange", handleVisibility);
        const timer = setInterval(savePinnedState, 10_000);
        return () => {
            window.removeEventListener("beforeunload", savePinnedState);
            document.removeEventListener("visibilitychange", handleVisibility);
            clearInterval(timer);
        };
    }, [itemsRef, safeSetItems]);
}
