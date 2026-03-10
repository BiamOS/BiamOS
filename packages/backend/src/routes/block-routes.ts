// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Routes
// ============================================================
// Serves metadata + source code for the 26 UI block components.
// Includes AI generation, validation, and custom block creation.
// ============================================================

import { Hono } from "hono";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getChatUrl, getHeaders } from "../services/llm-provider.js";
import { MODEL_FAST } from "../config/models.js";
import { log } from "../utils/logger.js";

const blockRoutes = new Hono();

// ─── Block Registry ─────────────────────────────────────────

interface BlockMeta {
    type: string;
    component: string;
    category: "content" | "data" | "list" | "media";
    file: string;
    description: string;
    isCustom?: boolean;
}

const CORE_BLOCKS: BlockMeta[] = [
    // Content
    { type: "title", component: "TitleBlock", category: "content", file: "ContentBlocks.tsx", description: "Section heading with optional subtitle" },
    { type: "text", component: "TextBlock", category: "content", file: "ContentBlocks.tsx", description: "Body text paragraph" },
    { type: "image", component: "ImageBlock", category: "content", file: "ContentBlocks.tsx", description: "Single image with lightbox" },
    { type: "divider", component: "DividerBlock", category: "content", file: "ContentBlocks.tsx", description: "Horizontal separator line" },
    { type: "spacer", component: "SpacerBlock", category: "content", file: "ContentBlocks.tsx", description: "Vertical whitespace" },
    { type: "callout", component: "CalloutBlock", category: "content", file: "ContentBlocks.tsx", description: "Alert/notice box (info, warning, tip)" },
    { type: "accordion", component: "AccordionBlock", category: "content", file: "ContentBlocks.tsx", description: "Collapsible sections" },
    // Data
    { type: "hero", component: "HeroBlock", category: "data", file: "DataBlocks.tsx", description: "Large stat with gradient text" },
    { type: "key_value", component: "KeyValueBlock", category: "data", file: "DataBlocks.tsx", description: "Key-value pair grid" },
    { type: "stat_bar", component: "StatBarBlock", category: "data", file: "DataBlocks.tsx", description: "Horizontal progress bars" },
    { type: "table", component: "TableBlock", category: "data", file: "DataBlocks.tsx", description: "Data table with headers" },
    { type: "metric_row", component: "MetricRowBlock", category: "data", file: "DataBlocks.tsx", description: "Row of metric cards" },
    { type: "rating", component: "RatingBlock", category: "data", file: "DataBlocks.tsx", description: "Star rating display" },
    { type: "timeline", component: "TimelineBlock", category: "data", file: "DataBlocks.tsx", description: "Chronological event list" },
    // List
    { type: "chip_list", component: "ChipListBlock", category: "list", file: "ListBlocks.tsx", description: "Tag/chip collection" },
    { type: "list", component: "ListBlock", category: "list", file: "ListBlocks.tsx", description: "Bulleted list with optional badges" },
    { type: "grid", component: "GridBlock", category: "list", file: "ListBlocks.tsx", description: "Multi-column layout container" },
    // Media
    { type: "image_grid", component: "ImageGridBlock", category: "media", file: "MediaBlocks.tsx", description: "Photo grid with lightbox" },
    { type: "progress_ring", component: "ProgressRingBlock", category: "media", file: "MediaBlocks.tsx", description: "Circular progress indicator" },
    { type: "badge_row", component: "BadgeRowBlock", category: "media", file: "MediaBlocks.tsx", description: "Row of icon badges" },
    { type: "quote", component: "QuoteBlock", category: "media", file: "MediaBlocks.tsx", description: "Styled quotation block" },
    { type: "code", component: "CodeBlock", category: "media", file: "MediaBlocks.tsx", description: "Syntax-highlighted code" },
    { type: "link_list", component: "LinkListBlock", category: "media", file: "MediaBlocks.tsx", description: "Clickable link collection" },
    { type: "hero_image", component: "HeroImageBlock", category: "media", file: "MediaBlocks.tsx", description: "Full-width image with overlay text" },
    { type: "media_card", component: "MediaCardBlock", category: "media", file: "MediaBlocks.tsx", description: "Image card with title + description" },
    { type: "video", component: "VideoBlock", category: "media", file: "MediaBlocks.tsx", description: "Embedded video player" },
    // System / Interactive
    { type: "calculator", component: "CalculatorBlock", category: "data", file: "CalculatorBlock.tsx", description: "Interactive calculator with Math.js API" },
];

// Resolve the blocks directory (frontend source)
const BLOCKS_DIR = resolve(import.meta.dirname, "../../../frontend/src/components/blocks");
const CUSTOM_BLOCKS_FILE = "CustomBlocks.tsx";
const CUSTOM_BLOCKS_PATH = resolve(BLOCKS_DIR, CUSTOM_BLOCKS_FILE);

/** Load custom blocks from CustomBlocks.tsx header comments */
function loadCustomBlocks(): BlockMeta[] {
    if (!existsSync(CUSTOM_BLOCKS_PATH)) return [];
    const src = readFileSync(CUSTOM_BLOCKS_PATH, "utf-8");
    const blocks: BlockMeta[] = [];
    // Parse registry comments: // @block type=xxx component=Xxx category=xxx description=xxx
    const regex = /\/\/ @block type=(\S+) component=(\S+) category=(\S+) description=(.+)/g;
    let m;
    while ((m = regex.exec(src)) !== null) {
        blocks.push({
            type: m[1],
            component: m[2],
            category: m[3] as BlockMeta["category"],
            file: CUSTOM_BLOCKS_FILE,
            description: m[4].trim(),
            isCustom: true,
        });
    }
    return blocks;
}

function getAllBlocks(): BlockMeta[] {
    return [...CORE_BLOCKS, ...loadCustomBlocks()];
}

// ─── Available Imports Reference ────────────────────────────

const AVAILABLE_IMPORTS = {
    react: ["React", "useState", "useEffect", "useCallback", "useMemo", "useRef"],
    mui_material: [
        "Box", "Typography", "Chip", "Button", "IconButton",
        "Table", "TableBody", "TableCell", "TableContainer", "TableHead", "TableRow",
        "Grid", "Card", "CardContent", "CardMedia",
        "List", "ListItem", "ListItemText", "ListItemIcon",
        "Accordion", "AccordionSummary", "AccordionDetails",
        "LinearProgress", "CircularProgress", "Avatar", "Tooltip",
        "Divider", "Rating as MuiRating",
    ],
    tokens: {
        COLORS: {
            accent: "#581cff",
            cyan: "#00c8ff",
            textPrimary: "rgba(255, 255, 255, 0.9)",
            textSecondary: "rgba(255, 255, 255, 0.7)",
            textMuted: "rgba(255, 255, 255, 0.4)",
            textFaint: "rgba(255, 255, 255, 0.06)",
            borderFaint: "rgba(255, 255, 255, 0.06)",
            surfaceFaint: "rgba(255, 255, 255, 0.02)",
            surfaceSubtle: "rgba(255, 255, 255, 0.03)",
        },
        GRADIENTS: {
            accent: "linear-gradient(135deg, rgba(88, 28, 255, 0.8), rgba(0, 200, 255, 0.8))",
            title: "linear-gradient(135deg, #fff 0%, rgba(88, 28, 255, 0.7) 100%)",
        },
        SectionLabel: "({ text }: { text: string }) => <Typography>",
    },
};

// ─── AI Prompt ──────────────────────────────────────────────

const GENERATE_BLOCK_PROMPT = `You are a React component engineer for BiamOS — a dark-themed dashboard app.
You create UI block components that the AI uses to compose Canvas layouts.

RULES:
1. Components use React.memo with named function: export const XxxBlock = React.memo(function XxxBlock({...}: XxxBlockSpec) { ... });
2. Use ONLY MUI v6 components: Box, Typography, Chip, Grid, Table, etc.
3. Import design tokens from "./tokens": { COLORS, GRADIENTS, SectionLabel }
4. Dark theme — NEVER use white backgrounds. Use COLORS.surfaceFaint, COLORS.surfaceSubtle for backgrounds.
5. Text colors: COLORS.textPrimary (bright), COLORS.textSecondary (medium), COLORS.textMuted (dim).
6. Accent color: COLORS.accent (#581cff), COLORS.cyan (#00c8ff).
7. All border-radius: 2 (MUI theme units).
8. Component must accept a single props object matching its TypeSpec interface.
9. Interface must extend BaseBlock with { type: "xxx_type" }.
10. Output ONLY valid TSX code — no markdown fences, no explanations.
11. Use sx prop for all styling (no CSS files).
12. Make it beautiful — gradients, subtle glows, smooth transitions.

AVAILABLE COLORS (from tokens.tsx):
- COLORS.accent = "#581cff"
- COLORS.cyan = "#00c8ff"
- COLORS.textPrimary = "rgba(255, 255, 255, 0.9)"
- COLORS.textSecondary = "rgba(255, 255, 255, 0.7)"
- COLORS.textMuted = "rgba(255, 255, 255, 0.4)"
- COLORS.textFaint = "rgba(255, 255, 255, 0.06)"
- COLORS.borderFaint = "rgba(255, 255, 255, 0.06)"
- COLORS.surfaceFaint = "rgba(255, 255, 255, 0.02)"
- COLORS.surfaceSubtle = "rgba(255, 255, 255, 0.03)"

EXAMPLE BLOCK:
\`\`\`tsx
import React from "react";
import { Box, Typography } from "@mui/material";
import { COLORS, SectionLabel } from "./tokens";

export interface PriceCardBlockSpec {
    type: "price_card";
    title: string;
    price: number;
    currency?: string;
    features?: string[];
    label?: string;
}

export const PriceCardBlock = React.memo(function PriceCardBlock({
    title, price, currency = "$", features = [], label,
}: PriceCardBlockSpec) {
    return (
        <Box>
            {label && <SectionLabel text={label} />}
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: COLORS.surfaceSubtle, border: "1px solid " + COLORS.borderFaint }}>
                <Typography sx={{ fontWeight: 700, color: COLORS.textPrimary, mb: 0.5 }}>{title}</Typography>
                <Typography sx={{ fontWeight: 900, fontSize: "2rem", background: "linear-gradient(135deg, #fff, " + COLORS.accent + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    {currency}{price}
                </Typography>
            </Box>
        </Box>
    );
});
\`\`\`

OUTPUT FORMAT:
Return EXACTLY two sections separated by "---TYPE_DEF---":
1. The component code (imports + interface + component)
2. Nothing else after TYPE_DEF marker (we extract the interface from the code)

Now generate a block component.`;

const MODIFY_BLOCK_PROMPT = `You are modifying an existing BiamOS block component.
The user describes what they want changed. Modify the code accordingly.

RULES:
1. Preserve the component structure (React.memo, named function, export).
2. Keep all existing imports. Add new ones only if needed.
3. Keep the interface name and type field — only change props if the user asks.
4. Use ONLY MUI v6 components and COLORS tokens (same as create).
5. Output the COMPLETE modified code — not just the diff. Include all imports.
6. Output ONLY valid TSX code — no markdown fences, no explanations.
7. Dark theme — same rules as before.

Now modify the component:`;

// ─── GET /api/blocks — List all block types ─────────────────

blockRoutes.get("/", (c) => {
    const blocks = getAllBlocks();
    return c.json({ blocks, total: blocks.length });
});

// ─── GET /api/blocks/imports — Available imports reference ──

blockRoutes.get("/imports", (c) => {
    return c.json(AVAILABLE_IMPORTS);
});

// ─── GET /api/blocks/:type/source — Raw source for one block ─

blockRoutes.get("/:type/source", (c) => {
    const type = c.req.param("type");
    const allBlocks = getAllBlocks();
    const meta = allBlocks.find((b) => b.type === type);
    if (!meta) {
        return c.json({ message: `Unknown block type: "${type}"` }, 404);
    }

    try {
        const filePath = resolve(BLOCKS_DIR, meta.file);
        const fullSource = readFileSync(filePath, "utf-8");

        // Extract just this component's source
        const compName = meta.component;
        const functionPattern = new RegExp(
            `(?:// ─[─]+[\\s\\S]*?)?export const ${compName}[\\s\\S]*?^\\}\\);`,
            "m"
        );
        const match = fullSource.match(functionPattern);

        return c.json({
            type: meta.type,
            component: meta.component,
            category: meta.category,
            file: meta.file,
            filePath,
            isCustom: meta.isCustom ?? false,
            source: match ? match[0] : fullSource,
            fullFileSource: fullSource,
        });
    } catch (err) {
        return c.json({
            message: `Failed to read source: ${err instanceof Error ? err.message : err}`,
        }, 500);
    }
});

// ─── PUT /api/blocks/:type/source — Save edited block source ─

blockRoutes.put("/:type/source", async (c) => {
    const type = c.req.param("type");
    const allBlocks = getAllBlocks();
    const meta = allBlocks.find((b) => b.type === type);
    if (!meta) {
        return c.json({ message: `Unknown block type: "${type}"` }, 404);
    }

    const { source } = await c.req.json<{ source: string }>();
    if (!source) {
        return c.json({ message: "source is required" }, 400);
    }

    try {
        const filePath = resolve(BLOCKS_DIR, meta.file);
        writeFileSync(filePath, source, "utf-8");

        return c.json({
            message: `Block "${meta.component}" saved.`,
            file: meta.file,
        });
    } catch (err) {
        return c.json({
            message: `Failed to save: ${err instanceof Error ? err.message : err}`,
        }, 500);
    }
});

// ─── POST /api/blocks/validate — Transpile check ───────────

blockRoutes.post("/validate", async (c) => {
    const { code } = await c.req.json<{ code: string }>();
    if (!code) {
        return c.json({ valid: false, errors: ["No code provided"] }, 400);
    }

    try {
        // Dynamic import sucrase for transpilation check
        const { transform } = await import("sucrase");
        transform(code, {
            transforms: ["typescript", "jsx"],
            jsxRuntime: "automatic",
        });
        return c.json({ valid: true, errors: [] });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Extract line number from error message
        const lineMatch = msg.match(/(\d+):(\d+)/);
        const errors = [{
            message: msg,
            line: lineMatch ? parseInt(lineMatch[1]) : undefined,
            column: lineMatch ? parseInt(lineMatch[2]) : undefined,
        }];
        return c.json({ valid: false, errors });
    }
});

// ─── POST /api/blocks/generate — AI code generation ─────────

blockRoutes.post("/generate", async (c) => {
    const { name, category, description, existingCode, modification } = await c.req.json<{
        name: string;
        category: string;
        description: string;
        existingCode?: string;
        modification?: string;
    }>();

    if (!description?.trim()) {
        return c.json({ message: "description is required" }, 400);
    }

    const isModify = !!existingCode && !!modification;

    const systemPrompt = isModify ? MODIFY_BLOCK_PROMPT : GENERATE_BLOCK_PROMPT;

    const userPrompt = isModify
        ? `EXISTING CODE:\n${existingCode}\n\nMODIFICATION REQUEST: ${modification}`
        : `Create a new block component:
- Block type: "${name || "custom_block"}"
- Component name: "${toPascalCase(name || "CustomBlock")}Block"
- Category: ${category || "content"}
- Description: ${description}

Generate the complete TSX code.`;


    try {
        const chatUrl = await getChatUrl();
        const llmHeaders = await getHeaders("block-generator");
        const response = await fetch(chatUrl, {
            method: "POST",
            headers: llmHeaders,
            body: JSON.stringify({
                model: MODEL_FAST,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.3,
                max_tokens: 4096,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LLM error ${response.status}: ${errText}`);
        }

        const result = await response.json();
        let raw = result.choices?.[0]?.message?.content ?? "";
        // Strip markdown fences if present
        raw = raw.replace(/^```(?:tsx?|jsx?)?[\s]*\n?/gm, "").replace(/\n?```[\s]*$/gm, "").trim();

        // Split on TYPE_DEF marker if present
        const parts = raw.split("---TYPE_DEF---");
        const code = parts[0].trim();


        // Validate the generated code
        let valid = true;
        let validationErrors: any[] = [];
        try {
            const { transform } = await import("sucrase");
            transform(code, {
                transforms: ["typescript", "jsx"],
                jsxRuntime: "automatic",
            });
        } catch (err) {
            valid = false;
            const msg = err instanceof Error ? err.message : String(err);
            const lineMatch = msg.match(/(\d+):(\d+)/);
            validationErrors = [{
                message: msg,
                line: lineMatch ? parseInt(lineMatch[1]) : undefined,
                column: lineMatch ? parseInt(lineMatch[2]) : undefined,
            }];
        }

        return c.json({ code, valid, errors: validationErrors });
    } catch (err) {
        log.error("💥 AI Block Generate error:", err);
        return c.json({
            message: err instanceof Error ? err.message : "Generation failed",
        }, 500);
    }
});

// ─── POST /api/blocks/create — Register a new custom block ──

blockRoutes.post("/create", async (c) => {
    const { type, component, category, description, code } = await c.req.json<{
        type: string;
        component: string;
        category: string;
        description: string;
        code: string;
    }>();

    if (!type || !component || !code) {
        return c.json({ message: "type, component, and code are required" }, 400);
    }

    // Check for duplicates
    const allBlocks = getAllBlocks();
    if (allBlocks.some((b) => b.type === type)) {
        return c.json({ message: `Block type "${type}" already exists` }, 409);
    }

    try {
        // Ensure CustomBlocks.tsx exists
        if (!existsSync(CUSTOM_BLOCKS_PATH)) {
            const header = `// ============================================================
// BiamOS — Custom Blocks (User-Created)
// ============================================================
// New blocks created via the Capsule Manager are saved here.
// Each block is registered with a @block comment.
// ============================================================

import React from "react";
import { Box, Typography, Chip } from "@mui/material";
import { COLORS, GRADIENTS, accentAlpha } from "../ui/SharedUI";

`;
            writeFileSync(CUSTOM_BLOCKS_PATH, header, "utf-8");
        }

        // Read existing file
        let currentSource = readFileSync(CUSTOM_BLOCKS_PATH, "utf-8");

        // Add registry comment + component code
        const registryComment = `\n// @block type=${type} component=${component} category=${category} description=${description}\n`;

        // Strip imports from the new code (they're already in the file header)
        const codeWithoutImports = code
            .replace(/^import\s+.*from\s+["']react["'];?\s*\n?/gm, "")
            .replace(/^import\s+\{[^}]*\}\s+from\s+["']@mui\/material[^"']*["'];?\s*\n?/gm, "")
            .replace(/^import\s+.*from\s+["']\.\/tokens["'];?\s*\n?/gm, "")
            .replace(/^import\s+.*from\s+["']\.\.\/ui\/SharedUI["'];?\s*\n?/gm, "")
            .replace(/^import\s+.*from\s+["']\.\/types["'];?\s*\n?/gm, "")
            .trim();

        // Check if the code needs additional MUI imports
        const existingImports = currentSource.match(/import \{([^}]+)\} from ["']@mui\/material["']/);
        const existingMuiImports = existingImports ? existingImports[1].split(",").map(s => s.trim()) : [];

        // Find MUI components used in the new code
        const muiComponents = ["Grid", "Table", "TableBody", "TableCell", "TableContainer",
            "TableHead", "TableRow", "Card", "CardContent", "CardMedia",
            "List", "ListItem", "ListItemText", "ListItemIcon",
            "Accordion", "AccordionSummary", "AccordionDetails",
            "LinearProgress", "CircularProgress", "Avatar", "Tooltip",
            "Divider", "Button", "IconButton", "Rating"];

        const neededImports = muiComponents.filter(comp =>
            codeWithoutImports.includes(`<${comp}`) && !existingMuiImports.includes(comp)
        );

        if (neededImports.length > 0) {
            const allImports = [...existingMuiImports, ...neededImports];
            currentSource = currentSource.replace(
                /import \{[^}]+\} from ["']@mui\/material["'];?/,
                `import { ${allImports.join(", ")} } from "@mui/material";`
            );
        }

        // Append the new component
        currentSource += registryComment + "\n" + codeWithoutImports + "\n";

        writeFileSync(CUSTOM_BLOCKS_PATH, currentSource, "utf-8");

        return c.json({
            message: `Block "${component}" created.`,
            type,
            component,
            file: CUSTOM_BLOCKS_FILE,
        }, 201);
    } catch (err) {
        log.error("💥 Block create error:", err);
        return c.json({
            message: `Failed to create: ${err instanceof Error ? err.message : err}`,
        }, 500);
    }
});

// ─── DELETE /api/blocks/:type — Delete a custom block ───────

blockRoutes.delete("/:type", async (c) => {
    const type = c.req.param("type");
    const meta = getAllBlocks().find((b) => b.type === type);

    if (!meta) {
        return c.json({ message: `Unknown block: "${type}"` }, 404);
    }
    if (!meta.isCustom) {
        return c.json({ message: `Cannot delete core block "${type}"` }, 403);
    }

    try {
        let source = readFileSync(CUSTOM_BLOCKS_PATH, "utf-8");

        // Find the @block marker for this type
        const markerStr = `// @block type=${type}`;
        const markerIdx = source.indexOf(markerStr);
        if (markerIdx === -1) {
            return c.json({ message: `Block marker not found in source` }, 404);
        }

        // Start = beginning of the marker line (skip preceding blank lines)
        let start = markerIdx;
        while (start > 0 && source[start - 1] === "\n") start--;
        if (start > 0 && source[start - 1] !== "\n") {
            // Don't eat into the previous line's content
            start = markerIdx;
            // But do include one preceding newline if there is one
            if (start > 0 && source[start - 1] === "\n") start--;
        }

        // End = next @block marker, or end of file
        // Search for next @block AFTER the current marker line
        const lineEnd = source.indexOf("\n", markerIdx);
        const searchFrom = lineEnd !== -1 ? lineEnd + 1 : source.length;
        const nextMarker = source.indexOf("// @block ", searchFrom);
        let end = nextMarker !== -1 ? nextMarker : source.length;
        
        // Trim trailing whitespace before the next marker
        while (end > searchFrom && (source[end - 1] === "\n" || source[end - 1] === "\r")) end--;
        // But keep one newline separator if there's a next block
        if (nextMarker !== -1) end = nextMarker;

        source = source.slice(0, start) + source.slice(end);

        // Clean up excessive empty lines
        source = source.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

        writeFileSync(CUSTOM_BLOCKS_PATH, source, "utf-8");

        return c.json({ message: `Block "${meta.component}" deleted.` });
    } catch (err) {
        return c.json({
            message: `Failed to delete: ${err instanceof Error ? err.message : err}`,
        }, 500);
    }
});

// ─── Helpers ────────────────────────────────────────────────

function toPascalCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9\s_-]/g, "")
        .split(/[\s_-]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
}

export { blockRoutes };
