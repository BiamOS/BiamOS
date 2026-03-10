// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — MediaCardBlock (with Lightbox)
// ============================================================

import React from "react";
import ReactDOM from "react-dom";
import { Box, Typography, Chip } from "@mui/material";
import { COLORS , accentAlpha } from "../../ui/SharedUI";
import type { MediaCardBlockSpec } from "../types";

export const MediaCardBlock = React.memo(function MediaCardBlock({
    src,
    title,
    description,
    badge,
}: MediaCardBlockSpec) {
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    return (
        <Box
            sx={{
                borderRadius: 3,
                overflow: "hidden",
                bgcolor: COLORS.surfaceSubtle,
                border: `1px solid ${COLORS.borderFaint}`,
                transition: "all 0.3s ease",
                "&:hover": {
                    borderColor: accentAlpha(0.25),
                    transform: "translateY(-2px)",
                    boxShadow: `0 8px 24px ${accentAlpha(0.15)}`,
                },
            }}
        >
            <Box sx={{ position: "relative" }}>
                <Box
                    component="img"
                    src={src}
                    alt={title}
                    loading="lazy"
                    onClick={() => setLightboxOpen(true)}
                    sx={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                        display: "block",
                        cursor: "pointer",
                        transition: "filter 0.3s ease",
                        "&:hover": { filter: "brightness(1.1)" },
                    }}
                />
                {badge && (
                    <Chip
                        label={badge}
                        size="small"
                        sx={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            bgcolor: accentAlpha(0.85),
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "0.65rem",
                            backdropFilter: "blur(4px)",
                        }}
                    />
                )}
            </Box>
            <Box sx={{ p: 1.5 }}>
                <Typography
                    variant="body1"
                    sx={{ fontWeight: 700, color: COLORS.textPrimary }}
                >
                    {title}
                </Typography>
                {description && (
                    <Typography
                        variant="body2"
                        sx={{ color: COLORS.textMuted, mt: 0.3, fontSize: "0.82rem" }}
                    >
                        {description}
                    </Typography>
                )}
            </Box>
            {/* Lightbox overlay — portaled to body */}
            {lightboxOpen && ReactDOM.createPortal(
                <Box
                    onClick={() => setLightboxOpen(false)}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        bgcolor: "rgba(0, 0, 0, 0.9)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        cursor: "zoom-out",
                        animation: "fadeIn 0.2s ease-out",
                    }}
                >
                    <Box
                        component="img"
                        src={src}
                        alt={title ?? ""}
                        sx={{
                            maxWidth: "92vw",
                            maxHeight: "92vh",
                            objectFit: "contain",
                            borderRadius: 2,
                            boxShadow: `0 0 60px ${accentAlpha(0.3)}`,
                        }}
                    />
                </Box>,
                document.body
            )}
        </Box>
    );
});
