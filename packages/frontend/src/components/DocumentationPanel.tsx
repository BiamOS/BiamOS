// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Developer Documentation Panel
// ============================================================
// In-app documentation for developers explaining how BiamOS
// works — modules, pipelines, architecture, and FAQs.
// ============================================================

import React, { useState } from "react";
import { Box, Typography, Chip } from "@mui/material";
import {
    ExpandMore as ExpandIcon,
    ChevronRight as CollapseIcon,
} from "@mui/icons-material";
import {
    COLORS,
    GRADIENTS,
    gradientTitleSx,
    sectionLabelSx,
    accentAlpha,
} from "./ui/SharedUI";

// ============================================================
// Accordion Section
// ============================================================

interface DocSectionProps {
    emoji: string;
    title: string;
    color: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

function DocSection({ emoji, title, color, defaultOpen = false, children }: DocSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <Box
            sx={{
                mb: 2,
                borderRadius: 2,
                bgcolor: COLORS.surface,
                border: `1px solid ${open ? color + "33" : COLORS.border}`,
                overflow: "hidden",
                transition: "border-color 0.3s ease",
            }}
        >
            {/* Header */}
            <Box
                onClick={() => setOpen(!open)}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 2,
                    cursor: "pointer",
                    userSelect: "none",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.02)" },
                    transition: "background 0.2s",
                }}
            >
                {open ? (
                    <ExpandIcon sx={{ fontSize: 20, color, transition: "transform 0.2s" }} />
                ) : (
                    <CollapseIcon sx={{ fontSize: 20, color: COLORS.textMuted, transition: "transform 0.2s" }} />
                )}
                <Typography sx={{ fontSize: "1rem", fontWeight: 700, color: open ? color : COLORS.textPrimary }}>
                    {emoji} {title}
                </Typography>
            </Box>

            {/* Content */}
            {open && (
                <Box sx={{ px: 3, pb: 2.5, pt: 0 }}>
                    {children}
                </Box>
            )}
        </Box>
    );
}

// ============================================================
// Content Helpers
// ============================================================

const textSx = { color: COLORS.textSecondary, fontSize: "0.84rem", lineHeight: 1.7, mb: 1.5 };
const headingSx = { ...sectionLabelSx, mb: 1, mt: 2, fontSize: "0.72rem" };
const codeSx = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "0.78rem",
    bgcolor: "rgba(0,0,0,0.3)",
    color: accentAlpha(0.8),
    px: 0.8, py: 0.2,
    borderRadius: 0.5,
    display: "inline",
};
const flowStepSx = {
    display: "flex",
    alignItems: "center",
    gap: 1,
    mb: 1,
};
const flowBadgeSx = (color: string) => ({
    height: 22,
    fontSize: "0.68rem",
    fontWeight: 700,
    bgcolor: color + "15",
    color,
    border: `1px solid ${color}30`,
    flexShrink: 0,
});

function FlowStep({ step, label, description, color }: { step: string; label: string; description: string; color: string }) {
    return (
        <Box sx={flowStepSx}>
            <Chip size="small" label={step} sx={flowBadgeSx(color)} />
            <Box>
                <Typography component="span" sx={{ color: COLORS.textPrimary, fontSize: "0.82rem", fontWeight: 600 }}>
                    {label}
                </Typography>
                <Typography component="span" sx={{ color: COLORS.textMuted, fontSize: "0.78rem" }}>
                    {" — "}{description}
                </Typography>
            </Box>
        </Box>
    );
}

function TechBadge({ name, desc }: { name: string; desc: string }) {
    return (
        <Box sx={{
            flex: "1 1 180px",
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: "rgba(0,0,0,0.2)",
            border: `1px solid ${COLORS.border}`,
        }}>
            <Typography sx={{ color: COLORS.textPrimary, fontSize: "0.82rem", fontWeight: 700 }}>{name}</Typography>
            <Typography sx={{ color: COLORS.textMuted, fontSize: "0.72rem", lineHeight: 1.4 }}>{desc}</Typography>
        </Box>
    );
}

function FaqItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <Box
            sx={{
                mb: 1,
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: "rgba(0,0,0,0.15)",
                border: `1px solid ${COLORS.border}`,
                cursor: "pointer",
                "&:hover": { borderColor: COLORS.borderHover },
                transition: "border-color 0.2s",
            }}
            onClick={() => setOpen(!open)}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ color: accentAlpha(0.7), fontSize: "0.82rem", fontWeight: 600, flex: 1 }}>
                    {open ? "▾" : "▸"} {q}
                </Typography>
            </Box>
            {open && (
                <Typography sx={{ color: COLORS.textSecondary, fontSize: "0.8rem", lineHeight: 1.6, mt: 1, pl: 2 }}>
                    {a}
                </Typography>
            )}
        </Box>
    );
}

// ============================================================
// Main Component
// ============================================================

export const DocumentationPanel = React.memo(function DocumentationPanel() {
    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" sx={gradientTitleSx()}>
                    📖 Documentation
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textSecondary, lineHeight: 1.5, display: "block", maxWidth: 600 }}>
                    How BiamOS works — architecture, AI pipelines, integrations, and commonly asked questions.
                    A reference guide for developers building on or contributing to BiamOS.
                </Typography>
            </Box>

            {/* ═══ Section 1: Architecture ═══ */}
            <DocSection emoji="🏗️" title="Architecture Overview" color={COLORS.accentLight} defaultOpen>
                <Typography sx={textSx}>
                    BiamOS is an <strong>AI-native workspace OS</strong> built as an Electron desktop app.
                    The frontend (React + Vite) communicates with a local backend (Hono HTTP server) over{" "}
                    <Box component="span" sx={codeSx}>localhost:3001</Box>. All data is stored in a local SQLite
                    database via Drizzle ORM — no cloud, no external databases.
                </Typography>

                <Typography sx={headingSx}>System Flow</Typography>
                <Typography sx={{ ...textSx, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", bgcolor: "rgba(0,0,0,0.25)", p: 1.5, borderRadius: 1, lineHeight: 2 }}>
                    {"┌──────────────┐    HTTP     ┌──────────────┐    Drizzle    ┌──────────┐"}<br />
                    {"│   Frontend   │ ◄────────►  │   Backend    │ ◄──────────►  │  SQLite  │"}<br />
                    {"│  React/Vite  │  /api/*     │  Hono Server │   ORM         │  BiamOS  │"}<br />
                    {"└──────┬───────┘             └──────┬───────┘               │   .db    │"}<br />
                    {"       │                            │                       └──────────┘"}<br />
                    {"       │ IPC                        │ fetch"}<br />
                    {"┌──────┴───────┐             ┌──────┴───────┐"}<br />
                    {"│   Electron   │             │  LLM Provider│"}<br />
                    {"│    Shell     │             │  (OpenRouter │"}<br />
                    {"│  + Webview   │             │   / Ollama)  │"}<br />
                    {"└──────────────┘             └──────────────┘"}<br />
                </Typography>

                <Typography sx={headingSx}>Technology Stack</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                    <TechBadge name="Electron" desc="Desktop shell, webview management, IPC" />
                    <TechBadge name="React + TypeScript" desc="Frontend UI with MUI components" />
                    <TechBadge name="Vite" desc="Fast dev server and production bundler" />
                    <TechBadge name="Hono" desc="Lightweight HTTP backend (replaces Express)" />
                    <TechBadge name="Drizzle ORM" desc="Type-safe SQLite queries and migrations" />
                    <TechBadge name="SQLite (libSQL)" desc="Local-first database, zero config" />
                    <TechBadge name="OpenRouter / Ollama" desc="LLM provider for all AI agents" />
                    <TechBadge name="MiniLM / Gemini" desc="Embedding models for semantic matching" />
                </Box>

                <Typography sx={headingSx}>Project Structure</Typography>
                <Typography sx={{ ...textSx, fontFamily: "'JetBrains Mono', monospace", fontSize: "0.74rem", bgcolor: "rgba(0,0,0,0.25)", p: 1.5, borderRadius: 1, lineHeight: 1.8 }}>
                    {"packages/"}<br />
                    {"  ├── frontend/     React + Vite (port 5173)"}<br />
                    {"  │   └── src/"}<br />
                    {"  │       ├── components/   UI panels, blocks, dialogs"}<br />
                    {"  │       ├── hooks/        Reusable state hooks"}<br />
                    {"  │       ├── theme/        Design tokens (COLORS, GRADIENTS)"}<br />
                    {"  │       └── types/        TypeScript interfaces"}<br />
                    {"  ├── backend/      Hono API server (port 3001)"}<br />
                    {"  │   └── src/"}<br />
                    {"  │       ├── agents/       AI pipeline stages"}<br />
                    {"  │       ├── db/           Schema, bootstrap, migrations"}<br />
                    {"  │       ├── routes/       API endpoints (REST)"}<br />
                    {"  │       ├── services/     Business logic"}<br />
                    {"  │       └── prompts/      LLM system prompts"}<br />
                    {"  └── electron/     Electron main process + preload"}<br />
                </Typography>
            </DocSection>

            {/* ═══ Section 2: Agent Pipeline ═══ */}
            <DocSection emoji="⚡" title="Agent Pipeline — How AI Browses" color={COLORS.accent}>
                <Typography sx={textSx}>
                    When you type a command starting with <Box component="span" sx={codeSx}>/act</Box> or a general statement, BiamOS routes it through a <strong>Multi-Agent Pipeline</strong>.
                    Instead of translating commands into static REST APIs, the AI now physically controls a headless browser using native OS-level inputs.
                </Typography>

                <Typography sx={headingSx}>Pipeline Stages</Typography>
                <FlowStep step="1" label="Semantic Router" description="Determines the intent type: RESEARCH, ACT, NAVIGATE, or GENERAL_KNOWLEDGE." color={COLORS.accentLight} />
                <FlowStep step="2" label="Domain Brain Retrieval" description="Fetches specific rules, instructions, or selector hints from RAG memory for the current domain." color={COLORS.accent} />
                <FlowStep step="3" label="WORMHOLE Executor" description="Performs live 4D raycasting on the DOM to find coordinates of elements without relying on fragile CSS selectors." color={COLORS.accentDark} />
                <FlowStep step="4" label="GhostCursor Sync" description="Animates the visual cursor to match the physical raycast coordinates, simulating human trajectories (Bézier)." color={COLORS.accentLight} />
                <FlowStep step="5" label="Native OS Input" description="Dispatches real OS-level mouse clicks and keyboard events through Electron." color={COLORS.accent} />
                <FlowStep step="6" label="The Librarian" description="Observes execution. If the agent fails or loops, it distills 'Avoid Rules' for future runs." color="#ff6b6b" />

                <Typography sx={headingSx}>Key Concepts</Typography>
                <Typography sx={textSx}>
                    <strong>Muscle Memory:</strong> Successful workflows (e.g., booking a flight) are saved locally as cached JSON step sequences. When asked again, BiamOS replays the cache instead of querying the LLM for planning.
                </Typography>
            </DocSection>

            {/* ═══ Section 3: Copilot ═══ */}
            <DocSection emoji="🌐" title="Context Copilot" color="#00dc64">
                <Typography sx={textSx}>
                    The <strong>Context Copilot</strong> is your persistent sidebar assistant. It actively observes your
                    browser tabs and answers questions using live page data without requiring dedicated API integrations.
                </Typography>

                <Typography sx={headingSx}>How it Works</Typography>
                <FlowStep step="1" label="DOM Extraction" description="Strips scripts/styles, extracts meaningful text from the active webview." color="#00dc64" />
                <FlowStep step="2" label="Context Analysis" description="LLM identifies the page topic, key entities, and actionable data." color={COLORS.accentLight} />
                <FlowStep step="3" label="Chat Interface" description="You can ask follow-up questions — Copilot understands the context of the current active tab." color="#ff9800" />
                
                <Typography sx={headingSx}>LLM Provider Setup</Typography>
                <Typography sx={textSx}>
                    BiamOS requires an LLM provider to power all AI features. Currently supported:
                    <strong> OpenRouter</strong> (recommended, cloud-based, many models) and{" "}
                    <strong>Ollama</strong> (local, private, requires installation).
                    Configure your API key in Settings → LLM.
                </Typography>
            </DocSection>

            {/* ═══ Section 4: Domain Brain ═══ */}
            <DocSection emoji="🧠" title="The Domain Brain" color="#ff9800">
                <Typography sx={textSx}>
                    The <strong>Domain Brain</strong> is the core memory system of BiamOS. Instead of brittle, hardcoded
                    scripts for individual websites, the agent learns how to interact with DOM elements dynamically over time.
                </Typography>

                <Typography sx={headingSx}>RAG Tier System</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2 }}>
                    <TechBadge name="Tier 1: Global" desc="Rules applying to all websites (e.g., always accept cookie banners)." />
                    <TechBadge name="Tier 2: Domain" desc="Rules for specific domains (e.g., youtube.com)." />
                    <TechBadge name="Tier 3: Subdomain" desc="Rules for subdomains (e.g., studio.youtube.com)." />
                    <TechBadge name="Tier 4: Exact Path" desc="Rules for specific pages (e.g., /upload) using Regex matching." />
                </Box>

                <Typography sx={headingSx}>Knowledge Types</Typography>
                <Typography sx={textSx}>
                    <Box component="span" sx={codeSx}>user_instruction</Box> — High-level intent ("On GitHub, always prefer dark mode").<br />
                    <Box component="span" sx={codeSx}>selector_rule</Box> — Specific hints about the DOM ("The search bar is typically in div#search-container").<br />
                    <Box component="span" sx={codeSx}>avoid_rule</Box> — Negative reinforcement automatically generated by The Librarian to stop infinite loops.
                </Typography>

                <Typography sx={headingSx}>Learned Interface</Typography>
                <Typography sx={textSx}>
                    You can manage, manually create, or delete RAG entries directly from the <strong>Knowledge Base</strong> panel in the UI. 
                    This allows you to explicitly train the agent on how to use internal company tools or complex web applications.
                </Typography>
            </DocSection>

            {/* ═══ Section 5: FAQ ═══ */}
            <DocSection emoji="❓" title="Frequently Asked Questions" color={accentAlpha(0.8) as string}>
                <FaqItem
                    q="Why do I need an API key?"
                    a="BiamOS uses large language models (LLMs) to understand your queries, route them to the right API, and generate visual layouts. These models run in the cloud (OpenRouter) or locally (Ollama). You need an API key to authenticate with the cloud provider. Without it, all AI features are disabled."
                />
                <FaqItem
                    q="What is OpenRouter?"
                    a="OpenRouter is an LLM gateway that gives you access to hundreds of AI models (GPT-4, Gemini, Claude, Llama, etc.) through a single API key. BiamOS uses it as the default provider because it offers the best model variety and reliability. You can sign up at openrouter.ai."
                />
                <FaqItem
                    q="Can I use BiamOS without internet?"
                    a="Partially. If you use Ollama as your LLM provider, AI features work offline. However, API integrations (weather, stock data, etc.) require internet to reach the external APIs. Web integrations also need internet for iframe content."
                />
                <FaqItem
                    q="How do I teach the agent a new flow?"
                    a="You don't need to 'program' it. Just ask it to perform a task. If it struggles, instruct it carefully via the Copilot chat. When it succeeds, BiamOS automatically saves the workflow as 'Muscle Memory'. Alternatively, you can explicitly add rules in the Knowledge Base."
                />
                <FaqItem
                    q="What happens when I click 'Delete All Data'?"
                    a="It purges all user data: agent memory, learned rules, pinned blocks, changelog entries, and system settings. The database tables remain but are emptied. The page reloads to reset the UI. Note: this is irreversible!"
                />
                <FaqItem
                    q="What are Blocks?"
                    a="Blocks are our internal visual component design system — titles, charts, key-value pairs, image grids, lists, etc. The Layout Architect (an AI agent) selectively uses these components to build custom reports and dashboards dynamically."
                />
                <FaqItem
                    q="How does semantic routing work?"
                    a="BiamOS generates vector embeddings (768-dimensional arrays of numbers) for intents. When you type a query, it's also converted to an embedding. This enables the agent to pattern-match commands ('find John on LinkedIn' vs. 'open John Doe LI profile') without exact text matches."
                />
                <FaqItem
                    q="Where is my data stored?"
                    a="All data is stored locally in a SQLite database at packages/backend/data/BiamOS.db. Nothing is sent to external servers except API calls to your configured LLM provider and integration endpoints. Your data stays on your machine."
                />
                <FaqItem
                    q="What AI models does BiamOS use?"
                    a="By default: Gemini 2.5 Flash Lite for fast agents (classifier, param-extractor) and Gemini 2.5 Flash for thinking agents (router, layout-architect). You can change any agent's model in Settings → Agents. For embeddings, it uses MiniLM (384-dim) and Gemini Embedding (768-dim)."
                />
            </DocSection>
        </Box>
    );
});
