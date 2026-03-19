// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Type Definitions
// ============================================================

export type BlockSpec =
    | TitleBlockSpec
    | TextBlockSpec
    | ImageBlockSpec
    | ChipListBlockSpec
    | StatBarBlockSpec
    | KeyValueBlockSpec
    | DividerBlockSpec
    | HeroBlockSpec
    | TableBlockSpec
    | ListBlockSpec
    | GridBlockSpec
    | SpacerBlockSpec
    | ImageGridBlockSpec
    | ProgressRingBlockSpec
    | BadgeRowBlockSpec
    | QuoteBlockSpec
    | CodeBlockSpec
    | LinkListBlockSpec
    | HeroImageBlockSpec
    | MediaCardBlockSpec
    | VideoBlockSpec
    | MetricRowBlockSpec
    | RatingBlockSpec
    | TimelineBlockSpec
    | CalloutBlockSpec
    | AccordionBlockSpec
    | TextInputBlockSpec
    | SelectBlockSpec
    | CheckboxGroupBlockSpec
    | ToggleBlockSpec
    | SliderBlockSpec
    | FormGroupBlockSpec
    | IframeBlockSpec
    | CalculatorBlockSpec
    | RowBlockSpec;

interface BaseBlock {
    type: string;
    blockId?: string;  // optional ID for block targeting (form → result updates)
}

// ─── Web / Embed Blocks ─────────────────────────────────────

export interface IframeBlockSpec extends BaseBlock {
    type: "iframe";
    url: string;
    title?: string;
    icon?: string;
    height?: number;
    /** When true, agent hooks (useAgentActions, useContextWatcher) are disabled.
     *  Used for link-opened tabs that should be read-only webviews. */
    agentDisabled?: boolean;
    /** GenUI dashboard blocks — when set, renders these blocks instead of webview */
    _genuiBlocks?: any[];
}

// ─── Content Blocks ─────────────────────────────────────────

export interface TitleBlockSpec extends BaseBlock {
    type: "title";
    text: string;
    subtitle?: string;
    align?: "left" | "center" | "right";
    size?: "h3" | "h4" | "h5" | "h6";
}

export interface TextBlockSpec extends BaseBlock {
    type: "text";
    content: string;
    variant?: "body1" | "body2" | "caption";
    color?: string;
}

export interface ImageBlockSpec extends BaseBlock {
    type: "image";
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    rounded?: boolean;
    caption?: string;
}

export interface DividerBlockSpec extends BaseBlock {
    type: "divider";
}

export interface SpacerBlockSpec extends BaseBlock {
    type: "spacer";
    size?: number;
}

// ─── Data Blocks ────────────────────────────────────────────

export interface HeroBlockSpec extends BaseBlock {
    type: "hero";
    value: string | number;
    label: string;
    unit?: string;
    icon?: string;
    gradient?: [string, string];
}

export interface KeyValueBlockSpec extends BaseBlock {
    type: "key_value";
    pairs: { key: string; value: string | number }[];
    columns?: 1 | 2 | 3;
    label?: string;
}

export interface StatBarBlockSpec extends BaseBlock {
    type: "stat_bar";
    items: { label: string; value: number; max?: number }[];
    label?: string;
}

export interface TableBlockSpec extends BaseBlock {
    type: "table";
    headers: string[];
    rows: (string | number)[][];
    label?: string;
}

// ─── List Blocks ────────────────────────────────────────────

export interface ChipListBlockSpec extends BaseBlock {
    type: "chip_list";
    items: string[];
    color?: "primary" | "secondary" | "success" | "error" | "warning" | "info";
    label?: string;
}

export interface ListBlockSpec extends BaseBlock {
    type: "list";
    items: { primary: string; secondary?: string; badge?: string; url?: string }[];
    label?: string;
}

export interface GridBlockSpec extends BaseBlock {
    type: "grid";
    columns?: 2 | 3;
    blocks: BlockSpec[];
}

export interface RowBlockSpec extends BaseBlock {
    type: "row";
    gap?: number;
    blocks: BlockSpec[];
}

// ─── NEW: Media / Rich Blocks ───────────────────────────────

export interface ImageGridBlockSpec extends BaseBlock {
    type: "image_grid";
    images: { src: string; alt?: string; caption?: string }[];
    columns?: 2 | 3 | 4;
    label?: string;
}

export interface ProgressRingBlockSpec extends BaseBlock {
    type: "progress_ring";
    value: number;
    max?: number;
    label: string;
    unit?: string;
    color?: string;
}

export interface BadgeRowBlockSpec extends BaseBlock {
    type: "badge_row";
    badges: { icon?: string; label: string; value?: string | number; color?: string }[];
    label?: string;
}

export interface QuoteBlockSpec extends BaseBlock {
    type: "quote";
    text: string;
    author?: string;
}

export interface CodeBlockSpec extends BaseBlock {
    type: "code";
    content: string;
    language?: string;
    label?: string;
}

export interface LinkListBlockSpec extends BaseBlock {
    type: "link_list";
    links: { label: string; url: string; description?: string }[];
    label?: string;
}

// ─── Layout ─────────────────────────────────────────────────

/** The complete layout that the LLM generates */
export interface LayoutSpec {
    title?: string;
    blocks: BlockSpec[];
}

// ─── NEW: Expanded Blocks (Phase 5) ────────────────────────

export interface HeroImageBlockSpec extends BaseBlock {
    type: "hero_image";
    src: string;
    title?: string;
    subtitle?: string;
    height?: number;
    overlay?: "bottom" | "center" | "top";
}

export interface MediaCardBlockSpec extends BaseBlock {
    type: "media_card";
    src: string;
    title: string;
    description?: string;
    badge?: string;
}

export interface VideoBlockSpec extends BaseBlock {
    type: "video";
    src: string;
    title?: string;
    aspectRatio?: "16:9" | "4:3" | "1:1";
}

export interface MetricRowBlockSpec extends BaseBlock {
    type: "metric_row";
    metrics: { label: string; value: string | number; icon?: string }[];
}

export interface RatingBlockSpec extends BaseBlock {
    type: "rating";
    value: number;
    max?: number;
    label?: string;
    count?: string;
}

export interface TimelineBlockSpec extends BaseBlock {
    type: "timeline";
    events: { time: string; title: string; description?: string }[];
    label?: string;
}

export interface CalloutBlockSpec extends BaseBlock {
    type: "callout";
    variant: "info" | "success" | "warning" | "tip";
    title?: string;
    text: string;
}

export interface AccordionBlockSpec extends BaseBlock {
    type: "accordion";
    sections: { title: string; content: string }[];
    label?: string;
}

// ─── Form Blocks ────────────────────────────────────────────

export interface TextInputBlockSpec extends BaseBlock {
    type: "text_input";
    label: string;
    placeholder?: string;
    inputType?: "text" | "email" | "password" | "number" | "tel" | "url";
    multiline?: boolean;
    rows?: number;
    helperText?: string;
    required?: boolean;
}

export interface SelectBlockSpec extends BaseBlock {
    type: "select";
    label: string;
    options: { value: string; label: string }[];
    placeholder?: string;
    helperText?: string;
    required?: boolean;
}

export interface CheckboxGroupBlockSpec extends BaseBlock {
    type: "checkbox_group";
    label?: string;
    items: { label: string; checked?: boolean }[];
    columns?: 1 | 2 | 3;
}

export interface ToggleBlockSpec extends BaseBlock {
    type: "toggle";
    label: string;
    description?: string;
    defaultValue?: boolean;
}

export interface SliderBlockSpec extends BaseBlock {
    type: "slider";
    label: string;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number;
    unit?: string;
}

export interface FormGroupBlockSpec extends BaseBlock {
    type: "form_group";
    title?: string;
    description?: string;
    submitLabel?: string;
    blocks: BlockSpec[];
    apiEndpoint?: string;        // URL to call on submit
    httpMethod?: string;         // GET or POST (default GET)
    resultBlockId?: string;      // ID of block to update with API response
}

// ─── Interactive / System Blocks ────────────────────────────

export interface CalculatorBlockSpec extends BaseBlock {
    type: "calculator";
}
