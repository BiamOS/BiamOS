// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Integration Edit Modal (uses IntegrationReviewPanel)
// ============================================================

import React, { useState, useMemo } from "react";
import { Box, Typography, Fade, Select, MenuItem, FormControl, InputLabel, Alert } from "@mui/material";
import {
    GradientButton,
    GhostButton,
    CloseButton,
    COLORS,
    gradientTitleSx,
} from "./ui/SharedUI";
import { STATUS_CONFIG, type IntegrationItem, type IntegrationStatus } from "../types/integration";
import type { IntegrationSpec, EndpointSpec } from "./integration-builder/shared";
import { IntegrationReviewPanel } from "./integration-builder/IntegrationReviewPanel";
import { BlockPicker, type BlockPickerEndpoint } from "./BlockPicker";

// ============================================================
// Edit Detail Panel
// ============================================================

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, config]) => ({
    value: value as IntegrationStatus,
    ...config,
}));

export const EditPanel = React.memo(function EditPanel({
    integration,
    allIntegrations,
    onSave,
    onClose,
}: {
    integration: IntegrationItem;
    allIntegrations: IntegrationItem[];
    onSave: (id: number, updates: Partial<IntegrationItem>) => Promise<void>;
    onClose: () => void;
}) {
    const groupName = integration.group_name;
    const siblings = useMemo(() =>
        groupName
            ? allIntegrations.filter((c) => c.group_name === groupName)
            : [integration],
        [groupName, allIntegrations, integration]
    );

    // Convert DB integrations to IntegrationSpec for the panel
    const initialSpec = useMemo<IntegrationSpec>(() => {
        // Derive base_url from first endpoint's api_endpoint
        let baseUrl = "";
        const firstEndpoint = siblings[0]?.api_endpoint;
        if (firstEndpoint) {
            try {
                const parsed = new URL(firstEndpoint);
                baseUrl = `${parsed.protocol}//${parsed.host}`;
            } catch { /* not a full URL */ }
        }

        return {
            integration_name: groupName ?? integration.name.replace("Widget", ""),
            auth_method: integration.api_config?.requiresAuth ? (integration.api_config.authType ?? "bearer") : "none",
            base_url: baseUrl,
            docs_url: "",
            description: (integration as any).description || "",
            category: (integration as any).category || "data",
            endpoints: siblings.map((sib) => ({
                name: sib.name,
                method: (sib as any).method || "GET",
                path: sib.api_endpoint,
                semantic_triggers: sib.intent_description.split("|").map((s) => s.trim()).filter(Boolean),
                test_params: {},
                endpoint_tags: (sib as any).endpoint_tags || "",
                response_type: (sib as any).response_type || "mixed",
                supported_intents: (sib as any).supported_intents || "DATA",
            })),
            sidebar_icon: integration.sidebar_icon ?? "✨",
            sidebar_label: integration.sidebar_label ?? "",
            human_triggers: (integration as any).human_triggers || "",
        };
    }, [integration, siblings, groupName]);

    const [spec, setSpec] = useState<IntegrationSpec>(initialSpec);
    const [authHeaderName, setAuthHeaderName] = useState(
        (integration.api_config?.requiresAuth ? integration.api_config.headerName : undefined) ?? "Authorization"
    );
    const [authPrefix, setAuthPrefix] = useState("Bearer");
    const [authKey, setAuthKey] = useState(
        (integration.api_config?.requiresAuth ? integration.api_config.apiKey : undefined) ?? ""
    );
    const [status, setStatus] = useState<IntegrationStatus>(integration.status ?? "live");
    const [saving, setSaving] = useState(false);
    const [allowedBlocks, setAllowedBlocks] = useState<string[] | null>(
        integration.allowed_blocks ?? null
    );

    // Can't set "live" if auth is required but no key provided
    const canGoLive = spec.auth_method === "none" || authKey.trim().length > 0;

    // Detect changes
    const hasChanges = useMemo(() => {
        const origAuth = integration.api_config?.requiresAuth ? integration.api_config.authType ?? "bearer" : "none";
        const origKey = (integration.api_config?.requiresAuth ? integration.api_config.apiKey : undefined) ?? "";

        // Normalize placeholder icons for comparison
        const placeholders = new Set(["✨", "⚡", "❓", "", null, undefined]);
        const origIcon = integration.sidebar_icon;
        const newIcon = spec.sidebar_icon;
        const iconChanged = placeholders.has(origIcon as any) ? !placeholders.has(newIcon as any) : newIcon !== origIcon;

        if (spec.auth_method !== origAuth) return true;
        if (authKey !== origKey) return true;
        if (status !== (integration.status ?? "live")) return true;
        if (iconChanged) return true;
        if (spec.sidebar_label !== (integration.sidebar_label ?? "")) return true;

        // Check category change
        if ((spec.category || "data") !== ((integration as any).category || "data")) return true;

        // Check if allowed_blocks changed
        const origBlocks = JSON.stringify(integration.allowed_blocks ?? null);
        const newBlocks = JSON.stringify(allowedBlocks);
        if (origBlocks !== newBlocks) return true;

        return siblings.some((sib, i) => {
            const ep = spec.endpoints[i];
            if (!ep) return true;
            return (
                ep.name !== sib.name ||
                ep.path !== sib.api_endpoint ||
                ep.semantic_triggers.join(" | ") !== sib.intent_description ||
                (ep.endpoint_tags || "") !== ((sib as any).endpoint_tags || "") ||
                (ep.response_type || "mixed") !== ((sib as any).response_type || "mixed") ||
                (ep.supported_intents || "DATA") !== ((sib as any).supported_intents || "DATA")
            );
        });
    }, [spec, authKey, status, integration, siblings, allowedBlocks]);

    const handleSave = async () => {
        setSaving(true);
        const apiConfig = spec.auth_method === "none"
            ? { requiresAuth: false }
            : {
                requiresAuth: true,
                authType: spec.auth_method,
                ...(authKey ? { apiKey: authKey } : {}),
                ...(spec.auth_method === "apikey" && authHeaderName ? { headerName: authHeaderName } : {}),
            };

        for (let i = 0; i < siblings.length; i++) {
            const sib = siblings[i];
            const ep = spec.endpoints[i];
            if (!ep) continue;
            await onSave(sib.id, {
                ...(ep.name !== sib.name ? { name: ep.name } : {}),
                api_endpoint: ep.path,
                intent_description: ep.semantic_triggers.join(" | "),
                api_config: apiConfig,
                sidebar_icon: spec.sidebar_icon || null,
                sidebar_label: spec.sidebar_label || null,
                status: status as any,
                allowed_blocks: allowedBlocks,
                category: spec.category || "data",
                description: spec.description || null,
                human_triggers: spec.human_triggers || null,
                endpoint_tags: ep.endpoint_tags || null,
                response_type: ep.response_type || "mixed",
                supported_intents: ep.supported_intents || "DATA",
            } as any);
        }
        setSaving(false);
        onClose();
    };

    return (
        <Fade in timeout={200}>
            <Box sx={{ animation: "fadeInUp 0.3s ease-out" }}>
                {/* Header */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h5" sx={gradientTitleSx()}>
                            {groupName ?? integration.name.replace("Widget", "")}
                        </Typography>
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary }}>
                            {siblings.length > 1
                                ? `${siblings.length} endpoints in this integration`
                                : "Edit integration configuration"}
                        </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        {/* Status Selector */}
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel sx={{ color: COLORS.textMuted, fontSize: "0.8rem" }}>Status</InputLabel>
                            <Select
                                value={status}
                                label="Status"
                                onChange={(e) => {
                                    const val = e.target.value as IntegrationStatus;
                                    if (val === "live" && !canGoLive) return;
                                    setStatus(val);
                                }}
                                sx={{
                                    color: COLORS.textPrimary,
                                    fontSize: "0.85rem",
                                    bgcolor: "rgba(0, 0, 0, 0.2)",
                                    "& .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.border },
                                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: COLORS.accent },
                                    "& .MuiSvgIcon-root": { color: COLORS.textMuted },
                                }}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            bgcolor: COLORS.surface,
                                            border: `1px solid ${COLORS.border}`,
                                        },
                                    },
                                }}
                            >
                                {STATUS_OPTIONS.map((opt) => {
                                    const disabled = opt.value === "live" && !canGoLive;
                                    return (
                                        <MenuItem
                                            key={opt.value}
                                            value={opt.value}
                                            disabled={disabled}
                                            sx={{
                                                color: disabled ? "rgba(255,255,255,0.3)" : COLORS.textPrimary,
                                                fontSize: "0.85rem",
                                                "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
                                            }}
                                        >
                                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                <Box sx={{
                                                    width: 8, height: 8, borderRadius: "50%",
                                                    bgcolor: opt.color,
                                                    boxShadow: `0 0 6px ${opt.color}40`,
                                                }} />
                                                {opt.label}
                                                {disabled && " (key needed)"}
                                            </Box>
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>
                        {hasChanges ? (
                            <GradientButton onClick={handleSave} loading={saving} sx={{ minWidth: 120 }}>
                                Save
                            </GradientButton>
                        ) : (
                            <GhostButton disabled sx={{ minWidth: 120, opacity: 0.4 }}>
                                No Changes
                            </GhostButton>
                        )}
                        <CloseButton onClick={onClose} />
                    </Box>
                </Box>

                {/* ═══ Health Warning Banner ═══ */}
                {(() => {
                    // Collect health issues from all siblings in this group
                    const issues = siblings
                        .filter((sib) => {
                            return sib.health_status === "degraded" || sib.health_status === "offline";
                        })
                        .map((sib) => ({
                            name: sib.name,
                            api_endpoint: sib.api_endpoint,
                            health_status: sib.health_status!,
                            health_message: sib.health_message ?? null,
                            health_checked_at: sib.health_checked_at ?? null,
                        }));

                    if (issues.length === 0) return null;

                    return (
                        <Alert
                            severity={issues.some(i => i.health_status === "offline") ? "error" : "warning"}
                            sx={{
                                mb: 2,
                                bgcolor: issues.some(i => i.health_status === "offline")
                                    ? "rgba(255, 50, 50, 0.08)"
                                    : "rgba(255, 179, 0, 0.08)",
                                color: COLORS.textPrimary,
                                border: `1px solid ${issues.some(i => i.health_status === "offline")
                                    ? "rgba(255, 50, 50, 0.2)"
                                    : "rgba(255, 179, 0, 0.2)"}`,
                                borderRadius: 2,
                                "& .MuiAlert-icon": {
                                    color: issues.some(i => i.health_status === "offline") ? "#ff5252" : "#ffb300",
                                },
                            }}
                        >
                            <Typography sx={{ fontWeight: 700, fontSize: "0.85rem", mb: 0.5 }}>
                                ⚠️ API Health Issues
                            </Typography>
                            {issues.map((issue, idx) => (
                                <Box key={idx} sx={{ ml: 1, mb: 0.5 }}>
                                    <Typography sx={{ fontSize: "0.78rem", color: COLORS.textSecondary }}>
                                        <b style={{ color: issue.health_status === "offline" ? "#ff5252" : "#ffb300" }}>
                                            {issue.health_status === "offline" ? "🔴" : "🟡"} {issue.name}
                                        </b>
                                        {issue.health_message && (
                                            <span> — {issue.health_message}</span>
                                        )}
                                    </Typography>
                                    <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted }}>
                                        Endpoint: {issue.api_endpoint}
                                        {issue.health_checked_at && (
                                            <> · Checked: {new Date(issue.health_checked_at).toLocaleString("de-DE")}</>
                                        )}
                                    </Typography>
                                </Box>
                            ))}
                        </Alert>
                    );
                })()}

                {/* Same IntegrationReviewPanel as create views */}
                <IntegrationReviewPanel
                    spec={spec}
                    onSpecChange={setSpec}
                    authHeaderName={authHeaderName}
                    authPrefix={authPrefix}
                    authKey={authKey}
                    onAuthHeaderNameChange={setAuthHeaderName}
                    onAuthPrefixChange={setAuthPrefix}
                    onAuthKeyChange={setAuthKey}
                    onSave={handleSave}
                    saving={saving}
                    saveDisabled={!hasChanges}
                    showTestButtons={false}
                    showDocsUrl={false}
                    showHumanTriggers={true}
                    showAddEndpoint={false}
                    rightFooter={<></>}
                />

                {/* ═══ Block Picker ═══ */}
                <Box sx={{ mt: 2.5 }}>
                    <BlockPicker
                        selectedBlocks={allowedBlocks}
                        onChange={setAllowedBlocks}
                        endpoints={siblings.map((sib) => ({
                            name: sib.name,
                            path: sib.api_endpoint,
                            intent_description: sib.intent_description,
                            response_type: (sib as any).response_type ?? undefined,
                            endpoint_tags: (sib as any).endpoint_tags ?? undefined,
                        }))}
                    />
                </Box>
            </Box>
        </Fade>
    );
});
