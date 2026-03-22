// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — integration Builder Shared Types & Styles
// ============================================================

import { COLORS, GRADIENTS } from "../ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

export interface EndpointSpec {
    name: string;
    method: string;
    path: string;
    semantic_triggers: string[];
    test_params?: Record<string, string>;
    param_schema?: Array<{ name: string; in: string; required?: boolean; description?: string }>;
    endpoint_tags?: string;
    response_type?: string;
    supported_intents?: string;
}

export interface IntegrationSpec {
    integration_name: string;
    description?: string;
    category?: string;
    auth_method: string;
    base_url: string;
    docs_url?: string;
    endpoints: EndpointSpec[];
    sidebar_icon: string;
    sidebar_label: string;
    human_triggers?: string;
    allowed_blocks?: string[];
}

export type CreationMode = "manual" | "ai" | "swagger";
export type BuilderStep = "search" | "review" | "done";

export interface EndpointBuildStatus {
    [key: string]: "idle" | "building" | "done" | "error";
}

export interface CapsuleBuilderProps {
    onClose?: () => void;
    onCreated?: () => void;
}

export interface EndpointEntry {
    name: string;
    method: string;
    path: string;
    triggers: string[];
    body_schema?: { name: string; type: string; required: boolean; description?: string }[];
}

export const emptyEndpoint = (): EndpointEntry => ({
    name: "",
    method: "GET",
    path: "",
    triggers: [],
});

// ─── Shared Styles ──────────────────────────────────────────

export const methodColors: Record<string, string> = {
    GET: "#00dc64",
    POST: "#FF3399",
    PUT: "#ffb400",
    DELETE: "#ff6b6b",
    PATCH: "#b48cff",
};

export const toggleSx = {
    "& .MuiToggleButton-root": {
        textTransform: "none" as const,
        fontWeight: 600,
        color: COLORS.textSecondary,
        borderColor: COLORS.border,
        px: 3,
        py: 1,
        "&.Mui-selected": {
            background: GRADIENTS.primary,
            color: "#fff",
            borderColor: "transparent",
            "&:hover": { background: GRADIENTS.primaryHover },
        },
        "&:hover": { bgcolor: COLORS.surface },
    },
};
