// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Feed Block (Instagram-style Feed Cards)
// ============================================================
// Renders a scrollable list of feed items with optional images,
// author, stats (likes/comments), and a "Show More" toggle.
// ============================================================

import React, { useState } from "react";
import { Box, Typography, Avatar } from "@mui/material";
import { COLORS, GRADIENTS, accentAlpha } from "../ui/SharedUI";
import { useNavigation } from "../../contexts/NavigationContext";
import { useCardGroup } from "../../contexts/CardGroupContext";

// ─── Types ──────────────────────────────────────────────────

export interface FeedItemSpec {
    image?: string;
    title: string;
    body?: string;
    author?: string;
    avatar?: string;
    timestamp?: string;
    stats?: { likes?: number; comments?: number; shares?: number };
    url?: string;
    badge?: string;
}

export interface FeedBlockSpec {
    type: "feed";
    label?: string;
    items: FeedItemSpec[];
    columns?: 1 | 2;
    initialCount?: number;
}

// ─── Helpers ────────────────────────────────────────────────

function formatCount(n?: number): string {
    if (!n) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toString();
}

// ─── FeedItem ───────────────────────────────────────────────

const FeedItem = React.memo(function FeedItem({ item }: { item: FeedItemSpec }) {
    const [imgError, setImgError] = useState(false);
    const navigate = useNavigation();
    const groupName = useCardGroup();
    const validImage = item.image && item.image.startsWith("http") && !imgError;
    const hasStats = item.stats && (item.stats.likes || item.stats.comments || item.stats.shares);

    return (
        <Box
            sx={{
                borderRadius: 3,
                overflow: "hidden",
                bgcolor: "rgba(20, 20, 40, 0.5)",
                border: `1px solid rgba(255,255,255,0.06)`,
                transition: "all 0.25s ease",
                cursor: item.url ? "pointer" : "default",
                "&:hover": {
                    borderColor: accentAlpha(0.2),
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    bgcolor: "rgba(20, 20, 40, 0.7)",
                },
            }}
            onClick={(e) => {
                if (!item.url) return;
                if (e.ctrlKey || e.metaKey) { window.open(item.url, "_blank"); return; }
                navigate(item.url, item.title, groupName);
            }}
        >
            {/* Image — only valid http URLs, auto-hide on error */}
            {validImage && (
                <Box sx={{ position: "relative" }}>
                    <Box
                        component="img"
                        src={item.image}
                        alt={item.title}
                        onError={() => setImgError(true)}
                        sx={{
                            width: "100%",
                            maxHeight: 200,
                            objectFit: "cover",
                            display: "block",
                        }}
                    />
                    {item.badge && (
                        <Typography
                            sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                px: 1,
                                py: 0.3,
                                borderRadius: 1.5,
                                fontSize: "0.6rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                background: GRADIENTS.accent,
                                color: "#fff",
                            }}
                        >
                            {item.badge}
                        </Typography>
                    )}
                </Box>
            )}

            {/* Content */}
            <Box sx={{ p: 2 }}>
                {/* Author row */}
                {item.author && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.8 }}>
                        <Avatar
                            src={item.avatar}
                            sx={{
                                width: 22,
                                height: 22,
                                fontSize: "0.6rem",
                                bgcolor: accentAlpha(0.3),
                            }}
                        >
                            {item.author.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography
                            sx={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: COLORS.textSecondary,
                                flex: 1,
                            }}
                        >
                            {item.author}
                        </Typography>
                        {item.timestamp && (
                            <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted }}>
                                {item.timestamp}
                            </Typography>
                        )}
                    </Box>
                )}

                {/* Title */}
                <Typography
                    sx={{
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        lineHeight: 1.3,
                        mb: item.body ? 0.5 : 0,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}
                >
                    {item.title}
                </Typography>

                {/* Body */}
                {item.body && (
                    <Typography
                        sx={{
                            fontSize: "0.75rem",
                            color: COLORS.textMuted,
                            lineHeight: 1.4,
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                        }}
                    >
                        {item.body}
                    </Typography>
                )}

                {/* Stats row */}
                {hasStats && (
                    <Box
                        sx={{
                            display: "flex",
                            gap: 1.5,
                            mt: 1,
                            pt: 0.8,
                            borderTop: `1px solid rgba(255,255,255,0.05)`,
                        }}
                    >
                        {item.stats!.likes != null && (
                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                                👍 {formatCount(item.stats!.likes)}
                            </Typography>
                        )}
                        {item.stats!.comments != null && (
                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                                💬 {formatCount(item.stats!.comments)}
                            </Typography>
                        )}
                        {item.stats!.shares != null && (
                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                                🔄 {formatCount(item.stats!.shares)}
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    );
});

// ─── FeedBlock (main export) ────────────────────────────────

export const FeedBlock = React.memo(function FeedBlock({
    label,
    items,
    columns = 1,
    initialCount = 3,
}: FeedBlockSpec) {
    const [visibleCount, setVisibleCount] = useState(initialCount);
    const visibleItems = items.slice(0, visibleCount);
    const hasMore = visibleCount < items.length;

    return (
        <Box>
            {label && (
                <Typography
                    sx={{
                        color: accentAlpha(0.9),
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        mb: 1,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    {label}
                </Typography>
            )}

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: columns === 2 ? "1fr 1fr" : "1fr",
                    gap: 1.5,
                }}
            >
                {visibleItems.map((item, i) => (
                    <FeedItem key={i} item={item} />
                ))}
            </Box>

            {/* Show More / Show Less */}
            {hasMore && (
                <Box
                    onClick={() => setVisibleCount((c) => Math.min(c + initialCount, items.length))}
                    sx={{
                        mt: 1.5,
                        py: 0.8,
                        textAlign: "center",
                        borderRadius: 2,
                        border: `1px solid ${COLORS.borderFaint}`,
                        bgcolor: COLORS.surfaceFaint,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        "&:hover": {
                            borderColor: accentAlpha(0.3),
                            bgcolor: accentAlpha(0.05),
                        },
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            color: COLORS.textSecondary,
                        }}
                    >
                        ▼ Show {Math.min(initialCount, items.length - visibleCount)} More
                    </Typography>
                </Box>
            )}
        </Box>
    );
});
