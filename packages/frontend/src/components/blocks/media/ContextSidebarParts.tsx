// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Context Sidebar Sub-components
// ============================================================
// Reusable sub-components for the context sidebar:
//   - renderMarkdown()      — lightweight MD → HTML converter
//   - HintBlockRenderer     — renders data blocks inside hints
//   - HintSkeleton          — shimmer loading skeleton
//   - SourceBadge           — page_context / web_search badge
//   - FollowUpChips         — clickable follow-up suggestions
// ============================================================

import React from "react";
import { Box, Typography, IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

// ─── Lightweight Markdown → HTML ─────────────────────────────

export function renderMarkdown(text: string): string {
    // 1. Extract fenced code blocks BEFORE escaping HTML
    const codeBlocks: string[] = [];
    let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
        const escaped = code
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .trimEnd();
        const langLabel = lang
            ? `<span style="position:absolute;top:4px;right:8px;font-size:0.55rem;color:rgba(0,212,255,0.5);text-transform:uppercase;font-weight:600">${lang}</span>`
            : '';
        const block = `<div style="position:relative;background:rgba(0,0,0,0.4);border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:8px 10px;margin:6px 0;overflow-x:auto">${langLabel}<pre style="margin:0;font-family:'Fira Code','Consolas',monospace;font-size:0.65rem;line-height:1.5;color:#e0f0ff;white-space:pre-wrap;word-break:break-word">${escaped}</pre></div>`;
        codeBlocks.push(block);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 2. Escape HTML in remaining text
    processed = processed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // 3. Inline code
    processed = processed.replace(/`([^`]+)`/g,
        '<code style="background:rgba(0,212,255,0.1);color:#4fc3f7;padding:1px 4px;border-radius:3px;font-family:\'Fira Code\',\'Consolas\',monospace;font-size:0.63rem">$1</code>');

    // 4. Bold
    processed = processed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    processed = processed.replace(/__(.+?)__/g, "<strong>$1</strong>");

    // 5. Italic
    processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

    // 6. Headings
    processed = processed.replace(/^####\s+(.+)$/gm,
        '<div style="color:#00d4ff;font-weight:700;font-size:0.68rem;margin:6px 0 2px">$1</div>');
    processed = processed.replace(/^###\s+(.+)$/gm,
        '<div style="color:#00d4ff;font-weight:700;font-size:0.72rem;margin:8px 0 3px">$1</div>');

    // 7. Links
    processed = processed.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
        '<a href="$2" data-lura-link="true" style="color:#4fc3f7;cursor:pointer;text-decoration:underline">$1</a>');

    // 8. Horizontal rules
    processed = processed.replace(/^---$/gm,
        '<hr style="border:none;border-top:1px solid rgba(0,212,255,0.15);margin:8px 0"/>');

    // 9. Lists
    const lines = processed.split("\n");
    const result: string[] = [];
    let inUl = false;
    let inOl = false;

    for (const line of lines) {
        const trimmed = line.trim();

        const codeMatch = trimmed.match(/^__CODE_BLOCK_(\d+)__$/);
        if (codeMatch) {
            if (inUl) { result.push("</ul>"); inUl = false; }
            if (inOl) { result.push("</ol>"); inOl = false; }
            result.push(codeBlocks[parseInt(codeMatch[1])]);
            continue;
        }

        const bulletMatch = trimmed.match(/^[\*\-]\s+(.+)/);
        const numMatch = trimmed.match(/^\d+\.\s+(.+)/);

        if (bulletMatch) {
            if (!inUl) { result.push("<ul>"); inUl = true; }
            if (inOl) { result.push("</ol>"); inOl = false; }
            result.push(`<li>${bulletMatch[1]}</li>`);
        } else if (numMatch) {
            if (!inOl) { result.push("<ol>"); inOl = true; }
            if (inUl) { result.push("</ul>"); inUl = false; }
            result.push(`<li>${numMatch[1]}</li>`);
        } else {
            if (inUl) { result.push("</ul>"); inUl = false; }
            if (inOl) { result.push("</ol>"); inOl = false; }
            if (trimmed) result.push(`<p>${trimmed}</p>`);
        }
    }
    if (inUl) result.push("</ul>");
    if (inOl) result.push("</ol>");

    return result.join("");
}

// ─── HintBlockRenderer ─────────────────────────────────────

export function HintBlockRenderer({ block }: { block: any }) {
    if (block.type === "title") {
        return <Typography sx={{ color: "#e0f0ff", fontSize: "0.7rem", fontWeight: 700 }}>{block.text}</Typography>;
    }
    if (block.type === "hero") {
        return (
            <Typography sx={{ color: "#00d4ff", fontSize: "1rem", fontWeight: 800 }}>
                {block.value}{block.label ? ` ${block.label}` : ""}
            </Typography>
        );
    }
    if (block.type === "key_value") {
        return (
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {(block.items || []).slice(0, 4).map((kv: any, ki: number) => (
                    <Typography key={ki} sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.6rem" }}>
                        <Box component="span" sx={{ color: "#00d4ff", fontWeight: 600 }}>{kv.label}</Box> {kv.value}
                    </Typography>
                ))}
            </Box>
        );
    }
    if (block.type === "metric_row") {
        return (
            <Box sx={{ display: "flex", gap: 1 }}>
                {(block.items || []).slice(0, 3).map((m: any, mi: number) => (
                    <Box key={mi} sx={{ textAlign: "center" }}>
                        <Typography sx={{ color: "#00d4ff", fontSize: "0.8rem", fontWeight: 700 }}>{m.value}</Typography>
                        <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: "0.5rem" }}>{m.label}</Typography>
                    </Box>
                ))}
            </Box>
        );
    }
    if (block.type === "list") {
        return (
            <Box>
                {(block.items || []).slice(0, 3).map((item: any, li: number) => (
                    <Typography key={li} sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.6rem", mb: 0.2 }}>
                        • {item.primary || item.title || item}
                    </Typography>
                ))}
            </Box>
        );
    }
    return null;
}

// ─── Skeleton Shimmer ───────────────────────────────────────

export function HintSkeleton() {
    const shimmerSx = {
        borderRadius: 1,
        bgcolor: "rgba(0, 212, 255, 0.08)",
        animation: "contextShimmer 1.5s ease-in-out infinite",
        "@keyframes contextShimmer": {
            "0%": { opacity: 0.3 },
            "50%": { opacity: 0.7 },
            "100%": { opacity: 0.3 },
        },
    };
    return (
        <Box sx={{
            p: 1.2, borderRadius: 2,
            bgcolor: "rgba(0, 212, 255, 0.04)",
            border: "1px solid rgba(0, 212, 255, 0.08)",
        }}>
            <Box sx={{ height: 10, width: "70%", mb: 0.8, ...shimmerSx }} />
            <Box sx={{ height: 8, width: "50%", ...shimmerSx, animationDelay: "0.3s" }} />
        </Box>
    );
}

// ─── Source Badge ────────────────────────────────────────────

export function SourceBadge({ source }: { source: string }) {
    const colorMap: Record<string, string> = {
        page_context: "rgba(0, 200, 100, 0.5)",
        web_search: "rgba(255, 180, 0, 0.6)",
    };
    const labelMap: Record<string, string> = {
        page_context: "📄 From page",
        web_search: "🔍 Web search",
    };
    return (
        <Typography sx={{
            color: colorMap[source] || "rgba(0, 212, 255, 0.4)",
            fontSize: "0.55rem",
            fontWeight: 600,
            mt: 0.5,
        }}>
            {labelMap[source] || "🧠 General knowledge"}
        </Typography>
    );
}

// ─── Copy to Clipboard Button ───────────────────────────────

export function CopyButton({ text }: { text: string }) {
    return (
        <IconButton
            className="copy-btn"
            size="small"
            onClick={() => {
                try {
                    const ta = document.createElement("textarea");
                    ta.value = text;
                    ta.style.position = "fixed";
                    ta.style.left = "-9999px";
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                } catch {
                    navigator.clipboard?.writeText(text).catch(() => {});
                }
            }}
            sx={{
                position: "absolute", top: 4, right: 4,
                opacity: 0, transition: "opacity 0.15s",
                color: "rgba(0, 212, 255, 0.4)",
                p: 0.3,
                "&:hover": { color: "rgba(0, 212, 255, 0.8)" },
            }}
        >
            <ContentCopyIcon sx={{ fontSize: 12 }} />
        </IconButton>
    );
}

// ─── Follow-up Suggestion Chips ─────────────────────────────

export function FollowUpChips({ followUps, onQuery }: { followUps: string[]; onQuery: (q: string) => void }) {
    if (!followUps || followUps.length === 0) return null;
    return (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
            {followUps.map((fu: string, fi: number) => (
                <Box
                    key={fi}
                    component="button"
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onQuery(fu);
                    }}
                    sx={{
                        px: 1, py: 0.3,
                        fontSize: "0.6rem", fontWeight: 500,
                        color: "rgba(0, 212, 255, 0.7)",
                        bgcolor: "rgba(0, 212, 255, 0.06)",
                        border: "1px solid rgba(0, 212, 255, 0.15)",
                        borderRadius: 1.5,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        "&:hover": {
                            bgcolor: "rgba(0, 212, 255, 0.12)",
                            borderColor: "rgba(0, 212, 255, 0.3)",
                            color: "#00d4ff",
                        },
                    }}
                >
                    {fu}
                </Box>
            ))}
        </Box>
    );
}

// ─── Markdown Content with Link Interception ────────────────

export function MarkdownContent({ html, sx }: { html: string; sx?: any }) {
    return (
        <Box
            onClick={(e: React.MouseEvent) => {
                const target = e.target as HTMLElement;
                const anchor = target.closest('a[data-lura-link]') as HTMLAnchorElement;
                if (anchor?.href) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('biamos:open-as-card', {
                        detail: { url: anchor.href, title: anchor.textContent || anchor.href },
                    }));
                }
            }}
            sx={{
                color: "rgba(255,255,255,0.85)",
                fontSize: "0.75rem",
                lineHeight: 1.6,
                userSelect: "text",
                cursor: "text",
                "& strong, & b": { color: "#00d4ff", fontWeight: 600 },
                "& ul, & ol": { pl: 2, my: 0.5 },
                "& li": { mb: 0.3 },
                "& a": { color: "#4fc3f7", textDecoration: "underline", cursor: "pointer" },
                "& p": { my: 0.3 },
                ...sx,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
