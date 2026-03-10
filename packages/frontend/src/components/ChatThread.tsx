// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Chat Thread (Collapsible Conversation)
// ============================================================
// Glassmorphic chat thread above the search bar.
// Shows conversation between user and BiamOS (Concierge agent).
// Auto-scrolls to bottom, collapses when pipeline executes.
// ============================================================

import React, { useRef, useEffect } from "react";
import { useLanguage } from "../hooks/useLanguage";
import {
    Box,
    Typography,
    IconButton,
    Fade,
    Collapse,
} from "@mui/material";
import {
    ExpandLess as CollapseIcon,
    ExpandMore as ExpandIcon,
    SmartToy as BotIcon,
} from "@mui/icons-material";
import { ChatMessage } from "./ChatMessage";
import type { ChatMsg } from "./ChatMessage";
import { accentAlpha } from "./ui/SharedUI";

export type { ChatMsg };

// ─── Types ──────────────────────────────────────────────────

interface ChatThreadProps {
    messages: ChatMsg[];
    isOpen: boolean;
    onSuggestionClick: (suggestion: string) => void;
    onToggle: () => void;
}

// ─── Styles ─────────────────────────────────────────────────

const threadContainerSx = {
    width: "100%",
    maxWidth: 600,
    mx: "auto",
    mb: 1,
};

const threadCardSx = {
    bgcolor: "rgba(12, 12, 24, 0.95)",
    backdropFilter: "blur(24px)",
    border: `1px solid ${accentAlpha(0.2)}`,
    borderRadius: "12px",
    boxShadow:
        `0 8px 40px rgba(0, 0, 0, 0.55), 0 0 30px ${accentAlpha(0.06)}`,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
};

const headerSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    px: 1.5,
    py: 0.8,
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    "&:hover": {
        bgcolor: "rgba(255, 255, 255, 0.02)",
    },
};

const messageAreaSx = {
    display: "flex",
    flexDirection: "column",
    gap: 1,
    px: 1.5,
    py: 1.2,
    maxHeight: 280,
    overflowY: "auto",
    scrollBehavior: "smooth",
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
    "&::-webkit-scrollbar-thumb": {
        bgcolor: accentAlpha(0.2),
        borderRadius: 2,
    },
};

// ─── Component ──────────────────────────────────────────────

export const ChatThread = React.memo(function ChatThread({
    messages,
    isOpen,
    onSuggestionClick,
    onToggle,
}: ChatThreadProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const { tr } = useLanguage();

    if (messages.length === 0) return null;

    return (
        <Fade in timeout={300}>
            <Box sx={threadContainerSx}>
                <Box sx={threadCardSx}>
                    {/* ─── Header ─── */}
                    <Box sx={headerSx} onClick={onToggle}>
                        <BotIcon sx={{ fontSize: 18, color: accentAlpha(0.7) }} />
                        <Typography
                            sx={{
                                flexGrow: 1,
                                color: "rgba(255, 255, 255, 0.5)",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                            }}
                        >
                            {tr.biamAssistant}
                        </Typography>
                        <Typography sx={{ color: "rgba(255, 255, 255, 0.2)", fontSize: "0.7rem" }}>
                            {messages.length} {tr.messages}
                        </Typography>
                        <IconButton size="small" sx={{ color: "rgba(255, 255, 255, 0.3)", p: 0.3 }}>
                            {isOpen ? <CollapseIcon sx={{ fontSize: 18 }} /> : <ExpandIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                    </Box>

                    {/* ─── Messages ─── */}
                    <Collapse in={isOpen} timeout={250}>
                        <Box ref={scrollRef} sx={messageAreaSx}>
                            {messages.map((msg, i) => (
                                <ChatMessage
                                    key={msg.id}
                                    message={msg}
                                    onSuggestionClick={onSuggestionClick}
                                    isLatest={i === messages.length - 1 && msg.role === "lura"}
                                />
                            ))}
                        </Box>
                    </Collapse>
                </Box>
            </Box>
        </Fade>
    );
});
