// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Smart Icon Picker
// ============================================================
// Modern 3-option icon selector:
//   1. Auto (gradient letter-icon from integration name)
//   2. Favicon (paste a domain/URL)
//   3. Emoji (compact curated grid)
// ============================================================

import React, { useState } from "react";
import {
    Box,
    Typography,
    TextField,
    Dialog,
    Tooltip,
    IconButton,
    Tabs,
    Tab,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { COLORS, inputSx, accentAlpha } from "../ui/SharedUI";

// Keep MUI icon support for backwards compat (existing integrations)
import * as Icons from "@mui/icons-material";

const ICON_NAMES: string[] = [
    "Chat", "Forum", "Mail", "Send", "Share", "ThumbUp", "Favorite", "Star",
    "Notifications", "Person", "Group", "Public", "Language",
    "Image", "PhotoCamera", "VideoLibrary", "MusicNote", "Mic",
    "PlayCircle", "Movie", "CameraAlt", "PhotoLibrary",
    "BarChart", "ShowChart", "PieChart", "TrendingUp", "Analytics",
    "Dashboard", "Assessment", "Leaderboard", "InsertChart",
    "Code", "Terminal", "BugReport", "Build", "Api", "DataObject",
    "Hub", "Memory", "Storage", "Webhook",
    "Search", "Home", "Settings", "Menu", "FilterList", "Sort",
    "Bookmark", "Label", "Flag", "Explore",
    "ShoppingCart", "Store", "CreditCard", "AttachMoney", "Receipt",
    "AccountBalance", "LocalOffer", "Storefront",
    "Cloud", "WbSunny", "Thermostat", "Air", "Terrain", "Park",
    "Pets", "Eco", "Water",
    "Article", "Description", "Feed", "RssFeed", "Newspaper",
    "LibraryBooks", "MenuBook", "AutoStories",
    "Science", "Biotech", "Psychology", "Insights", "School",
    "HealthAndSafety", "MedicalServices",
    "Flight", "DirectionsCar", "Train", "Rocket", "Map",
    "LocationOn", "TravelExplore", "NearMe",
    "Extension", "Bolt", "AutoAwesome", "Lightbulb", "Palette",
    "Brush", "Edit", "Tune", "Security", "Lock", "Dns",
    "SmartToy", "SportsEsports", "Casino", "EmojiEvents",
    "WorkspacePremium", "Verified", "NewReleases", "Info",
    "Restaurant", "LocalCafe", "Fastfood", "LunchDining",
];

const ICON_MAP: Record<string, React.ComponentType<any>> = {};
for (const name of ICON_NAMES) {
    const comp = (Icons as any)[name];
    if (comp) ICON_MAP[name] = comp;
}

// ─── Curated Emoji Grid ────────────────────────────────────
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
    { label: "Tech", emojis: ["💻", "🖥️", "📱", "⌨️", "🔧", "⚙️", "🔌", "💾", "🤖", "🧠", "📡", "🔬"] },
    { label: "Data", emojis: ["📊", "📈", "📉", "🗂️", "📋", "🗄️", "💰", "💳", "🏦", "📦", "🔍", "🧮"] },
    { label: "Media", emojis: ["🎵", "🎬", "📸", "🎨", "🖼️", "📺", "🎮", "🎯", "🏆", "⭐", "🔥", "💡"] },
    { label: "Nature", emojis: ["🌍", "☀️", "🌙", "⛅", "🌊", "🌿", "🌸", "🐾", "🦋", "🍕", "☕", "🍺"] },
    { label: "Social", emojis: ["💬", "📧", "📰", "📖", "✏️", "🔔", "❤️", "👍", "🎉", "🚀", "⚡", "✨"] },
];

// ─── Smart Icon Utilities ──────────────────────────────────

const GRADIENTS_POOL = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
    "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
    "linear-gradient(135deg, #f5576c 0%, #ff6a00 100%)",
    "linear-gradient(135deg, #13547a 0%, #80d0c7 100%)",
    "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)",
    "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
];

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
}

function extractDomain(s: string): string | null {
    if (/^https?:\/\//i.test(s)) {
        try { return new URL(s).hostname; } catch { return null; }
    }
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(s)) return s.split("/")[0];
    return null;
}

// ─── Sub-components ────────────────────────────────────────

function LetterIcon({ label, size = 20 }: { label: string; size?: number }) {
    const letter = (label || "?").charAt(0).toUpperCase();
    const grad = GRADIENTS_POOL[hashStr(label) % GRADIENTS_POOL.length];
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: size + 4,
                height: size + 4,
                borderRadius: "30%",
                background: grad,
                color: "#fff",
                fontWeight: 800,
                fontSize: size * 0.6,
                lineHeight: 1,
                fontFamily: "'Inter', 'Roboto', sans-serif",
                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                flexShrink: 0,
            }}
        >
            {letter}
        </span>
    );
}

function FaviconIcon({ domain, label, size = 20 }: { domain: string; label: string; size?: number }) {
    const [srcIndex, setSrcIndex] = React.useState(0);

    // Try multiple favicon sources in order
    const sources = React.useMemo(() => [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://${domain}/favicon.ico`,
    ], [domain]);

    const advance = React.useCallback(() => setSrcIndex((prev) => prev + 1), []);

    if (srcIndex >= sources.length) return <LetterIcon label={label} size={size} />;

    return (
        <img
            src={sources[srcIndex]}
            alt={label}
            width={size}
            height={size}
            style={{ borderRadius: 4, objectFit: "contain" }}
            onError={advance}
            onLoad={(e) => {
                // Detect generic/placeholder icons (tiny images = globe fallback)
                const img = e.currentTarget;
                if (img.naturalWidth <= 1 || img.naturalHeight <= 1) advance();
            }}
        />
    );
}

// ─── Icon Picker Modal ─────────────────────────────────────

interface IconPickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (iconName: string) => void;
    currentIcon?: string;
}

export function IconPicker({ open, onClose, onSelect, currentIcon }: IconPickerProps) {
    const [tab, setTab] = useState(0);
    const [faviconUrl, setFaviconUrl] = useState("");

    const handleSelect = (value: string) => {
        onSelect(value);
        onClose();
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: "#0a0a1a",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 3,
                    maxHeight: "60vh",
                },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, pb: 0 }}>
                <Typography sx={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: "0.95rem" }}>
                    Choose Icon
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: COLORS.textMuted }}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Box>

            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{
                    px: 2, pt: 1, minHeight: 36,
                    "& .MuiTab-root": {
                        minHeight: 32, py: 0.5, px: 1.5,
                        fontSize: "0.75rem", fontWeight: 600,
                        color: COLORS.textMuted,
                        textTransform: "none",
                        "&.Mui-selected": { color: accentAlpha(0.9) },
                    },
                    "& .MuiTabs-indicator": {
                        backgroundColor: accentAlpha(0.8),
                        height: 2,
                    },
                }}
            >
                <Tab label="✨ Auto" />
                <Tab label="🌐 Favicon" />
                <Tab label="😊 Emoji" />
            </Tabs>

            <Box sx={{ p: 2, pt: 1.5 }}>
                {/* ─── Tab 0: Auto (gradient letter) ─── */}
                {tab === 0 && (
                    <Box sx={{ textAlign: "center", py: 3 }}>
                        <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
                            {["Pokemon", "Weather", "Wiki", "News", "Finance", "Music"].map((name) => (
                                <Box key={name} sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                                    <LetterIcon label={name} size={36} />
                                    <Typography sx={{ fontSize: "0.6rem", color: COLORS.textMuted }}>{name}</Typography>
                                </Box>
                            ))}
                        </Box>
                        <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.8rem", mb: 2 }}>
                            Auto-generated gradient icon from your integration name.
                            <br />Each integration gets a unique color!
                        </Typography>
                        <Box
                            onClick={() => handleSelect("✨")}
                            sx={{
                                display: "inline-flex", alignItems: "center", gap: 1,
                                px: 3, py: 1.2, borderRadius: 2,
                                background: `linear-gradient(135deg, ${accentAlpha(0.3)}, ${accentAlpha(0.1)})`,
                                border: `1px solid ${accentAlpha(0.4)}`,
                                cursor: "pointer",
                                transition: "all 0.2s",
                                "&:hover": {
                                    background: `linear-gradient(135deg, ${accentAlpha(0.4)}, ${accentAlpha(0.2)})`,
                                    transform: "scale(1.02)",
                                },
                            }}
                        >
                            <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: "0.85rem" }}>
                                Use Auto Icon
                            </Typography>
                        </Box>
                    </Box>
                )}

                {/* ─── Tab 1: Favicon URL ─── */}
                {tab === 1 && (
                    <Box sx={{ py: 1 }}>
                        <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.78rem", mb: 1.5 }}>
                            Paste a website URL to use its favicon as the icon.
                        </Typography>
                        <TextField
                            placeholder="pokeapi.co or https://wikipedia.org"
                            value={faviconUrl}
                            onChange={(e) => setFaviconUrl(e.target.value)}
                            size="small"
                            fullWidth
                            autoFocus
                            sx={{ ...inputSx, mb: 2 }}
                        />
                        {faviconUrl.trim() && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 2, borderRadius: 2, bgcolor: "rgba(255,255,255,0.03)", border: `1px solid ${COLORS.border}` }}>
                                <Typography sx={{ color: COLORS.textMuted, fontSize: "0.75rem" }}>Preview:</Typography>
                                <FaviconIcon
                                    domain={extractDomain(faviconUrl.trim()) || faviconUrl.trim()}
                                    label={faviconUrl}
                                    size={32}
                                />
                                <Box sx={{ flex: 1 }} />
                                <Box
                                    onClick={() => {
                                        const domain = extractDomain(faviconUrl.trim()) || faviconUrl.trim();
                                        handleSelect(`https://${domain}`);
                                    }}
                                    sx={{
                                        px: 2, py: 0.8, borderRadius: 1.5,
                                        bgcolor: accentAlpha(0.15),
                                        border: `1px solid ${accentAlpha(0.3)}`,
                                        cursor: "pointer",
                                        "&:hover": { bgcolor: accentAlpha(0.25) },
                                    }}
                                >
                                    <Typography sx={{ color: "#fff", fontWeight: 600, fontSize: "0.78rem" }}>
                                        Use This
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>
                )}

                {/* ─── Tab 2: Emoji Grid ─── */}
                {tab === 2 && (
                    <Box>
                        {EMOJI_CATEGORIES.map((cat) => (
                            <Box key={cat.label} sx={{ mb: 1.5 }}>
                                <Typography sx={{ fontSize: "0.65rem", color: COLORS.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", mb: 0.5 }}>
                                    {cat.label}
                                </Typography>
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.3 }}>
                                    {cat.emojis.map((emoji) => (
                                        <Tooltip key={emoji} title={emoji} arrow placement="top">
                                            <Box
                                                onClick={() => handleSelect(emoji)}
                                                sx={{
                                                    width: 36, height: 36,
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    borderRadius: 1.5, cursor: "pointer",
                                                    border: currentIcon === emoji ? `2px solid ${accentAlpha(0.8)}` : "1px solid transparent",
                                                    bgcolor: currentIcon === emoji ? accentAlpha(0.12) : "transparent",
                                                    fontSize: "1.2rem",
                                                    transition: "all 0.15s ease",
                                                    "&:hover": {
                                                        bgcolor: accentAlpha(0.08),
                                                        transform: "scale(1.15)",
                                                    },
                                                }}
                                            >
                                                {emoji}
                                            </Box>
                                        </Tooltip>
                                    ))}
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        </Dialog>
    );
}

// ─── Render a stored icon by name ───────────────────────────

// Default placeholder emojis — treated as "no icon set"
const PLACEHOLDER_ICONS = new Set(["✨", "⚡", "❓"]);

export function RenderIcon({ name, label, sx }: { name?: string | null; label?: string; sx?: any }) {
    const size = (sx?.fontSize as number) || 20;
    const fallbackLabel = label || name || "?";

    // 1. No name or placeholder default → gradient letter fallback
    if (!name || PLACEHOLDER_ICONS.has(name)) {
        return <LetterIcon label={fallbackLabel} size={size} />;
    }

    // 2. If it's a URL/domain → fetch favicon
    const domain = extractDomain(name);
    if (domain) return <FaviconIcon domain={domain} label={fallbackLabel} size={size} />;

    // 3. If it's an emoji (1-4 chars, not a known icon name) → render as text
    if (name.length <= 4 && !ICON_MAP[name]) {
        return <span style={{ fontSize: size * 0.06 + "rem" }}>{name}</span>;
    }

    // 4. MUI icon name → render component
    const IconComp = ICON_MAP[name];
    if (IconComp) return <IconComp sx={{ fontSize: size, ...sx }} />;

    // 5. Final fallback → gradient letter from the label
    return <LetterIcon label={fallbackLabel} size={size} />;
}
