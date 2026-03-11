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
                <Typography variant="h5" sx={gradientTitleSx(GRADIENTS.titleCyan)}>
                    📖 Documentation
                </Typography>
                <Typography variant="caption" sx={{ color: COLORS.textSecondary, lineHeight: 1.5, display: "block", maxWidth: 600 }}>
                    How BiamOS works — architecture, AI pipelines, integrations, and commonly asked questions.
                    A reference guide for developers building on or contributing to BiamOS.
                </Typography>
            </Box>

            {/* ═══ Section 1: Architecture ═══ */}
            <DocSection emoji="🏗️" title="Architecture Overview" color="#00c8ff" defaultOpen>
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

            {/* ═══ Section 2: Intent Pipeline ═══ */}
            <DocSection emoji="⚡" title="Intent Pipeline — How Queries Work" color="#581cff">
                <Typography sx={textSx}>
                    When you type a query in BiamOS, it goes through a <strong>multi-stage AI pipeline</strong>.
                    Each stage is handled by a specialized LLM agent. The pipeline transforms your natural language
                    into a structured API call, then renders the result as a visual card layout.
                </Typography>

                <Typography sx={headingSx}>Pipeline Stages</Typography>
                <FlowStep step="1" label="Concierge (Cache)" description="Checks if the query matches a known group embedding. If yes, skips classification." color="#00c8ff" />
                <FlowStep step="2" label="Classifier" description="Determines the intent type: API_CALL, WEB_SEARCH, NAVIGATE, OPEN_APP, GENERAL_KNOWLEDGE." color="#581cff" />
                <FlowStep step="3" label="Router" description="Selects the best integration endpoint using semantic matching + LLM reasoning." color="#00dc64" />
                <FlowStep step="4" label="Param Extractor" description="Extracts API parameters from the query (e.g., 'weather in Berlin' → city=Berlin)." color="#ff9800" />
                <FlowStep step="5" label="API Call" description="Executes the HTTP request with extracted params and auth config." color="#00c8ff" />
                <FlowStep step="6" label="Guard" description="Validates the API response — retries on error or redirects if needed." color="#ff6b6b" />
                <FlowStep step="7" label="Layout Architect" description="AI generates a block-based layout (JSON) for displaying the API response data." color="#e040fb" />
                <FlowStep step="8" label="UI Renderer" description="React renders the layout as visual blocks (cards, charts, lists, etc.)." color="#40c4ff" />

                <Typography sx={headingSx}>Key Concepts</Typography>
                <Typography sx={textSx}>
                    <strong>Embeddings:</strong> Each integration gets a 768-dimensional vector (via Gemini) for fast semantic matching.
                    The Concierge compares your query embedding against all group embeddings using cosine similarity.
                </Typography>
                <Typography sx={textSx}>
                    <strong>Agents vs. Services:</strong> Agents are LLM-powered (they call an AI model). Services are
                    deterministic code (embedding, caching, routing). Agents are configurable in the Agents panel.
                </Typography>
            </DocSection>

            {/* ═══ Section 3: Copilot & AI Create ═══ */}
            <DocSection emoji="🌐" title="Copilot & AI Create" color="#00dc64">
                <Typography sx={textSx}>
                    BiamOS has two AI-powered creation tools: the <strong>Context Copilot</strong> (sidebar assistant)
                    and the <strong>AI Create / Builder</strong> (auto-generates integrations from API docs).
                </Typography>

                <Typography sx={headingSx}>Context Copilot</Typography>
                <Typography sx={textSx}>
                    The Copilot sidebar analyzes the current webpage you're viewing inside the built-in browser.
                    It extracts DOM content, detects the page context, and provides contextual AI insights.
                </Typography>
                <FlowStep step="1" label="DOM Extraction" description="Strips scripts/styles, extracts meaningful text from the active webview." color="#00dc64" />
                <FlowStep step="2" label="Context Analysis" description="LLM identifies the page topic, key entities, and actionable data." color="#00c8ff" />
                <FlowStep step="3" label="Hint Generation" description="Suggests relevant actions (e.g., 'Check stock price' when on a finance page)." color="#581cff" />
                <FlowStep step="4" label="Chat Interface" description="Users can ask follow-up questions — Copilot uses web search + page context." color="#ff9800" />

                <Typography sx={headingSx}>AI Create (Builder Pipeline)</Typography>
                <Typography sx={textSx}>
                    The Builder takes an API documentation URL and auto-generates a full integration with endpoints,
                    param schemas, and block layouts. It uses two specialized agents:
                </Typography>
                <FlowStep step="1" label="Blueprint Generator" description="Reads API docs and creates a structured endpoint definition (name, method, params, triggers)." color="#581cff" />
                <FlowStep step="2" label="Docs Verifier" description="Cross-checks the blueprint against the original docs — catches hallucinated endpoints." color="#ff6b6b" />
                <FlowStep step="3" label="Save & Embed" description="Stores the integration in the DB and generates embeddings for semantic routing." color="#00dc64" />

                <Typography sx={headingSx}>LLM Provider Setup</Typography>
                <Typography sx={textSx}>
                    BiamOS requires an LLM provider to power all AI features. Currently supported:
                    <strong> OpenRouter</strong> (recommended, cloud-based, many models) and{" "}
                    <strong>Ollama</strong> (local, private, requires installation).
                    Configure your API key in Settings → LLM.
                </Typography>
            </DocSection>

            {/* ═══ Section 4: Integration Manager ═══ */}
            <DocSection emoji="🔌" title="Integration Manager" color="#ff9800">
                <Typography sx={textSx}>
                    Integrations connect BiamOS to external APIs. Each integration has one or more
                    <strong> endpoints</strong> grouped under a common name. BiamOS routes queries to the
                    best-matching endpoint using semantic similarity + LLM reasoning.
                </Typography>

                <Typography sx={headingSx}>Integration Types</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2 }}>
                    <TechBadge name="API Integration" desc="REST API calls with auto-param extraction. Powers data cards." />
                    <TechBadge name="Web Integration" desc="Iframe-based. Opens websites as tabs inside BiamOS." />
                    <TechBadge name="Template" desc="Pre-built integrations from the Template Shop (Wikipedia, Pexels, etc.)." />
                    <TechBadge name="Custom" desc="User-created via AI Create or manual setup." />
                </Box>

                <Typography sx={headingSx}>Key Fields</Typography>
                <Typography sx={textSx}>
                    <Box component="span" sx={codeSx}>group_name</Box> — Groups multiple endpoints under one integration.<br />
                    <Box component="span" sx={codeSx}>human_triggers</Box> — Keywords that help the Concierge match queries (e.g., "weather | forecast | temperature").<br />
                    <Box component="span" sx={codeSx}>endpoint_tags</Box> — LLM-optimized tags for endpoint selection within a group.<br />
                    <Box component="span" sx={codeSx}>api_config</Box> — JSON auth config: API key, bearer token, OAuth setup.<br />
                    <Box component="span" sx={codeSx}>allowed_blocks</Box> — Restricts which UI blocks the Layout Architect can use for this endpoint.
                </Typography>

                <Typography sx={headingSx}>Health Checks</Typography>
                <Typography sx={textSx}>
                    BiamOS can ping integration endpoints to verify they're reachable. Status:
                    🟢 healthy, 🟡 degraded (slow), 🔴 offline (5xx or timeout). Results are stored
                    in the <Box component="span" sx={codeSx}>health_checks</Box> table with full history.
                </Typography>

                <Typography sx={headingSx}>Import / Export</Typography>
                <Typography sx={textSx}>
                    Integrations can be exported as <Box component="span" sx={codeSx}>.biam</Box> packages (JSON format)
                    and shared with other BiamOS users. Import auto-creates all endpoints and config.
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
                    q="How do I add a custom integration?"
                    a="Three ways: (1) Use AI Create — paste an API docs URL and the AI auto-generates endpoints. (2) Use the Template Shop — install pre-built integrations. (3) Manual setup — click 'New Integration' and fill in the endpoint details."
                />
                <FaqItem
                    q="What happens when I click 'Delete All Data'?"
                    a="It purges all user data: integrations, agents, pinned blocks, scraper endpoints, changelog entries, usage logs, and system settings. The database tables remain but are emptied. The page reloads to reset the UI. Note: this is irreversible!"
                />
                <FaqItem
                    q="What are Blocks?"
                    a="Blocks are the visual components that display API data — titles, charts, key-value pairs, image grids, lists, etc. The Layout Architect (an AI agent) selects which blocks to use based on the API response shape. You can restrict which blocks an integration uses via 'allowed_blocks'."
                />
                <FaqItem
                    q="How do embeddings work?"
                    a="BiamOS generates vector embeddings (768-dimensional arrays of numbers) for each integration group. When you type a query, it's also converted to an embedding, and cosine similarity determines which integration is the best match. This happens in the Concierge stage, before any LLM call — making routing extremely fast."
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
