// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Row (Expandable Table Row)
// ============================================================
// Extracted from IntegrationManager.tsx for maintainability.
// Contains: CapsuleRow — expandable table row with edit panel
// for API endpoint, auth, and triggers.
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    Chip,
    TableCell,
    TableRow,
    IconButton,
    Tooltip,
    CircularProgress,
    Button,
    Collapse,
    TextField,
    Select,
    MenuItem,
    FormControl,
    Autocomplete,
    Switch,
} from "@mui/material";
import {
    AutoAwesome as AutoIcon,
    Person as HumanIcon,
    Memory as EmbeddingIcon,
    Lock as AuthIcon,
    LockOpen as NoAuthIcon,
    Delete as DeleteIcon,
    KeyboardArrowDown as ExpandIcon,
    KeyboardArrowUp as CollapseIcon,
    Save as SaveIcon,
} from "@mui/icons-material";
import type { IntegrationListItem, CapsuleUpdatePayload } from "./IntegrationManager";
import { accentAlpha } from "./ui/SharedUI";

// ============================================================
// Shared Styles
// ============================================================

const editFieldSx = {
    "& .MuiOutlinedInput-root": {
        bgcolor: "rgba(0, 0, 0, 0.2)",
        borderRadius: 2,
        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.08)" },
        "&:hover fieldset": { borderColor: accentAlpha(0.3) },
        "&.Mui-focused fieldset": { borderColor: accentAlpha(0.6) },
    },
    "& .MuiInputLabel-root": { color: "rgba(255, 255, 255, 0.4)" },
    "& .MuiInputBase-input": { color: "rgba(255, 255, 255, 0.9)", fontSize: "0.85rem" },
};

const fieldLabelSx = {
    color: "rgba(255, 255, 255, 0.4)",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    display: "block",
    mb: 1,
};

const gradientButtonSx = {
    borderRadius: 2,
    textTransform: "none" as const,
    fontWeight: 700,
    px: 3,
    "&.Mui-disabled": {
        bgcolor: "rgba(255, 255, 255, 0.05)",
        color: "rgba(255, 255, 255, 0.2)",
    },
};

// ============================================================
// CapsuleRow (Expandable Table Row)
// ============================================================

interface CapsuleRowProps {
    integration: IntegrationListItem;
    expanded: boolean;
    onToggle: () => void;
    onDelete: (integration: IntegrationListItem) => void;
    onSave: (id: number, updates: CapsuleUpdatePayload) => Promise<void>;
    onToggleActive: (integration: IntegrationListItem) => void;
    isDeleting: boolean;
}

export const CapsuleRow = React.memo(function CapsuleRow({
    integration,
    expanded,
    onToggle,
    onDelete,
    onSave,
    onToggleActive,
    isDeleting,
}: CapsuleRowProps) {
    // Local edit state
    const [editEndpoint, setEditEndpoint] = useState(integration.api_endpoint);
    const [editTriggers, setEditTriggers] = useState<string[]>(
        integration.intent_description.split(/\s+/).filter(Boolean)
    );
    const [editAuth, setEditAuth] = useState(
        integration.api_config?.requiresAuth
            ? integration.api_config.authType ?? "bearer"
            : "none"
    );
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        const updates: CapsuleUpdatePayload = {
            api_endpoint: editEndpoint,
            intent_description: editTriggers.join(" "),
            api_config:
                editAuth !== "none"
                    ? { requiresAuth: true, authType: editAuth }
                    : null,
        };
        await onSave(integration.id, updates);
        setIsSaving(false);
    };

    const hasChanges =
        editEndpoint !== integration.api_endpoint ||
        editTriggers.join(" ") !== integration.intent_description ||
        (editAuth !== "none") !== (integration.api_config?.requiresAuth ?? false) ||
        (editAuth !== "none" && editAuth !== (integration.api_config?.authType ?? ""));

    return (
        <>
            {/* Main Row */}
            <TableRow
                sx={{
                    "&:hover": { bgcolor: "rgba(255, 255, 255, 0.02)" },
                    "& td": {
                        borderColor: expanded
                            ? "transparent"
                            : "rgba(255, 255, 255, 0.04)",
                    },
                    opacity: isDeleting ? 0.4 : integration.is_active ? 1 : 0.45,
                    transition: "opacity 0.3s ease",
                    cursor: "pointer",
                }}
                onClick={onToggle}
            >
                {/* Expand Toggle */}
                <TableCell sx={{ width: 40, pr: 0 }}>
                    <IconButton
                        size="small"
                        sx={{ color: "rgba(255, 255, 255, 0.3)" }}
                    >
                        {expanded ? (
                            <CollapseIcon sx={{ fontSize: 18 }} />
                        ) : (
                            <ExpandIcon sx={{ fontSize: 18 }} />
                        )}
                    </IconButton>
                </TableCell>

                {/* Name */}
                <TableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                color: "rgba(255, 255, 255, 0.9)",
                                fontWeight: 600,
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: "0.85rem",
                            }}
                        >
                            {integration.name}
                        </Typography>
                        {integration.has_embedding && (
                            <Tooltip title="Embedding vorhanden">
                                <EmbeddingIcon
                                    sx={{ fontSize: 14, color: "rgba(0, 200, 255, 0.6)" }}
                                />
                            </Tooltip>
                        )}
                    </Box>
                </TableCell>

                {/* Intent (truncated) */}
                <TableCell>
                    <Typography
                        variant="caption"
                        sx={{
                            color: "rgba(255, 255, 255, 0.5)",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.5,
                        }}
                    >
                        {integration.intent_description}
                    </Typography>
                </TableCell>

                {/* Origin */}
                <TableCell align="center">
                    {integration.is_auto_generated ? (
                        <Chip
                            icon={<AutoIcon sx={{ fontSize: 14 }} />}
                            label="Auto"
                            size="small"
                            sx={{
                                bgcolor: accentAlpha(0.12),
                                color: "rgba(180, 140, 255, 0.9)",
                                border: `1px solid ${accentAlpha(0.25)}`,
                                fontSize: "0.7rem",
                                height: 24,
                                "& .MuiChip-icon": { color: "rgba(180, 140, 255, 0.9)" },
                            }}
                        />
                    ) : (
                        <Chip
                            icon={<HumanIcon sx={{ fontSize: 14 }} />}
                            label="Manuell"
                            size="small"
                            sx={{
                                bgcolor: "rgba(0, 200, 255, 0.08)",
                                color: "rgba(0, 200, 255, 0.9)",
                                border: "1px solid rgba(0, 200, 255, 0.2)",
                                fontSize: "0.7rem",
                                height: 24,
                                "& .MuiChip-icon": { color: "rgba(0, 200, 255, 0.9)" },
                            }}
                        />
                    )}
                </TableCell>

                {/* Status — Active Toggle */}
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={integration.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}>
                        <Switch
                            checked={integration.is_active}
                            onChange={() => onToggleActive(integration)}
                            size="small"
                            sx={{
                                "& .MuiSwitch-switchBase.Mui-checked": {
                                    color: "#00dc64",
                                },
                                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                                    backgroundColor: "rgba(0, 220, 100, 0.4)",
                                },
                                "& .MuiSwitch-track": {
                                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                                },
                            }}
                        />
                    </Tooltip>
                </TableCell>

                {/* Delete */}
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Delete">
                        <IconButton
                            onClick={() => onDelete(integration)}
                            disabled={isDeleting}
                            size="small"
                            sx={{
                                color: "rgba(255, 80, 80, 0.6)",
                                "&:hover": {
                                    color: "rgba(255, 80, 80, 1)",
                                    bgcolor: "rgba(255, 80, 80, 0.08)",
                                },
                            }}
                        >
                            {isDeleting ? (
                                <CircularProgress size={16} sx={{ color: "inherit" }} />
                            ) : (
                                <DeleteIcon sx={{ fontSize: 18 }} />
                            )}
                        </IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>

            {/* ═══ Expanded Detail Panel ═══ */}
            <TableRow>
                <TableCell
                    colSpan={6}
                    sx={{
                        py: 0,
                        borderColor: expanded
                            ? "rgba(255, 255, 255, 0.04)"
                            : "transparent",
                    }}
                >
                    <Collapse in={expanded} timeout={300}>
                        <Box
                            sx={{
                                py: 3,
                                px: 2,
                                display: "flex",
                                flexDirection: "column",
                                gap: 2.5,
                            }}
                        >
                            {/* API Endpoint */}
                            <Box>
                                <Typography variant="caption" sx={fieldLabelSx}>
                                    API Endpoint
                                </Typography>
                                <TextField
                                    value={editEndpoint}
                                    onChange={(e) => setEditEndpoint(e.target.value)}
                                    fullWidth
                                    size="small"
                                    placeholder="https://api.example.com/..."
                                    sx={editFieldSx}
                                />
                            </Box>

                            {/* Auth Method */}
                            <Box>
                                <Typography variant="caption" sx={fieldLabelSx}>
                                    Auth Method
                                </Typography>
                                <FormControl size="small" sx={{ minWidth: 200, ...editFieldSx }}>
                                    <Select
                                        value={editAuth}
                                        onChange={(e) => setEditAuth(e.target.value)}
                                        sx={{ color: "rgba(255, 255, 255, 0.9)" }}
                                    >
                                        <MenuItem value="none">
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <NoAuthIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.3)" }} />
                                                No Auth
                                            </Box>
                                        </MenuItem>
                                        <MenuItem value="apikey">
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <AuthIcon sx={{ fontSize: 16, color: "#ffb400" }} />
                                                API-Key
                                            </Box>
                                        </MenuItem>
                                        <MenuItem value="bearer">
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <AuthIcon sx={{ fontSize: 16, color: "#00c8ff" }} />
                                                Bearer Token
                                            </Box>
                                        </MenuItem>
                                        <MenuItem value="oauth2">
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <AuthIcon sx={{ fontSize: 16, color: "#b48cff" }} />
                                                OAuth2
                                            </Box>
                                        </MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Semantic Triggers */}
                            <Box>
                                <Typography variant="caption" sx={fieldLabelSx}>
                                    Keywords (Intent Matching)
                                </Typography>
                                <Autocomplete
                                    multiple
                                    freeSolo
                                    options={[]}
                                    value={editTriggers}
                                    onChange={(_, newValue) => setEditTriggers(newValue)}
                                    renderTags={(value, getTagProps) =>
                                        value.map((option, tagIndex) => {
                                            const { key, ...rest } = getTagProps({ index: tagIndex });
                                            return (
                                                <Chip
                                                    key={key}
                                                    label={option}
                                                    size="small"
                                                    {...rest}
                                                    sx={{
                                                        bgcolor: accentAlpha(0.1),
                                                        color: "rgba(180, 140, 255, 0.9)",
                                                        border: `1px solid ${accentAlpha(0.2)}`,
                                                        "& .MuiChip-deleteIcon": {
                                                            color: "rgba(180, 140, 255, 0.5)",
                                                            "&:hover": { color: "#ff6b6b" },
                                                        },
                                                    }}
                                                />
                                            );
                                        })
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Add keyword (Enter)..."
                                            size="small"
                                            sx={editFieldSx}
                                        />
                                    )}
                                />
                            </Box>

                            {/* Save Button */}
                            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                                <Button
                                    variant="contained"
                                    startIcon={
                                        isSaving ? (
                                            <CircularProgress size={16} sx={{ color: "inherit" }} />
                                        ) : (
                                            <SaveIcon />
                                        )
                                    }
                                    onClick={handleSave}
                                    disabled={!hasChanges || isSaving}
                                    size="small"
                                    sx={{
                                        ...gradientButtonSx,
                                        background: hasChanges
                                            ? "linear-gradient(135deg, #581cff 0%, #00c8ff 100%)"
                                            : undefined,
                                        "&:hover": {
                                            background:
                                                "linear-gradient(135deg, #6b33ff 0%, #33d4ff 100%)",
                                        },
                                    }}
                                >
                                    {isSaving ? "Saving..." : "Save changes"}
                                </Button>
                            </Box>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
});
