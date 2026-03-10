// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Review Panel (Global Shared)
// ============================================================
// THE single layout for viewing/editing an integration.
// Used by: ManualForm, AIFlow, SwaggerImport, EditPanel.
//
// Two-column layout:
//   LEFT:  Integration details + Authentication
//   RIGHT: Endpoint cards with method, path, triggers, actions
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
    CircularProgress,
    Chip,
    Autocomplete,
    IconButton,
} from "@mui/material";
import {
    CheckCircle as DoneIcon,
    Delete as DeleteIcon,
    Add as AddIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    GhostButton,
    COLORS,
    inputSx,
    sectionLabelSx,
    accentAlpha,
} from "../ui/SharedUI";
import { methodColors, type IntegrationSpec, type EndpointSpec } from "./shared";
import { IconPicker, RenderIcon } from "./IconPicker";

// ─── Types ──────────────────────────────────────────────────

export interface EndpointStatus {
    build?: "idle" | "building" | "done" | "error";
    test?: "idle" | "testing" | "pass" | "fail";
    fix?: "idle" | "fixing";
}

export interface ReviewPanelProps {
    spec: IntegrationSpec;
    onSpecChange: (spec: IntegrationSpec) => void;

    // Auth credential state (stored outside spec)
    authHeaderName: string;
    authPrefix: string;
    authKey: string;
    onAuthHeaderNameChange: (v: string) => void;
    onAuthPrefixChange: (v: string) => void;
    onAuthKeyChange: (v: string) => void;

    // Endpoint statuses (build, test, fix)
    endpointStatus?: Record<string, EndpointStatus>;

    // Action callbacks
    onSave: () => void;
    onCancel?: () => void;
    onTestEndpoint?: (ep: EndpointSpec, index: number) => void;
    onTestAll?: () => void;
    onFixEndpoint?: (ep: EndpointSpec, index: number) => void;
    onBack?: () => void;

    // UI state
    saving?: boolean;
    saveLabel?: string;
    saveDisabled?: boolean;
    showTestButtons?: boolean;
    showDocsUrl?: boolean;
    showHumanTriggers?: boolean;
    showAddEndpoint?: boolean;

    /** Extra content below right column (e.g. test all button) */
    rightFooter?: React.ReactNode;
}

// ─── Component ──────────────────────────────────────────────

export const IntegrationReviewPanel = React.memo(function IntegrationReviewPanel({
    spec,
    onSpecChange,
    authHeaderName,
    authPrefix,
    authKey,
    onAuthHeaderNameChange,
    onAuthPrefixChange,
    onAuthKeyChange,
    endpointStatus = {},
    onSave,
    onCancel,
    onTestEndpoint,
    onTestAll,
    onFixEndpoint,
    onBack,
    saving,
    saveLabel,
    saveDisabled,
    showTestButtons,
    showDocsUrl = true,
    showHumanTriggers = true,
    showAddEndpoint = true,
    rightFooter,
}: ReviewPanelProps) {
    const [iconPickerOpen, setIconPickerOpen] = useState(false);

    // ─── Helpers ──────────────────────────────────────────────

    const update = (patch: Partial<IntegrationSpec>) => onSpecChange({ ...spec, ...patch });

    const updateEndpoint = (index: number, patch: Partial<EndpointSpec>) => {
        const endpoints = [...spec.endpoints];
        endpoints[index] = { ...endpoints[index], ...patch };
        update({ endpoints });
    };

    const deleteEndpoint = (index: number) => {
        if (spec.endpoints.length <= 1) return;
        update({ endpoints: spec.endpoints.filter((_, i) => i !== index) });
    };

    const addEndpoint = () => {
        update({
            endpoints: [
                ...spec.endpoints,
                { name: "", method: "GET", path: "", semantic_triggers: [], test_params: {}, endpoint_tags: "", response_type: "mixed", supported_intents: "DATA" },
            ],
        });
    };

    // ─── Constants ─────────────────────────────────────────────


    const CATEGORY_OPTIONS = [
        { value: "data", label: "📊 Data", desc: "Weather, stats, metrics, numbers" },
        { value: "content", label: "📄 Content", desc: "Images, articles, media, text" },
        { value: "tools", label: "🔧 Tools", desc: "Calculator, converter, interactive utilities" },
        { value: "web", label: "🌐 Web", desc: "Websites, iframes, web apps" },
    ];

    const INTENT_OPTIONS = [
        { value: "DATA", label: "📊 DATA", desc: "Numbers, stats, weather" },
        { value: "SEARCH", label: "🔍 SEARCH", desc: "List of search results" },
        { value: "ARTICLE", label: "📝 ARTICLE", desc: "Read about a topic" },
        { value: "IMAGE", label: "🖼️ IMAGE", desc: "Show a single image" },
        { value: "IMAGES", label: "🖼️ IMAGES", desc: "Gallery of multiple images" },
        { value: "VIDEO", label: "🎬 VIDEO", desc: "Watch a video" },
        { value: "ACTION", label: "⚡ ACTION", desc: "Send, create, submit" },
    ];

    const RESPONSE_TYPE_OPTIONS = [
        { value: "mixed", label: "Mixed (single object)", desc: "JSON object with various fields" },
        { value: "data", label: "Data (structured)", desc: "Numbers, stats, key-value data" },
        { value: "list", label: "List (array of items)", desc: "Array of results or entries" },
        { value: "article", label: "Article (text content)", desc: "Long-form text, wiki, recipes" },
        { value: "text", label: "Text (plain string)", desc: "Simple text response" },
        { value: "image", label: "Image (single)", desc: "Single image URL" },
        { value: "image_list", label: "Image list (gallery)", desc: "Array of image URLs" },
    ];

    const doneCount = spec.endpoints.filter((ep) => endpointStatus[ep.name]?.build === "done").length;
    const anyTesting = spec.endpoints.some((ep) => endpointStatus[ep.name]?.test === "testing");
    const allTestsPassed = spec.endpoints.every((ep) => endpointStatus[ep.name]?.test === "pass");

    // ─── Render ──────────────────────────────────────────────

    return (
        <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
            {/* ═══ LEFT: Integration Details + Auth ═══ */}
            <Box sx={{ flex: "0 0 48%", display: "flex", flexDirection: "column", gap: 2.5 }}>
                {/* Integration Details */}
                <Box sx={{ p: 2.5, pt: 2, borderRadius: 1, bgcolor: COLORS.surface, border: `1px solid ${COLORS.border}40` }}>
                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, fontSize: "0.7rem", mb: 2 }}>
                        Integration
                    </Typography>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <TextField
                            label="Integration Name"
                            value={spec.integration_name}
                            onChange={(e) => update({ integration_name: e.target.value })}
                            size="small"
                            fullWidth
                            sx={inputSx}
                        />
                        <TextField
                            label="Base URL"
                            value={spec.base_url}
                            onChange={(e) => update({ base_url: e.target.value })}
                            fullWidth
                            size="small"
                            sx={inputSx}
                            placeholder="https://api.example.com"
                        />
                        {showDocsUrl && (
                            <TextField
                                label="Docs URL"
                                value={spec.docs_url || ""}
                                onChange={(e) => update({ docs_url: e.target.value })}
                                fullWidth
                                size="small"
                                sx={inputSx}
                                placeholder="https://developer.example.com/docs"
                                helperText="Official API documentation link"
                            />
                        )}
                        <TextField
                            label="Description"
                            value={spec.description || ""}
                            onChange={(e) => update({ description: e.target.value })}
                            fullWidth
                            size="small"
                            multiline
                            minRows={2}
                            maxRows={3}
                            sx={inputSx}
                            placeholder="Real-time weather data for any location worldwide"
                            helperText="Short description of what this integration does"
                        />
                        {showHumanTriggers && (
                            <Autocomplete
                                multiple
                                freeSolo
                                options={[]}
                                value={(spec.human_triggers || "").split(/[|,]+/).map(s => s.trim()).filter(Boolean)}
                                onChange={(_, newValue) => update({ human_triggers: newValue.join(", ") })}
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
                                                    bgcolor: "rgba(0, 200, 255, 0.1)",
                                                    color: "rgba(0, 200, 255, 0.9)",
                                                    border: "1px solid rgba(0, 200, 255, 0.2)",
                                                    "& .MuiChip-deleteIcon": {
                                                        color: "rgba(0, 200, 255, 0.5)",
                                                        "&:hover": { color: COLORS.red },
                                                    },
                                                }}
                                            />
                                        );
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Human Triggers"
                                        placeholder="Add trigger..."
                                        size="small"
                                        sx={inputSx}
                                        helperText="Group-level keywords — type + Enter to add"
                                    />
                                )}
                            />
                        )}
                        <Box sx={{ display: "flex", gap: 1.5 }}>
                            <Box
                                onClick={() => setIconPickerOpen(true)}
                                sx={{
                                    flex: "0 0 48px",
                                    height: 40,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 1,
                                    border: `1px solid ${COLORS.border}`,
                                    bgcolor: COLORS.surfaceDark,
                                    cursor: "pointer",
                                    transition: "border-color 0.2s",
                                    "&:hover": { borderColor: accentAlpha(0.4) },
                                }}
                            >
                                <RenderIcon name={spec.sidebar_icon} label={spec.sidebar_label || spec.integration_name} />
                            </Box>
                            <TextField
                                label="Label"
                                value={spec.sidebar_label}
                                onChange={(e) => update({ sidebar_label: e.target.value.slice(0, 20) })}
                                fullWidth
                                size="small"
                                sx={inputSx}
                            />
                        </Box>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ color: COLORS.textSecondary }}>Category</InputLabel>
                            <Select
                                value={spec.category || "data"}
                                label="Category"
                                onChange={(e) => update({ category: e.target.value })}
                                sx={{
                                    bgcolor: COLORS.surfaceDark,
                                    color: COLORS.textPrimary,
                                    "& fieldset": { borderColor: COLORS.border },
                                }}
                            >
                                {CATEGORY_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        <Box>
                                            <Typography sx={{ fontSize: "0.85rem" }}>{opt.label}</Typography>
                                            <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, mt: -0.2 }}>{opt.desc}</Typography>
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </Box>

                {/* Authentication */}
                <Box
                    sx={{
                        p: 2.5,
                        pt: 2,
                        borderRadius: 1,
                        bgcolor: COLORS.surface,
                        border: `1px solid ${spec.auth_method !== "none" && !authKey ? "rgba(255, 180, 0, 0.3)" : `${COLORS.border}40`}`,
                    }}
                >
                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, fontSize: "0.7rem", mb: 2 }}>
                        Authentication
                    </Typography>
                    <FormControl size="small" fullWidth>
                        <InputLabel sx={{ color: COLORS.textSecondary }}>Auth Type</InputLabel>
                        <Select
                            value={spec.auth_method}
                            label="Auth Type"
                            onChange={(e) => {
                                const v = e.target.value;
                                update({ auth_method: v });
                                if (v === "bearer") { onAuthHeaderNameChange("Authorization"); onAuthPrefixChange("Bearer"); }
                                else if (v === "apikey") { onAuthHeaderNameChange("Authorization"); onAuthPrefixChange(""); }
                            }}
                            sx={{
                                bgcolor: COLORS.surfaceDark,
                                color: COLORS.textPrimary,
                                "& fieldset": { borderColor: COLORS.border },
                            }}
                        >
                            <MenuItem value="none">No Authentication</MenuItem>
                            <MenuItem value="apikey">API Key</MenuItem>
                            <MenuItem value="bearer">Bearer Token</MenuItem>
                            <MenuItem value="oauth2">OAuth2</MenuItem>
                            <MenuItem value="basic">Basic Auth</MenuItem>
                        </Select>
                    </FormControl>

                    {spec.auth_method !== "none" && (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 2 }}>
                            {!authKey && (
                                <Box sx={{
                                    p: 1.5,
                                    borderRadius: 1,
                                    bgcolor: "rgba(255, 180, 0, 0.06)",
                                    border: "1px solid rgba(255, 180, 0, 0.2)",
                                }}>
                                    <Typography variant="caption" sx={{ color: "rgba(255, 180, 0, 0.9)", fontWeight: 600, fontSize: "0.7rem" }}>
                                        ⚠️ {spec.auth_method === "apikey" ? "API Key" : "Authentication"} required
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: "block", fontSize: "0.65rem", mt: 0.3 }}>
                                        Enter your credentials below. Tests will fail without authentication.
                                    </Typography>
                                </Box>
                            )}

                            {spec.docs_url && (
                                <Typography
                                    variant="caption"
                                    component="a"
                                    href={spec.docs_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{
                                        color: COLORS.cyan,
                                        fontSize: "0.7rem",
                                        textDecoration: "none",
                                        "&:hover": { textDecoration: "underline", color: "#fff" },
                                    }}
                                >
                                    📖 API Documentation →
                                </Typography>
                            )}

                            <Box sx={{ display: "flex", gap: 1.5 }}>
                                <TextField
                                    label="Header Name"
                                    value={authHeaderName}
                                    onChange={(e) => onAuthHeaderNameChange(e.target.value)}
                                    size="small"
                                    fullWidth
                                    sx={inputSx}
                                    helperText="e.g. Authorization"
                                />
                                {spec.auth_method === "bearer" && (
                                    <TextField
                                        label="Prefix"
                                        value={authPrefix}
                                        onChange={(e) => onAuthPrefixChange(e.target.value)}
                                        size="small"
                                        sx={{ ...inputSx, minWidth: 100 }}
                                        helperText="e.g. Bearer"
                                    />
                                )}
                            </Box>
                            <TextField
                                label={
                                    spec.auth_method === "bearer" ? "Token" :
                                        spec.auth_method === "apikey" ? "API Key" :
                                            spec.auth_method === "basic" ? "user:password" : "Credentials"
                                }
                                placeholder={
                                    spec.auth_method === "bearer" ? "sk-xxxx..." :
                                        spec.auth_method === "apikey" ? "your-api-key" :
                                            spec.auth_method === "basic" ? "user:password" : "token"
                                }
                                value={authKey}
                                onChange={(e) => onAuthKeyChange(e.target.value)}
                                size="small"
                                type="password"
                                fullWidth
                                sx={inputSx}
                            />
                        </Box>
                    )}
                </Box>

                {/* Back / Cancel */}
                {onBack && (
                    <GhostButton onClick={onBack}>← Back to Search</GhostButton>
                )}
                {onCancel && !onBack && (
                    <GhostButton onClick={onCancel}>Cancel</GhostButton>
                )}
            </Box>

            {/* ═══ RIGHT: Endpoints ═══ */}
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Typography variant="subtitle2" sx={{ ...sectionLabelSx, fontSize: "0.7rem", mb: 0 }}>
                        {spec.endpoints.length} Endpoints
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {doneCount > 0 && (
                            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                                {doneCount}/{spec.endpoints.length} built
                            </Typography>
                        )}
                        {showAddEndpoint && (
                            <GhostButton startIcon={<AddIcon />} onClick={addEndpoint} sx={{ fontSize: "0.75rem" }}>
                                Add
                            </GhostButton>
                        )}
                    </Box>
                </Box>

                {spec.endpoints.map((ep, i) => {
                    const status = endpointStatus[ep.name] ?? {};
                    const methodColor = methodColors[ep.method] ?? "#ccc";
                    return (
                        <Box
                            key={`${ep.name}-${i}`}
                            sx={{
                                p: 2.5,
                                borderRadius: 1,
                                bgcolor: "rgba(15, 15, 35, 0.9)",
                                border: `1px solid ${status.build === "done" ? "rgba(0, 220, 100, 0.3)" : COLORS.border}`,
                                transition: "border-color 0.3s ease",
                                display: "flex",
                                flexDirection: "column",
                                gap: 3,
                            }}
                        >
                            {/* Header: Method + Name + Status */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <FormControl size="small" sx={{ minWidth: 90 }}>
                                    <Select
                                        value={ep.method}
                                        onChange={(e) => updateEndpoint(i, { method: e.target.value })}
                                        sx={{
                                            bgcolor: `${methodColor}15`,
                                            color: methodColor,
                                            fontWeight: 700,
                                            fontSize: "0.75rem",
                                            fontFamily: "'JetBrains Mono', monospace",
                                            "& fieldset": { borderColor: `${methodColor}40` },
                                        }}
                                    >
                                        {["GET", "POST", "PUT", "DELETE", "PATCH"].map((m) => (
                                            <MenuItem key={m} value={m}>{m}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <TextField
                                    value={ep.name}
                                    onChange={(e) => updateEndpoint(i, { name: e.target.value })}
                                    size="small"
                                    placeholder="Endpoint Name"
                                    sx={{
                                        ...inputSx,
                                        flex: 1,
                                        "& input": { fontWeight: 600, fontSize: "0.95rem" },
                                    }}
                                    variant="standard"
                                    slotProps={{ input: { disableUnderline: true, sx: { color: COLORS.textPrimary } } }}
                                />
                                {status.build === "done" && <DoneIcon sx={{ fontSize: 20, color: "#00dc64" }} />}
                                {status.build === "building" && <CircularProgress size={16} sx={{ color: COLORS.accent }} />}
                                {status.build === "error" && <Typography variant="caption" sx={{ color: COLORS.red }}>Failed</Typography>}
                                {showTestButtons && status.test === "pass" && <Typography variant="caption" sx={{ color: "#00dc64", fontWeight: 600 }}>TEST ✅</Typography>}
                                {showTestButtons && status.test === "fail" && (
                                    <>
                                        <Typography variant="caption" sx={{ color: COLORS.red, fontWeight: 600 }}>TEST ❌</Typography>
                                        {onFixEndpoint && (
                                            <Typography
                                                variant="caption"
                                                onClick={() => onFixEndpoint(ep, i)}
                                                sx={{
                                                    color: "#ff9800",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    px: 1,
                                                    py: 0.2,
                                                    borderRadius: 1,
                                                    bgcolor: "rgba(255, 152, 0, 0.1)",
                                                    border: "1px solid rgba(255, 152, 0, 0.3)",
                                                    "&:hover": { bgcolor: "rgba(255, 152, 0, 0.2)" },
                                                }}
                                            >
                                                {status.fix === "fixing" ? "⏳ Fixing..." : "🔧 Fix"}
                                            </Typography>
                                        )}
                                    </>
                                )}
                                {showTestButtons && status.test === "testing" && <CircularProgress size={12} sx={{ color: "#ff9800" }} />}
                                {spec.endpoints.length > 1 && (
                                    <IconButton
                                        size="small"
                                        onClick={() => deleteEndpoint(i)}
                                        sx={{
                                            color: COLORS.textSecondary,
                                            ml: "auto",
                                            "&:hover": { color: COLORS.red },
                                        }}
                                    >
                                        <DeleteIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                )}
                            </Box>

                            {/* Path */}
                            <TextField
                                value={ep.path}
                                onChange={(e) => updateEndpoint(i, { path: e.target.value })}
                                size="small"
                                fullWidth
                                sx={{
                                    ...inputSx,
                                    "& input": { fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" },
                                }}
                                placeholder="/api/path/{param}"
                            />

                            {/* Endpoint Description (stored as intent_description) */}
                            <TextField
                                label="Description"
                                value={ep.semantic_triggers.join(" | ")}
                                onChange={(e) => updateEndpoint(i, { semantic_triggers: e.target.value.split("|").map(s => s.trim()).filter(Boolean) })}
                                size="small"
                                fullWidth
                                multiline
                                minRows={1}
                                maxRows={3}
                                sx={{
                                    ...inputSx,
                                }}
                                placeholder="What does this endpoint do?"
                                helperText="Endpoint description — used for scoring (weight ×2)"
                            />

                            {/* ─── Routing Metadata ─── */}
                            <Autocomplete
                                multiple
                                freeSolo
                                options={[]}
                                value={(ep.endpoint_tags || "").split(/[,]+/).map(s => s.trim()).filter(Boolean)}
                                onChange={(_, newValue) => updateEndpoint(i, { endpoint_tags: newValue.join(",") })}
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
                                                    bgcolor: "rgba(0, 220, 100, 0.1)",
                                                    color: "rgba(0, 220, 100, 0.9)",
                                                    border: "1px solid rgba(0, 220, 100, 0.2)",
                                                    "& .MuiChip-deleteIcon": {
                                                        color: "rgba(0, 220, 100, 0.5)",
                                                        "&:hover": { color: COLORS.red },
                                                    },
                                                }}
                                            />
                                        );
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Endpoint Tags"
                                        placeholder="Add tag..."
                                        size="small"
                                        sx={{ ...inputSx }}
                                        helperText="Router scoring keywords — weight ×3 (highest priority)"
                                    />
                                )}
                            />
                            <Box sx={{ display: "flex", gap: 1.5 }}>
                                <FormControl size="small" sx={{ flex: 1 }}>
                                    <InputLabel sx={{ color: COLORS.textSecondary }}>Response Type</InputLabel>
                                    <Select
                                        value={ep.response_type || "mixed"}
                                        label="Response Type"
                                        onChange={(e) => updateEndpoint(i, { response_type: e.target.value })}
                                        sx={{
                                            bgcolor: COLORS.surfaceDark,
                                            color: COLORS.textPrimary,
                                            fontSize: "0.8rem",
                                            "& fieldset": { borderColor: COLORS.border },
                                        }}
                                    >
                                        {RESPONSE_TYPE_OPTIONS.map((opt) => (
                                            <MenuItem key={opt.value} value={opt.value}>
                                                <Box>
                                                    <Typography sx={{ fontSize: "0.8rem" }}>{opt.label}</Typography>
                                                    <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted, mt: -0.2 }}>{opt.desc}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ flex: 1 }}>
                                    <InputLabel sx={{ color: COLORS.textSecondary }}>Intents</InputLabel>
                                    <Select
                                        multiple
                                        value={(ep.supported_intents || "DATA").split("|").filter(Boolean)}
                                        label="Intents"
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const intents = typeof val === "string" ? val : val.join("|");
                                            updateEndpoint(i, { supported_intents: intents });
                                        }}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                                {(selected as string[]).map((s) => (
                                                    <Chip key={s} label={s} size="small" sx={{ height: 20, fontSize: "0.65rem", bgcolor: accentAlpha(0.15), color: COLORS.textPrimary }} />
                                                ))}
                                            </Box>
                                        )}
                                        sx={{
                                            bgcolor: COLORS.surfaceDark,
                                            color: COLORS.textPrimary,
                                            fontSize: "0.8rem",
                                            "& fieldset": { borderColor: COLORS.border },
                                        }}
                                    >
                                        {INTENT_OPTIONS.map((opt) => (
                                            <MenuItem key={opt.value} value={opt.value}>
                                                <Box>
                                                    <Typography sx={{ fontSize: "0.8rem" }}>{opt.label}</Typography>
                                                    <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted, mt: -0.2 }}>{opt.desc}</Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>
                        </Box>
                    );
                })}

                {/* Right Footer (test all, build all, save, etc.) */}
                {rightFooter}

                {/* Default save button if no custom footer */}
                {!rightFooter && (
                    <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end", pt: 1 }}>
                        {onCancel && <GhostButton onClick={onCancel}>Cancel</GhostButton>}
                        <GradientButton onClick={onSave} loading={saving} disabled={saveDisabled}>
                            {saveLabel || "Save"}
                        </GradientButton>
                    </Box>
                )}
            </Box>

            {/* Icon Picker */}
            <IconPicker
                open={iconPickerOpen}
                onClose={() => setIconPickerOpen(false)}
                onSelect={(name) => update({ sidebar_icon: name })}
                currentIcon={spec.sidebar_icon}
            />
        </Box >
    );
});
