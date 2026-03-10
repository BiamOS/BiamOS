// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Card Group Context
// ============================================================
// Provides the hosting card's _groupName to all child blocks.
// Used by blocks (LinkListBlock, FeedBlock) to pass
// sourceGroupName when opening links as webview tabs.
// ============================================================

import { createContext, useContext } from "react";

const CardGroupContext = createContext<string | undefined>(undefined);

export function useCardGroup(): string | undefined {
    return useContext(CardGroupContext);
}

export { CardGroupContext };
