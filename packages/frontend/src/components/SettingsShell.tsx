// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Settings Shell
// ============================================================
// Full-width sidebar + content panel. No outer border.
// Four navigation items: General, Integrations, Blocks, Agents.
// ============================================================

import React, { useState } from "react";
import { Box, Typography, List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import { Settings as GeneralIcon, Extension as StoreIcon, Widgets as BlocksIcon, SmartToy as AgentsIcon, Psychology as LLMIcon, HistoryEdu as ChangelogIcon } from "@mui/icons-material";
import { COLORS, accentAlpha } from "./ui/SharedUI";
import { GeneralSettings } from "./GeneralSettings";
import { IntegrationStore } from "./IntegrationStore";
import { BlockManager } from "./BlockManager";
import { AgentPanel } from "./AgentPanel";
import { LLMSettings } from "./LLMSettings";
import { ChangelogPanel } from "./ChangelogPanel";
import { ErrorBoundary } from "./ErrorBoundary";

// ============================================================
// Types
// ============================================================

type Panel = "general" | "llm" | "integrations" | "blocks" | "agents" | "changelog";

const NAV_ITEMS: { key: Panel; label: string; icon: React.ReactNode }[] = [
    { key: "general", label: "General", icon: <GeneralIcon /> },
    { key: "llm", label: "LLM", icon: <LLMIcon /> },
    { key: "agents", label: "Agents", icon: <AgentsIcon /> },
    { key: "integrations", label: "Integrations", icon: <StoreIcon /> },
    { key: "blocks", label: "Blocks", icon: <BlocksIcon /> },
    { key: "changelog", label: "Changelog", icon: <ChangelogIcon /> },
];

// ============================================================
// Styles
// ============================================================

const navItemSx = (active: boolean) => ({
    borderRadius: 2,
    mx: 1,
    mb: 0.5,
    color: active ? accentAlpha(0.9) : COLORS.textSecondary,
    bgcolor: active ? accentAlpha(0.08) : "transparent",
    "&:hover": {
        bgcolor: active ? accentAlpha(0.12) : COLORS.surface,
    },
    transition: "all 0.2s ease",
});

// ============================================================
// Component
// ============================================================

export const SettingsShell = React.memo(function SettingsShell() {
    const [activePanel, setActivePanel] = useState<Panel>("general");

    return (
        <Box
            sx={{
                display: "flex",
                height: "100%",
                overflow: "hidden",
            }}
        >
            {/* ─── Sidebar ─── */}
            <Box
                sx={{
                    width: 180,
                    minWidth: 180,
                    borderRight: `1px solid ${COLORS.border}`,
                    py: 2,
                    position: "sticky",
                    top: 0,
                    alignSelf: "flex-start",
                    height: "100%",
                    overflow: "auto",
                }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        color: COLORS.textMuted,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        px: 2,
                        mb: 1,
                        display: "block",
                        fontSize: "0.6rem",
                    }}
                >
                    Settings
                </Typography>

                <List disablePadding>
                    {NAV_ITEMS.map((item) => (
                        <ListItemButton
                            key={item.key}
                            selected={activePanel === item.key}
                            onClick={() => setActivePanel(item.key)}
                            sx={navItemSx(activePanel === item.key)}
                        >
                            <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{
                                    fontSize: "0.85rem",
                                    fontWeight: activePanel === item.key ? 700 : 400,
                                }}
                            />
                        </ListItemButton>
                    ))}
                </List>
            </Box>

            {/* ─── Content Panel ─── */}
            <Box sx={{ flex: 1, p: 3, overflow: "auto" }}>
                {activePanel === "general" && <ErrorBoundary label="General"><GeneralSettings /></ErrorBoundary>}
                {activePanel === "llm" && <ErrorBoundary label="LLM"><LLMSettings /></ErrorBoundary>}
                {activePanel === "integrations" && <ErrorBoundary label="Integrations"><IntegrationStore /></ErrorBoundary>}
                {activePanel === "blocks" && <ErrorBoundary label="Blocks"><BlockManager /></ErrorBoundary>}
                {activePanel === "agents" && <ErrorBoundary label="Agents"><AgentPanel /></ErrorBoundary>}
                {activePanel === "changelog" && <ErrorBoundary label="Changelog"><ChangelogPanel /></ErrorBoundary>}
            </Box>
        </Box>
    );
});
