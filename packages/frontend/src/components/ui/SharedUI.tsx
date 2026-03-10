// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Shared UI Components & Presets
// ============================================================
// Reusable components + re-exports of design tokens.
// Import COLORS, GRADIENTS, accentAlpha from here.
// ============================================================

import React from "react";
import {
    Box,
    Button,
    IconButton,
    TextField,
    Tooltip,
    Typography,
    CircularProgress,
    type ButtonProps,
    type IconButtonProps,
    type TextFieldProps,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

// ─── Re-export tokens from theme (single source of truth) ───
export { COLORS, GRADIENTS, accentAlpha, cyanAlpha } from "../../theme/theme";
import { COLORS, GRADIENTS, accentAlpha } from "../../theme/theme";

// ============================================================
// Shared sx Presets
// ============================================================

export const inputSx = {
    "& .MuiOutlinedInput-root": {
        bgcolor: COLORS.surfaceDark,
        borderRadius: "4px",
        "& fieldset": { borderColor: COLORS.border },
        "&:hover fieldset": { borderColor: COLORS.borderHover },
        "&.Mui-focused fieldset": { borderColor: accentAlpha(0.6) },
    },
    "& .MuiInputLabel-root": { color: COLORS.textSecondary },
    "& .MuiInputBase-input": { color: COLORS.textPrimary, fontSize: "0.85rem" },
} as const;

export const sectionLabelSx = {
    color: COLORS.textSecondary,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    fontSize: "0.65rem",
    display: "block",
    mb: 0.5,
} as const;

export const panelSx = {
    p: 3,
    borderRadius: "6px",
    background: GRADIENTS.panel,
    border: `1px solid ${COLORS.border}`,
    backdropFilter: "blur(20px)",
} as const;

export const cardSx = {
    background: GRADIENTS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "6px",
    transition: "all 0.25s ease",
    "&:hover": {
        borderColor: COLORS.borderHover,
        transform: "translateY(-2px)",
        boxShadow: `0 8px 24px ${accentAlpha(0.1)}`,
    },
} as const;

export const rowSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    py: 1.5,
    px: 2,
    borderRadius: "4px",
    bgcolor: COLORS.surfaceSubtle,
    "&:hover": { bgcolor: accentAlpha(0.04) },
    transition: "background 0.2s",
} as const;

export const scrollbarSx = {
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-thumb": {
        bgcolor: accentAlpha(0.2),
        borderRadius: 2,
    },
    "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
} as const;

export const gradientTitleSx = (gradient: string = GRADIENTS.title): Record<string, unknown> => ({
    fontWeight: 800,
    background: gradient,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
});

/** Colored chip sx helper */
export const chipSx = (color: string, bgOpacity = 0.15) => ({
    bgcolor: color.startsWith("rgba") ? color : `${color}26`,
    color,
    fontWeight: 700,
    fontSize: "0.7rem",
});

// ============================================================
// SectionLabel Component (backward compat)
// ============================================================

export function SectionLabel({ text }: { text: string }) {
    return <Typography sx={{ ...sectionLabelSx, color: accentAlpha(0.9), fontWeight: 700, fontSize: "0.7rem" }}>{text}</Typography>;
}

// ============================================================
// Gradient Button (primary action)
// ============================================================

interface GradientButtonProps extends Omit<ButtonProps, "variant"> {
    loading?: boolean;
}

export const GradientButton = React.memo(function GradientButton({
    loading,
    disabled,
    children,
    sx,
    ...props
}: GradientButtonProps) {
    return (
        <Button
            variant="contained"
            disabled={disabled || loading}
            sx={{
                px: 3,
                background: disabled || loading ? undefined : GRADIENTS.primary,
                "&:hover": { background: GRADIENTS.primaryHover },
                "&.Mui-disabled": {
                    bgcolor: COLORS.surface,
                    color: COLORS.textMuted,
                },
                ...sx,
            }}
            {...props}
        >
            {loading ? <CircularProgress size={16} sx={{ color: "inherit", mr: 1 }} /> : null}
            {children}
        </Button>
    );
});

// ============================================================
// Ghost Button (secondary / cancel action)
// ============================================================

export const GhostButton = React.memo(function GhostButton({
    children,
    sx,
    ...props
}: ButtonProps) {
    return (
        <Button
            variant="text"
            sx={{
                color: COLORS.textSecondary,
                "&:hover": { color: COLORS.textPrimary, bgcolor: COLORS.surface },
                ...sx,
            }}
            {...props}
        >
            {children}
        </Button>
    );
});

// ============================================================
// Danger Button (delete actions)
// ============================================================

export const DangerButton = React.memo(function DangerButton({
    loading,
    disabled,
    children,
    sx,
    ...props
}: GradientButtonProps) {
    return (
        <Button
            variant="contained"
            disabled={disabled || loading}
            sx={{
                bgcolor: "rgba(255, 50, 50, 0.1)",
                color: COLORS.red,
                border: `1px solid rgba(255, 50, 50, 0.2)`,
                "&:hover": {
                    bgcolor: "rgba(255, 50, 50, 0.2)",
                    borderColor: "rgba(255, 50, 50, 0.4)",
                },
                "&.Mui-disabled": {
                    bgcolor: COLORS.surface,
                    color: COLORS.textMuted,
                },
                ...sx,
            }}
            {...props}
        >
            {loading ? <CircularProgress size={16} sx={{ color: "inherit", mr: 1 }} /> : null}
            {children}
        </Button>
    );
});

// ============================================================
// Action Icon Button (small icon actions)
// ============================================================

interface ActionIconProps extends Omit<IconButtonProps, "color"> {
    tooltip: string;
    hoverColor?: string;
}

export const ActionIcon = React.memo(function ActionIcon({
    tooltip,
    hoverColor = accentAlpha(0.8),
    children,
    sx,
    ...props
}: ActionIconProps) {
    return (
        <Tooltip title={tooltip}>
            <IconButton
                size="small"
                sx={{
                    color: COLORS.textSecondary,
                    "&:hover": { color: hoverColor },
                    ...sx,
                }}
                {...props}
            >
                {children}
            </IconButton>
        </Tooltip>
    );
});

// ============================================================
// Close Button (X button for panels)
// ============================================================

export const CloseButton = React.memo(function CloseButton({
    onClick,
    sx,
    ...props
}: Omit<IconButtonProps, "children">) {
    return (
        <IconButton
            onClick={onClick}
            sx={{
                color: COLORS.textSecondary,
                "&:hover": { color: COLORS.textPrimary },
                ...sx,
            }}
            {...props}
        >
            <CloseIcon />
        </IconButton>
    );
});

// ============================================================
// Styled TextField (same style everywhere)
// ============================================================

export const StyledTextField = React.memo(
    React.forwardRef<HTMLInputElement, TextFieldProps>(function StyledTextField(props, ref) {
        return <TextField inputRef={ref} sx={{ ...inputSx, ...props.sx }} {...props} />;
    })
);

// ============================================================
// Error Alert Preset (replaces 12+ duplicate patterns)
// ============================================================

export const errorAlertSx = {
    mb: 2,
    bgcolor: "rgba(255, 50, 50, 0.08)",
    color: COLORS.red,
    border: "1px solid rgba(255, 50, 50, 0.2)",
    borderRadius: "4px",
    "& .MuiAlert-icon": { color: COLORS.red },
};

// ============================================================
// Loading Spinner (centered, replaces 19 duplicate patterns)
// ============================================================

interface LoadingSpinnerProps {
    /** Vertical padding (MUI spacing), default 8 */
    py?: number;
    /** Optional label below spinner */
    label?: string;
}

export const LoadingSpinner = React.memo(function LoadingSpinner({
    py = 8,
    label,
}: LoadingSpinnerProps) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py, gap: 1.5 }}>
            <CircularProgress size={28} sx={{ color: COLORS.accent }} />
            {label && (
                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: "0.7rem" }}>
                    {label}
                </Typography>
            )}
        </Box>
    );
});

// ============================================================
// Status Dot (health/connectivity indicator)
// ============================================================

const STATUS_COLORS: Record<string, string> = {
    healthy: "#00dc64",
    online: "#00dc64",
    degraded: "#ffb400",
    checking: "#ffb400",
    offline: "#ff5050",
    error: "#ff5050",
    unknown: "rgba(255, 255, 255, 0.25)",
};

interface StatusDotProps {
    status: string;
    /** Size in px, default 8 */
    size?: number;
    /** Show pulsing animation for transitional states */
    pulse?: boolean;
}

export const StatusDot = React.memo(function StatusDot({
    status,
    size = 8,
    pulse,
}: StatusDotProps) {
    const color = STATUS_COLORS[status] ?? STATUS_COLORS.unknown;
    const shouldPulse = pulse ?? (status === "checking" || status === "degraded");
    return (
        <Box
            sx={{
                width: size,
                height: size,
                borderRadius: "50%",
                bgcolor: color,
                boxShadow: `0 0 ${size}px ${color}`,
                flexShrink: 0,
                ...(shouldPulse ? {
                    animation: "statusPulse 1.5s ease-in-out infinite",
                    "@keyframes statusPulse": {
                        "0%, 100%": { opacity: 0.5, transform: "scale(0.9)" },
                        "50%": { opacity: 1, transform: "scale(1.1)" },
                    },
                } : undefined),
            }}
        />
    );
});

// ============================================================
// Empty State (center-dashed placeholder)
// ============================================================

interface EmptyStateProps {
    /** Large emoji or icon string */
    icon?: string;
    title: string;
    subtitle?: string;
    /** CTA button label */
    actionLabel?: string;
    /** CTA click handler */
    onAction?: () => void;
}

export const EmptyState = React.memo(function EmptyState({
    icon = "📭",
    title,
    subtitle,
    actionLabel,
    onAction,
}: EmptyStateProps) {
    return (
        <Box sx={{ textAlign: "center", py: 6 }}>
            <Typography sx={{ fontSize: "3rem", mb: 1, opacity: 0.4 }}>
                {icon}
            </Typography>
            <Typography variant="h6" sx={{ color: COLORS.textSecondary, fontWeight: 600, mb: 0.5 }}>
                {title}
            </Typography>
            {subtitle && (
                <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 2 }}>
                    {subtitle}
                </Typography>
            )}
            {actionLabel && onAction && (
                <GradientButton onClick={onAction} size="small">
                    {actionLabel}
                </GradientButton>
            )}
        </Box>
    );
});
