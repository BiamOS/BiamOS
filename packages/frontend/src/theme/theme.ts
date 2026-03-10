// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Theme & Design Tokens (SINGLE SOURCE OF TRUTH)
// ============================================================
// All colors, gradients, spacing, and MUI overrides live here.
// Import tokens from here or via SharedUI re-exports.
// ============================================================

import { createTheme } from "@mui/material";

// ============================================================
// Design Tokens
// ============================================================

export const COLORS = {
    // ─── Brand ─────────────────────────────────
    accent: "#581cff",
    cyan: "#00c8ff",
    green: "#00dc64",
    red: "#ff6b6b",

    // ─── Text ──────────────────────────────────
    textPrimary: "rgba(255, 255, 255, 0.9)",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    textMuted: "rgba(255, 255, 255, 0.4)",
    textFaint: "rgba(255, 255, 255, 0.2)",

    // ─── Surfaces ──────────────────────────────
    bg: "#0a0a0f",
    bgPaper: "#12121a",
    surface: "rgba(255, 255, 255, 0.03)",
    surfaceSubtle: "rgba(255, 255, 255, 0.02)",
    surfaceFaint: "rgba(255, 255, 255, 0.01)",
    surfaceDark: "rgba(0, 0, 0, 0.2)",
    surfaceGlass: "rgba(255, 255, 255, 0.04)",
    surfaceElevated: "rgba(255, 255, 255, 0.05)",

    // ─── Borders ───────────────────────────────
    border: "rgba(255, 255, 255, 0.06)",
    borderFaint: "rgba(255, 255, 255, 0.06)",
    borderSubtle: "rgba(255, 255, 255, 0.04)",
    borderHover: "rgba(88, 28, 255, 0.3)",
    borderGlass: "rgba(255, 255, 255, 0.08)",
} as const;

/** Helper: accent color with custom opacity */
export const accentAlpha = (opacity: number) => `rgba(88, 28, 255, ${opacity})`;

/** Helper: cyan brand color with custom opacity */
export const cyanAlpha = (opacity: number) => `rgba(0, 200, 255, ${opacity})`;

export const GRADIENTS = {
    primary: "linear-gradient(135deg, #581cff 0%, #00c8ff 100%)",
    primaryHover: "linear-gradient(135deg, #6b33ff 0%, #33d4ff 100%)",
    accent: `linear-gradient(135deg, ${accentAlpha(0.8)}, ${cyanAlpha(0.8)})`,
    card: "linear-gradient(135deg, rgba(25, 25, 50, 0.95) 0%, rgba(12, 12, 30, 0.98) 100%)",
    panel: "linear-gradient(135deg, rgba(30, 30, 60, 0.9) 0%, rgba(15, 15, 35, 0.95) 100%)",
    title: `linear-gradient(135deg, #fff 0%, ${accentAlpha(0.8)} 100%)`,
    titleCyan: `linear-gradient(135deg, #fff 0%, ${cyanAlpha(0.8)} 100%)`,
    titleSoft: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 100%)",
} as const;

// ─── Apple-Style Shadows (layered for depth) ────────────────

export const SHADOWS = {
    sm: "0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15)",
    md: "0 2px 8px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)",
    lg: "0 4px 16px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.25), 0 16px 48px rgba(0,0,0,0.15)",
    glow: (color: string, intensity = 0.15) => `0 0 20px rgba(${color}, ${intensity}), 0 0 40px rgba(${color}, ${intensity * 0.5})`,
} as const;

// ─── Glass Surface Presets ──────────────────────────────────

export const GLASS = {
    surface: {
        bgcolor: COLORS.surfaceGlass,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${COLORS.borderGlass}`,
        borderRadius: "16px",
    },
    card: {
        bgcolor: "rgba(255, 255, 255, 0.03)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid rgba(255, 255, 255, 0.06)`,
        borderRadius: "20px",
        boxShadow: SHADOWS.md,
    },
    subtle: {
        bgcolor: "rgba(255, 255, 255, 0.02)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid rgba(255, 255, 255, 0.04)`,
        borderRadius: "14px",
    },
} as const;

// ============================================================
// App Constants
// ============================================================

export const INTENT_API_URL = "/api/intent";

export const GRID_COLS = { lg: 12, md: 8, sm: 4, xs: 2 } as const;
export const GRID_BREAKPOINTS = { lg: 1200, md: 900, sm: 600, xs: 0 } as const;
export const GRID_MARGIN: [number, number] = [12, 12];
export const GRID_PADDING: [number, number] = [0, 0];
export const ROW_HEIGHT = 30;
export const CARD_CONSTRAINTS = { minW: 2, minH: 4, maxW: 12 };

export const LOGO_GRADIENT =
    `linear-gradient(135deg, #fff 0%, ${accentAlpha(0.8)} 50%, ${cyanAlpha(0.8)} 100%)`;

// ============================================================
// MUI Theme with Component Overrides
// ============================================================

export const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: COLORS.accent },
        secondary: { main: COLORS.cyan },
        error: { main: COLORS.red },
        success: { main: COLORS.green },
        background: { default: COLORS.bg, paper: COLORS.bgPaper },
        text: {
            primary: COLORS.textPrimary,
            secondary: COLORS.textSecondary,
            disabled: COLORS.textMuted,
        },
    },
    typography: {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    shape: { borderRadius: 6 },
    components: {
        // ─── Button ─────────────────────────────
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none" as const,
                    fontWeight: 700,
                    borderRadius: 8,
                },
            },
        },
        // ─── TextField / OutlinedInput ──────────
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    backgroundColor: COLORS.surfaceDark,
                    borderRadius: 8,
                    "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: COLORS.border,
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: COLORS.borderHover,
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: accentAlpha(0.6),
                    },
                },
                input: {
                    color: COLORS.textPrimary,
                    fontSize: "0.85rem",
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: { color: COLORS.textSecondary },
            },
        },
        // ─── Select ─────────────────────────────
        MuiSelect: {
            styleOverrides: {
                root: {
                    backgroundColor: COLORS.surfaceDark,
                    borderRadius: 8,
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                paper: {
                    backgroundColor: COLORS.bgPaper,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                },
            },
        },
        // ─── Dialog ─────────────────────────────
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: COLORS.bgPaper,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 12,
                },
            },
        },
        // ─── Chip ───────────────────────────────
        MuiChip: {
            styleOverrides: {
                root: {
                    fontWeight: 700,
                    fontSize: "0.7rem",
                    borderRadius: 6,
                },
            },
        },
        // ─── Alert ──────────────────────────────
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                },
            },
        },
        // ─── Divider ────────────────────────────
        MuiDivider: {
            styleOverrides: {
                root: {
                    borderColor: COLORS.border,
                },
            },
        },
        // ─── Tooltip ────────────────────────────
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: COLORS.bgPaper,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary,
                    fontSize: "0.75rem",
                    borderRadius: 6,
                },
            },
        },
        // ─── Icon Button ────────────────────────
        MuiIconButton: {
            styleOverrides: {
                root: {
                    color: COLORS.textSecondary,
                    "&:hover": {
                        color: COLORS.textPrimary,
                    },
                },
            },
        },
    },
});

// ============================================================
// Shared sx Presets (hoisted, never re-created)
// ============================================================

export const rootSx = {
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    position: "relative" as const,
    overflow: "hidden",
    zIndex: 1,
};

export const topBarSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    px: 3,
    py: 1.5,
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
    backdropFilter: "blur(20px)",
    bgcolor: "rgba(10, 10, 15, 0.7)",
    borderBottom: `1px solid ${COLORS.border}`,
};

export const errorAlertSx = {
    maxWidth: 600,
    mx: "auto",
    mb: 2,
    bgcolor: "rgba(255, 50, 50, 0.08)",
    color: COLORS.red,
    border: "1px solid rgba(255, 50, 50, 0.2)",
    borderRadius: 3,
    "& .MuiAlert-icon": { color: COLORS.red },
};

export const floatingSearchSx = {
    position: "fixed" as const,
    bottom: 20,
    left: "50%",
    zIndex: 100,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    maxWidth: 640,
    width: "90%",
};

export const resizeHandleSx = {
    height: "100%",
};
