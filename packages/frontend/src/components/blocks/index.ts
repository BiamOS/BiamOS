// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Block Library (barrel export)
// ============================================================
// Import from "components/blocks" to get everything.
// ============================================================

// Types
export type {
    BlockSpec,
    LayoutSpec,
    TitleBlockSpec,
    TextBlockSpec,
    ImageBlockSpec,
    ChipListBlockSpec,
    StatBarBlockSpec,
    KeyValueBlockSpec,
    DividerBlockSpec,
    SpacerBlockSpec,
    HeroBlockSpec,
    TableBlockSpec,
    ListBlockSpec,
    GridBlockSpec,
    ImageGridBlockSpec,
    ProgressRingBlockSpec,
    BadgeRowBlockSpec,
    QuoteBlockSpec,
    CodeBlockSpec,
    LinkListBlockSpec,
} from "./types";
export type { FeedBlockSpec, FeedItemSpec } from "./FeedBlock";

// Tokens
export { COLORS, GRADIENTS, sectionLabelSx, SectionLabel } from "../ui/SharedUI";

// Block Components
export { TitleBlock, TextBlock, ImageBlock, DividerBlock, SpacerBlock } from "./ContentBlocks";
export { HeroBlock, KeyValueBlock, StatBarBlock, TableBlock } from "./DataBlocks";
export { ChipListBlock, ListBlock, GridBlock } from "./ListBlocks";
export {
    ImageGridBlock,
    ProgressRingBlock,
    BadgeRowBlock,
    QuoteBlock,
    CodeBlock,
    LinkListBlock,
    HeroImageBlock,
    MediaCardBlock,
    VideoBlock,
    IframeBlock,
} from "./media";

// Renderer
export { RenderBlock, LayoutRenderer } from "./BlockRenderer";

// Feed
export { FeedBlock } from "./FeedBlock";
