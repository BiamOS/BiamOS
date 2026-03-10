// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Store Hook
// ============================================================
// Extracted from IntegrationStore.tsx — all state + CRUD logic
// for integrations, health checks, filtering, and grouping.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import type { IntegrationItem, FilterType, DisplayItem } from "../types/integration";

// ============================================================
// Hook
// ============================================================

export function useIntegrationStore() {
    const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterType>("all");
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingIntegration, setEditingIntegration] = useState<IntegrationItem | null>(null);

    // ─── Health Check State ───────────────────────────────
    const [healthMap, setHealthMap] = useState<Record<number, { status: string; responseTime: number; message?: string }>>({});
    const [isCheckingHealth, setIsCheckingHealth] = useState(false);
    const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
    const [healthHistory, setHealthHistory] = useState<Record<string, Array<{ status: string; response_time: number; checked_at: string }>>>({});
    const [showMonitor, setShowMonitor] = useState(false);

    // ─── Fetch ────────────────────────────────────────────
    const fetchIntegrations = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/integrations");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setIntegrations(data.integrations);
        } catch (err) {
            setError(err instanceof Error ? `Loading error: ${err.message}` : "Unknown error");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Health Checks ────────────────────────────────────
    const handleCheckAllHealth = useCallback(async () => {
        setIsCheckingHealth(true);
        try {
            const res = await fetch("/api/integrations/health");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const map: Record<number, { status: string; responseTime: number; message?: string }> = {};
            for (const r of data.results ?? []) {
                map[r.integrationId] = { status: r.status, responseTime: r.responseTime, message: r.message };
            }
            setHealthMap(map);
            setLastCheckedAt(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
            await fetchIntegrations();
            try {
                const hRes = await fetch("/api/integrations/health/history");
                if (hRes.ok) {
                    const hData = await hRes.json();
                    setHealthHistory(hData.history ?? {});
                    setShowMonitor(true);
                }
            } catch { /* ignore */ }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Health check failed");
        } finally {
            setIsCheckingHealth(false);
        }
    }, [fetchIntegrations]);

    const handleCheckSingleHealth = useCallback(async (integration: IntegrationItem) => {
        try {
            const res = await fetch(`/api/integrations/${integration.id}/health`, { method: "POST" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const r = data.result;
            if (r) {
                setHealthMap((prev) => ({ ...prev, [r.integrationId]: { status: r.status, responseTime: r.responseTime, message: r.message } }));
            }
            await fetchIntegrations();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Health check failed");
        }
    }, [fetchIntegrations]);

    // ─── CRUD ─────────────────────────────────────────────
    const handleDelete = useCallback(async (integration: IntegrationItem) => {
        setDeletingId(integration.id);
        try {
            const res = await fetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? "Delete failed");
            }
            setIntegrations((prev) => prev.filter((c) => c.id !== integration.id));
            setSnackbar(`"${integration.name}" deleted ✓`);
            window.dispatchEvent(new Event("biamos:integrations-changed"));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeletingId(null);
        }
    }, []);

    const handleSave = useCallback(async (id: number, updates: Partial<IntegrationItem>) => {
        try {
            const res = await fetch(`/api/integrations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error("Save failed");
            const data = await res.json();
            setIntegrations((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.integration } : c)));
            setSnackbar("Changes saved ✓");
            window.dispatchEvent(new Event("biamos:integrations-changed"));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
        }
    }, []);

    const handleToggleActive = useCallback(async (integration: IntegrationItem) => {
        const newActive = !integration.is_active;
        const newStatus = newActive ? "live" : "inactive";
        // Optimistic update for all integrations in the same group
        setIntegrations((prev) =>
            prev.map((c) => {
                if (integration.group_name && c.group_name === integration.group_name) {
                    return { ...c, is_active: newActive, status: newStatus as IntegrationItem["status"] };
                }
                return c.id === integration.id ? { ...c, is_active: newActive, status: newStatus as IntegrationItem["status"] } : c;
            })
        );
        try {
            const targets = integration.group_name
                ? integrations.filter((c) => c.group_name === integration.group_name)
                : [integration];
            for (const t of targets) {
                const res = await fetch(`/api/integrations/${t.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: newActive, status: newStatus }),
                });
                if (!res.ok) throw new Error("Toggle failed");
            }
            setSnackbar(`${integration.group_name ?? integration.name} ${newActive ? "activated" : "deactivated"} ✓`);
        } catch {
            // Rollback
            setIntegrations((prev) =>
                prev.map((c) => {
                    if (integration.group_name && c.group_name === integration.group_name) {
                        return { ...c, is_active: !newActive, status: (!newActive ? "live" : "inactive") as IntegrationItem["status"] };
                    }
                    return c.id === integration.id ? { ...c, is_active: !newActive, status: (!newActive ? "live" : "inactive") as IntegrationItem["status"] } : c;
                })
            );
            setError("Failed to toggle integration");
        }
    }, [integrations]);

    // ─── Initial Fetch ────────────────────────────────────
    useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

    // ─── Filtered integrations ────────────────────────────
    const filtered = useMemo(() => {
        let result = integrations;
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (c) => c.name.toLowerCase().includes(q) || c.intent_description.toLowerCase().includes(q)
                    || (c.group_name ?? "").toLowerCase().includes(q)
            );
        }
        switch (filter) {
            case "auth": result = result.filter((c) => c.api_config?.requiresAuth); break;
            case "noauth": result = result.filter((c) => !c.api_config?.requiresAuth); break;
            case "auto": result = result.filter((c) => c.is_auto_generated); break;
            case "manual": result = result.filter((c) => !c.is_auto_generated); break;
        }
        return result;
    }, [integrations, search, filter]);

    // ─── Group by group_name ──────────────────────────────
    const displayItems = useMemo<DisplayItem[]>(() => {
        const groups = new Map<string, IntegrationItem[]>();
        const singles: IntegrationItem[] = [];
        for (const cap of filtered) {
            if (cap.group_name) {
                const arr = groups.get(cap.group_name) ?? [];
                arr.push(cap);
                groups.set(cap.group_name, arr);
            } else {
                singles.push(cap);
            }
        }
        const items: DisplayItem[] = [];
        for (const [groupName, caps] of groups) {
            items.push({ kind: "group", groupName, integrations: caps });
        }
        for (const cap of singles) {
            items.push({ kind: "single", integration: cap });
        }
        return items;
    }, [filtered]);

    return {
        // State
        integrations,
        isLoading,
        error,
        snackbar,
        deletingId,
        search,
        filter,
        showBuilder,
        editingIntegration,
        healthMap,
        isCheckingHealth,
        lastCheckedAt,
        healthHistory,
        showMonitor,
        displayItems,

        // Setters
        setSearch,
        setFilter,
        setShowBuilder,
        setEditingIntegration,
        setSnackbar,
        setError,
        setShowMonitor,

        // Actions
        fetchIntegrations,
        handleCheckAllHealth,
        handleCheckSingleHealth,
        handleDelete,
        handleSave,
        handleToggleActive,
    };
}
