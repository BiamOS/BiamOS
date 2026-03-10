// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — AI Discovery Flow (uses IntegrationReviewPanel)
// ============================================================

import { useState, useCallback } from "react";
import {
    Box,
    Typography,
    TextField,
    Alert,
    Chip,
} from "@mui/material";
import {
    AutoAwesome as MagicIcon,
    Rocket as GenerateIcon,
    CheckCircle as DoneIcon,
} from "@mui/icons-material";
import {
    GradientButton,
    GhostButton,
    COLORS,
    inputSx,
    accentAlpha,
} from "../ui/SharedUI";
import {
    type IntegrationSpec,
    type EndpointSpec,
    type BuilderStep,
} from "./shared";
import { IntegrationReviewPanel, type EndpointStatus } from "./IntegrationReviewPanel";

export function AIFlow({ onCreated, onClose }: { onCreated?: () => void; onClose?: () => void }) {
    const [step, setStep] = useState<BuilderStep>("search");
    const [toolName, setToolName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spec, setSpec] = useState<IntegrationSpec | null>(null);
    const [endpointStatus, setEndpointStatus] = useState<Record<string, EndpointStatus>>({});
    const [lastTestError, setLastTestError] = useState<Record<string, any>>({});

    // Auth credential state
    const [authHeaderName, setAuthHeaderName] = useState("Authorization");
    const [authPrefix, setAuthPrefix] = useState("Bearer");
    const [authKey, setAuthKey] = useState("");

    // ─── Magic Fill ──────────────────────────────────────────

    const handleMagicFill = useCallback(async () => {
        if (!toolName.trim()) return;
        setIsLoading(true);
        setError(null);
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: true, message: "🤖 AI is analyzing the API…" } }));
        try {
            const res = await fetch("/api/builder/magic-fill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tool_name: toolName.trim() }),
            });
            const data = await res.json();
            if (!res.ok || data.action === "error") throw new Error(data.message ?? "Magic Fill failed");

            const rawAuth = (data.spec.auth_type || "none").toLowerCase();
            const authMethod = rawAuth.includes("bearer") ? "bearer"
                : rawAuth.includes("api") ? "apikey"
                    : rawAuth.includes("oauth") ? "oauth2"
                        : rawAuth.includes("basic") ? "basic"
                            : "none";

            setSpec({
                ...data.spec,
                auth_method: authMethod,
                sidebar_icon: data.spec.sidebar_icon || "✨",
                sidebar_label: data.spec.sidebar_label || data.spec.integration_name?.slice(0, 10) || "",
            });

            if (authMethod === "apikey") { setAuthHeaderName("Authorization"); setAuthPrefix(""); }
            else if (authMethod === "bearer") { setAuthHeaderName("Authorization"); setAuthPrefix("Bearer"); }

            setStep("review");

            // Init statuses
            const statuses: Record<string, EndpointStatus> = {};
            data.spec.endpoints.forEach((ep: EndpointSpec) => { statuses[ep.name] = {}; });
            setEndpointStatus(statuses);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error during Magic Fill");
        } finally {
            setIsLoading(false);
            window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: false, message: "" } }));
        }
    }, [toolName]);

    // ─── Build API Config ────────────────────────────────────

    const buildApiConfig = useCallback(() => {
        if (!spec || spec.auth_method === "none") return { requiresAuth: false };
        return {
            requiresAuth: true,
            authType: spec.auth_method,
            authHeaderName: authHeaderName.trim() || "Authorization",
            authPrefix: spec.auth_method === "bearer" ? authPrefix : undefined,
            authKey: authKey.trim() || undefined,
        };
    }, [spec, authHeaderName, authPrefix, authKey]);

    // ─── Test Endpoint ───────────────────────────────────────

    const handleTestEndpoint = useCallback(async (endpoint: EndpointSpec) => {
        if (!spec) return;
        setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], test: "testing" } }));
        try {
            const apiConfig = buildApiConfig();
            const res = await fetch("/api/builder/test-endpoint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    base_url: spec.base_url,
                    path: endpoint.path,
                    test_params: endpoint.test_params || {},
                    auth_config: apiConfig.requiresAuth ? apiConfig : undefined,
                }),
            });
            const data = await res.json();
            setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], test: data.pass ? "pass" : "fail" } }));
            if (!data.pass) {
                setLastTestError((prev) => ({ ...prev, [endpoint.name]: data }));
                setError(`${endpoint.name}: ${data.error || `HTTP ${data.status}`}`);
            } else {
                setLastTestError((prev) => { const n = { ...prev }; delete n[endpoint.name]; return n; });
            }
        } catch (err) {
            setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], test: "fail" } }));
            setError(`${endpoint.name}: ${err instanceof Error ? err.message : "Test failed"}`);
        }
    }, [spec, buildApiConfig]);

    // ─── Test All ────────────────────────────────────────────

    const handleTestAll = useCallback(async () => {
        if (!spec) return;
        setError(null);
        for (const ep of spec.endpoints) await handleTestEndpoint(ep);
    }, [spec, handleTestEndpoint]);

    // ─── Fix Endpoint ────────────────────────────────────────

    const handleFixEndpoint = useCallback(async (endpoint: EndpointSpec, index: number) => {
        if (!spec) return;
        setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], fix: "fixing" } }));
        setError(null);
        try {
            const res = await fetch("/api/builder/fix-endpoint", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endpoint,
                    base_url: spec.base_url,
                    docs_url: spec.docs_url,
                    error: lastTestError[endpoint.name] || { status: 0, error: "Unknown" },
                    integration_name: spec.integration_name,
                }),
            });
            const data = await res.json();
            if (data.fixed && data.endpoint) {
                const updated = [...spec.endpoints];
                updated[index] = {
                    ...updated[index],
                    path: data.endpoint.path || updated[index].path,
                    method: data.endpoint.method || updated[index].method,
                    test_params: data.endpoint.test_params || updated[index].test_params,
                    param_schema: data.endpoint.param_schema || updated[index].param_schema,
                };
                setSpec({ ...spec, endpoints: updated });
                setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], test: "idle", fix: "idle" } }));
                setTimeout(() => handleTestEndpoint(updated[index]), 300);
            } else {
                setError(`Fix failed: ${data.error || "Unknown error"}`);
            }
        } catch (err) {
            setError(`Fix failed: ${err instanceof Error ? err.message : "Error"}`);
        } finally {
            setEndpointStatus((prev) => ({ ...prev, [endpoint.name]: { ...prev[endpoint.name], fix: "idle" } }));
        }
    }, [spec, lastTestError, handleTestEndpoint]);

    // ─── Build All Endpoints ─────────────────────────────────

    const handleBuildAll = useCallback(async () => {
        if (!spec) return;
        const apiConfig = buildApiConfig();
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: true, message: `🔨 Building ${spec.endpoints.length} endpoints…` } }));
        for (const ep of spec.endpoints) {
            if (endpointStatus[ep.name]?.build === "done" || endpointStatus[ep.name]?.build === "building") continue;
            setEndpointStatus((prev) => ({ ...prev, [ep.name]: { ...prev[ep.name], build: "building" } }));
            try {
                const fullUrl = `${spec.base_url}${ep.path}`;
                const intentText = `${ep.name}: ${ep.semantic_triggers.join(" ")}`;
                const res = await fetch("/api/builder/build", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: ep.name.replace(/\s+/g, ""),
                        intent: intentText,
                        apiEndpoint: fullUrl,
                        triggers: ep.semantic_triggers,
                        groupName: spec.integration_name,
                        method: ep.method || "GET",
                        authMethod: spec.auth_method !== "none" ? spec.auth_method : undefined,
                        apiConfig,
                        sidebarIcon: spec.sidebar_icon || "✨",
                        sidebarLabel: spec.sidebar_label || spec.integration_name.slice(0, 10),
                        humanTriggers: spec.human_triggers || spec.integration_name,
                        apiTriggers: ep.semantic_triggers.join(", "),
                        paramSchema: ep.param_schema || undefined,
                        endpointTags: ep.endpoint_tags || ep.semantic_triggers.join(", "),
                        responseType: ep.response_type || undefined,
                        supportedIntents: ep.supported_intents || undefined,
                        allowedBlocks: spec.allowed_blocks || undefined,
                        description: spec.description || undefined,
                        category: spec.category || undefined,
                    }),
                });
                const data = await res.json();
                if (!res.ok || data.action === "error") throw new Error(data.message ?? "Generation failed");
                setEndpointStatus((prev) => ({ ...prev, [ep.name]: { ...prev[ep.name], build: "done" } }));
            } catch (err) {
                setEndpointStatus((prev) => ({ ...prev, [ep.name]: { ...prev[ep.name], build: "error" } }));
                setError(err instanceof Error ? `${ep.name}: ${err.message}` : "Generation failed");
            }
        }
        window.dispatchEvent(new CustomEvent("biamos:builder-loading", { detail: { loading: false, message: "" } }));
        window.dispatchEvent(new Event("biamos:integrations-changed"));
        setTimeout(() => onCreated?.(), 600);
    }, [spec, endpointStatus, buildApiConfig, onCreated]);

    // ─── Computed ────────────────────────────────────────────

    const allDone = spec ? spec.endpoints.every((ep) => endpointStatus[ep.name]?.build === "done") : false;
    const anyBuilding = spec ? spec.endpoints.some((ep) => endpointStatus[ep.name]?.build === "building") : false;
    const anyTesting = spec ? spec.endpoints.some((ep) => endpointStatus[ep.name]?.test === "testing") : false;
    const allTestsPassed = spec ? spec.endpoints.every((ep) => endpointStatus[ep.name]?.test === "pass") : false;

    // ─── Render ──────────────────────────────────────────────

    return (
        <Box sx={{ width: "100%" }}>
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

            {/* Step 1: Search */}
            {step === "search" && (
                <Box sx={{ textAlign: "center", py: 2 }}>
                    <Typography variant="h6" sx={{ color: "rgba(255, 255, 255, 0.7)", mb: 3, fontWeight: 400 }}>
                        Which service would you like to integrate?
                    </Typography>
                    <Box sx={{ display: "flex", gap: 2, maxWidth: 500, mx: "auto" }}>
                        <TextField
                            placeholder='e.g. "GitHub", "OpenRouter", "Gmail"'
                            value={toolName}
                            onChange={(e) => setToolName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleMagicFill()}
                            fullWidth
                            size="medium"
                            sx={inputSx}
                        />
                        <GradientButton
                            onClick={handleMagicFill}
                            loading={isLoading}
                            disabled={!toolName.trim()}
                            startIcon={!isLoading ? <MagicIcon /> : undefined}
                        >
                            {isLoading ? "Analyzing..." : "✨ Magic Setup"}
                        </GradientButton>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "center", mt: 3 }}>
                        {["GitHub", "Gmail", "Spotify", "OpenAI", "Stripe"].map((n) => (
                            <Chip
                                key={n}
                                label={n}
                                size="small"
                                onClick={() => setToolName(n)}
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
                </Box>
            )}

            {/* Step 2: Review — uses IntegrationReviewPanel */}
            {step === "review" && spec && (
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
                    onSave={handleBuildAll}
                    onTestEndpoint={(ep) => handleTestEndpoint(ep)}
                    onTestAll={handleTestAll}
                    onFixEndpoint={(ep, i) => handleFixEndpoint(ep, i)}
                    onBack={() => { setStep("search"); setSpec(null); setToolName(""); setError(null); setAuthKey(""); }}
                    saving={anyBuilding}
                    saveDisabled={allDone || anyBuilding || !allTestsPassed}
                    showTestButtons={true}
                    showDocsUrl={true}
                    showHumanTriggers={true}
                    showAddEndpoint={false}
                    rightFooter={
                        <>
                            {/* Test All Button */}
                            <GhostButton
                                onClick={handleTestAll}
                                disabled={anyTesting || allDone}
                                sx={{
                                    py: 1.2,
                                    mb: 1,
                                    border: allTestsPassed
                                        ? "1px solid rgba(0, 220, 100, 0.3)"
                                        : `1px solid ${COLORS.border}`,
                                    color: allTestsPassed ? "#00dc64" : COLORS.textSecondary,
                                }}
                            >
                                {anyTesting ? "🧪 Testing..." : allTestsPassed ? "✅ All Tests Passed" : "🧪 Test All Endpoints"}
                            </GhostButton>

                            {/* Build All Button */}
                            <GradientButton
                                onClick={handleBuildAll}
                                disabled={allDone || anyBuilding || !allTestsPassed}
                                loading={anyBuilding}
                                startIcon={allDone ? <DoneIcon /> : <GenerateIcon />}
                                fullWidth
                                sx={{
                                    py: 1.5,
                                    ...(allDone && {
                                        background: "rgba(0, 220, 100, 0.1)",
                                        color: "rgba(0, 220, 100, 0.9)",
                                        border: "1px solid rgba(0, 220, 100, 0.2)",
                                    }),
                                }}
                            >
                                {allDone ? `✓ All ${spec.endpoints.length} Built` : anyBuilding ? "Building..." : `🚀 Save & Build All ${spec.endpoints.length} Endpoints`}
                            </GradientButton>
                        </>
                    }
                />
            )}
        </Box>
    );
}
