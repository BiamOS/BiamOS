// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Store (Main Container)
// ============================================================
// Card-grid view with Shop/My tabs.
//   Shop tab: installable templates
//   My tab:   user's integrations (existing grid)
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    Chip,
    Alert,
    Snackbar,
} from "@mui/material";
import {
    Search as SearchIcon,
    Add as AddIcon,
    Refresh as RefreshIcon,
    Lock as AuthIcon,
    LockOpen as NoAuthIcon,
    AutoAwesome as AutoIcon,
    Person as HumanIcon,
    MonitorHeart as HealthIcon,
} from "@mui/icons-material";
import { IntegrationBuilder } from "./IntegrationBuilder";
import {
    GradientButton,
    ActionIcon,
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    accentAlpha,
    LoadingSpinner,
    EmptyState,
    errorAlertSx,
} from "./ui/SharedUI";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationGroupCard } from "./IntegrationGroupCard";
import { EditPanel } from "./IntegrationEditModal";
import { HealthCheckLoading, HealthSummaryBanner, HealthMonitorCard } from "./HealthDashboard";
import { TemplateShop } from "./TemplateShop";
import { useIntegrationStore } from "../hooks/useIntegrationStore";
import type { FilterType } from "../types/integration";

// Re-export for backwards compatibility
export type { IntegrationItem, FilterType } from "../types/integration";

// ============================================================
// Filter Chips Config
// ============================================================

const FILTERS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: null },
    { key: "auth", label: "With Auth", icon: <AuthIcon sx={{ fontSize: 14 }} /> },
    { key: "noauth", label: "No Auth", icon: <NoAuthIcon sx={{ fontSize: 14 }} /> },
    { key: "auto", label: "Auto-generated", icon: <AutoIcon sx={{ fontSize: 14 }} /> },
    { key: "manual", label: "Manual", icon: <HumanIcon sx={{ fontSize: 14 }} /> },
];

// ============================================================
// Styles
// ============================================================

const chipFilterSx = (active: boolean) => ({
    bgcolor: active ? accentAlpha(0.15) : COLORS.surface,
    color: active ? accentAlpha(0.9) : COLORS.textSecondary,
    border: `1px solid ${active ? COLORS.borderHover : COLORS.border}`,
    fontWeight: active ? 700 : 400,
    transition: "all 0.2s ease",
    cursor: "pointer",
    "&:hover": { bgcolor: accentAlpha(0.1), borderColor: COLORS.borderHover },
});

type StoreTab = "shop" | "mine";

// ============================================================
// Main Component
// ============================================================

export const IntegrationStore = React.memo(function IntegrationStore() {
    const store = useIntegrationStore();
    const [tab, setTab] = useState<StoreTab>("mine");
    const [shopCount, setShopCount] = useState<number | null>(null);

    // Fetch template count for Shop tab badge
    React.useEffect(() => {
        fetch("/api/integrations/templates")
            .then(r => r.json())
            .then(d => setShopCount(d.templates?.length ?? 0))
            .catch(() => {});
    }, []);

    // ─── Edit Panel View ───
    if (store.editingIntegration) {
        return (
            <EditPanel
                integration={store.editingIntegration}
                allIntegrations={store.integrations}
                onSave={store.handleSave}
                onClose={() => store.setEditingIntegration(null)}
            />
        );
    }

    // ─── Builder View ───
    if (store.showBuilder) {
        return (
            <IntegrationBuilder
                onClose={() => store.setShowBuilder(false)}
                onCreated={() => { store.setShowBuilder(false); store.fetchIntegrations(); }}
            />
        );
    }

    // ─── Configure handler (navigate from Shop → Edit) ───
    const handleConfigure = (groupName: string) => {
        const match = store.integrations.find((i) => i.group_name === groupName);
        if (match) {
            store.setEditingIntegration(match);
        }
        setTab("mine");
    };

    // ─── Store View ───
    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box>
                    <Typography variant="h5" sx={gradientTitleSx(GRADIENTS.titleCyan)}>
                        🧩 Integrations
                    </Typography>
                    <Typography variant="caption" sx={{ color: COLORS.textSecondary, lineHeight: 1.5, display: "block", maxWidth: 600 }}>
                        Integrations connect BiamOS to external APIs and services. The AI routes your queries to the right
                        integration and renders results as visual cards. Install from the shop or create your own.
                    </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                    {tab === "mine" && (
                        <>
                            <ActionIcon
                                tooltip={store.isCheckingHealth ? "Checking..." : "Check Health"}
                                hoverColor="#00dc64"
                                onClick={store.handleCheckAllHealth}
                                disabled={store.isCheckingHealth}
                            >
                                <HealthIcon sx={store.isCheckingHealth ? { animation: "pulse 1s infinite" } : undefined} />
                            </ActionIcon>
                            <ActionIcon tooltip="Refresh" onClick={store.fetchIntegrations} disabled={store.isLoading}>
                                <RefreshIcon />
                            </ActionIcon>
                        </>
                    )}
                    <GradientButton startIcon={<AddIcon />} onClick={() => store.setShowBuilder(true)}>
                        Create
                    </GradientButton>
                </Box>
            </Box>

            {/* ═══ Tab Toggle ═══ */}
            <Box sx={{ display: "flex", gap: 1, mb: 2.5 }}>
                <Chip
                    label={`🔧 My (${store.displayItems.length})`}
                    onClick={() => setTab("mine")}
                    sx={{
                        ...chipFilterSx(tab === "mine"),
                        height: 36,
                        fontSize: "0.85rem",
                        fontWeight: tab === "mine" ? 700 : 500,
                        px: 1,
                    }}
                />
                <Chip
                    label={`🏪 Shop${shopCount !== null ? ` (${shopCount})` : ""}`}
                    onClick={() => setTab("shop")}
                    sx={{
                        ...chipFilterSx(tab === "shop"),
                        height: 36,
                        fontSize: "0.85rem",
                        fontWeight: tab === "shop" ? 700 : 500,
                        px: 1,
                    }}
                />
            </Box>

            {/* ═══ Shop Tab ═══ */}
            {tab === "shop" && (
                <TemplateShop
                    onInstalled={() => { store.fetchIntegrations(); }}
                    onConfigure={handleConfigure}
                />
            )}

            {/* ═══ My Integrations Tab ═══ */}
            {tab === "mine" && (
                <>
                    {store.error && (
                        <Alert
                            severity="error"
                            onClose={() => store.setError(null)}
                            sx={errorAlertSx}
                        >
                            {store.error}
                        </Alert>
                    )}

                    {/* Search + Filters */}
                    <Box sx={{ mb: 2.5 }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                p: 1,
                                borderRadius: 2,
                                bgcolor: COLORS.surfaceDark,
                                border: `1px solid ${COLORS.border}`,
                                mb: 1.5,
                                "&:focus-within": { borderColor: accentAlpha(0.6) },
                            }}
                        >
                            <SearchIcon sx={{ color: COLORS.textMuted, fontSize: 20 }} />
                            <Box
                                component="input"
                                placeholder="Search integrations..."
                                value={store.search}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => store.setSearch(e.target.value)}
                                sx={{
                                    flex: 1,
                                    border: "none",
                                    outline: "none",
                                    bgcolor: "transparent",
                                    color: COLORS.textPrimary,
                                    fontSize: "0.85rem",
                                    "::placeholder": { color: COLORS.textMuted },
                                }}
                            />
                        </Box>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            {FILTERS.map((f) => (
                                <Chip
                                    key={f.key}
                                    label={f.label}
                                    icon={f.icon as React.ReactElement | undefined}
                                    size="small"
                                    onClick={() => store.setFilter(f.key)}
                                    sx={chipFilterSx(store.filter === f.key)}
                                />
                            ))}
                        </Box>
                    </Box>

                    {/* ═══ Health Dashboard ═══ */}
                    {store.isCheckingHealth && <HealthCheckLoading />}

                    {store.lastCheckedAt && !store.isCheckingHealth && Object.keys(store.healthMap).length > 0 && (
                        <HealthSummaryBanner healthMap={store.healthMap} lastCheckedAt={store.lastCheckedAt} />
                    )}

                    <HealthMonitorCard
                        healthHistory={store.healthHistory}
                        showMonitor={store.showMonitor}
                        onToggleMonitor={() => store.setShowMonitor(!store.showMonitor)}
                    />

                    {/* Card Grid */}
                    {store.isLoading ? (
                        <LoadingSpinner py={6} />
                    ) : store.displayItems.length === 0 ? (
                        <EmptyState
                            icon="🧩"
                            title={store.search || store.filter !== "all" ? "No integrations match your filters" : "No integrations yet"}
                            subtitle={store.search || store.filter !== "all"
                                ? "Try adjusting your search or filters"
                                : "Install your first integration from the Template Shop to get started."}
                            actionLabel={!store.search && store.filter === "all" ? "🏪 Go to Shop" : undefined}
                            onAction={!store.search && store.filter === "all" ? () => setTab("shop") : undefined}
                        />
                    ) : (
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                                gap: 2,
                            }}
                        >
                            {store.displayItems.map((item) => {
                                if (item.kind === "group") {
                                    return (
                                        <IntegrationGroupCard
                                            key={`grp-${item.groupName}`}
                                            groupName={item.groupName}
                                            integrations={item.integrations}
                                            healthMap={store.healthMap}
                                            onEdit={store.setEditingIntegration}
                                            onDelete={store.handleDelete}
                                            onCheckHealth={store.handleCheckSingleHealth}
                                        />
                                    );
                                } else {
                                    return (
                                        <IntegrationCard
                                            key={item.integration.id}
                                            integration={item.integration}
                                            onEdit={store.setEditingIntegration}
                                            onDelete={store.handleDelete}
                                            onToggleActive={store.handleToggleActive}
                                            isDeleting={store.deletingId === item.integration.id}
                                            healthStatus={store.healthMap[item.integration.id] ?? null}
                                            onCheckHealth={store.handleCheckSingleHealth}
                                        />
                                    );
                                }
                            })}
                        </Box>
                    )}
                </>
            )}

            {/* Snackbar */}
            <Snackbar
                open={!!store.snackbar}
                autoHideDuration={3000}
                onClose={() => store.setSnackbar(null)}
                message={store.snackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
});
