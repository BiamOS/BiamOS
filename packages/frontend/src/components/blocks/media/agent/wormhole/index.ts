// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── WORMHOLE Module Barrel ──────────────────────────────────
// Re-exports all 4 WORMHOLE modules and their public types.
// Import from here in engine.ts and action handlers.

export { PerceptionEngine, CDPConnectionError } from './PerceptionEngine';
export type { UINode, CdpSender, IpcInvoker } from './PerceptionEngine';

export { StateEngine, ElementLostFatalError } from './StateEngine';

export { StealthExecutor, ObscuredElementError } from './StealthExecutor';
export type { FrameRegistry } from './StealthExecutor';

export { NetworkSandbox } from './NetworkSandbox';
export type { MutationAlert } from './NetworkSandbox';
