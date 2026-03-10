// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Form Blocks
// text_input, select, checkbox_group, toggle, slider, form_group
// ============================================================

import React from "react";
import {
    Box,
    TextField,
    MenuItem,
    FormControlLabel,
    Checkbox,
    Switch,
    Slider as MuiSlider,
    Typography,
    Button,
} from "@mui/material";
import { COLORS, SectionLabel, accentAlpha } from "../ui/SharedUI";
import { useCardContext } from "./CardContext";
import type {
    TextInputBlockSpec,
    SelectBlockSpec,
    CheckboxGroupBlockSpec,
    ToggleBlockSpec,
    SliderBlockSpec,
    FormGroupBlockSpec,
    BlockSpec,
} from "./types";

// ─── Shared styles ──────────────────────────────────────────

const inputSx = {
    "& .MuiOutlinedInput-root": {
        bgcolor: "rgba(255, 255, 255, 0.03)",
        borderRadius: 2,
        fontSize: "0.9rem",
        color: COLORS.textPrimary,
        "& fieldset": {
            borderColor: "rgba(255, 255, 255, 0.08)",
        },
        "&:hover fieldset": {
            borderColor: accentAlpha(0.3),
        },
        "&.Mui-focused fieldset": {
            borderColor: COLORS.accent,
            borderWidth: 1,
        },
    },
    "& .MuiInputLabel-root": {
        color: COLORS.textMuted,
        fontSize: "0.85rem",
        "&.Mui-focused": {
            color: COLORS.accent,
        },
    },
    "& .MuiFormHelperText-root": {
        color: COLORS.textMuted,
        fontSize: "0.75rem",
    },
};

// ─── TEXT INPUT ─────────────────────────────────────────────

export const TextInputBlock = React.memo(function TextInputBlock({
    label,
    placeholder,
    inputType = "text",
    multiline = false,
    rows = 3,
    helperText,
    required,
}: TextInputBlockSpec) {
    return (
        <TextField
            fullWidth
            variant="outlined"
            size="small"
            label={label}
            placeholder={placeholder}
            type={inputType}
            multiline={multiline}
            rows={multiline ? rows : undefined}
            helperText={helperText}
            required={required}
            sx={inputSx}
        />
    );
});

// ─── SELECT ─────────────────────────────────────────────────

export const SelectBlock = React.memo(function SelectBlock({
    label,
    options,
    placeholder,
    helperText,
    required,
}: SelectBlockSpec) {
    const [value, setValue] = React.useState("");

    return (
        <TextField
            fullWidth
            select
            variant="outlined"
            size="small"
            label={label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            helperText={helperText}
            required={required}
            sx={inputSx}
        >
            {placeholder && (
                <MenuItem value="" disabled>
                    <Typography sx={{ color: COLORS.textMuted, fontSize: "0.85rem" }}>
                        {placeholder}
                    </Typography>
                </MenuItem>
            )}
            {options.map((opt) => (
                <MenuItem
                    key={opt.value}
                    value={opt.value}
                    sx={{
                        fontSize: "0.85rem",
                        color: COLORS.textPrimary,
                        "&:hover": { bgcolor: accentAlpha(0.1) },
                    }}
                >
                    {opt.label}
                </MenuItem>
            ))}
        </TextField>
    );
});

// ─── CHECKBOX GROUP ─────────────────────────────────────────

export const CheckboxGroupBlock = React.memo(function CheckboxGroupBlock({
    label,
    items,
    columns = 1,
}: CheckboxGroupBlockSpec) {
    const [checked, setChecked] = React.useState<boolean[]>(
        items.map((item) => item.checked ?? false)
    );

    const toggle = (index: number) => {
        setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
    };

    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {items.map((item, i) => (
                    <Box key={i} sx={{ flex: `0 0 ${100 / columns}%`, minWidth: 0 }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={checked[i]}
                                    onChange={() => toggle(i)}
                                    size="small"
                                    sx={{
                                        color: COLORS.textMuted,
                                        "&.Mui-checked": { color: COLORS.accent },
                                    }}
                                />
                            }
                            label={
                                <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.85rem" }}>
                                    {item.label}
                                </Typography>
                            }
                        />
                    </Box>
                ))}
            </Box>
        </Box>
    );
});

// ─── TOGGLE ─────────────────────────────────────────────────

export const ToggleBlock = React.memo(function ToggleBlock({
    label,
    description,
    defaultValue = false,
}: ToggleBlockSpec) {
    const [on, setOn] = React.useState(defaultValue);

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 1.5,
                borderRadius: 2,
                bgcolor: COLORS.surfaceSubtle,
                border: `1px solid ${COLORS.borderFaint}`,
            }}
        >
            <Box>
                <Typography
                    sx={{ color: COLORS.textPrimary, fontWeight: 600, fontSize: "0.9rem" }}
                >
                    {label}
                </Typography>
                {description && (
                    <Typography
                        sx={{ color: COLORS.textMuted, fontSize: "0.78rem", mt: 0.2 }}
                    >
                        {description}
                    </Typography>
                )}
            </Box>
            <Switch
                checked={on}
                onChange={() => setOn(!on)}
                sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                        color: COLORS.accent,
                        "& + .MuiSwitch-track": {
                            bgcolor: accentAlpha(0.5),
                        },
                    },
                    "& .MuiSwitch-track": {
                        bgcolor: "rgba(255, 255, 255, 0.1)",
                    },
                }}
            />
        </Box>
    );
});

// ─── SLIDER ─────────────────────────────────────────────────

export const SliderBlock = React.memo(function SliderBlock({
    label,
    min = 0,
    max = 100,
    step = 1,
    defaultValue,
    unit = "",
}: SliderBlockSpec) {
    const initial = defaultValue ?? Math.round((min + max) / 2);
    const [value, setValue] = React.useState(initial);

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.85rem" }}>
                    {label}
                </Typography>
                <Typography
                    sx={{
                        color: COLORS.accent,
                        fontWeight: 700,
                        fontSize: "0.85rem",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {value}{unit}
                </Typography>
            </Box>
            <MuiSlider
                value={value}
                onChange={(_e, v) => setValue(v as number)}
                min={min}
                max={max}
                step={step}
                sx={{
                    color: COLORS.accent,
                    height: 4,
                    "& .MuiSlider-thumb": {
                        width: 14,
                        height: 14,
                        bgcolor: "#fff",
                        boxShadow: `0 0 8px ${COLORS.accent}`,
                        "&:hover": { boxShadow: `0 0 14px ${COLORS.accent}` },
                    },
                    "& .MuiSlider-rail": {
                        bgcolor: "rgba(255, 255, 255, 0.08)",
                    },
                }}
            />
        </Box>
    );
});

// ─── FORM GROUP ─────────────────────────────────────────────

// RenderBlock ref set by BlockRenderer (avoids circular import)
let _RenderBlock: React.ComponentType<{ block: BlockSpec }> | null = null;
export function setFormRenderBlock(rb: React.ComponentType<{ block: BlockSpec }>) {
    _RenderBlock = rb;
}

export const FormGroupBlock = React.memo(function FormGroupBlock({
    title,
    description,
    submitLabel = "Submit",
    blocks,
    apiEndpoint,
    httpMethod = "GET",
    resultBlockId,
}: FormGroupBlockSpec) {
    const cardCtx = useCardContext();
    const formRef = React.useRef<HTMLDivElement>(null);
    const [submitting, setSubmitting] = React.useState(false);

    const handleSubmit = React.useCallback(async () => {
        if (!apiEndpoint || !resultBlockId || !cardCtx) return;

        // Collect form values from input elements
        const inputs = formRef.current?.querySelectorAll("input, textarea, select");
        const values: Record<string, string> = {};
        inputs?.forEach((el) => {
            const input = el as HTMLInputElement;
            const label = input.getAttribute("aria-label") || input.name || input.id || "";
            if (label && input.value) {
                values[label.toLowerCase().replace(/\s+/g, "_")] = input.value;
            }
        });

        setSubmitting(true);
        cardCtx.setLoading(resultBlockId, true);

        try {
            let url = apiEndpoint;
            let options: RequestInit = {};

            if (httpMethod.toUpperCase() === "GET") {
                // For GET: append values as query params
                const params = new URLSearchParams();
                Object.entries(values).forEach(([k, v]) => {
                    params.set(k, v);
                });
                // Special: if there's only one field, use "expr" as key (Math.js compat)
                if (Object.keys(values).length === 1) {
                    const val = Object.values(values)[0];
                    url = `${apiEndpoint}?expr=${encodeURIComponent(val)}`;
                } else {
                    url = `${apiEndpoint}?${params.toString()}`;
                }
                options = { method: "GET" };
            } else {
                options = {
                    method: httpMethod.toUpperCase(),
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                };
            }

            const res = await fetch(url);
            const contentType = res.headers.get("content-type") || "";
            let data: any;

            if (contentType.includes("application/json")) {
                data = await res.json();
            } else {
                data = await res.text();
            }

            cardCtx.setResult(resultBlockId, data);
        } catch (err) {
            cardCtx.setError(resultBlockId, err instanceof Error ? err.message : "API call failed");
        } finally {
            setSubmitting(false);
        }
    }, [apiEndpoint, httpMethod, resultBlockId, cardCtx]);

    return (
        <Box
            ref={formRef}
            sx={{
                p: 2,
                borderRadius: 2.5,
                bgcolor: "rgba(255, 255, 255, 0.02)",
                border: `1px solid ${accentAlpha(0.15)}`,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
            }}
        >
            {title && (
                <Typography
                    sx={{
                        color: COLORS.textPrimary,
                        fontWeight: 700,
                        fontSize: "1rem",
                    }}
                >
                    {title}
                </Typography>
            )}
            {description && (
                <Typography sx={{ color: COLORS.textMuted, fontSize: "0.82rem", mt: -0.5 }}>
                    {description}
                </Typography>
            )}

            {blocks.map((block, i) =>
                _RenderBlock ? <_RenderBlock key={i} block={block} /> : null
            )}

            <Button
                variant="contained"
                disableElevation
                disabled={submitting}
                onClick={apiEndpoint ? handleSubmit : undefined}
                sx={{
                    mt: 0.5,
                    bgcolor: COLORS.accent,
                    color: "#fff",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: 2,
                    px: 3,
                    py: 0.8,
                    alignSelf: "flex-start",
                    "&:hover": {
                        bgcolor: accentAlpha(0.85),
                    },
                    "&.Mui-disabled": {
                        bgcolor: accentAlpha(0.4),
                        color: "rgba(255, 255, 255, 0.5)",
                    },
                }}
            >
                {submitting ? "..." : submitLabel}
            </Button>
        </Box>
    );
});
