// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Endpoint Card (Shared Sub-Component)
// ============================================================
// Unified endpoint editor with method, path, triggers, and
// optional body schema for POST/PUT/PATCH methods.
// Used by both ManualForm (create) and EditPanel (edit).
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Chip,
    Autocomplete,
    IconButton,
    Checkbox,
    FormControlLabel,
} from "@mui/material";
import {
    Delete as RemoveIcon,
    Add as AddIcon,
    Close as CloseIcon,
} from "@mui/icons-material";
import {
    ActionIcon,
    GhostButton,
    COLORS,
    inputSx,
    sectionLabelSx,
} from "../ui/SharedUI";
import { methodColors, type EndpointEntry } from "./shared";

// ─── Body Schema Row ────────────────────────────────────────

interface SchemaField {
    name: string;
    type: string;
    required: boolean;
    description?: string;
}

function SchemaFieldRow({
    field,
    onChange,
    onRemove,
}: {
    field: SchemaField;
    onChange: (f: SchemaField) => void;
    onRemove: () => void;
}) {
    return (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField
                placeholder="field_name"
                value={field.name}
                onChange={(e) => onChange({ ...field, name: e.target.value })}
                size="small"
                sx={{ ...inputSx, flex: 2 }}
            />
            <FormControl size="small" sx={{ flex: 1, minWidth: 90 }}>
                <Select
                    value={field.type}
                    onChange={(e) => onChange({ ...field, type: e.target.value })}
                    sx={{
                        bgcolor: COLORS.surfaceDark,
                        color: COLORS.textPrimary,
                        fontSize: "0.8rem",
                        "& fieldset": { borderColor: COLORS.border },
                    }}
                >
                    {["string", "number", "boolean", "object", "array"].map((t) => (
                        <MenuItem key={t} value={t} sx={{ fontSize: "0.8rem" }}>
                            {t}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControlLabel
                label=""
                control={
                    <Checkbox
                        checked={field.required}
                        onChange={(e) => onChange({ ...field, required: e.target.checked })}
                        size="small"
                        sx={{
                            color: COLORS.textMuted,
                            "&.Mui-checked": { color: "#00dc64" },
                            p: 0.5,
                        }}
                    />
                }
                sx={{ mx: 0 }}
                title="Required"
            />
            <IconButton onClick={onRemove} size="small" sx={{ color: COLORS.textMuted, "&:hover": { color: COLORS.red } }}>
                <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
        </Box>
    );
}

// ─── Main Endpoint Card ─────────────────────────────────────

interface EndpointCardProps {
    entry: EndpointEntry;
    index: number;
    onChange: (i: number, e: EndpointEntry) => void;
    onRemove: (i: number) => void;
    canRemove: boolean;
}

export function EndpointCard({ entry, index, onChange, onRemove, canRemove }: EndpointCardProps) {
    const update = (patch: Partial<EndpointEntry>) => onChange(index, { ...entry, ...patch });
    const needsBody = ["POST", "PUT", "PATCH"].includes(entry.method);
    const [showSchema, setShowSchema] = useState(needsBody && (entry.body_schema?.length ?? 0) > 0);

    return (
        <Box
            sx={{
                p: 2,
                borderRadius: 3,
                bgcolor: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                transition: "border-color 0.2s",
                "&:hover": { borderColor: COLORS.borderHover },
            }}
        >
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                    Endpoint {index + 1}
                </Typography>
                {canRemove && (
                    <ActionIcon tooltip="Remove" hoverColor={COLORS.red} onClick={() => onRemove(index)}>
                        <RemoveIcon sx={{ fontSize: 16 }} />
                    </ActionIcon>
                )}
            </Box>

            {/* Name + Method */}
            <Box sx={{ display: "flex", gap: 1.5, mb: 1.5 }}>
                <TextField
                    label="Endpoint Name"
                    placeholder='e.g. "ListRepos", "GetWeather"'
                    value={entry.name}
                    onChange={(e) => update({ name: e.target.value })}
                    size="small"
                    fullWidth
                    sx={inputSx}
                />
                <FormControl size="small" sx={{ minWidth: 110 }}>
                    <InputLabel sx={{ color: COLORS.textSecondary }}>Method</InputLabel>
                    <Select
                        value={entry.method}
                        label="Method"
                        onChange={(e) => {
                            const newMethod = e.target.value;
                            update({ method: newMethod });
                            // Auto-show body schema for POST/PUT/PATCH
                            if (["POST", "PUT", "PATCH"].includes(newMethod)) {
                                setShowSchema(true);
                                if (!entry.body_schema?.length) {
                                    update({ method: newMethod, body_schema: [{ name: "", type: "string", required: true }] });
                                }
                            }
                        }}
                        sx={{
                            bgcolor: COLORS.surfaceDark,
                            color: methodColors[entry.method] ?? COLORS.textPrimary,
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            "& fieldset": { borderColor: COLORS.border },
                        }}
                    >
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                            <MenuItem key={m} value={m} sx={{ color: methodColors[m], fontWeight: 700 }}>
                                {m}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>

            {/* Path */}
            <TextField
                label="Path"
                placeholder="/v1/repos/{owner}/{repo}"
                value={entry.path}
                onChange={(e) => update({ path: e.target.value })}
                size="small"
                fullWidth
                sx={{ ...inputSx, mb: 1.5 }}
            />

            {/* Triggers */}
            <Typography variant="caption" sx={{ ...sectionLabelSx, fontSize: "0.6rem", mb: 0.5 }}>
                Search Triggers
            </Typography>
            <Autocomplete
                multiple
                freeSolo
                value={entry.triggers}
                onChange={(_e, val) => update({ triggers: val as string[] })}
                options={[]}
                renderTags={(value, getTagProps) =>
                    value.map((tag, i) => (
                        <Chip
                            {...getTagProps({ index: i })}
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{
                                bgcolor: "rgba(0, 200, 255, 0.1)",
                                color: "rgba(0, 200, 255, 0.9)",
                                border: "1px solid rgba(0, 200, 255, 0.3)",
                            }}
                        />
                    ))
                }
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder='e.g. "show repos", "list projects"'
                        size="small"
                        sx={inputSx}
                    />
                )}
            />

            {/* ─── Body Schema (POST/PUT/PATCH) ─── */}
            {needsBody && (
                <Box sx={{ mt: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Typography
                            variant="caption"
                            sx={{ ...sectionLabelSx, fontSize: "0.6rem", mb: 0, cursor: "pointer" }}
                            onClick={() => setShowSchema(!showSchema)}
                        >
                            Request Body Schema {showSchema ? "▲" : "▼"}
                        </Typography>
                        {!showSchema && (
                            <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.6rem" }}>
                                {entry.body_schema?.length ?? 0} fields
                            </Typography>
                        )}
                    </Box>

                    {showSchema && (
                        <Box
                            sx={{
                                mt: 1,
                                p: 1.5,
                                borderRadius: 2,
                                bgcolor: COLORS.surfaceDark,
                                border: `1px solid ${COLORS.border}`,
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                            }}
                        >
                            {/* Column headers */}
                            <Box sx={{ display: "flex", gap: 1, px: 0.5 }}>
                                <Typography variant="caption" sx={{ flex: 2, color: COLORS.textMuted, fontSize: "0.55rem", textTransform: "uppercase" }}>
                                    Field
                                </Typography>
                                <Typography variant="caption" sx={{ flex: 1, minWidth: 90, color: COLORS.textMuted, fontSize: "0.55rem", textTransform: "uppercase" }}>
                                    Type
                                </Typography>
                                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.55rem", textTransform: "uppercase", width: 32, textAlign: "center" }}>
                                    Req
                                </Typography>
                                <Box sx={{ width: 28 }} />
                            </Box>

                            {(entry.body_schema ?? []).map((field, fi) => (
                                <SchemaFieldRow
                                    key={fi}
                                    field={field}
                                    onChange={(updated) => {
                                        const schema = [...(entry.body_schema ?? [])];
                                        schema[fi] = updated;
                                        update({ body_schema: schema });
                                    }}
                                    onRemove={() => {
                                        const schema = (entry.body_schema ?? []).filter((_, idx) => idx !== fi);
                                        update({ body_schema: schema });
                                    }}
                                />
                            ))}

                            <GhostButton
                                startIcon={<AddIcon />}
                                onClick={() => {
                                    const schema = [...(entry.body_schema ?? []), { name: "", type: "string", required: false }];
                                    update({ body_schema: schema });
                                }}
                                sx={{ fontSize: "0.7rem", alignSelf: "flex-start" }}
                            >
                                Add Field
                            </GhostButton>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}
