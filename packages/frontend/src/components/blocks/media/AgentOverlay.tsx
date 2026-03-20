// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Agent Visual Overlay ("Ghost Mouse")
// ============================================================
// Renders a glowing border, canvas-based particle trail,
// smooth-animated AI cursor, and status bar when the browser
// agent is active.
// ============================================================

import React, { useRef, useEffect, useCallback } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import ThumbDownAltIcon from "@mui/icons-material/ThumbDownAlt";
import type { AgentState } from "./useAgentActions";

// ─── Particle System ────────────────────────────────────────

interface Particle {
    x: number;
    y: number;
    size: number;
    opacity: number;
    vx: number;
    vy: number;
    life: number;     // 0→1, starts at 1 and decays
    maxLife: number;
    hue: number;       // slight hue variation around cyan
}

const PARTICLE_CYAN = { r: 0, g: 212, b: 255 };
const MAX_PARTICLES = 120;
const PARTICLE_SPAWN_RATE = 3;     // particles per frame while moving
const PARTICLE_LIFETIME = 0.8;     // seconds

// ─── Component ──────────────────────────────────────────────

interface AgentOverlayProps {
    state: AgentState;
    task: string;
    onStop: () => void;
    onContinue: () => void;
    onFeedback?: (positive: boolean) => void;
}

export const AgentOverlay = React.memo(function AgentOverlay({
    state,
    task,
    onStop,
    onContinue,
    onFeedback,
}: AgentOverlayProps) {
    // ─── Refs for animation loop ────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animFrameRef = useRef<number>(0);
    const particlesRef = useRef<Particle[]>([]);
    const currentPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const targetPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const hasInitialPosRef = useRef(false);
    const lastSpawnTimeRef = useRef(0);
    const cursorVisibleRef = useRef(false);
    const fadeOpacityRef = useRef(0); // 0→1 for fade-in, used for cursor appearance

    const isActive = state.status === "running";
    const isPaused = state.status === "paused";
    const isDone = state.status === "done";
    const isError = state.status === "error";
    const isFinished = isDone || isError;
    const showCursor = isActive || isPaused;

    // ─── Update target position when cursorPos changes ──────
    useEffect(() => {
        if (state.cursorPos && showCursor) {
            targetPosRef.current = { x: state.cursorPos.x, y: state.cursorPos.y };
            if (!hasInitialPosRef.current) {
                // First position — snap immediately instead of lerp
                currentPosRef.current = { ...targetPosRef.current };
                hasInitialPosRef.current = true;
            }
            cursorVisibleRef.current = true;
        }
    }, [state.cursorPos, showCursor]);

    // ─── Reset when agent stops ─────────────────────────────
    useEffect(() => {
        if (!showCursor) {
            // Fade out, then clear
            const fadeTimer = setTimeout(() => {
                hasInitialPosRef.current = false;
                cursorVisibleRef.current = false;
                particlesRef.current = [];
                fadeOpacityRef.current = 0;
            }, 600);
            return () => clearTimeout(fadeTimer);
        }
    }, [showCursor]);

    // ─── Spawn particles along the trail ────────────────────
    const spawnParticles = useCallback((cx: number, cy: number) => {
        const now = performance.now();
        if (now - lastSpawnTimeRef.current < 16) return; // ~60fps cap
        lastSpawnTimeRef.current = now;

        const particles = particlesRef.current;

        for (let i = 0; i < PARTICLE_SPAWN_RATE; i++) {
            if (particles.length >= MAX_PARTICLES) {
                // Replace oldest dead particle
                const deadIdx = particles.findIndex(p => p.life <= 0);
                if (deadIdx === -1) break;
                particles.splice(deadIdx, 1);
            }

            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 8;
            const speed = 0.2 + Math.random() * 0.5;

            particles.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                size: 1 + Math.random() * 2.5,
                opacity: 0.6 + Math.random() * 0.4,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 0.3, // slight upward drift
                life: 1,
                maxLife: PARTICLE_LIFETIME + Math.random() * 0.3,
                hue: 185 + Math.random() * 15, // 185-200 = cyan range
            });
        }
    }, []);

    // ─── Main animation loop ────────────────────────────────
    useEffect(() => {
        if (state.status === "idle") return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let lastTime = performance.now();

        const loop = (time: number) => {
            const dt = Math.min((time - lastTime) / 1000, 0.05); // delta in seconds, cap at 50ms
            lastTime = time;

            // Resize canvas to container
            const parent = canvas.parentElement;
            if (parent) {
                const w = parent.clientWidth;
                const h = parent.clientHeight;
                if (canvas.width !== w || canvas.height !== h) {
                    canvas.width = w;
                    canvas.height = h;
                }
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const cur = currentPosRef.current;
            const tgt = targetPosRef.current;
            const visible = cursorVisibleRef.current;

            // ── Fade in/out ──
            if (showCursor && visible) {
                fadeOpacityRef.current = Math.min(1, fadeOpacityRef.current + dt * 3);
            } else {
                fadeOpacityRef.current = Math.max(0, fadeOpacityRef.current - dt * 2);
            }
            const globalAlpha = fadeOpacityRef.current;

            if (globalAlpha <= 0.01) {
                animFrameRef.current = requestAnimationFrame(loop);
                return;
            }

            // ── Lerp cursor toward target ──
            const lerpFactor = 1 - Math.pow(0.02, dt); // smooth exponential lerp
            const prevX = cur.x;
            const prevY = cur.y;
            cur.x += (tgt.x - cur.x) * lerpFactor;
            cur.y += (tgt.y - cur.y) * lerpFactor;

            // ── Spawn particles when moving ──
            const dx = cur.x - prevX;
            const dy = cur.y - prevY;
            const speed = Math.sqrt(dx * dx + dy * dy);
            if (speed > 0.3 && showCursor) {
                spawnParticles(cur.x, cur.y);
            }

            // ── Update & draw particles ──
            const particles = particlesRef.current;
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.life -= dt / p.maxLife;
                if (p.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.98;
                p.vy *= 0.98;

                const alpha = p.opacity * p.life * globalAlpha;
                const size = p.size * (0.5 + p.life * 0.5);

                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha})`;
                ctx.fill();

                // Glow
                if (size > 1.5) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${alpha * 0.15})`;
                    ctx.fill();
                }
            }

            // ── Draw cursor ──
            if (visible) {
                const cx = cur.x;
                const cy = cur.y;

                // Outer glow ring (pulsing)
                const pulse = 0.7 + 0.3 * Math.sin(time / 400);
                const outerRadius = 16 * pulse;
                const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRadius);
                outerGrad.addColorStop(0, `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.15 * globalAlpha})`);
                outerGrad.addColorStop(0.6, `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.06 * globalAlpha})`);
                outerGrad.addColorStop(1, `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, 0)`);
                ctx.beginPath();
                ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
                ctx.fillStyle = outerGrad;
                ctx.fill();

                // Middle glow ring
                ctx.beginPath();
                ctx.arc(cx, cy, 10, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.3 * pulse * globalAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Inner core dot
                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 4);
                coreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.95 * globalAlpha})`);
                coreGrad.addColorStop(0.5, `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.9 * globalAlpha})`);
                coreGrad.addColorStop(1, `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.6 * globalAlpha})`);
                ctx.fillStyle = coreGrad;
                ctx.fill();

                // Drop shadow for the core
                ctx.beginPath();
                ctx.arc(cx, cy, 5, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.5 * globalAlpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();

                // "AI" label
                ctx.font = "bold 9px Inter, system-ui, sans-serif";
                ctx.fillStyle = `rgba(${PARTICLE_CYAN.r}, ${PARTICLE_CYAN.g}, ${PARTICLE_CYAN.b}, ${0.6 * globalAlpha})`;
                ctx.fillText("AI", cx + 10, cy - 8);
            }

            animFrameRef.current = requestAnimationFrame(loop);
        };

        animFrameRef.current = requestAnimationFrame(loop);

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [state.status, showCursor, spawnParticles]);

    if (state.status === "idle") return null;

    return (
        <>
            {/* ─── Glowing Border ─── */}
            {(isActive || isPaused) && (
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        zIndex: 50,
                        border: isPaused
                            ? "2px solid rgba(255, 190, 60, 0.6)"
                            : "2px solid rgba(0, 212, 255, 0.5)",
                        borderRadius: 1,
                        animation: isActive ? "agentGlow 2s ease-in-out infinite" : "none",
                        "@keyframes agentGlow": {
                            "0%, 100%": {
                                boxShadow: `inset 0 0 15px rgba(0, 212, 255, 0.15), 0 0 20px rgba(0, 212, 255, 0.1)`,
                                borderColor: "rgba(0, 212, 255, 0.4)",
                            },
                            "50%": {
                                boxShadow: `inset 0 0 25px rgba(0, 212, 255, 0.25), 0 0 35px rgba(0, 212, 255, 0.2)`,
                                borderColor: "rgba(0, 212, 255, 0.7)",
                            },
                        },
                    }}
                />
            )}

            {/* ─── Ghost Mouse Canvas (Particle Trail + Cursor) ─── */}
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 55,
                }}
            />

            {/* ─── Status Bar ─── */}
            <Box
                sx={{
                    position: "absolute",
                    bottom: 8,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 60,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 2,
                    py: 0.8,
                    borderRadius: 3,
                    bgcolor: isPaused
                        ? "rgba(40, 30, 0, 0.92)"
                        : isDone
                            ? "rgba(0, 30, 10, 0.92)"
                            : isError
                                ? "rgba(40, 0, 0, 0.92)"
                                : "rgba(0, 12, 24, 0.92)",
                    border: `1px solid ${
                        isPaused
                            ? "rgba(255, 190, 60, 0.3)"
                            : isDone
                                ? "rgba(0, 200, 100, 0.3)"
                                : isError
                                    ? "rgba(255, 80, 80, 0.3)"
                                    : "rgba(0, 212, 255, 0.3)"
                    }`,
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)",
                    maxWidth: "80%",
                    animation: isFinished
                        ? "slideUp 0.3s ease-out, fadeOut 1s ease-out 4s forwards"
                        : "slideUp 0.3s ease-out",
                    cursor: isFinished ? "pointer" : "default",
                    "@keyframes slideUp": {
                        from: { opacity: 0, transform: "translateX(-50%) translateY(10px)" },
                        to: { opacity: 1, transform: "translateX(-50%) translateY(0)" },
                    },
                    "@keyframes fadeOut": {
                        from: { opacity: 1 },
                        to: { opacity: 0, pointerEvents: "none" },
                    },
                }}
                onClick={isFinished ? onStop : undefined}
            >
                {/* Pulsing dot */}
                {isActive && (
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: "#00d4ff",
                            flexShrink: 0,
                            animation: "agentPulse 1.5s ease-in-out infinite",
                            "@keyframes agentPulse": {
                                "0%, 100%": { opacity: 0.4, transform: "scale(0.8)" },
                                "50%": { opacity: 1, transform: "scale(1.2)" },
                            },
                        }}
                    />
                )}

                {/* Action text */}
                <Typography
                    sx={{
                        color: isPaused
                            ? "rgba(255, 190, 60, 0.9)"
                            : isDone
                                ? "rgba(0, 200, 100, 0.9)"
                                : isError
                                    ? "rgba(255, 100, 100, 0.9)"
                                    : "rgba(0, 212, 255, 0.9)",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        maxWidth: 600,
                        lineHeight: 1.4,
                    }}
                >
                    {state.currentAction || "🤖 AI Agent"}
                </Typography>

                {/* Step counter */}
                {state.steps.length > 0 && (
                    <Typography
                        sx={{
                            color: "rgba(255, 255, 255, 0.3)",
                            fontSize: "0.6rem",
                            fontWeight: 500,
                            flexShrink: 0,
                        }}
                    >
                        {state.steps.length} steps
                    </Typography>
                )}

                {/* Continue button (when paused) */}
                {isPaused && (
                    <IconButton
                        onClick={onContinue}
                        size="small"
                        sx={{
                            color: "rgba(0, 200, 100, 0.9)",
                            bgcolor: "rgba(0, 200, 100, 0.15)",
                            p: 0.5,
                            "&:hover": { bgcolor: "rgba(0, 200, 100, 0.25)" },
                        }}
                    >
                        <PlayArrowIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}

                {/* Stop button */}
                {(isActive || isPaused) && (
                    <IconButton
                        onClick={onStop}
                        size="small"
                        sx={{
                            color: "rgba(255, 80, 80, 0.7)",
                            p: 0.5,
                            "&:hover": {
                                color: "rgba(255, 80, 80, 1)",
                                bgcolor: "rgba(255, 80, 80, 0.1)",
                            },
                        }}
                    >
                        <StopIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                )}

                {/* 👍/👎 Feedback buttons (when done and has workflow) */}
                {isDone && state.lastWorkflowId && onFeedback && (
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 0.5 }}>
                        <IconButton
                            onClick={(e) => { e.stopPropagation(); onFeedback(true); }}
                            size="small"
                            title="Workflow was correct — remember it!"
                            sx={{
                                color: "rgba(0, 200, 100, 0.7)",
                                p: 0.3,
                                "&:hover": {
                                    color: "rgba(0, 200, 100, 1)",
                                    bgcolor: "rgba(0, 200, 100, 0.15)",
                                },
                            }}
                        >
                            <ThumbUpAltIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                        <IconButton
                            onClick={(e) => { e.stopPropagation(); onFeedback(false); }}
                            size="small"
                            title="Workflow was wrong"
                            sx={{
                                color: "rgba(255, 80, 80, 0.5)",
                                p: 0.3,
                                "&:hover": {
                                    color: "rgba(255, 80, 80, 0.9)",
                                    bgcolor: "rgba(255, 80, 80, 0.1)",
                                },
                            }}
                        >
                            <ThumbDownAltIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Box>
                )}
            </Box>
        </>
    );
});
