// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — LinkCard (Blocked Site Fallback)
// ============================================================

import React from "react";
import { Box, Typography } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { COLORS, accentAlpha } from "../../ui/SharedUI";

export const LinkCard = React.memo(function LinkCard({
    url,
    title,
    hostname,
    faviconUrl,
}: {
    url: string;
    title?: string;
    hostname: string;
    faviconUrl: string;
}) {
    return (
        <Box
            sx={{
                borderRadius: 3,
                overflow: "hidden",
                bgcolor: "rgba(10, 10, 20, 0.8)",
                border: `1px solid rgba(255, 255, 255, 0.08)`,
                p: 3,
                textAlign: "center",
            }}
        >
            <Box
                component="img"
                src={faviconUrl}
                alt=""
                sx={{ width: 48, height: 48, mb: 2, borderRadius: 1, opacity: 0.8 }}
            />
            <Typography variant="h6" sx={{ color: COLORS.textPrimary, fontWeight: 700, mb: 0.5 }}>
                {title || hostname}
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 1 }}>
                This site doesn't allow iframe embedding — click below to open it.
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(0, 200, 255, 0.5)", mb: 2, display: "block" }}>
                💡 Works fully embedded in BiamOS Desktop (Electron)
            </Typography>
            <Box
                component="a"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: accentAlpha(0.15),
                    border: `1px solid ${accentAlpha(0.3)}`,
                    color: "rgba(167, 139, 250, 0.9)",
                    textDecoration: "none",
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    transition: "all 0.2s ease",
                    "&:hover": {
                        bgcolor: accentAlpha(0.25),
                        borderColor: accentAlpha(0.5),
                    },
                }}
            >
                <LinkIcon sx={{ fontSize: 18 }} />
                Open {hostname}
            </Box>
        </Box>
    );
});
