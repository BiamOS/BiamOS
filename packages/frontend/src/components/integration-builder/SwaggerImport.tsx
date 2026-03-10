// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Swagger / OpenAPI Import Flow
// ============================================================

import { useState } from "react";
import {
    Box,
    Typography,
    TextField,
    Alert,
    Chip,
} from "@mui/material";
import {
    CheckCircle as DoneIcon,
    CloudDownload as ImportIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    GhostButton,
    COLORS,
    inputSx,
    accentAlpha,
} from "../ui/SharedUI";

export function SwaggerImport({ onCreated, onClose }: { onCreated?: () => void; onClose?: () => void }) {
    const [specUrl, setSpecUrl] = useState("");
    const [groupName, setGroupName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        integration_name: string;
        endpoints_found: number;
        created: number;
        errors: string[];
    } | null>(null);

    const handleImport = async () => {
        if (!specUrl.trim()) return;
        setLoading(true);
        setError(null);
        setResult(null);
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: true, message: "📦 Importing OpenAPI spec…" } }));
        try {
            const res = await fetch("/api/builder/import-openapi", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    specUrl: specUrl.trim(),
                    groupName: groupName.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || data.action === "error") {
                throw new Error(data.message ?? "Import failed");
            }
            setResult(data);
            if (data.created > 0) {
                setTimeout(() => onCreated?.(), 800);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Import failed");
        } finally {
            setLoading(false);
            window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: false, message: "" } }));
        }
    };

    return (
        <Box sx={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {error && (
                <Alert
                    severity="error"
                    onClose={() => setError(null)}
                    sx={{
                        bgcolor: "rgba(255, 50, 50, 0.08)",
                        color: COLORS.red,
                        border: "1px solid rgba(255, 50, 50, 0.2)",
                        borderRadius: 2,
                    }}
                >
                    {error}
                </Alert>
            )}

            {!result ? (
                <>
                    <Box sx={{ textAlign: "center", py: 2 }}>
                        <Typography variant="h6" sx={{ color: "rgba(255, 255, 255, 0.7)", mb: 1, fontWeight: 400 }}>
                            Paste a Swagger / OpenAPI URL
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                            All endpoints will be automatically imported with tags, auth config, and parameter schemas.
                        </Typography>
                    </Box>

                    <TextField
                        label="OpenAPI Spec URL"
                        placeholder="https://petstore.swagger.io/v2/swagger.json"
                        value={specUrl}
                        onChange={(e) => setSpecUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleImport()}
                        fullWidth
                        size="medium"
                        sx={inputSx}
                    />

                    <TextField
                        label="Group Name (optional override)"
                        placeholder="e.g. Petstore, HaloITSM"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        fullWidth
                        size="small"
                        sx={inputSx}
                    />

                    <Box sx={{ display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
                        {onClose && <GhostButton onClick={onClose}>Cancel</GhostButton>}
                        <GradientButton
                            onClick={handleImport}
                            loading={loading}
                            disabled={!specUrl.trim()}
                            startIcon={!loading ? <ImportIcon /> : undefined}
                        >
                            {loading ? "Importing..." : "Import Spec"}
                        </GradientButton>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1, justifyContent: "center", mt: 1 }}>
                        {[
                            { label: "Petstore", url: "https://petstore.swagger.io/v2/swagger.json" },
                            { label: "JSONPlaceholder", url: "https://fakerestapi.azurewebsites.net/swagger/v1/swagger.json" },
                        ].map((ex) => (
                            <Chip
                                key={ex.label}
                                label={ex.label}
                                size="small"
                                onClick={() => setSpecUrl(ex.url)}
                                sx={{
                                    bgcolor: COLORS.surface,
                                    color: COLORS.textSecondary,
                                    border: `1px solid ${COLORS.border}`,
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: accentAlpha(0.1), color: COLORS.textPrimary },
                                }}
                            />
                        ))}
                    </Box>
                </>
            ) : (
                <Box
                    sx={{
                        p: 3,
                        borderRadius: 3,
                        bgcolor: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                        textAlign: "center",
                    }}
                >
                    <DoneIcon sx={{ fontSize: 48, color: "#00dc64", mb: 2 }} />
                    <Typography variant="h6" sx={{ color: COLORS.textPrimary, mb: 1 }}>
                        {result.integration_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 2 }}>
                        {result.created} of {result.endpoints_found} endpoints imported
                    </Typography>
                    {result.errors.length > 0 && (
                        <Alert severity="warning" sx={{ mt: 1, textAlign: "left" }}>
                            {result.errors.length} errors: {result.errors.slice(0, 3).join(", ")}
                        </Alert>
                    )}
                    <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", mt: 3 }}>
                        <GhostButton onClick={() => { setResult(null); setSpecUrl(""); setGroupName(""); }}>
                            Import Another
                        </GhostButton>
                        {onClose && (
                            <GradientButton onClick={onClose}>
                                Done
                            </GradientButton>
                        )}
                    </Box>
                </Box>
            )}
        </Box>
    );
}
