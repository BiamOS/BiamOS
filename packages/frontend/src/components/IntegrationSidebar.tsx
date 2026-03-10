// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Sidebar (Premium Redesign)
// ============================================================
// Sleek icon rail with pill indicators, subtle glow effects,
// and smooth transitions. Reads from integrations API.
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Typography } from "@mui/material";
import { Home as HomeIcon } from "@mui/icons-material";
import { RenderIcon } from "./integration-builder/IconPicker";
import { COLORS, accentAlpha } from "./ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

interface IntegrationInfo {
    name: string;
    group_name?: string | null;
    is_active?: boolean | number;
    status?: string | null;
    sidebar_icon?: string | null;
    sidebar_label?: string | null;
}

interface GroupInfo {
    name: string;
    icon: string;
    label: string;
}

interface IntegrationSidebarProps {
    onFilterChange: (groups: string[]) => void;
}

// ============================================================
// Component
// ============================================================

export const IntegrationSidebar = React.memo(function IntegrationSidebar({
    onFilterChange,
}: IntegrationSidebarProps) {
    const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
    const [selected, setSelected] = useState<string[]>([]);

    // Fetch integrations from API
    const fetchIntegrations = useCallback(() => {
        fetch("/api/integrations")
            .then((r) => r.json())
            .then((data: any) => {
                const list = Array.isArray(data) ? data : data?.integrations;
                if (Array.isArray(list)) setIntegrations(list);
            })
            .catch(() => { });
    }, []);

    useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

    // Listen for integration changes (install/delete) from other components
    useEffect(() => {
        const handler = () => fetchIntegrations();
        window.addEventListener("biamos:integrations-changed", handler);
        return () => window.removeEventListener("biamos:integrations-changed", handler);
    }, [fetchIntegrations]);

    // Build deduplicated groups
    const groups = useMemo(() => {
        const seen = new Map<string, GroupInfo>();
        for (const c of integrations) {
            if (c.is_active === false || c.is_active === 0) continue;
            if (c.status === "auth_needed" || c.status === "inactive") continue;
            const groupName = c.group_name ?? c.name ?? "Unknown";
            if (!seen.has(groupName)) {
                seen.set(groupName, {
                    name: groupName,
                    icon: c.sidebar_icon || "⚡",
                    label: c.sidebar_label || groupName.slice(0, 10),
                });
            }
        }
        return Array.from(seen.values());
    }, [integrations]);

    // Sync filter changes outside of setState
    useEffect(() => {
        if (selected.length === 0 || selected.length === groups.length) {
            onFilterChange([]);
        } else {
            onFilterChange(selected);
        }
    }, [selected, groups.length, onFilterChange]);

    const handleClick = useCallback(
        (group: string | null) => {
            if (group === null) {
                setSelected([]);
                return;
            }
            setSelected((prev) => {
                const isIn = prev.includes(group);
                const next = isIn ? prev.filter((g) => g !== group) : [...prev, group];
                return next.length === groups.length ? [] : next;
            });
        },
        [groups.length]
    );

    const isAllMode = selected.length === 0;

    if (groups.length === 0) return null;

    return (
        <Box
            sx={{
                width: 80,
                minWidth: 80,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                py: 1.5,
                gap: 0.5,
                overflowY: "auto",
                overflowX: "hidden",
                "&::-webkit-scrollbar": { width: 0 },
                borderRight: `1px solid rgba(255, 255, 255, 0.04)`,
                background: "linear-gradient(180deg, rgba(10, 10, 22, 0.5) 0%, rgba(6, 6, 16, 0.7) 100%)",
                zIndex: 5,
                flexShrink: 0,
            }}
        >
            {/* ─── Home / All ─── */}
            <SidebarItem
                icon="Home"
                label="All"
                isActive={isAllMode}
                dimmed={false}
                onClick={() => handleClick(null)}
                isHome
            />

            {/* Divider */}
            <Box
                sx={{
                    width: 36,
                    height: "1px",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
                    my: 0.3,
                }}
            />

            {/* ─── Integration Groups ─── */}
            {groups.map((g) => (
                <SidebarItem
                    key={g.name}
                    icon={g.icon}
                    label={g.label}
                    isActive={selected.includes(g.name)}
                    dimmed={!isAllMode && !selected.includes(g.name)}
                    onClick={() => handleClick(g.name)}
                />
            ))}
        </Box>
    );
});

// ─── Sidebar Item ───────────────────────────────────────────

interface SidebarItemProps {
    icon: string;
    label: string;
    isActive: boolean;
    dimmed: boolean;
    onClick: () => void;
    isHome?: boolean;
}

function SidebarItem({ icon, label, isActive, dimmed, onClick, isHome }: SidebarItemProps) {
    return (
        <Box
            onClick={onClick}
            sx={{
                width: 68,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.4,
                py: 0.8,
                px: 0.5,
                borderRadius: "14px",
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
                opacity: dimmed ? 0.3 : 1,

                bgcolor: isActive
                    ? accentAlpha(0.12)
                    : "transparent",
                border: "1px solid",
                borderColor: isActive
                    ? accentAlpha(0.25)
                    : "transparent",

                // Active glow
                boxShadow: isActive
                    ? `0 0 12px ${accentAlpha(0.15)}`
                    : "none",

                "&:hover": {
                    opacity: 1,
                    bgcolor: isActive
                        ? accentAlpha(0.18)
                        : "rgba(255, 255, 255, 0.04)",
                    borderColor: isActive
                        ? accentAlpha(0.35)
                        : "rgba(255, 255, 255, 0.06)",
                    transform: "scale(1.03)",
                },

                // Active indicator pill (left edge)
                "&::before": isActive
                    ? {
                        content: '""',
                        position: "absolute",
                        left: -6,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 3,
                        height: 20,
                        borderRadius: "0 3px 3px 0",
                        background: "linear-gradient(180deg, #581cff 0%, #a78bfa 100%)",
                        boxShadow: `0 0 6px ${accentAlpha(0.4)}`,
                    }
                    : {},
            }}
        >
            {/* Icon */}
            <Box sx={{
                width: 42,
                height: 42,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}>
                {isHome ? (
                    <HomeIcon
                        sx={{
                            fontSize: 22,
                            color: isActive ? accentAlpha(0.9) : "rgba(255, 255, 255, 0.45)",
                            transition: "color 0.2s ease",
                        }}
                    />
                ) : (
                    <RenderIcon
                        name={icon}
                        label={label}
                        sx={{
                            fontSize: 22,
                            color: isActive ? accentAlpha(0.9) : "rgba(255, 255, 255, 0.45)",
                            transition: "color 0.2s ease",
                        }}
                    />
                )}
            </Box>

            {/* Label */}
            <Typography
                sx={{
                    fontSize: "0.6rem",
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.4)",
                    textAlign: "center",
                    lineHeight: 1.15,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s ease",
                    letterSpacing: "0.01em",
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}
