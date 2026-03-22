// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Content Blocks (Apple-Style)
// title, text, image, divider, spacer, callout, accordion
// ============================================================

import React from "react";
import ReactDOM from "react-dom";
import {
    Box,
    Typography,
    Divider,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";
import { ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import { COLORS, GRADIENTS, accentAlpha } from "../ui/SharedUI";
import { GLASS } from "../../theme/theme";
import type {
    TitleBlockSpec,
    TextBlockSpec,
    ImageBlockSpec,
    DividerBlockSpec,
    SpacerBlockSpec,
    CalloutBlockSpec,
    AccordionBlockSpec,
} from "./types";

// ─── TITLE ──────────────────────────────────────────────────

export const TitleBlock = React.memo(function TitleBlock({
    text,
    subtitle,
    align = "left",
    size = "h5",
}: TitleBlockSpec) {
    return (
        <Box sx={{ textAlign: align, mb: 0.8 }}>
            <Typography
                variant={size}
                sx={{
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.15,
                    background: GRADIENTS.title,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                }}
            >
                {text}
            </Typography>
            {subtitle && (
                <Typography
                    variant="body2"
                    sx={{
                        color: COLORS.textMuted,
                        mt: 0.5,
                        fontSize: "0.78rem",
                        letterSpacing: "0.01em",
                        lineHeight: 1.5,
                    }}
                >
                    {subtitle}
                </Typography>
            )}
        </Box>
    );
});

// ─── TEXT ────────────────────────────────────────────────────

export const TextBlock = React.memo(function TextBlock({
    content,
    variant = "body2",
    color,
}: TextBlockSpec) {
    return (
        <Typography
            variant={variant}
            sx={{
                color: color ?? COLORS.textSecondary,
                lineHeight: 1.6,
                fontSize: "0.82rem",
                letterSpacing: "0.005em",
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
                wordBreak: "break-word",
            }}
        >
            {content}
        </Typography>
    );
});

// ─── IMAGE ──────────────────────────────────────────────────

export const ImageBlock = React.memo(function ImageBlock({
    src,
    alt,
    width,
    height,
    rounded,
    caption,
}: ImageBlockSpec) {
    const [open, setOpen] = React.useState(false);
    return (
        <Box sx={{ textAlign: "center" }}>
            <Box
                component="img"
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                onClick={() => setOpen(true)}
                sx={{
                    width: width ?? "auto",
                    height: height ?? "auto",
                    maxWidth: "100%",
                    maxHeight: 300,
                    objectFit: "contain",
                    borderRadius: rounded ? "50%" : "16px",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)",
                    cursor: "pointer",
                    transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    "&:hover": {
                        transform: "scale(1.02)",
                        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${accentAlpha(0.1)}`,
                    },
                }}
            />
            {caption && (
                <Typography
                    variant="caption"
                    sx={{
                        color: COLORS.textMuted,
                        mt: 1.2,
                        display: "block",
                        fontSize: "0.75rem",
                        letterSpacing: "0.02em",
                    }}
                >
                    {caption}
                </Typography>
            )}
            {/* Lightbox overlay — portaled to body */}
            {open && ReactDOM.createPortal(
                <Box
                    onClick={() => setOpen(false)}
                    sx={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        bgcolor: "rgba(0, 0, 0, 0.92)",
                        backdropFilter: "blur(20px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 9999,
                        cursor: "zoom-out",
                        animation: "fadeIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    }}
                >
                    <Box
                        component="img"
                        src={src}
                        alt={alt ?? ""}
                        sx={{
                            maxWidth: "90vw",
                            maxHeight: "90vh",
                            objectFit: "contain",
                            borderRadius: "16px",
                            boxShadow: "0 16px 64px rgba(0,0,0,0.6), 0 0 40px rgba(88,28,255,0.15)",
                        }}
                    />
                </Box>,
                document.body
            )}
        </Box>
    );
});

// ─── DIVIDER ────────────────────────────────────────────────

export const DividerBlock = React.memo(function DividerBlock() {
    return (
        <Divider
            sx={{
                my: 2.5,
                borderColor: "transparent",
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
                height: "1px",
                border: "none",
            }}
        />
    );
});

// ─── SPACER ─────────────────────────────────────────────────

export const SpacerBlock = React.memo(function SpacerBlock({ size = 2 }: SpacerBlockSpec) {
    return <Box sx={{ height: size * 8 }} />;
});

// ─── CALLOUT ────────────────────────────────────────────────

const CALLOUT_STYLES = {
    info: { icon: "ℹ️", bg: "rgba(33, 150, 243, 0.06)", border: "rgba(33, 150, 243, 0.15)", color: "#64b5f6" },
    success: { icon: "✅", bg: "rgba(0, 220, 100, 0.06)", border: "rgba(0, 220, 100, 0.15)", color: "#00dc64" },
    warning: { icon: "⚠️", bg: "rgba(255, 180, 0, 0.06)", border: "rgba(255, 180, 0, 0.15)", color: "#ffb400" },
    tip: { icon: "💡", bg: accentAlpha(0.06), border: accentAlpha(0.15), color: "#b48cff" },
} as const;

export const CalloutBlock = React.memo(function CalloutBlock({
    variant,
    title,
    text,
}: CalloutBlockSpec) {
    const style = CALLOUT_STYLES[variant] ?? CALLOUT_STYLES.info;
    return (
        <Box
            sx={{
                display: "flex",
                gap: 1.5,
                p: 1.5,
                borderRadius: "16px",
                bgcolor: style.bg,
                border: `1px solid ${style.border}`,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                transition: "border-color 0.3s ease",
                "&:hover": { borderColor: style.border.replace(/[\d.]+\)$/, "0.3)") },
            }}
        >
            <Box
                sx={{
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    bgcolor: style.bg,
                    flexShrink: 0,
                    fontSize: "1rem",
                }}
            >
                {style.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {title && (
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: style.color, mb: 0.4, fontSize: "0.875rem" }}
                    >
                        {title}
                    </Typography>
                )}
                <Typography
                    variant="body2"
                    sx={{
                        color: COLORS.textSecondary,
                        lineHeight: 1.7,
                        fontSize: "0.85rem",
                    }}
                >
                    {text}
                </Typography>
            </Box>
        </Box>
    );
});

// ─── ACCORDION ───────────────────────────────────────────────

export const AccordionBlock = React.memo(function AccordionBlock({
    sections,
    label,
}: AccordionBlockSpec) {
    return (
        <Box>
            {label && (
                <Typography
                    sx={{
                        color: COLORS.textMuted,
                        fontWeight: 600,
                        fontSize: "0.72rem",
                        mb: 1.2,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                    }}
                >
                    {label}
                </Typography>
            )}
            {sections.map((sec, i) => (
                <Accordion
                    key={i}
                    disableGutters
                    elevation={0}
                    sx={{
                        bgcolor: COLORS.surfaceSubtle,
                        backdropFilter: "blur(12px)",
                        border: `1px solid ${COLORS.borderSubtle}`,
                        borderRadius: "10px",
                        mb: 0.8,
                        "&:before": { display: "none" },
                        "&.Mui-expanded": {
                            borderColor: accentAlpha(0.15),
                        },
                        transition: "border-color 0.3s ease",
                    }}
                >
                    <AccordionSummary
                        expandIcon={<ExpandMoreIcon sx={{ color: COLORS.textMuted, fontSize: 18 }} />}
                        sx={{
                            minHeight: 40,
                            "& .MuiAccordionSummary-content": { my: 0.8 },
                        }}
                    >
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: "0.875rem" }}
                        >
                            {sec.title}
                        </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, pb: 2, px: 2 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                color: COLORS.textSecondary,
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.75,
                                fontSize: "0.85rem",
                            }}
                        >
                            {sec.content}
                        </Typography>
                    </AccordionDetails>
                </Accordion>
            ))}
        </Box>
    );
});
