// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — ImageGridBlock (with Lightbox)
// ============================================================

import React from "react";
import ReactDOM from "react-dom";
import { Box, Typography } from "@mui/material";
import { COLORS, SectionLabel, accentAlpha } from "../../ui/SharedUI";
import type { ImageGridBlockSpec } from "../types";

export const ImageGridBlock = React.memo(function ImageGridBlock({
    images = [],
    columns = 3,
    label,
}: ImageGridBlockSpec) {
    const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    gap: 1,
                }}
            >
                {images.map((img, i) => (
                    <Box key={i} sx={{ textAlign: "center", position: "relative", zIndex: 1 }}>
                        <Box
                            component="img"
                            src={img.src}
                            alt={img.alt ?? ""}
                            loading="lazy"
                            onClick={() => setLightboxSrc(img.src)}
                            sx={{
                                width: "100%",
                                height: 150,
                                objectFit: "contain",
                                imageRendering: "auto",
                                borderRadius: 2,
                                border: `1px solid ${COLORS.borderFaint}`,
                                bgcolor: "rgba(0, 0, 0, 0.2)",
                                cursor: "zoom-in",
                                transition: "transform 0.3s ease, box-shadow 0.3s ease",
                                "&:hover": {
                                    transform: "scale(1.05)",
                                    boxShadow: `0 4px 20px ${accentAlpha(0.3)}`,
                                },
                            }}
                        />
                        {img.caption && (
                            <Typography
                                variant="caption"
                                sx={{ color: COLORS.textMuted, mt: 0.5, display: "block", fontSize: "0.65rem" }}
                            >
                                {img.caption}
                            </Typography>
                        )}
                    </Box>
                ))}
            </Box>
            {/* Lightbox overlay — portaled to body to escape overflow:hidden */}
            {lightboxSrc && ReactDOM.createPortal(
                <Box
                    onClick={() => setLightboxSrc(null)}
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
                        src={lightboxSrc}
                        alt=""
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
