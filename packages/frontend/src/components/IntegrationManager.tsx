// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — IntegrationManager (Main Container)
// ============================================================
// Table view of all integrations with expandable rows for
// editing API endpoint, auth, and triggers.
// Grouped view: integrations with the same group_name are
// collapsed into a single header row.
//
// Sub-components extracted to:
//   - IntegrationRow.tsx (CapsuleRow — expandable table row)
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Box,
    Card,
    CardContent,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    CircularProgress,
    Alert,
    Snackbar,
    Button,
    Collapse,
    Divider,
    Chip,
} from "@mui/material";
import {
    Refresh as RefreshIcon,
    Add as AddIcon,
    KeyboardArrowDown as ExpandIcon,
    KeyboardArrowUp as CollapseIcon,
    FolderOpen as GroupIcon,
} from "@mui/icons-material";
import { IntegrationBuilder } from "./IntegrationBuilder";
import { CapsuleRow } from "./IntegrationRow";

// ============================================================
// Types (exported for sub-components)
// ============================================================

export interface IntegrationListItem {
    id: number;
    name: string;
    intent_description: string;
    api_endpoint: string;
    is_auto_generated: boolean;
    has_embedding: boolean;
    api_config: { requiresAuth: boolean; authType?: string } | null;
    group_name?: string;
    is_active: boolean;
}

export interface IntegrationListResponse {
    biam_protocol: string;
    action: string;
    integrations: IntegrationListItem[];
}

export interface SystemStats {
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_tokens: number;
    api_calls: number;
    masked_api_key: string;
}

export interface CapsuleUpdatePayload {
    api_endpoint?: string;
    intent_description?: string;
    api_config?: { requiresAuth: boolean; authType?: string } | null;
    is_active?: boolean;
}

import { UsageDashboard } from "./UsageDashboard";
import { accentAlpha, LoadingSpinner, EmptyState, COLORS, errorAlertSx } from "./ui/SharedUI";

// ============================================================
// Shared Styles
// ============================================================

const headerCellSx = {
    color: COLORS.textMuted,
    borderColor: COLORS.border,
    fontWeight: 600,
    fontSize: "0.7rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
};

// ============================================================
// Grouping Helper
// ============================================================

interface IntegrationGroup {
    groupName: string;
    integrations: IntegrationListItem[];
}

function groupIntegrations(integrations: IntegrationListItem[]): { groups: IntegrationGroup[]; ungrouped: IntegrationListItem[] } {
    const groupMap = new Map<string, IntegrationListItem[]>();
    const ungrouped: IntegrationListItem[] = [];

    for (const item of integrations) {
        if (item.group_name) {
            const existing = groupMap.get(item.group_name);
            if (existing) existing.push(item);
            else groupMap.set(item.group_name, [item]);
        } else {
            ungrouped.push(item);
        }
    }

    // Groups with only 1 item → treat as ungrouped
    const groups: IntegrationGroup[] = [];
    for (const [groupName, items] of groupMap) {
        if (items.length === 1) {
            ungrouped.push(items[0]);
        } else {
            groups.push({ groupName, integrations: items });
        }
    }

    return { groups, ungrouped };
}


// ============================================================
// Main Component
// ============================================================

export function IntegrationManager() {
    const [integrations, setIntegrations] = useState<IntegrationListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [showBuilder, setShowBuilder] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const { groups, ungrouped } = useMemo(() => groupIntegrations(integrations), [integrations]);

    const toggleGroup = useCallback((groupName: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    }, []);

    const fetchIntegrations = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/integrations");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: IntegrationListResponse = await response.json();
            setIntegrations(data.integrations);
        } catch (err) {
            setError(
                err instanceof Error
                    ? `Loading error: ${err.message}`
                    : "Unknown error"
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleDelete = useCallback(async (integration: IntegrationListItem) => {
        setDeletingId(integration.id);
        try {
            const response = await fetch(`/api/integrations/${integration.id}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message ?? "Delete failed");
            }
            setIntegrations((prev) => prev.filter((c) => c.id !== integration.id));
            setSnackbar(`"${integration.name}" deleted ✓`);
            if (expandedId === integration.id) setExpandedId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeletingId(null);
        }
    }, [expandedId]);

    const handleDeleteGroup = useCallback(async (groupName: string) => {
        const groupItems = integrations.filter(i => i.group_name === groupName);
        if (groupItems.length === 0) return;

        // Delete all items in the group
        let deletedCount = 0;
        for (const item of groupItems) {
            try {
                const response = await fetch(`/api/integrations/${item.id}`, { method: "DELETE" });
                if (response.ok) {
                    deletedCount++;
                }
            } catch { /* continue */ }
        }

        setIntegrations(prev => prev.filter(i => i.group_name !== groupName));
        setSnackbar(`"${groupName}" — ${deletedCount} endpoints deleted ✓`);
        setExpandedGroups(prev => { const next = new Set(prev); next.delete(groupName); return next; });
    }, [integrations]);

    const handleToggleActive = useCallback(async (integration: IntegrationListItem) => {
        const newActive = !integration.is_active;
        // Optimistic update
        setIntegrations((prev) =>
            prev.map((c) => (c.id === integration.id ? { ...c, is_active: newActive } : c))
        );
        try {
            const response = await fetch(`/api/integrations/${integration.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: newActive }),
            });
            if (!response.ok) throw new Error("Toggle failed");
            setSnackbar(`${integration.name} ${newActive ? "activated" : "deactivated"} ✓`);
        } catch {
            // Rollback on failure
            setIntegrations((prev) =>
                prev.map((c) => (c.id === integration.id ? { ...c, is_active: integration.is_active } : c))
            );
            setError("Failed to toggle integration");
        }
    }, []);

    const handleSave = useCallback(
        async (id: number, updates: Partial<IntegrationListItem>) => {
            try {
                const response = await fetch(`/api/integrations/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updates),
                });
                if (!response.ok) throw new Error("Save failed");

                const data = await response.json();
                setIntegrations((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, ...data.integration } : c))
                );
                setSnackbar("Changes saved ✓");
            } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed");
            }
        },
        []
    );

    useEffect(() => {
        fetchIntegrations();
    }, [fetchIntegrations]);

    return (
        <>
            <Card
                sx={{
                    background:
                        "linear-gradient(135deg, rgba(30, 30, 60, 0.9) 0%, rgba(15, 15, 35, 0.95) 100%)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 4,
                    width: "100%",
                    maxWidth: 960,
                    animation: "fadeInUp 0.6s ease-out",
                }}
            >
                <CardContent sx={{ p: 4 }}>
                    {/* Usage Dashboard */}
                    <UsageDashboard />

                    {/* Header */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            mb: 3,
                        }}
                    >
                        <Box>
                            <Typography
                                variant="h5"
                                sx={{
                                    fontWeight: 700,
                                    color: "rgba(255, 255, 255, 0.95)",
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                🧠 Integration Manager
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ color: "rgba(255, 255, 255, 0.4)", mt: 0.5 }}
                            >
                                {integrations.length} integration{integrations.length !== 1 ? "s" : ""}{" "}
                                registered
                                {groups.length > 0 && (
                                    <Typography component="span" sx={{ color: COLORS.textMuted, ml: 1 }}>
                                        · {groups.length} group{groups.length !== 1 ? "s" : ""}
                                    </Typography>
                                )}
                            </Typography>
                        </Box>

                        <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                                variant={showBuilder ? "outlined" : "contained"}
                                startIcon={<AddIcon />}
                                onClick={() => setShowBuilder(!showBuilder)}
                                size="small"
                                sx={{
                                    borderRadius: 2,
                                    textTransform: "none",
                                    fontWeight: 700,
                                    fontSize: "0.8rem",
                                    px: 2,
                                    ...(showBuilder
                                        ? {
                                            borderColor: "rgba(0, 200, 255, 0.3)",
                                            color: "rgba(0, 200, 255, 0.9)",
                                            "&:hover": {
                                                borderColor: "rgba(0, 200, 255, 0.6)",
                                                bgcolor: "rgba(0, 200, 255, 0.05)",
                                            },
                                        }
                                        : {
                                            background:
                                                "linear-gradient(135deg, #581cff 0%, #00c8ff 100%)",
                                            "&:hover": {
                                                background:
                                                    "linear-gradient(135deg, #6b33ff 0%, #33d4ff 100%)",
                                            },
                                        }),
                                }}
                            >
                                {showBuilder ? "Close" : "New Integration"}
                            </Button>

                            <Tooltip title="Refresh">
                                <IconButton
                                    onClick={fetchIntegrations}
                                    disabled={isLoading}
                                    sx={{
                                        color: "rgba(0, 200, 255, 0.8)",
                                        "&:hover": { bgcolor: "rgba(0, 200, 255, 0.1)" },
                                    }}
                                >
                                    <RefreshIcon />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* Error */}
                    {error && (
                        <Alert severity="error" onClose={() => setError(null)} sx={errorAlertSx}>
                            {error}
                        </Alert>
                    )}

                    {/* Loading */}
                    {isLoading && <LoadingSpinner py={4} />}

                    {/* Table */}
                    {!isLoading && integrations.length > 0 && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ ...headerCellSx, width: 40 }} />
                                        <TableCell sx={headerCellSx}>integration</TableCell>
                                        <TableCell sx={headerCellSx}>Intent-Trigger</TableCell>
                                        <TableCell align="center" sx={headerCellSx}>
                                            Origin
                                        </TableCell>
                                        <TableCell align="center" sx={headerCellSx}>
                                            Status
                                        </TableCell>
                                        <TableCell align="center" sx={headerCellSx}>
                                            Action
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {/* ═══ Grouped Integrations ═══ */}
                                    {groups.map((group) => {
                                        const isExpanded = expandedGroups.has(group.groupName);
                                        const activeCount = group.integrations.filter(i => i.is_active).length;
                                        return (
                                            <React.Fragment key={`group-${group.groupName}`}>
                                                {/* Group Header Row */}
                                                <TableRow
                                                    onClick={() => toggleGroup(group.groupName)}
                                                    sx={{
                                                        cursor: "pointer",
                                                        bgcolor: "rgba(120, 80, 255, 0.04)",
                                                        "&:hover": { bgcolor: "rgba(120, 80, 255, 0.08)" },
                                                        "& td": { borderColor: isExpanded ? "rgba(120, 80, 255, 0.15)" : COLORS.border },
                                                    }}
                                                >
                                                    <TableCell sx={{ width: 40, pr: 0 }}>
                                                        <IconButton size="small" sx={{ color: "rgba(180, 140, 255, 0.6)" }}>
                                                            {isExpanded ? <CollapseIcon sx={{ fontSize: 18 }} /> : <ExpandIcon sx={{ fontSize: 18 }} />}
                                                        </IconButton>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                                            <GroupIcon sx={{ fontSize: 18, color: "rgba(180, 140, 255, 0.7)" }} />
                                                            <Typography sx={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: "0.9rem" }}>
                                                                {group.groupName}
                                                            </Typography>
                                                            <Chip
                                                                label={`${group.integrations.length} endpoints`}
                                                                size="small"
                                                                sx={{
                                                                    height: 20,
                                                                    fontSize: "0.65rem",
                                                                    bgcolor: accentAlpha(0.1),
                                                                    color: "rgba(180, 140, 255, 0.9)",
                                                                    border: `1px solid ${accentAlpha(0.2)}`,
                                                                }}
                                                            />
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                                            {activeCount}/{group.integrations.length} active
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip
                                                            label="Group"
                                                            size="small"
                                                            sx={{
                                                                height: 22,
                                                                fontSize: "0.65rem",
                                                                bgcolor: "rgba(120, 80, 255, 0.1)",
                                                                color: "rgba(180, 140, 255, 0.8)",
                                                                border: "1px solid rgba(120, 80, 255, 0.2)",
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell />
                                                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                        <Tooltip title={`Delete all ${group.integrations.length} endpoints in "${group.groupName}"`}>
                                                            <IconButton
                                                                onClick={() => handleDeleteGroup(group.groupName)}
                                                                size="small"
                                                                sx={{
                                                                    color: "rgba(255, 80, 80, 0.4)",
                                                                    "&:hover": {
                                                                        color: "rgba(255, 80, 80, 1)",
                                                                        bgcolor: "rgba(255, 80, 80, 0.08)",
                                                                    },
                                                                }}
                                                            >
                                                                <span style={{ fontSize: "0.65rem", fontWeight: 700 }}>🗑 ALL</span>
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>

                                                {/* Group Children (collapsed by default) */}
                                                {isExpanded && group.integrations.map((cap) => (
                                                    <CapsuleRow
                                                        key={cap.id}
                                                        integration={cap}
                                                        expanded={expandedId === cap.id}
                                                        onToggle={() =>
                                                            setExpandedId(expandedId === cap.id ? null : cap.id)
                                                        }
                                                        onDelete={handleDelete}
                                                        onSave={handleSave}
                                                        onToggleActive={handleToggleActive}
                                                        isDeleting={deletingId === cap.id}
                                                    />
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* ═══ Ungrouped Integrations ═══ */}
                                    {ungrouped.map((cap) => (
                                        <CapsuleRow
                                            key={cap.id}
                                            integration={cap}
                                            expanded={expandedId === cap.id}
                                            onToggle={() =>
                                                setExpandedId(expandedId === cap.id ? null : cap.id)
                                            }
                                            onDelete={handleDelete}
                                            onSave={handleSave}
                                            onToggleActive={handleToggleActive}
                                            isDeleting={deletingId === cap.id}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Empty */}
                    {!isLoading && integrations.length === 0 && !error && (
                        <EmptyState
                            icon="📦"
                            title="No integrations registered"
                            subtitle="Start with a new integration!"
                        />
                    )}

                    {/* Inline Builder */}
                    <Collapse in={showBuilder} timeout={400}>
                        <Divider
                            sx={{ my: 3, borderColor: "rgba(255, 255, 255, 0.06)" }}
                        />
                        <IntegrationBuilder
                            onClose={() => {
                                setShowBuilder(false);
                                fetchIntegrations();
                            }}
                        />
                    </Collapse>
                </CardContent>
            </Card>

            <Snackbar
                open={!!snackbar}
                autoHideDuration={3000}
                onClose={() => setSnackbar(null)}
                message={snackbar}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                sx={{
                    "& .MuiSnackbarContent-root": {
                        bgcolor: "rgba(15, 15, 35, 0.95)",
                        border: "1px solid rgba(0, 220, 100, 0.2)",
                        color: "rgba(0, 220, 100, 0.9)",
                        backdropFilter: "blur(20px)",
                        borderRadius: 3,
                    },
                }}
            />
        </>
    );
}
