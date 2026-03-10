// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Header (Shared Sub-Component)
// ============================================================
// Name, Base URL, Icon + Label fields.
// Used by both ManualForm (create) and EditPanel (edit).
// ============================================================

import { Box, TextField, Typography } from "@mui/material";
import { COLORS, inputSx, sectionLabelSx , accentAlpha } from "../ui/SharedUI";
import { RenderIcon } from "./IconPicker";

interface IntegrationHeaderProps {
    name: string;
    baseUrl: string;
    sidebarIcon: string;
    sidebarLabel: string;
    onChangeName: (v: string) => void;
    onChangeBaseUrl: (v: string) => void;
    onChangeSidebarIcon: (v: string) => void;
    onChangeSidebarLabel: (v: string) => void;
    /** If true, name field is read-only (edit mode for groups) */
    nameReadOnly?: boolean;
    /** Hide base URL (edit mode — URL is per-endpoint) */
    hideBaseUrl?: boolean;
    /** Opens icon picker modal */
    onIconClick?: () => void;
}

export function IntegrationHeader({
    name,
    baseUrl,
    sidebarIcon,
    sidebarLabel,
    onChangeName,
    onChangeBaseUrl,
    onChangeSidebarIcon,
    onChangeSidebarLabel,
    nameReadOnly,
    hideBaseUrl,
    onIconClick,
}: IntegrationHeaderProps) {
    return (
        <>
            <Typography variant="subtitle2" sx={{ ...sectionLabelSx, fontSize: "0.7rem", mt: 1 }}>
                Integration
            </Typography>
            <Box sx={{ display: "flex", gap: 2 }}>
                <TextField
                    label="Integration Name"
                    placeholder='e.g. "GitHub", "WeatherAPI"'
                    value={name}
                    onChange={(e) => onChangeName(e.target.value)}
                    size="small"
                    fullWidth
                    sx={inputSx}
                    slotProps={{ input: { readOnly: nameReadOnly } }}
                />
                {!hideBaseUrl && (
                    <TextField
                        label="Base URL"
                        placeholder="https://api.example.com"
                        value={baseUrl}
                        onChange={(e) => onChangeBaseUrl(e.target.value)}
                        size="small"
                        fullWidth
                        sx={inputSx}
                    />
                )}
            </Box>
            <Box sx={{ display: "flex", gap: 2 }}>
                <Box
                    onClick={onIconClick}
                    sx={{
                        flex: "0 0 60px",
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 2,
                        border: `1px solid ${COLORS.border}`,
                        bgcolor: COLORS.surfaceDark,
                        cursor: "pointer",
                        fontSize: "1.3rem",
                        transition: "border-color 0.2s",
                        "&:hover": { borderColor: accentAlpha(0.4) },
                    }}
                >
                    <RenderIcon name={sidebarIcon} />
                </Box>
                <TextField
                    label="Sidebar Label"
                    placeholder='e.g. "Weather" (max 10)'
                    value={sidebarLabel}
                    onChange={(e) => onChangeSidebarLabel(e.target.value.slice(0, 10))}
                    size="small"
                    fullWidth
                    sx={inputSx}
                    slotProps={{ htmlInput: { maxLength: 10 } }}
                />
            </Box>
        </>
    );
}
