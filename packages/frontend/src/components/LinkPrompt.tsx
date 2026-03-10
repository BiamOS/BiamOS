// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Link Prompt (Smart Link Handler)
// ============================================================
// When a user clicks a URL link in a list/card, this dialog
// offers to install it as a web integration + open as iframe card,
// or open in the external browser.
// Remembers "always external" domains via localStorage.
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, IconButton, CircularProgress } from "@mui/material";
import {
    OpenInNew as ExternalIcon,
    Download as InstallIcon,
    Close as CloseIcon,
} from "@mui/icons-material";
import { GradientButton, GhostButton, COLORS, accentAlpha } from "./ui/SharedUI";
import { GLASS } from "../theme/theme";

// ─── localStorage keys ──────────────────────────────────────
const EXTERNAL_KEY = "biamos:external-domains";
const INSTALLED_KEY = "biamos:installed-web-domains";

function getExternalDomains(): Set<string> {
    try {
        const raw = localStorage.getItem(EXTERNAL_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function addExternalDomain(domain: string): void {
    const domains = getExternalDomains();
    domains.add(domain);
    localStorage.setItem(EXTERNAL_KEY, JSON.stringify([...domains]));
}

function getInstalledDomains(): Set<string> {
    try {
        const raw = localStorage.getItem(INSTALLED_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function addInstalledDomain(domain: string): void {
    const domains = getInstalledDomains();
    domains.add(domain);
    localStorage.setItem(INSTALLED_KEY, JSON.stringify([...domains]));
}

function extractDomain(url: string): string {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return url; }
}

// ─── Custom Event Types ─────────────────────────────────────
export interface LinkOpenDetail {
    url: string;
    title?: string;
    groupName?: string;
    /** When set, addIframeCard groups into the webview card showing this URL */
    sourceUrl?: string;
}

/** Dispatch from any block to trigger the link prompt */
export function dispatchLinkOpen(url: string, title?: string, groupName?: string): void {
    const domain = extractDomain(url);
    const externalDomains = getExternalDomains();

    // If domain is marked "always external", skip prompt
    if (externalDomains.has(domain)) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }

    // If ANY web integration is installed, skip prompt → open directly as tab
    const installedDomains = getInstalledDomains();
    if (installedDomains.size > 0) {
        window.dispatchEvent(
            new CustomEvent<LinkOpenDetail>("biamos:open-as-card", {
                detail: { url, title, groupName },
            })
        );
        return;
    }

    window.dispatchEvent(
        new CustomEvent<LinkOpenDetail>("biamos:open-link", {
            detail: { url, title, groupName },
        })
    );
}

// ─── Component ──────────────────────────────────────────────

export const LinkPrompt = React.memo(function LinkPrompt() {
    const [pending, setPending] = useState<LinkOpenDetail | null>(null);
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<LinkOpenDetail>).detail;
            setPending(detail);
        };
        window.addEventListener("biamos:open-link", handler);
        return () => window.removeEventListener("biamos:open-link", handler);
    }, []);

    const domain = pending ? extractDomain(pending.url) : "";

    const handleInstallAndOpen = useCallback(async () => {
        if (!pending) return;
        setInstalling(true);

        try {
            // Call backend to install web integration
            const res = await fetch("/api/integrations/install-web", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: pending.url, title: pending.title }),
            });
            const data = await res.json();

            if (data.action === "web_installed" || data.action === "web_already_installed") {
                // Remember this domain as installed
                addInstalledDomain(domain);

                // Dispatch custom event to reload integrations sidebar
                window.dispatchEvent(new CustomEvent("biamos:integrations-changed"));

                // Open as iframe card
                window.dispatchEvent(
                    new CustomEvent<LinkOpenDetail>("biamos:open-as-card", {
                        detail: pending,
                    })
                );
            }
        } catch (err) {
            console.error("Web install failed:", err);
            // Fallback: just open as card without installing
            window.dispatchEvent(
                new CustomEvent<LinkOpenDetail>("biamos:open-as-card", {
                    detail: pending,
                })
            );
        } finally {
            setInstalling(false);
            setPending(null);
        }
    }, [pending, domain]);

    const handleOpenExternal = useCallback(() => {
        if (!pending) return;
        window.open(pending.url, "_blank", "noopener,noreferrer");
        setPending(null);
    }, [pending]);

    const handleAlwaysExternal = useCallback(() => {
        if (!pending) return;
        addExternalDomain(domain);
        window.open(pending.url, "_blank", "noopener,noreferrer");
        setPending(null);
    }, [pending, domain]);

    const handleDismiss = useCallback(() => setPending(null), []);

    if (!pending) return null;

    return (
        <Box
            sx={{
                position: "fixed",
                bottom: 90,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 9999,
                ...GLASS.card,
                bgcolor: "rgba(10, 10, 30, 0.95)",
                border: `1px solid ${accentAlpha(0.2)}`,
                borderRadius: "20px",
                px: 3,
                py: 2,
                minWidth: 340,
                maxWidth: 500,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accentAlpha(0.1)}`,
                animation: "blockReveal 0.25s ease-out",
            }}
        >
            {/* Close button */}
            <IconButton
                onClick={handleDismiss}
                sx={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    color: COLORS.textMuted,
                    width: 28,
                    height: 28,
                }}
            >
                <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>

            {/* Domain label */}
            <Typography
                sx={{
                    fontSize: "0.7rem",
                    color: COLORS.textMuted,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    mb: 0.5,
                }}
            >
                🌐 {domain}
            </Typography>

            {/* Title */}
            <Typography
                sx={{
                    fontSize: "0.85rem",
                    color: COLORS.textPrimary,
                    fontWeight: 500,
                    mb: 1.5,
                    pr: 3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {pending.title || pending.url}
            </Typography>

            {/* Action buttons */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <GradientButton
                    startIcon={installing
                        ? <CircularProgress size={14} sx={{ color: "inherit" }} />
                        : <InstallIcon sx={{ fontSize: 16 }} />
                    }
                    onClick={handleInstallAndOpen}
                    disabled={installing}
                    sx={{ fontSize: "0.75rem", py: 0.6, px: 2, flex: 1 }}
                >
                    {installing ? "Installiere..." : "Installieren & Öffnen"}
                </GradientButton>
                <GhostButton
                    startIcon={<ExternalIcon sx={{ fontSize: 14 }} />}
                    onClick={handleOpenExternal}
                    disabled={installing}
                    sx={{ fontSize: "0.72rem", py: 0.6, px: 1.5 }}
                >
                    Browser
                </GhostButton>
            </Box>

            {/* "Always external" small link */}
            <Typography
                onClick={installing ? undefined : handleAlwaysExternal}
                sx={{
                    fontSize: "0.62rem",
                    color: COLORS.textMuted,
                    mt: 1,
                    textAlign: "center",
                    cursor: installing ? "default" : "pointer",
                    opacity: installing ? 0.3 : 0.6,
                    transition: "opacity 0.2s ease",
                    "&:hover": installing ? {} : { opacity: 1, color: COLORS.textSecondary },
                }}
            >
                {domain} immer im Browser öffnen
            </Typography>
        </Box>
    );
});
