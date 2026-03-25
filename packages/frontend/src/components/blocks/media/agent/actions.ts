// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Backward Compatibility Shim ────────────────────────────
// This file is kept only for backward compatibility.
// All action logic has been moved to agent/actions/* (indexed by agent/actions/index.ts).
// New code should import from "agent/actions/index" directly.

export { executeAction } from "./actions/index";
export type { ActionContext } from "./actions/index";
