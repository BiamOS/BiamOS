// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Editor Panel (Create + Edit)
// ============================================================
// Extracted from BlockManager.tsx for maintainability.
// Contains: editor/create panel, AI generation, validation,
// save, create, and revert logic.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Box,
    Typography,
    Chip,
    Alert,
    Fade,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
} from "@mui/material";
import {
    Save as SaveIcon,
    Code as CodeIcon,
    Add as AddIcon,
    AutoAwesome as AIIcon,
    PlayArrow as PreviewIcon,
    Undo as RevertIcon,
    ErrorOutline as ErrorIcon,
    DeleteForever as DeleteIcon,
} from "@mui/icons-material";
import { CircularProgress } from "@mui/material";
import { RenderBlock } from "./blocks/BlockRenderer";
import type { BlockSpec } from "./blocks/types";
import {
    GradientButton,
    GhostButton,
    CloseButton,
    COLORS,
    gradientTitleSx,
    sectionLabelSx,
    accentAlpha,
} from "./ui/SharedUI";
import type { BlockMeta, ValidationError } from "./BlockManager";
import { SAMPLE_PROPS, CATEGORY_CONFIG } from "./BlockManager";
import { ImportsReference } from "./BlockCard";

// ============================================================
// New block template
// ============================================================

function newBlockTemplate(typeName: string, compName: string): string {
    return `import React from "react";
import { Box, Typography } from "@mui/material";
import { COLORS, SectionLabel , accentAlpha } from "./ui/SharedUI";

export interface ${compName}Spec {
    type: "${typeName}";
    title: string;
    content?: string;
    label?: string;
}

export const ${compName} = React.memo(function ${compName}({
    title,
    content,
    label,
}: ${compName}Spec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box
                sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: COLORS.surfaceSubtle,
                    border: "1px solid " + COLORS.borderFaint,
                }}
            >
                <Typography
                    sx={{
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        mb: 0.5,
                    }}
                >
                    {title}
                </Typography>
                {content && (
                    <Typography
                        variant="body2"
                        sx={{ color: COLORS.textSecondary, lineHeight: 1.6 }}
                    >
                        {content}
                    </Typography>
                )}
            </Box>
        </Box>
    );
});
`;
}

// ============================================================
// Unified Editor Panel (Create + Edit)
// ============================================================

export const BlockEditorPanel = React.memo(function BlockEditorPanel({
    block,
    isCreateMode,
    onClose,
    onBlockCreated,
    onBlockDeleted,
}: {
    block: BlockMeta | null;
    isCreateMode: boolean;
    onClose: () => void;
    onBlockCreated?: () => void;
    onBlockDeleted?: () => void;
}) {
    // Details state
    const [blockName, setBlockName] = useState(block?.type ?? "");
    const [blockCategory, setBlockCategory] = useState<string>(block?.category ?? "content");
    const [blockDescription, setBlockDescription] = useState(block?.description ?? "");

    // Code state
    const [code, setCode] = useState("");
    const [originalCode, setOriginalCode] = useState("");
    const [loading, setLoading] = useState(!isCreateMode);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // AI state
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiLoading, setAiLoading] = useState(false);

    // Validation state
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [previewVisible, setPreviewVisible] = useState(!isCreateMode);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Derived
    const componentName = useMemo(() => {
        if (!blockName) return "NewBlock";
        return blockName
            .replace(/[^a-zA-Z0-9\s_-]/g, "")
            .split(/[\s_-]+/)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join("") + "Block";
    }, [blockName]);

    const hasChanges = code !== originalCode;
    const sampleProps = block ? SAMPLE_PROPS[block.type] : null;

    // For custom blocks: parse interface from code to generate dummy preview props
    const customPreviewProps = useMemo<BlockSpec | null>(() => {
        if (sampleProps || isCreateMode) return null;
        if (!block?.isCustom) return null;
        try {
            const ifaceMatch = code.match(/export interface (\w+)\s*\{([^}]+)\}/);
            if (!ifaceMatch) return null;
            const props: Record<string, unknown> = { type: block.type };
            const lines = ifaceMatch[2].split("\n");
            for (const line of lines) {
                const match = line.match(/^\s*(\w+)\??\s*:\s*(.+?)\s*;?$/);
                if (!match) continue;
                const [, name, typeStr] = match;
                if (name === "type") continue;
                const t = typeStr.trim();
                if (t === "string") props[name] = `Sample ${name}`;
                else if (t === "number") props[name] = 42;
                else if (t === "boolean") props[name] = true;
                else if (t.includes("string[]")) props[name] = ["Item 1", "Item 2"];
            }
            return props as unknown as BlockSpec;
        } catch { return null; }
    }, [code, block, sampleProps, isCreateMode]);

    // Fetch source (edit mode)
    useEffect(() => {
        if (isCreateMode) {
            const template = newBlockTemplate(blockName || "new_block", componentName);
            setCode(template);
            setOriginalCode(template);
            return;
        }
        if (!block) return;

        setLoading(true);
        setError(null);
        fetch(`/api/blocks/${block.type}/source`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((data) => {
                const src = data.fullFileSource ?? data.source ?? "";
                setCode(src);
                setOriginalCode(src);
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
            .finally(() => setLoading(false));
    }, [block, isCreateMode, blockName, componentName]);

    // ─── Validate ───
    const handleValidate = useCallback(async () => {
        setValidationErrors([]);
        try {
            const res = await fetch("/api/blocks/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            });
            const data = await res.json();
            if (!data.valid) {
                setValidationErrors(data.errors ?? []);
                return false;
            }
            setPreviewVisible(true);
            return true;
        } catch {
            setValidationErrors([{ message: "Validation request failed" }]);
            return false;
        }
    }, [code]);

    // ─── Save (Edit mode) ───
    const handleSave = async () => {
        if (!block) return;
        setSaving(true);
        setError(null);
        try {
            // Validate first
            const valid = await handleValidate();
            if (!valid) {
                setSaving(false);
                return;
            }

            const res = await fetch(`/api/blocks/${block.type}/source`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: code }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? "Save failed");
            }
            setOriginalCode(code);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    // ─── Create (Create mode) ───
    const handleCreate = async () => {
        if (!blockName.trim()) {
            setError("Block name is required");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const valid = await handleValidate();
            if (!valid) {
                setSaving(false);
                return;
            }

            const res = await fetch("/api/blocks/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: blockName.toLowerCase().replace(/\s+/g, "_"),
                    component: componentName,
                    category: blockCategory,
                    description: blockDescription || `Custom ${blockCategory} block`,
                    code,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? "Create failed");
            }

            setSaved(true);
            onBlockCreated?.();
            setTimeout(() => onClose(), 800);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed");
        } finally {
            setSaving(false);
        }
    };

    // ─── AI Generate / Modify ───
    const handleAI = async () => {
        if (!aiPrompt.trim()) return;
        setAiLoading(true);
        setError(null);
        setValidationErrors([]);
        try {
            const res = await fetch("/api/blocks/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: blockName || "custom_block",
                    category: blockCategory,
                    description: aiPrompt,
                    existingCode: isCreateMode ? undefined : code,
                    modification: isCreateMode ? undefined : aiPrompt,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? "AI generation failed");
            }

            const data = await res.json();
            setCode(data.code);
            if (!data.valid && data.errors?.length) {
                setValidationErrors(data.errors);
            }
            setAiPrompt("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "AI generation failed");
        } finally {
            setAiLoading(false);
        }
    };

    // ─── Revert ───
    const handleRevert = () => {
        setCode(originalCode);
        setValidationErrors([]);
        setError(null);
    };

    // ─── Delete (custom blocks only) ───
    const handleDelete = async () => {
        if (!block?.isCustom) return;
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/blocks/${block.type}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message ?? "Delete failed");
            }
            onBlockDeleted?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Delete failed");
        } finally {
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const cat = block ? CATEGORY_CONFIG[block.category] : CATEGORY_CONFIG[blockCategory as keyof typeof CATEGORY_CONFIG];

    return (
        <Fade in timeout={200}>
            <Box sx={{ animation: "fadeInUp 0.3s ease-out", height: "100%" }}>
                {/* Header */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h5" sx={gradientTitleSx()}>
                            {isCreateMode ? <AddIcon sx={{ fontSize: 22, mr: 1, verticalAlign: "middle" }} /> : <CodeIcon sx={{ fontSize: 22, mr: 1, verticalAlign: "middle" }} />}
                            {isCreateMode ? "New Block" : block?.component}
                        </Typography>
                        {!isCreateMode && block && (
                            <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                                <Chip size="small" label={block.type} sx={{ mr: 0.5, height: 18, fontSize: "0.65rem", bgcolor: `${cat.color.replace("0.7", "0.08")}`, color: cat.color, border: `1px solid ${cat.color.replace("0.7", "0.15")}` }} />
                                {block.file} · {block.description}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {saved && <Typography variant="caption" sx={{ color: "#00dc64", fontWeight: 600 }}>Saved ✓</Typography>}
                        {hasChanges && !isCreateMode && (
                            <GhostButton onClick={handleRevert} sx={{ minWidth: 0, px: 1 }}>
                                <RevertIcon sx={{ fontSize: 16, mr: 0.5 }} /> Revert
                            </GhostButton>
                        )}
                        <GhostButton onClick={handleValidate} sx={{ minWidth: 0, px: 1 }}>
                            <PreviewIcon sx={{ fontSize: 16, mr: 0.5 }} /> Preview
                        </GhostButton>
                        {isCreateMode ? (
                            <GradientButton onClick={handleCreate} loading={saving} startIcon={<AddIcon />} sx={{ minWidth: 100 }}>
                                Create
                            </GradientButton>
                        ) : hasChanges ? (
                            <GradientButton onClick={handleSave} loading={saving} startIcon={<SaveIcon />} sx={{ minWidth: 100 }}>
                                Save
                            </GradientButton>
                        ) : (
                            <GhostButton disabled sx={{ minWidth: 100, opacity: 0.4 }}>No Changes</GhostButton>
                        )}
                        {/* Delete button for custom blocks */}
                        {!isCreateMode && block?.isCustom && (
                            confirmDelete ? (
                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                                    <Typography variant="caption" sx={{ color: "rgba(255,80,80,0.9)", fontSize: "0.7rem" }}>Delete?</Typography>
                                    <GhostButton
                                        onClick={handleDelete}
                                        sx={{ minWidth: 0, px: 1, color: "rgba(255,80,80,0.9)", "&:hover": { bgcolor: "rgba(255,50,50,0.1)" } }}
                                    >
                                        {deleting ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : "Yes"}
                                    </GhostButton>
                                    <GhostButton onClick={() => setConfirmDelete(false)} sx={{ minWidth: 0, px: 1 }}>No</GhostButton>
                                </Box>
                            ) : (
                                <GhostButton
                                    onClick={() => setConfirmDelete(true)}
                                    sx={{ minWidth: 0, px: 1, color: "rgba(255,80,80,0.6)", "&:hover": { color: "rgba(255,80,80,0.9)", bgcolor: "rgba(255,50,50,0.08)" } }}
                                >
                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                </GhostButton>
                            )
                        )}
                        <CloseButton onClick={onClose} />
                    </Box>
                </Box>

                {error && (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, bgcolor: "rgba(255, 50, 50, 0.08)", color: COLORS.red, border: "1px solid rgba(255, 50, 50, 0.2)", borderRadius: 2 }}>
                        {error}
                    </Alert>
                )}

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                        <CircularProgress size={28} sx={{ color: accentAlpha(0.6) }} />
                    </Box>
                ) : (
                    <Box sx={{ display: "flex", gap: 2, height: "calc(100vh - 200px)", minHeight: 400 }}>

                        {/* ═══ LEFT PANEL: Details + AI + Imports ═══ */}
                        <Box sx={{ width: 280, minWidth: 240, display: "flex", flexDirection: "column", gap: 1.5, overflowY: "auto", pr: 0.5 }}>

                            {/* Details Section */}
                            <Box>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, color: accentAlpha(0.7) }}>Details</Typography>

                                {/* Name */}
                                <Box component="input"
                                    placeholder="Block type (snake_case)"
                                    value={blockName}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBlockName(e.target.value)}
                                    disabled={!isCreateMode}
                                    sx={{
                                        width: "100%",
                                        p: 1,
                                        mb: 1,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 2,
                                        bgcolor: isCreateMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)",
                                        color: COLORS.textPrimary,
                                        fontSize: "0.85rem",
                                        fontFamily: "'JetBrains Mono', monospace",
                                        outline: "none",
                                        "&:focus": { borderColor: accentAlpha(0.5) },
                                        "&:disabled": { opacity: 0.5 },
                                    }}
                                />

                                {/* Component Name (auto-derived) */}
                                <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.7rem" }}>Component:</Typography>
                                    <Typography variant="caption" sx={{ color: COLORS.accentLight, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem" }}>
                                        {componentName}
                                    </Typography>
                                </Box>

                                {/* Category */}
                                <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                                    <InputLabel sx={{ color: COLORS.textMuted, fontSize: "0.8rem" }}>Category</InputLabel>
                                    <Select
                                        value={blockCategory}
                                        onChange={(e) => setBlockCategory(e.target.value)}
                                        disabled={!isCreateMode}
                                        label="Category"
                                        sx={{
                                            bgcolor: "rgba(0,0,0,0.2)",
                                            color: COLORS.textPrimary,
                                            fontSize: "0.82rem",
                                            borderRadius: 2,
                                            "& .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.border },
                                            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: accentAlpha(0.3) },
                                            "& .MuiSvgIcon-root": { color: COLORS.textMuted },
                                        }}
                                    >
                                        {Object.entries(CATEGORY_CONFIG).map(([key, conf]) => (
                                            <MenuItem key={key} value={key} sx={{ fontSize: "0.82rem" }}>
                                                {conf.icon} <span style={{ marginLeft: 6 }}>{conf.label}</span>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {/* Description */}
                                {isCreateMode && (
                                    <Box
                                        component="textarea"
                                        placeholder="Short description of this block..."
                                        value={blockDescription}
                                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBlockDescription(e.target.value)}
                                        rows={2}
                                        sx={{
                                            width: "100%",
                                            p: 1,
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: 2,
                                            bgcolor: "rgba(0,0,0,0.3)",
                                            color: COLORS.textSecondary,
                                            fontSize: "0.8rem",
                                            resize: "vertical",
                                            outline: "none",
                                            fontFamily: "inherit",
                                            "&:focus": { borderColor: accentAlpha(0.5) },
                                        }}
                                    />
                                )}
                            </Box>

                            {/* AI Assist Section */}
                            <Box>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, color: "rgba(0, 200, 255, 0.7)" }}>
                                    <AIIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
                                    {isCreateMode ? "AI Generate" : "AI Modify"}
                                </Typography>
                                <Box
                                    component="textarea"
                                    placeholder={isCreateMode
                                        ? "Describe the block you want...\n\ne.g. 'A pricing card with title, price, and feature list. Gradient price text.'"
                                        : "Describe what to change...\n\ne.g. 'Add a hover glow effect and make the gradient more vibrant'"
                                    }
                                    value={aiPrompt}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAiPrompt(e.target.value)}
                                    rows={4}
                                    sx={{
                                        width: "100%",
                                        p: 1,
                                        mb: 1,
                                        border: `1px solid ${COLORS.border}`,
                                        borderRadius: 2,
                                        bgcolor: "rgba(0,0,0,0.3)",
                                        color: COLORS.textSecondary,
                                        fontSize: "0.8rem",
                                        resize: "vertical",
                                        outline: "none",
                                        fontFamily: "inherit",
                                        "&:focus": { borderColor: "rgba(0, 200, 255, 0.3)" },
                                    }}
                                />
                                <GradientButton
                                    onClick={handleAI}
                                    loading={aiLoading}
                                    disabled={!aiPrompt.trim()}
                                    startIcon={<AIIcon />}
                                    fullWidth
                                    sx={{
                                        background: aiPrompt.trim()
                                            ? `linear-gradient(135deg, rgba(0, 200, 255, 0.6), ${accentAlpha(0.6)})`
                                            : undefined,
                                    }}
                                >
                                    {isCreateMode ? "Generate Code" : "Modify with AI"}
                                </GradientButton>
                                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.62rem", mt: 0.5, textAlign: "center", display: "block", lineHeight: 1.4 }}>
                                    ⚠️ AI-generated code may contain errors. Always review and test before saving.
                                </Typography>
                            </Box>

                            {/* Imports Reference */}
                            <ImportsReference />

                            {/* Live Preview (left panel) */}
                            {previewVisible && (
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" sx={{ ...sectionLabelSx, color: "rgba(0, 220, 100, 0.7)" }}>
                                        <PreviewIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: "middle" }} />
                                        Preview
                                    </Typography>
                                    <Box
                                        sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            bgcolor: "rgba(255,255,255,0.015)",
                                            border: `1px solid ${COLORS.border}`,
                                            overflow: "hidden",
                                            minHeight: 80,
                                        }}
                                    >
                                        {(sampleProps || customPreviewProps) ? (
                                            <RenderBlock block={(sampleProps || customPreviewProps)!} />
                                        ) : (
                                            <Box sx={{ textAlign: "center", py: 2 }}>
                                                <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                                    {isCreateMode ? "Save to see preview" : "No preview data"}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                </Box>
                            )}
                        </Box>

                        {/* ═══ RIGHT PANEL: Code + Errors ═══ */}
                        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, color: accentAlpha(0.7) }}>
                                    Source Code {!isCreateMode && block && `— ${block.file}`}
                                </Typography>
                                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.65rem" }}>
                                    {code.split("\n").length} lines · {(code.length / 1024).toFixed(1)} KB
                                </Typography>
                            </Box>

                            {/* Code Editor */}
                            <Box
                                component="textarea"
                                value={code}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                    setCode(e.target.value);
                                    setValidationErrors([]);
                                }}
                                spellCheck={false}
                                sx={{
                                    flex: 1,
                                    width: "100%",
                                    p: 2,
                                    resize: "none",
                                    border: `1px solid ${validationErrors.length ? "rgba(255, 80, 80, 0.4)" : COLORS.border}`,
                                    borderRadius: 3,
                                    bgcolor: "rgba(0, 0, 0, 0.3)",
                                    color: "rgba(200, 220, 255, 0.9)",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: "0.82rem",
                                    lineHeight: 1.6,
                                    outline: "none",
                                    tabSize: 2,
                                    whiteSpace: "pre",
                                    overflowWrap: "normal",
                                    overflowX: "auto",
                                    transition: "border-color 0.2s",
                                    "&:focus": {
                                        borderColor: validationErrors.length ? "rgba(255, 80, 80, 0.6)" : accentAlpha(0.5),
                                        boxShadow: validationErrors.length ? "0 0 0 2px rgba(255, 80, 80, 0.1)" : `0 0 0 2px ${accentAlpha(0.1)}`,
                                    },
                                    "&::-webkit-scrollbar": { width: 6, height: 6 },
                                    "&::-webkit-scrollbar-thumb": {
                                        bgcolor: accentAlpha(0.2),
                                        borderRadius: 3,
                                    },
                                    "&::selection": {
                                        bgcolor: accentAlpha(0.3),
                                        color: "#fff",
                                    },
                                }}
                            />

                            {/* Error Panel */}
                            {validationErrors.length > 0 && (
                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 2,
                                        bgcolor: "rgba(255, 50, 50, 0.06)",
                                        border: "1px solid rgba(255, 50, 50, 0.2)",
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                                        <ErrorIcon sx={{ fontSize: 14, color: "rgba(255, 100, 100, 0.8)" }} />
                                        <Typography variant="caption" sx={{ color: "rgba(255, 100, 100, 0.9)", fontWeight: 700, fontSize: "0.7rem", textTransform: "uppercase" }}>
                                            Transpile Errors
                                        </Typography>
                                    </Box>
                                    {validationErrors.map((err, i) => (
                                        <Box key={i} sx={{ display: "flex", gap: 1, mt: 0.3 }}>
                                            {err.line && (
                                                <Typography variant="caption" sx={{ color: "rgba(255, 180, 0, 0.8)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                                                    Line {err.line}{err.column ? `:${err.column}` : ""}
                                                </Typography>
                                            )}
                                            <Typography variant="caption" sx={{ color: "rgba(255, 100, 100, 0.8)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", wordBreak: "break-word" }}>
                                                {err.message}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </Box>
                )}
            </Box>
        </Fade>
    );
});
