// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — HeroImageBlock (with Lightbox)
// ============================================================

import React from "react";
import ReactDOM from "react-dom";
import { Box, Typography } from "@mui/material";
import { COLORS , accentAlpha } from "../../ui/SharedUI";
import type { HeroImageBlockSpec } from "../types";

export const HeroImageBlock = React.memo(function HeroImageBlock({
    src,
    title,
    subtitle,
    height = 180,
    overlay = "bottom",
}: HeroImageBlockSpec) {
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const overlayPosition = {
        bottom: { bottom: 0, left: 0, right: 0 },
        center: { top: "50%", left: 0, right: 0, transform: "translateY(-50%)" },
        top: { top: 0, left: 0, right: 0 },
    }[overlay];

    return (
        <Box sx={{ position: "relative", borderRadius: 3, overflow: "hidden" }}>
            <Box
                component="img"
                src={src}
                alt={title ?? ""}
                loading="lazy"
                onClick={() => setLightboxOpen(true)}
                sx={{
                    width: "100%",
                    height,
                    objectFit: "cover",
                    display: "block",
                    cursor: "pointer",
                    transition: "filter 0.3s ease",
                    "&:hover": { filter: "brightness(1.1)" },
                }}
            />
            {(title || subtitle) && (
                <Box
                    onClick={() => setLightboxOpen(true)}
                    sx={{
                        position: "absolute",
                        ...overlayPosition,
                        p: 2,
                        background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
                        cursor: "pointer",
                    }}
                >
                    {title && (
                        <Typography
                            variant="h6"
                            sx={{
                                fontWeight: 800,
                                color: "#fff",
                                textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                            }}
                        >
                            {title}
                        </Typography>
                    )}
                    {subtitle && (
                        <Typography
                            variant="body2"
                            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.3 }}
                        >
                            {subtitle}
                        </Typography>
                    )}
                </Box>
            )}
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
