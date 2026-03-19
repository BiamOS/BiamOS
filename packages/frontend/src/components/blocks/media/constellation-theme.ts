// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Constellation Theme (Design Token-based)
// ============================================================
// Node theme configuration for the Deep Research visualization.
// Uses COLORS/GRADIENTS tokens from the design system.
// ============================================================

import { COLORS, accentAlpha, cyanAlpha } from "../../../theme/theme";

// ─── Node Theme Config ──────────────────────────────────────

export interface NodeThemeEntry {
    icon: string;
    label: string;
    borderColor: string;
    glowColor: string;
    bgGradient: string;
    accentColor: string;
    badgeBg: string;
}

export const NODE_THEME: Record<string, NodeThemeEntry> = {
    nucleus: {
        icon: "🎯",
        label: "Task",
        borderColor: cyanAlpha(0.7),
        glowColor: `0 0 30px ${cyanAlpha(0.35)}, 0 0 60px ${cyanAlpha(0.12)}`,
        bgGradient: "linear-gradient(135deg, rgba(0, 20, 40, 0.97), rgba(0, 30, 50, 0.95))",
        accentColor: COLORS.cyan,
        badgeBg: cyanAlpha(0.15),
    },
    search: {
        icon: "🔍",
        label: "Web Search",
        borderColor: "rgba(100, 180, 255, 0.5)",
        glowColor: "0 0 20px rgba(100, 180, 255, 0.18)",
        bgGradient: "linear-gradient(135deg, rgba(8, 14, 35, 0.96), rgba(12, 22, 45, 0.94))",
        accentColor: "#64b4ff",
        badgeBg: "rgba(100, 180, 255, 0.12)",
    },
    note: {
        icon: "📝",
        label: "Extracted Data",
        borderColor: `rgba(0, 230, 140, 0.5)`,
        glowColor: "0 0 18px rgba(0, 230, 140, 0.15)",
        bgGradient: "linear-gradient(135deg, rgba(4, 22, 14, 0.96), rgba(6, 30, 20, 0.94))",
        accentColor: COLORS.green,
        badgeBg: "rgba(0, 230, 140, 0.12)",
    },
    navigate: {
        icon: "🌐",
        label: "Navigation",
        borderColor: "rgba(255, 190, 60, 0.5)",
        glowColor: "0 0 18px rgba(255, 190, 60, 0.15)",
        bgGradient: "linear-gradient(135deg, rgba(25, 18, 5, 0.96), rgba(30, 22, 8, 0.94))",
        accentColor: "#ffbe3c",
        badgeBg: "rgba(255, 190, 60, 0.12)",
    },
    genui: {
        icon: "✨",
        label: "Dashboard",
        borderColor: accentAlpha(0.6),
        glowColor: `0 0 25px ${accentAlpha(0.25)}, 0 0 50px ${accentAlpha(0.08)}`,
        bgGradient: "linear-gradient(135deg, rgba(18, 5, 30, 0.97), rgba(25, 8, 40, 0.95))",
        accentColor: COLORS.accent,
        badgeBg: accentAlpha(0.15),
    },
};

// ─── Multi-Tentacle Position Generator ──────────────────────

export const ARM_ANGLES: Record<string, number> = {
    search:   -60,   // upper-left
    note:     150,   // bottom-left
    navigate: 30,    // upper-right
    genui:    -30,   // top-right
};

export function generateTentaclePosition(
    type: string,
    indexInArm: number,
): { x: number; y: number } {
    const baseAngle = (ARM_ANGLES[type] ?? 0) * (Math.PI / 180);
    const spreadAngle = (indexInArm - 0.5) * 0.3;
    const angle = baseAngle + spreadAngle;
    const radius = 18 + indexInArm * 11;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
    };
}
