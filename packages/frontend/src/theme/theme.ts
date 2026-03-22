// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Theme & Design Tokens (SINGLE SOURCE OF TRUTH)
// ============================================================
// The "Magenta Pro" Apple Clean Aesthetic.
// Pure Blacks, Asphalt Grays, and exactly ONE Accent Color.
// ============================================================

import { createTheme } from "@mui/material";

// ============================================================
// Design Tokens
// ============================================================

export const COLORS = {
    // ─── Brand (Apple Pro Dark × Magenta) ──────
    accent: "#DC0070",          // Lura Magenta — single accent
    accentDark: "#A30053",      // Hover / pressed state
    accentLight: "#FF3399",     // Highlight / glow
    green: "#30D158",           // Apple system green
    red: "#FF453A",             // Apple system red
    yellow: "#FFD60A",          // Apple system yellow

    // ─── Text (Apple typography) ────────────────
    textPrimary: "#F5F5F7",     // Apple off-white (crisp)
    textSecondary: "#8E8E93",   // Apple secondary grey (asphalt)
    textMuted: "rgba(255, 255, 255, 0.35)",
    textFaint: "rgba(255, 255, 255, 0.15)",

    // ─── Surfaces (Apple Dark Mode) ─────────────
    bg: "#000000",              // Endless canvas — true black
    bgPaper: "#121212ff",         // Bento cards, panels — Apple Charcoal
    surface: "#2C2C2E",         // Elevated containers, hover states
    surfaceSubtle: "rgba(255, 255, 255, 0.03)",
    surfaceFaint: "rgba(255, 255, 255, 0.01)",
    surfaceDark: "rgba(0, 0, 0, 0.3)",
    surfaceGlass: "rgba(28, 28, 30, 0.65)", // Charcoal glass

    // ─── Borders ────────────────────────────────
    border: "#3A3A3C",          // Asphalt grey border
    borderFaint: "rgba(255, 255, 255, 0.06)",
    borderSubtle: "rgba(255, 255, 255, 0.04)",
    borderHover: "rgba(255, 255, 255, 0.20)",
    borderGlass: "rgba(255, 255, 255, 0.1)",
} as const;

/** Helper: accent (Magenta) with custom opacity */
export const accentAlpha = (opacity: number) => `rgba(220, 0, 112, ${opacity})`;

export const GRADIENTS = {
    primary: `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 100%)`,
    primaryHover: `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accentDark} 100%)`,
    accent: `linear-gradient(135deg, ${accentAlpha(0.8)}, ${accentAlpha(0.3)})`,
    card: "linear-gradient(135deg, rgba(28, 28, 30, 1) 0%, rgba(15, 15, 15, 1) 100%)",
    panel: "linear-gradient(135deg, rgba(28, 28, 30, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%)",
    title: `linear-gradient(135deg, #ffffff 0%, ${COLORS.textSecondary} 100%)`, // Clean silver gradient
} as const;

// ─── Apple-Style Shadows (layered for depth) ────────────────

export const SHADOWS = {
    sm: "0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)",
    md: "0 4px 12px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.3)",
    lg: "0 12px 32px rgba(0,0,0,0.5), 0 24px 64px rgba(0,0,0,0.4)",
    glow: (color: string, intensity = 0.15) => `0 0 20px rgba(${color}, ${intensity}), 0 0 40px rgba(${color}, ${intensity * 0.5})`,
} as const;

// ─── Glass Surface Presets ──────────────────────────────────

export const GLASS = {
    surface: {
        bgcolor: COLORS.surfaceGlass,
        backdropFilter: "blur(24px) saturate(1.2)",
        WebkitBackdropFilter: "blur(24px) saturate(1.2)",
        border: `1px solid ${COLORS.borderGlass}`,
        borderRadius: "12px",
    },
    card: {
        bgcolor: "rgba(28, 28, 30, 0.4)",
        backdropFilter: "blur(30px) saturate(1.5)",
        WebkitBackdropFilter: "blur(30px) saturate(1.5)",
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        borderRadius: "16px",
        boxShadow: SHADOWS.md,
    },
} as const;

// ============================================================
// V2 Chat Design Tokens (Professional Neutrals)
// ============================================================

export const CHAT_TOKENS = {
    light: {
        sidebarBg: '#FFFFFF',
        canvasBg: '#F5F5F7',
        cardBg: '#FFFFFF',
        userBubbleBg: COLORS.accent, // Brand consistency
        userBubbleText: '#FFFFFF',
        userBubbleRadius: '16px 16px 4px 16px',
        aiBubbleBg: '#F5F5F7',
        aiBubbleText: '#1D1D1F',
        aiBubbleRadius: '16px 16px 16px 4px',
        chatFontSize: '0.85rem',
        chatLineHeight: 1.5,
        chatFontWeight: 400,
        secondaryText: '#86868B',
        secondaryFontSize: '0.7rem',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        statusSuccess: COLORS.green,
        statusActive: COLORS.accent,
        statusWarning: COLORS.yellow,
        statusError: COLORS.red,
    },
    dark: {
        sidebarBg: COLORS.bgPaper,
        canvasBg: COLORS.bg,
        cardBg: COLORS.bgPaper,
        userBubbleBg: '#3A3A3C',    // Asphalt for user
        userBubbleText: '#FFFFFF',
        userBubbleRadius: '14px 14px 4px 14px',
        aiBubbleBg: 'transparent',  // Ultra-clean AI bubbles
        aiBubbleText: '#F5F5F7',
        aiBubbleRadius: '14px 14px 14px 4px',
        chatFontSize: '0.85rem',
        chatLineHeight: 1.6,
        chatFontWeight: 400,
        secondaryText: COLORS.textSecondary,
        secondaryFontSize: '0.7rem',
        border: `1px solid ${COLORS.border}`,
        statusSuccess: COLORS.green,
        statusActive: COLORS.accent,
        statusWarning: COLORS.yellow,
        statusError: COLORS.red,
    },
} as const;

export const getChatTokens = (mode: 'light' | 'dark' = 'dark') => CHAT_TOKENS[mode];

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
    `linear-gradient(135deg, ${COLORS.accentLight} 0%, ${COLORS.accent} 100%)`;

// ============================================================
// MUI Theme with Component Overrides
// ============================================================

export const theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: COLORS.accent,
            dark: COLORS.accentDark,
            light: COLORS.accentLight,
            contrastText: "#FFFFFF",
        },
        error: { main: COLORS.red },
        success: { main: COLORS.green },
        warning: { main: COLORS.yellow },
        background: { default: COLORS.bg, paper: COLORS.bgPaper },
        divider: COLORS.border,
        text: {
            primary: COLORS.textPrimary,
            secondary: COLORS.textSecondary,
            disabled: COLORS.textMuted,
        },
    },
    typography: {
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    shape: { borderRadius: 8 }, // Crisp Apple corners
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    fontWeight: 600, // Slightly less bold for elegance
                    letterSpacing: "-0.01em",
                    borderRadius: 8,
                    boxShadow: "none",
                    "&:hover": {
                        boxShadow: "none",
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    backgroundColor: COLORS.surface,
                    borderRadius: 8,
                    transition: "all 0.2s ease",
                    "& .MuiOutlinedInput-notchedOutline": {
                        borderColor: COLORS.border,
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                        borderColor: COLORS.textSecondary, // Asphalt hover
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                        borderColor: COLORS.accent, // Laser magenta focus
                        borderWidth: "1px",
                    },
                },
                input: {
                    color: COLORS.textPrimary,
                    fontSize: "0.85rem",
                    padding: "10px 14px",
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: { color: COLORS.textSecondary, fontSize: "0.85rem" },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    backgroundColor: COLORS.surface,
                    borderRadius: 8,
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                paper: {
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 10,
                    boxShadow: SHADOWS.md,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: COLORS.bgPaper,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16, // Apple standard for modals
                    boxShadow: SHADOWS.lg,
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    borderRadius: 6,
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.borderSubtle}`,
                },
            },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    alignItems: "center",
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: { borderColor: COLORS.border },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.textPrimary,
                    fontSize: "0.7rem",
                    fontWeight: 500,
                    borderRadius: 6,
                    boxShadow: SHADOWS.sm,
                },
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    color: COLORS.textSecondary,
                    transition: "color 0.2s ease, background-color 0.2s ease",
                    "&:hover": {
                        color: COLORS.textPrimary,
                        backgroundColor: COLORS.surfaceSubtle,
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
    bgcolor: COLORS.bg, // Force absolute black
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
    backdropFilter: "blur(24px) saturate(1.8)",
    WebkitBackdropFilter: "blur(24px) saturate(1.8)",
    bgcolor: "rgba(22, 22, 22, 0.75)", // Apple pure dark glass
    borderBottom: `1px solid ${COLORS.borderFaint}`,
};

export const errorAlertSx = {
    maxWidth: 600,
    mx: "auto",
    mb: 2,
    bgcolor: "rgba(255, 69, 58, 0.1)", // Apple Red alpha
    color: COLORS.red,
    border: `1px solid rgba(255, 69, 58, 0.2)`,
    borderRadius: 2,
    "& .MuiAlert-icon": { color: COLORS.red },
};

export const floatingSearchSx = {
    position: "relative" as const,
    zIndex: 50,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    width: "100%",
    backdropFilter: "blur(24px) saturate(1.8)",
    WebkitBackdropFilter: "blur(24px) saturate(1.8)",
    bgcolor: "rgba(0, 0, 0, 0.85)", // Apple pure dark glass
    borderBottom: `1px solid ${COLORS.borderFaint}`,
    px: 3,
    py: 1.5,
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    overflow: "hidden",
};

export const resizeHandleSx = {
    height: "100%",
};