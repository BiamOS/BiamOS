// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Error Boundary
// ============================================================
// Catches React rendering errors in child components.
// Instead of crashing the entire app, shows a friendly
// fallback UI and logs the error.
// ============================================================

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";
import { WarningAmber as WarningIcon } from "@mui/icons-material";

// ─── Types ──────────────────────────────────────────────────

interface Props {
    children: ReactNode;
    /** What area this wraps, shown in error message */
    label?: string;
    /** Compact mode for inline blocks (no padding/border) */
    compact?: boolean;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

// ─── Component ──────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            `[BiamOS] Error in ${this.props.label ?? "component"}:`,
            error,
            info.componentStack
        );
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { label, compact } = this.props;
        const errorMsg = this.state.error?.message ?? "Unknown error";

        // Compact mode: inline block error (used inside layout grid)
        if (compact) {
            return (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: "rgba(255, 82, 82, 0.08)",
                        border: "1px solid rgba(255, 82, 82, 0.2)",
                    }}
                >
                    <WarningIcon sx={{ color: "#ff5252", fontSize: 18 }} />
                    <Typography variant="caption" sx={{ color: "#ff8a80" }}>
                        {label ? `${label}: ` : ""}Block error
                    </Typography>
                    <Button
                        size="small"
                        onClick={this.handleRetry}
                        sx={{
                            ml: "auto",
                            minWidth: "auto",
                            fontSize: "0.7rem",
                            color: "#ff8a80",
                            textTransform: "none",
                        }}
                    >
                        Retry
                    </Button>
                </Box>
            );
        }

        // Full mode: panel-level error (used for settings tabs)
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    p: 4,
                    borderRadius: 2,
                    bgcolor: "rgba(255, 82, 82, 0.06)",
                    border: "1px solid rgba(255, 82, 82, 0.15)",
                    minHeight: 200,
                }}
            >
                <WarningIcon sx={{ color: "#ff5252", fontSize: 40 }} />
                <Typography
                    variant="h6"
                    sx={{ color: "#ff8a80", fontWeight: 600 }}
                >
                    {label ? `${label} — Error` : "Something went wrong"}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{
                        color: "rgba(255, 255, 255, 0.5)",
                        maxWidth: 400,
                        textAlign: "center",
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                    }}
                >
                    {errorMsg}
                </Typography>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={this.handleRetry}
                    sx={{
                        borderColor: "rgba(255, 82, 82, 0.3)",
                        color: "#ff8a80",
                        textTransform: "none",
                        "&:hover": {
                            borderColor: "rgba(255, 82, 82, 0.5)",
                            bgcolor: "rgba(255, 82, 82, 0.08)",
                        },
                    }}
                >
                    Try Again
                </Button>
            </Box>
        );
    }
}
