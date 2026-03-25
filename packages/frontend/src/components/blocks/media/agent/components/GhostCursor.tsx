// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Ghost Cursor (OS-level visual feedback)
// ============================================================
// Overlay component that displays a smooth-moving cursor simulating
// human movements for the BiamOS Agent over the main webview.
// ============================================================

import React, { useEffect, useState } from 'react';
import { Box, styled, useTheme } from '@mui/material';

export interface GhostCursorProps {
    cursorPos: { x: number; y: number } | null;
}

// Keyframes for the click ripple effect
const RippleKeyframes = `
  @keyframes rippleEffect {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(3); opacity: 0; }
  }
`;

export const GhostCursor = React.memo(function GhostCursor({ cursorPos }: GhostCursorProps) {
    const theme = useTheme();
    const [clickEffect, setClickEffect] = useState(false);
    const [particles, setParticles] = useState<{ id: number, x: number, y: number }[]>([]);
    const [lastPos, setLastPos] = useState<{ x: number, y: number } | null>(null);

    // Keep memory of last position so we don't vanish instantly
    useEffect(() => {
        if (cursorPos) setLastPos(cursorPos);
    }, [cursorPos]);

    useEffect(() => {
        if (!cursorPos) return;

        // When the position changes, trigger the click ripple effect!
        setClickEffect(true);
        const timer = setTimeout(() => setClickEffect(false), 400);

        // Dust particle trail logic
        const newParticle = { id: Date.now(), x: cursorPos.x, y: cursorPos.y };
        setParticles(prev => [...prev.slice(-4), newParticle]); // keep max 5 trail pieces

        return () => clearTimeout(timer);
    }, [cursorPos]);

    const activePos = cursorPos || lastPos;
    if (!activePos) return null;

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999, // ensures it sits above webview perfectly
                overflow: 'hidden',
                opacity: cursorPos ? 1 : 0, // graceful fade out instead of vanishing
                transition: 'opacity 0.6s ease-out',
            }}
        >
            <style>{RippleKeyframes}</style>

            {/* Dust Particles (Trail) */}
            {particles.map((p, idx) => (
                <Box
                    key={p.id}
                    sx={{
                        position: 'absolute',
                        left: p.x,
                        top: p.y,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        opacity: 0.1 + (idx * 0.1),
                        transform: 'translate(-50%, -50%)',
                        boxShadow: `0 0 10px ${theme.palette.primary.main}`,
                        transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
                        willChange: 'opacity, transform',
                        animation: 'rippleEffect 1s ease-out forwards',
                    }}
                />
            ))}

            {/* Main Ghost Cursor Tip */}
            <Box
                sx={{
                    position: 'absolute',
                    left: activePos.x,
                    top: activePos.y,
                    transform: 'translate(-50%, -50%)',
                    transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)', // fast start, human slowdown
                    willChange: 'left, top',
                }}
            >
                {/* SVG Mouse Pointer matching BiamOS neon style */}
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"
                    style={{ filter: `drop-shadow(0 0 8px ${theme.palette.primary.main})` }}
                >
                    <path
                        d="M6 3.5L23.5 12.5L14.5 14.5L12 24L6 3.5Z"
                        fill={theme.palette.primary.main}
                        stroke={theme.palette.background.paper}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>

                {/* Click Ripple Overlay */}
                {clickEffect && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: 24,
                            height: 24,
                            transform: 'translate(-50%, -50%)',
                            borderRadius: '50%',
                            border: `2px solid ${theme.palette.primary.main}`,
                            animation: 'rippleEffect 0.4s ease-out',
                        }}
                    />
                )}
            </Box>
        </Box>
    );
});
