// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Manual Creation Form (uses IntegrationReviewPanel)
// ============================================================

import { useState, useCallback } from "react";
import { Box, Alert } from "@mui/material";
import { COLORS } from "../ui/SharedUI";
import type { IntegrationSpec, EndpointSpec } from "./shared";
import { IntegrationReviewPanel, type EndpointStatus } from "./IntegrationReviewPanel";

const EMPTY_SPEC: IntegrationSpec = {
    integration_name: "",
    description: "",
    category: "data",
    auth_method: "none",
    base_url: "",
    docs_url: "",
    endpoints: [{ name: "", method: "GET", path: "", semantic_triggers: [], test_params: {} }],
    sidebar_icon: "✨",
    sidebar_label: "",
    human_triggers: "",
};

export function ManualForm({ onCreated, onClose }: { onCreated?: () => void; onClose?: () => void }) {
    const [spec, setSpec] = useState<IntegrationSpec>({ ...EMPTY_SPEC });
    const [authHeaderName, setAuthHeaderName] = useState("Authorization");
    const [authPrefix, setAuthPrefix] = useState("Bearer");
    const [authKey, setAuthKey] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [endpointStatus, setEndpointStatus] = useState<Record<string, EndpointStatus>>({});

    const validEndpoints = spec.endpoints.filter(
        (ep) => ep.name.trim() && ep.path.trim() && ep.semantic_triggers.length > 0
    );
    const canSave = spec.integration_name.trim() && spec.base_url.trim() && validEndpoints.length > 0;

    const handleSave = useCallback(async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: true, message: `🔨 Creating ${validEndpoints.length} endpoint${validEndpoints.length !== 1 ? "s" : ""}…` } }));

        const apiConfig = spec.auth_method === "none"
            ? { requiresAuth: false }
            : {
                requiresAuth: true,
                authType: spec.auth_method,
                authHeaderName: authHeaderName.trim() || "Authorization",
                authPrefix: spec.auth_method === "bearer" ? authPrefix : undefined,
                authKey: authKey.trim() || undefined,
            };

        let successCount = 0;
        for (const ep of validEndpoints) {
            setEndpointStatus((prev) => ({ ...prev, [ep.name]: { build: "building" } }));
            try {
                const fullUrl = `${spec.base_url.replace(/\/+$/, "")}${ep.path}`;
                const intentText = `${ep.name.trim()}: ${ep.semantic_triggers.join(" ")}`;
                const res = await fetch("/api/builder/build", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: ep.name.replace(/\s+/g, ""),
                        intent: intentText,
                        apiEndpoint: fullUrl,
                        method: ep.method,
                        triggers: ep.semantic_triggers,
                        groupName: spec.integration_name.trim(),
                        authMethod: spec.auth_method !== "none" ? spec.auth_method : undefined,
                        apiConfig,
                        sidebarIcon: spec.sidebar_icon || undefined,
                        sidebarLabel: spec.sidebar_label || undefined,
                        humanTriggers: spec.human_triggers || spec.integration_name,
                        apiTriggers: ep.semantic_triggers.join(", "),
                        endpointTags: ep.endpoint_tags || ep.semantic_triggers.join(", "),
                        responseType: ep.response_type || undefined,
                        supportedIntents: ep.supported_intents || undefined,
                        allowedBlocks: spec.allowed_blocks || undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok || data.action === "error") throw new Error(data.message ?? "Failed");
                setEndpointStatus((prev) => ({ ...prev, [ep.name]: { build: "done" } }));
                successCount++;
            } catch (err) {
                setEndpointStatus((prev) => ({ ...prev, [ep.name]: { build: "error" } }));
                setError(err instanceof Error ? `${ep.name}: ${err.message}` : "Creation failed");
            }
        }

        setSaving(false);
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: false, message: "" } }));
        if (successCount > 0) {
            window.dispatchEvent(new Event("biamos:integrations-changed"));
            setTimeout(() => onCreated?.(), 500);
        }
    }, [spec, authHeaderName, authPrefix, authKey, canSave, validEndpoints, onCreated]);

    return (
        <Box>
            {error && (
                <Alert
                    severity="error"
                    onClose={() => setError(null)}
                    sx={{
                        mb: 2,
                        bgcolor: "rgba(255, 50, 50, 0.08)",
                        color: COLORS.red,
                        border: "1px solid rgba(255, 50, 50, 0.2)",
                        borderRadius: 2,
                    }}
                >
                    {error}
                </Alert>
            )}
            <IntegrationReviewPanel
                spec={spec}
                onSpecChange={setSpec}
                authHeaderName={authHeaderName}
                authPrefix={authPrefix}
                authKey={authKey}
                onAuthHeaderNameChange={setAuthHeaderName}
                onAuthPrefixChange={setAuthPrefix}
                onAuthKeyChange={setAuthKey}
                endpointStatus={endpointStatus}
                onSave={handleSave}
                onCancel={onClose}
                saving={saving}
                saveLabel={`Create ${validEndpoints.length} Endpoint${validEndpoints.length !== 1 ? "s" : ""}`}
                saveDisabled={!canSave}
                showTestButtons={false}
                showDocsUrl={true}
                showHumanTriggers={true}
                showAddEndpoint={true}
            />
        </Box>
    );
}
