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
import { getChatTokens } from "../../../theme/theme";

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

        let block: string;
        if (lang === "copy") {
            // Special COPY block — rendered as a styled copyable card
            block = `<div class="copy-block" data-copy-text="${escaped.replace(/"/g, '&quot;')}" style="position:relative;background:rgba(0,220,130,0.06);border:1px solid rgba(0,220,130,0.2);border-left:3px solid rgba(0,220,130,0.5);border-radius:6px;padding:10px 36px 10px 12px;margin:8px 0;cursor:pointer;transition:background 0.15s" onmouseenter="this.style.background='rgba(0,220,130,0.1)'" onmouseleave="this.style.background='rgba(0,220,130,0.06)'"><span style="position:absolute;top:6px;right:8px;font-size:0.55rem;color:rgba(0,220,130,0.6);font-weight:600;display:flex;align-items:center;gap:2px">📋 COPY</span><pre style="margin:0;font-family:inherit;font-size:0.72rem;line-height:1.6;color:rgba(255,255,255,0.9);white-space:pre-wrap;word-break:break-word">${escaped}</pre></div>`;
        } else {
            const langLabel = lang
                ? `<span style="position:absolute;top:4px;right:8px;font-size:0.55rem;color:rgba(0,212,255,0.5);text-transform:uppercase;font-weight:600">${lang}</span>`
                : '';
            block = `<div style="position:relative;background:rgba(0,0,0,0.4);border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:8px 10px;margin:6px 0;overflow-x:auto">${langLabel}<pre style="margin:0;font-family:'Fira Code','Consolas',monospace;font-size:0.65rem;line-height:1.5;color:#e0f0ff;white-space:pre-wrap;word-break:break-word">${escaped}</pre></div>`;
        }
        codeBlocks.push(block);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
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

        const codeMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
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
                // Handle link clicks
                const anchor = target.closest('a[data-lura-link]') as HTMLAnchorElement;
                if (anchor?.href) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('biamos:open-as-card', {
                        detail: { url: anchor.href, title: anchor.textContent || anchor.href },
                    }));
                    return;
                }
                // Handle copy-block clicks
                const copyBlock = target.closest('.copy-block') as HTMLElement;
                if (copyBlock) {
                    e.stopPropagation();
                    const rawText = copyBlock.getAttribute('data-copy-text') || '';
                    // Decode HTML entities for clean clipboard text
                    const tmp = document.createElement('textarea');
                    tmp.innerHTML = rawText;
                    const cleanText = tmp.value;
                    navigator.clipboard?.writeText(cleanText).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = cleanText;
                        ta.style.position = 'fixed';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                    });
                    // Visual feedback
                    const label = copyBlock.querySelector('span');
                    if (label) {
                        const orig = label.innerHTML;
                        label.innerHTML = '✓ Copied!';
                        label.style.color = 'rgba(0, 220, 130, 1)';
                        setTimeout(() => { label.innerHTML = orig; label.style.color = ''; }, 1500);
                    }
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

// ─── Copyable Markdown with per-section copy buttons ────────

/** Split markdown source into logical sections, preserving fenced code blocks */
function splitMarkdownSections(md: string): string[] {
    // 1. Extract fenced code blocks as atomic units first
    const parts: { text: string; isCode: boolean }[] = [];
    let lastIndex = 0;
    const codeBlockRegex = /```\w*\r?\n[\s\S]*?```/g;
    let match;
    while ((match = codeBlockRegex.exec(md)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: md.substring(lastIndex, match.index), isCode: false });
        }
        parts.push({ text: match[0], isCode: true });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < md.length) {
        parts.push({ text: md.substring(lastIndex), isCode: false });
    }

    // 2. Split non-code parts into paragraphs, keep code blocks as-is
    const sections: string[] = [];
    for (const part of parts) {
        if (part.isCode) {
            sections.push(part.text.trim());
        } else {
            const lines = part.text.split(/\n{2,}/).map(l => l.trim()).filter(Boolean);
            sections.push(...lines);
        }
    }

    return sections.length > 0 ? sections : [md];
}

/** Strip HTML tags for clean clipboard text */
function stripHtml(html: string): string {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

/** Inline copy button that appears on hover */
function SectionCopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = React.useState(false);
    return (
        <IconButton
            size="small"
            className="section-copy-btn"
            onClick={(e) => {
                e.stopPropagation();
                const clean = stripHtml(text);
                navigator.clipboard?.writeText(clean).catch(() => {
                    // Fallback
                    const ta = document.createElement("textarea");
                    ta.value = clean;
                    ta.style.position = "fixed";
                    ta.style.left = "-9999px";
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                });
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
            sx={{
                position: "absolute", top: 2, right: 2,
                opacity: 0, transition: "opacity 0.12s",
                p: 0.3,
                color: copied ? "rgba(0, 220, 130, 0.8)" : "rgba(0, 212, 255, 0.5)",
                "&:hover": { color: copied ? "rgba(0, 220, 130, 1)" : "rgba(0, 212, 255, 0.9)" },
            }}
            title={copied ? "Copied!" : "Copy this section"}
        >
            <ContentCopyIcon sx={{ fontSize: 11 }} />
        </IconButton>
    );
}

export function CopyableMarkdown({ markdown, sx }: { markdown: string; sx?: any }) {
    const sections = splitMarkdownSections(markdown);
    // If only 1 section, render normally without per-section buttons
    if (sections.length <= 1) {
        return <MarkdownContent html={renderMarkdown(markdown)} sx={sx} />;
    }
    return (
        <Box sx={sx}>
            {sections.map((section, i) => {
                const html = renderMarkdown(section);
                return (
                    <Box
                        key={i}
                        sx={{
                            position: "relative",
                            borderRadius: 1,
                            px: 0.5,
                            py: 0.2,
                            mx: -0.5,
                            transition: "background-color 0.12s",
                            "&:hover": {
                                bgcolor: "rgba(0, 212, 255, 0.04)",
                            },
                            "&:hover .section-copy-btn": { opacity: 1 },
                        }}
                    >
                        <SectionCopyBtn text={html} />
                        <MarkdownContent html={html} />
                    </Box>
                );
            })}
        </Box>
    );
}

// ─── Research Progress Bubble (Perplexity-Style Accordion) ──

interface ResearchStep {
    phase: string;
    status: string;
    data?: Record<string, unknown>;
}

export function ResearchProgressBubble({
    steps,
    phase,
    status,
    query,
}: {
    steps: ResearchStep[];
    phase: string;
    status: 'idle' | 'running' | 'done' | 'error';
    query: string;
}) {
    const [expanded, setExpanded] = React.useState(false);
    // Use dark tokens (V2 will add theme mode switching)
    const t = getChatTokens('dark');

    const isRunning = status === 'running';
    const isDone = status === 'done';
    const stepCount = steps.length;

    // Summary label
    const summaryText = isRunning
        ? phase === 'search' ? `Searching...` : phase === 'fetch' ? `Reading ${stepCount} sources...` : `Building dashboard...`
        : isDone
            ? `${stepCount} steps completed`
            : `Research: ${query}`;

    return (
        <Box sx={{
            bgcolor: t.aiBubbleBg,
            borderRadius: t.aiBubbleRadius,
            border: t.border,
            overflow: 'hidden',
            mb: 1,
        }}>
            {/* Accordion Header — always visible */}
            <Box
                onClick={() => setExpanded(!expanded)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 1,
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                }}
            >
                <Box sx={{
                    fontSize: '0.9rem', lineHeight: 1,
                    animation: isRunning ? 'spin 2s linear infinite' : 'none',
                    '@keyframes spin': {
                        '0%': { transform: 'rotate(0deg)' },
                        '100%': { transform: 'rotate(360deg)' },
                    },
                }}>
                    {isRunning ? '🔄' : isDone ? '📊' : '❌'}
                </Box>
                <Typography sx={{
                    flex: 1,
                    fontSize: t.chatFontSize,
                    lineHeight: t.chatLineHeight,
                    fontWeight: t.chatFontWeight,
                    color: t.aiBubbleText,
                }}>
                    {summaryText}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: t.secondaryText }}>
                    {expanded ? '▾' : `▸ ${stepCount}`}
                </Typography>
            </Box>

            {/* Expanded Step List */}
            {expanded && (
                <Box sx={{ px: 1.5, pb: 1, borderTop: t.border }}>
                    {steps.map((step, i) => {
                        const isActive = isRunning && i === steps.length - 1;
                        const icon = step.phase === 'search' ? '🔍'
                            : step.phase === 'fetch' ? '📄'
                            : step.phase === 'synthesize' ? '✨' : '✅';
                        return (
                            <Box key={i} sx={{
                                display: 'flex', alignItems: 'center', gap: 0.8,
                                py: 0.4,
                            }}>
                                {isActive ? (
                                    <Box sx={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        bgcolor: t.statusActive,
                                        animation: 'pulse 1.5s ease-in-out infinite',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 0.4 },
                                            '50%': { opacity: 1 },
                                        },
                                    }} />
                                ) : (
                                    <Typography sx={{ fontSize: '0.7rem', lineHeight: 1 }}>{icon}</Typography>
                                )}
                                <Typography sx={{
                                    fontSize: t.secondaryFontSize,
                                    color: isActive ? t.aiBubbleText : t.secondaryText,
                                    fontWeight: isActive ? 500 : 400,
                                }}>
                                    {step.status}
                                    {step.data && (step.data as any).resultCount ? ` (${(step.data as any).resultCount} results)` : ''}
                                    {step.data && (step.data as any).pagesRead != null ? ` (${(step.data as any).pagesRead} pages)` : ''}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}

// ─── Agent Step Bubble ──────────────────────────────────────

interface AgentStep {
    action: string;
    description: string;
    result?: string;
}

export function AgentStepBubble({
    steps,
    status,
    task,
    currentAction,
    pauseQuestion,
    onConfirm,
    onCancel,
}: {
    steps: AgentStep[];
    status: string;
    task: string;
    currentAction: string;
    /** Set when the agent is paused with ask_user */
    pauseQuestion?: string | null;
    /** User clicked ✅ Yes */
    onConfirm?: () => void;
    /** User clicked ❌ Cancel */
    onCancel?: () => void;
}) {
    const [expanded, setExpanded] = React.useState(false);
    const t = getChatTokens('dark');

    const isRunning = status === 'running';
    const isDone = status === 'done';
    const isError = status === 'error';
    const stepCount = steps.length;

    const stepIcon = (action: string) => {
        switch (action) {
            case 'navigate': return '🌐';
            case 'click': case 'click_at': return '🖱️';
            case 'type_text': return '⌨️';
            case 'scroll': return '📜';
            case 'take_notes': return '📝';
            case 'search_web': return '🔍';
            case 'genui': return '🎨';
            case 'done': return '✅';
            default: return '▸';
        }
    };

    const isPaused = status === 'paused';

    const statusLabel = isRunning
        ? currentAction || 'Working...'
        : isPaused
            ? `⏸️ Waiting for confirmation`
            : isDone
                ? `✅ ${stepCount} steps · Done`
                : isError
                    ? `❌ Failed after ${stepCount} steps`
                    : task;

    return (
        <Box sx={{
            bgcolor: t.aiBubbleBg,
            borderRadius: t.aiBubbleRadius,
            border: t.border,
            overflow: 'hidden',
            mb: 1,
        }}>
            {/* Header */}
            <Box
                onClick={() => setExpanded(!expanded)}
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 1,
                    cursor: 'pointer', userSelect: 'none',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                }}
            >
                <Box sx={{
                    fontSize: '0.9rem', lineHeight: 1,
                    animation: isRunning ? 'botBounce 1s ease-in-out infinite' : 'none',
                    '@keyframes botBounce': {
                        '0%, 100%': { transform: 'translateY(0)' },
                        '50%': { transform: 'translateY(-2px)' },
                    },
                }}>
                    🤖
                </Box>
                <Typography sx={{
                    flex: 1,
                    fontSize: t.chatFontSize,
                    lineHeight: t.chatLineHeight,
                    fontWeight: t.chatFontWeight,
                    color: t.aiBubbleText,
                }}>
                    {statusLabel}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: t.secondaryText }}>
                    {expanded ? '▾' : `▸ ${stepCount}`}
                </Typography>
            </Box>

            {/* Step List */}
            {expanded && steps.length > 0 && (
                <Box sx={{ px: 1.5, pb: 1, borderTop: t.border }}>
                    {steps.map((step, i) => {
                        const isActive = isRunning && i === steps.length - 1;
                        return (
                            <Box key={i} sx={{
                                display: 'flex', alignItems: 'flex-start', gap: 0.8,
                                py: 0.3,
                            }}>
                                {isActive ? (
                                    <Box sx={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        bgcolor: t.statusActive, mt: 0.6,
                                        animation: 'pulse 1.5s ease-in-out infinite',
                                    }} />
                                ) : (
                                    <Typography sx={{ fontSize: '0.7rem', lineHeight: 1, mt: 0.2 }}>
                                        {step.action === 'done' ? '✅' : stepIcon(step.action)}
                                    </Typography>
                                )}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={{
                                        fontSize: t.secondaryFontSize,
                                        color: isActive ? t.aiBubbleText : t.secondaryText,
                                        fontWeight: isActive ? 500 : 400,
                                    }}>
                                        {step.description}
                                    </Typography>
                                    {step.result && (
                                        <Typography sx={{
                                            fontSize: '0.65rem',
                                            color: t.secondaryText,
                                            opacity: 0.7,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            → {step.result.split('\n')[0].substring(0, 80)}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}

            {/* ⏸️ Pause Confirmation Card — shown when agent calls ask_user */}
            {isPaused && pauseQuestion && (
                <Box sx={{
                    mx: 1.5, mb: 1.5, mt: 0.5,
                    p: 1.2,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(255, 180, 50, 0.06)',
                    border: '1px solid rgba(255, 180, 50, 0.25)',
                    borderLeft: '3px solid rgba(255, 180, 50, 0.7)',
                }}>
                    {/* Pause indicator */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.8 }}>
                        <Box sx={{
                            width: 8, height: 8, borderRadius: '50%',
                            bgcolor: 'rgba(255, 180, 50, 0.8)',
                            animation: 'pausePulse 1.8s ease-in-out infinite',
                            '@keyframes pausePulse': {
                                '0%, 100%': { opacity: 0.4, transform: 'scale(0.9)' },
                                '50%': { opacity: 1, transform: 'scale(1.1)' },
                            },
                        }} />
                        <Typography sx={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            color: 'rgba(255, 180, 50, 0.8)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}>
                            Agent waiting
                        </Typography>
                    </Box>

                    {/* The question */}
                    <Typography sx={{
                        fontSize: t.chatFontSize,
                        color: t.aiBubbleText,
                        lineHeight: t.chatLineHeight,
                        mb: 1.2,
                    }}>
                        {pauseQuestion}
                    </Typography>

                    {/* Yes / Cancel buttons */}
                    <Box sx={{ display: 'flex', gap: 0.8 }}>
                        <Box
                            component="button"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onConfirm?.(); }}
                            sx={{
                                flex: 1,
                                py: 0.6, px: 1,
                                fontSize: '0.65rem', fontWeight: 700,
                                color: 'rgba(0, 220, 130, 1)',
                                bgcolor: 'rgba(0, 220, 130, 0.08)',
                                border: '1px solid rgba(0, 220, 130, 0.3)',
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    bgcolor: 'rgba(0, 220, 130, 0.15)',
                                    borderColor: 'rgba(0, 220, 130, 0.6)',
                                },
                            }}
                        >
                            ✅ Yes, continue
                        </Box>
                        <Box
                            component="button"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onCancel?.(); }}
                            sx={{
                                flex: 1,
                                py: 0.6, px: 1,
                                fontSize: '0.65rem', fontWeight: 700,
                                color: 'rgba(255, 100, 100, 0.8)',
                                bgcolor: 'rgba(255, 100, 100, 0.06)',
                                border: '1px solid rgba(255, 100, 100, 0.2)',
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    bgcolor: 'rgba(255, 100, 100, 0.12)',
                                    borderColor: 'rgba(255, 100, 100, 0.4)',
                                },
                            }}
                        >
                            ❌ Cancel
                        </Box>
                    </Box>
                </Box>
            )}
        </Box>
    );
}

