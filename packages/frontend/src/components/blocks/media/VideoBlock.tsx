// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — VideoBlock
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import { COLORS } from "../../ui/SharedUI";
import type { VideoBlockSpec } from "../types";

// ─── Helpers ────────────────────────────────────────────────

/** Check if URL is a direct video file (not an embed page) */
function isDirectVideoUrl(src: string): boolean {
    const lower = src.toLowerCase();
    if (/\.(mp4|webm|mov|ogg|m3u8)(\?|$)/.test(lower)) return true;
    if (lower.includes("videos.pexels.com")) return true;
    if (lower.includes("player.vimeo.com/external")) return true;
    return false;
}

/** Convert watch URLs to embed URLs (YouTube only) */
function toEmbedUrl(src: string): string {
    const ytMatch = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = src.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return src;
}

// ─── Component ──────────────────────────────────────────────

export const VideoBlock = React.memo(function VideoBlock({
    src,
    title,
    aspectRatio = "16:9",
}: VideoBlockSpec) {
    const useNativeVideo = isDirectVideoUrl(src);

    const containerSx = {
        position: "relative" as const,
        width: "100%",
        paddingTop: aspectRatio === "4:3" ? "75%" : aspectRatio === "1:1" ? "100%" : "56.25%",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "rgba(0, 0, 0, 0.3)",
    };

    const innerSx = {
        position: "absolute" as const,
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
    };

    return (
        <Box>
            {title && (
                <Typography
                    variant="body2"
                    sx={{ color: COLORS.textMuted, mb: 0.5, fontWeight: 600, fontSize: "0.8rem" }}
                >
                    {title}
                </Typography>
            )}
            <Box sx={containerSx}>
                {useNativeVideo ? (
                    <Box
                        component="video"
                        src={src}
                        controls
                        preload="metadata"
                        playsInline
                        sx={{ ...innerSx, objectFit: "cover" }}
                    />
                ) : (
                    <Box
                        component="iframe"
                        src={toEmbedUrl(src)}
                        title={title ?? "Video"}
                        frameBorder={0}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        sx={innerSx}
                    />
                )}
            </Box>
        </Box>
    );
});
