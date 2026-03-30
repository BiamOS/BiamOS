// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — SpotlightPanel (Upward-expanding dropdown)
// ============================================================
// Shows search history, matched integrations, and active tasks.
// Opens upward from the Omnibar on focus/typing.
// ============================================================

import React, { useMemo } from "react";
import { Box, Typography, IconButton, Fade } from "@mui/material";
import {
    History as HistoryIcon,
    Close as CloseIcon,
    TrendingUp as TrendingIcon,
    PlayCircleOutline as RunIcon,
    CheckCircleOutline as DoneIcon,
    ErrorOutline as ErrorIcon,
    AutoAwesome as AutoIcon,
} from "@mui/icons-material";
import { COLORS, accentAlpha } from "../../theme/theme";
import { useTaskStore } from "../../stores/useTaskStore";

// ─── Types ──────────────────────────────────────────────────

interface IntegrationInfo {
    name: string;
    intent_description: string;
    human_triggers?: string | null;
    group_name?: string | null;
    is_active?: boolean;
    sidebar_icon?: string | null;
    sidebar_label?: string | null;
}

interface MatchedGroup {
    name: string;
    icon: string;
    label: string;
    matchedKeyword: string;
}

interface SpotlightPanelProps {
    open: boolean;
    inputValue: string;
    history: string[];
    integrations: IntegrationInfo[];
    onSelectOption: (text: string) => void;
    onDeleteHistory: (item: string) => void;
    onClearHistory: () => void;
}

// ─── Trigger Matching Engine ────────────────────────────────

function matchTriggers(
    input: string,
    integrations: IntegrationInfo[]
): MatchedGroup[] {
    const words = input.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2);
    if (words.length === 0) return [];

    const seen = new Set<string>();
    const matched: MatchedGroup[] = [];

    for (const cap of integrations) {
        if (cap.is_active === false) continue;
        const groupName = cap.group_name || cap.name?.replace(/Widget$/i, "") || "Unknown";
        if (seen.has(groupName)) continue;

        const triggerSource = [cap.human_triggers, cap.intent_description].filter(Boolean).join("|");
        const triggers = triggerSource.split("|").map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);

        for (const word of words) {
            const hit = triggers.find((t) => t.includes(word) || word.includes(t));
            if (hit) {
                seen.add(groupName);
                matched.push({
                    name: groupName,
                    icon: cap.sidebar_icon || "⚡",
                    label: cap.sidebar_label || groupName,
                    matchedKeyword: hit,
                });
                break;
            }
        }
    }
    return matched;
}

// ─── Styles ─────────────────────────────────────────────────

const panelSx = {
    position: "absolute" as const,
    bottom: "100%",
    left: 0,
    right: 0,
    mb: 0.5,
    maxHeight: 320,
    overflowY: "auto" as const,
    bgcolor: COLORS.bgPaper,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "16px",
    boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.4), 0 -2px 8px rgba(0, 0, 0, 0.2)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.1)", borderRadius: 2 },
};

const sectionTitleSx = {
    color: COLORS.textMuted,
    fontWeight: 700,
    fontSize: "0.65rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    px: 2,
    pt: 1.2,
    pb: 0.5,
};

const historyItemSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    px: 2,
    py: 0.8,
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.04)" },
    "&:hover .delete-btn": { opacity: 1 },
};

const triggerChipSx = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0.5,
    px: 1,
    py: 0.3,
    borderRadius: "10px",
    bgcolor: "rgba(0, 220, 100, 0.08)",
    border: "1px solid rgba(0, 220, 100, 0.2)",
    cursor: "pointer",
    transition: "all 0.15s ease",
    "&:hover": {
        bgcolor: "rgba(0, 220, 100, 0.15)",
        borderColor: "rgba(0, 220, 100, 0.35)",
    },
};

// ─── Component ──────────────────────────────────────────────

export const SpotlightPanel = React.memo(function SpotlightPanel({
    open,
    inputValue,
    history,
    integrations,
    onSelectOption,
    onDeleteHistory,
    onClearHistory,
}: SpotlightPanelProps) {
    const query = inputValue.toLowerCase().trim();

    // Filter history by query
    const filteredHistory = useMemo(() => {
        const list = query
            ? history.filter((h) => h.toLowerCase().includes(query))
            : history;
        return list.slice(0, 5);
    }, [history, query]);

    // Trigger matching
    const matchedGroups = useMemo(
        () => matchTriggers(inputValue, integrations),
        [inputValue, integrations]
    );

    const taskMap = useTaskStore((s) => s.tasks);
    const tasks = useMemo(() => Object.values(taskMap), [taskMap]);
    const { clearDoneTasks } = useTaskStore();
    const hasContent = filteredHistory.length > 0 || matchedGroups.length > 0 || tasks.length > 0;

    if (!open || !hasContent) return null;

    return (
        <Fade in timeout={150}>
            <Box sx={panelSx}>
                {/* ─── Active Tasks ─── */}
                {tasks.length > 0 && (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Typography sx={sectionTitleSx}>
                                LIVE THREADS
                            </Typography>
                            <Typography
                                onClick={clearDoneTasks}
                                sx={{
                                    fontSize: "0.6rem",
                                    color: COLORS.textFaint,
                                    cursor: "pointer",
                                    pr: 2,
                                    pt: 1,
                                    "&:hover": { color: "rgba(255, 80, 80, 0.7)" },
                                }}
                            >
                                Clear Done
                            </Typography>
                        </Box>
                        {tasks.map((task) => {
                            const Icon = task.status === 'running' ? RunIcon : task.status === 'done' ? DoneIcon : ErrorIcon;
                            const color = task.status === 'running' ? COLORS.accent : task.status === 'done' ? COLORS.green : COLORS.red;
                            return (
                                <Box
                                    key={task.id}
                                    sx={{ ...historyItemSx, py: 1 }}
                                    onClick={() => {
                                        const el = document.getElementById(task.cardId);
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }}
                                >
                                    <Icon sx={{ fontSize: 18, color, animation: task.status === 'running' ? 'pulseGlow 2s infinite' : 'none' }} />
                                    <Typography
                                        sx={{
                                            flex: 1,
                                            fontSize: "0.85rem",
                                            color: task.status === 'running' ? COLORS.textPrimary : COLORS.textSecondary,
                                            fontWeight: task.status === 'running' ? 500 : 400,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        [{task.type === 'research' ? '🔬' : '🤖'}] {task.label}
                                    </Typography>
                                </Box>
                            );
                        })}
                        <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.05)', mx: 2, mt: 1 }} />
                    </>
                )}

                {/* ─── Matched Triggers ─── */}
                {matchedGroups.length > 0 && (
                    <>
                        <Typography sx={sectionTitleSx}>
                            Matched Integrations
                        </Typography>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 2, pb: 1 }}>
                            {matchedGroups.map((group) => (
                                <Box
                                    key={group.name}
                                    sx={triggerChipSx}
                                    onClick={() => onSelectOption(group.matchedKeyword)}
                                >
                                    <AutoIcon
                                        sx={{ fontSize: 14, color: "rgba(0, 220, 100, 0.7)" }}
                                    />
                                    <Typography
                                        sx={{
                                            fontSize: "0.68rem",
                                            fontWeight: 600,
                                            color: "rgba(0, 220, 100, 0.85)",
                                        }}
                                    >
                                        {group.label}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </>
                )}

                {/* ─── History ─── */}
                {filteredHistory.length > 0 && (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <Typography sx={sectionTitleSx}>
                                Recent
                            </Typography>
                            {!query && history.length > 0 && (
                                <Typography
                                    onClick={onClearHistory}
                                    sx={{
                                        fontSize: "0.6rem",
                                        color: COLORS.textFaint,
                                        cursor: "pointer",
                                        pr: 2,
                                        pt: 1,
                                        "&:hover": { color: "rgba(255, 80, 80, 0.7)" },
                                    }}
                                >
                                    Clear all
                                </Typography>
                            )}
                        </Box>
                        {filteredHistory.map((item) => (
                            <Box
                                key={item}
                                sx={historyItemSx}
                                onClick={() => onSelectOption(item)}
                            >
                                <HistoryIcon sx={{ fontSize: 16, color: COLORS.textFaint }} />
                                <Typography
                                    sx={{
                                        flex: 1,
                                        fontSize: "0.82rem",
                                        color: COLORS.textSecondary,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {item}
                                </Typography>
                                <IconButton
                                    className="delete-btn"
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteHistory(item);
                                    }}
                                    sx={{
                                        opacity: 0,
                                        p: 0.3,
                                        color: COLORS.textFaint,
                                        transition: "opacity 0.15s ease",
                                        "&:hover": { color: "rgba(255, 80, 80, 0.8)" },
                                    }}
                                >
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Box>
                        ))}
                    </>
                )}
            </Box>
        </Fade>
    );
});
