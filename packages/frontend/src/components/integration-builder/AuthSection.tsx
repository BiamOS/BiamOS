// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Auth Section (Shared Sub-Component)
// ============================================================
// Auth type selector + conditional credential fields.
// Used by both ManualForm (create) and EditPanel (edit).
// ============================================================

import {
    Box,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Divider,
    Alert,
} from "@mui/material";
import { COLORS, inputSx, sectionLabelSx } from "../ui/SharedUI";

export type AuthType = "none" | "apikey" | "bearer" | "oauth2" | "basic";

interface AuthSectionProps {
    authType: AuthType;
    authHeaderName: string;
    authPrefix: string;
    authKey: string;
    onChangeAuthType: (v: AuthType) => void;
    onChangeHeaderName: (v: string) => void;
    onChangePrefix: (v: string) => void;
    onChangeKey: (v: string) => void;
}

export function AuthSection({
    authType,
    authHeaderName,
    authPrefix,
    authKey,
    onChangeAuthType,
    onChangeHeaderName,
    onChangePrefix,
    onChangeKey,
}: AuthSectionProps) {
    return (
        <>

            <FormControl size="small" fullWidth>
                <InputLabel sx={{ color: COLORS.textSecondary }}>Auth Type</InputLabel>
                <Select
                    value={authType}
                    label="Auth Type"
                    onChange={(e) => onChangeAuthType(e.target.value as AuthType)}
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

            {authType !== "none" && (
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                    }}
                >
                    {authType === "oauth2" && (
                        <Alert
                            severity="warning"
                            sx={{
                                bgcolor: "rgba(255, 180, 0, 0.08)",
                                color: "#ffb400",
                                border: "1px solid rgba(255, 180, 0, 0.2)",
                                borderRadius: 2,
                                fontSize: "0.75rem",
                            }}
                        >
                            Authentication required. Tests will fail without authentication.
                        </Alert>
                    )}

                    <Box sx={{ display: "flex", gap: 2 }}>
                        <TextField
                            label="Header Name"
                            value={authHeaderName}
                            onChange={(e) => onChangeHeaderName(e.target.value)}
                            size="small"
                            fullWidth
                            sx={inputSx}
                            helperText="e.g. Authorization, X-API-Key"
                        />
                        {authType === "bearer" && (
                            <TextField
                                label="Prefix"
                                value={authPrefix}
                                onChange={(e) => onChangePrefix(e.target.value)}
                                size="small"
                                sx={{ ...inputSx, minWidth: 120 }}
                                helperText="e.g. Bearer"
                            />
                        )}
                    </Box>
                    <TextField
                        label={
                            authType === "bearer" ? "Token" :
                                authType === "apikey" ? "API Key" :
                                    authType === "oauth2" ? "Access Token" :
                                        "Credentials"
                        }
                        placeholder={
                            authType === "bearer" ? "sk-xxxx..." :
                                authType === "apikey" ? "your-api-key" :
                                    authType === "basic" ? "user:password" : "token"
                        }
                        value={authKey}
                        onChange={(e) => onChangeKey(e.target.value)}
                        size="small"
                        type="password"
                        fullWidth
                        sx={inputSx}
                    />
                </Box>
            )}
        </>
    );
}
