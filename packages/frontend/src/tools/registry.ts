// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Tool Registry
// ============================================================
// Central registry of all tools the Copilot can use.
// Provides type-safe tool definitions and keyword-based
// matching for automatic tool selection from natural language.
// ============================================================

// ─── Types ──────────────────────────────────────────────────

export interface Tool {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Emoji icon */
    emoji: string;
    /** Short description (shown in dropdown) */
    description: string;
    /** Slash command trigger (e.g., "/act") */
    slashCommand: string;
    /**
     * How this tool runs:
     * - 'agent'    → Starts the autonomous browser agent (needs webview)
     * - 'research' → Runs API-based research engine (no browser, SSE streaming)
     * - 'inline'   → Runs in-place via Context Chat (summarize, translate, extract)
     * - 'tab'      → Creates a new tab (future)
     */
    trigger: 'agent' | 'research' | 'inline' | 'tab';
    /**
     * Keywords for auto-detection from natural language.
     * Matched case-insensitively against the user query.
     */
    keywords: string[];
    /** Default task text when command is used without arguments */
    defaultTask?: string;
}

// ─── Registry ───────────────────────────────────────────────

export const TOOL_REGISTRY: readonly Tool[] = [
    {
        id: 'agent',
        name: 'AI Agent',
        emoji: '🤖',
        description: 'Click, type, navigate autonomously',
        slashCommand: '/act',
        trigger: 'agent',
        keywords: [
            'open', 'go to', 'navigate', 'click', 'type', 'fill',
            'login', 'sign in', 'submit', 'send', 'compose',
            'öffne', 'geh zu', 'klick', 'schreib', 'anmelden',
            'gmail', 'email', 'mail',
        ],
        defaultTask: 'Analyze this page and tell me what you see',
    },
    {
        id: 'research',
        name: 'Research & Dashboard',
        emoji: '📊',
        description: 'Deep research → visual dashboard',
        slashCommand: '/research',
        trigger: 'research',  // API-based research engine, no browser needed
        keywords: [
            'dashboard', 'news', 'neuigkeiten', 'recherche', 'research',
            'zeig mir', 'show me', 'find out', 'überblick', 'trends',
            'aktuell', 'latest', 'zusammenfassen', 'summary',
        ],
        defaultTask: 'Research this topic and create a dashboard',
    },
    {
        id: 'summarize',
        name: 'Summarize',
        emoji: '📝',
        description: 'Summarize this page',
        slashCommand: '/summarize',
        trigger: 'inline',
        keywords: [
            'summarize', 'summary', 'zusammenfassung', 'fass zusammen',
            'tldr', 'overview', 'key points',
        ],
        defaultTask: 'Summarize this page',
    },
    {
        id: 'translate',
        name: 'Translate',
        emoji: '🌍',
        description: 'Translate page content',
        slashCommand: '/translate',
        trigger: 'inline',
        keywords: [
            'translate', 'übersetze', 'translation', 'übersetzung',
        ],
        defaultTask: 'Translate this page to English',
    },
    {
        id: 'extract',
        name: 'Extract',
        emoji: '📊',
        description: 'Extract structured data',
        slashCommand: '/extract',
        trigger: 'inline',
        keywords: [
            'extract', 'extrahiere', 'scrape', 'data', 'daten',
            'table', 'tabelle', 'list',
        ],
        defaultTask: 'Extract the main structured data from this page',
    },
] as const;

// ─── Matchers ───────────────────────────────────────────────

/**
 * Match a slash command to a tool.
 * Returns the tool if the query starts with a known slash command.
 */
export function matchSlashCommand(query: string): { tool: Tool; args: string } | null {
    const trimmed = query.trim().toLowerCase();
    for (const tool of TOOL_REGISTRY) {
        const cmd = tool.slashCommand.toLowerCase();
        if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
            const args = query.replace(new RegExp(`^${tool.slashCommand}\\s*`, 'i'), '').trim();
            return { tool, args };
        }
    }
    return null;
}

/**
 * Auto-detect a tool from natural language query.
 * Returns the best-matching tool based on keyword hits, or null if ambiguous.
 */
export function matchToolFromQuery(query: string): Tool | null {
    const lower = query.toLowerCase();
    let bestTool: Tool | null = null;
    let bestScore = 0;

    for (const tool of TOOL_REGISTRY) {
        let score = 0;
        for (const kw of tool.keywords) {
            if (lower.includes(kw.toLowerCase())) {
                // Longer keywords = stronger signal
                score += kw.length;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestTool = tool;
        }
    }

    // Only return if score is meaningful (at least one keyword matched)
    return bestScore > 0 ? bestTool : null;
}

/**
 * Full tool resolution: try slash command first, then keyword match.
 * Returns the tool and the cleaned argument string.
 */
export function resolveTool(query: string): { tool: Tool; args: string } | null {
    // 1. Explicit slash command
    const slash = matchSlashCommand(query);
    if (slash) return slash;

    // 2. Auto-detect from natural language
    const matched = matchToolFromQuery(query);
    if (matched) return { tool: matched, args: query.trim() };

    return null;
}
