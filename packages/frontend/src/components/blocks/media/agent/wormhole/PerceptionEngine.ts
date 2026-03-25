// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── WORMHOLE / PerceptionEngine ─────────────────────────────
// Sprint 1: Extracts the absolute truth from the V8/Chromium engine.
//
// Architecture:
//   - Uses Accessibility.getFullAXTree as primary perception source
//   - V8 Event-Listener Mining via a single batch IPC roundtrip
//     (Death Trap 1: avoids N×IPC by using 'cdp-get-listeners-batch')
//   - Tracks frameId per node (Death Trap 2: enables IFrame coord offsets)
//   - Result: a flat UINode[] with implicit_action flags
//
// Transport: all CDP calls go via electronAPI.cdpSend (IPC bridge).
// No Playwright. No JS injection into guest pages.

export interface UINode {
    /** backendNodeId from CDP */
    i: number;
    /** Semantic role (e.g. 'button', 'link', 'generic') */
    r: string;
    /** Accessible name */
    n: string;
    /** Current value (input fields) */
    v?: string;
    /** State string (e.g. 'focused', 'disabled') */
    s?: string;
    /** Parent backendNodeId (for flat hierarchy) */
    p?: number;
    /**
     * Origin frameId — non-null when node lives in a cross-origin IFrame.
     * Used by StealthExecutor to apply coordinate offsets (Death Trap 2).
     */
    frameId?: string;
    /**
     * True when V8 mining found a 'click' or 'mousedown' listener on a
     * node that has no semantic interactive role in the AXTree.
     */
    implicit_action?: boolean;
}

/** Thrown when the CDP session is unavailable or drops mid-scan. */
export class CDPConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CDPConnectionError';
    }
}

// ─── AX Roles that are natively interactive ─────────────────
// Nodes with these roles will NEVER need V8 listener mining —
// they are already considered actionable.
const NATIVE_INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'combobox',
    'checkbox', 'radio', 'menuitem', 'tab', 'listbox',
    'option', 'slider', 'spinbutton', 'switch', 'treeitem',
    'menuitemcheckbox', 'menuitemradio', 'scrollbar',
]);

/**
 * CdpSender is the async wrapper around electronAPI.cdpSend.
 * Accepts (method, params?) → returns { ok, result?, error? }.
 */
export type CdpSender = (method: string, params?: object) => Promise<{ ok: boolean; result?: any; error?: string }>;

/**
 * IpcInvoker maps to window.electronAPI.invoke (or equivalent) for
 * handlers that are NOT cdp-send — specifically cdp-get-listeners-batch.
 */
export type IpcInvoker = (channel: string, ...args: any[]) => Promise<any>;

// ─── PerceptionEngine ────────────────────────────────────────

export class PerceptionEngine {
    private readonly cdp: CdpSender;
    private readonly ipc: IpcInvoker;
    private readonly wcId: number;

    /**
     * @param cdp  - Bound CDP sender for the target webContents (calls via electronAPI.cdpSend)
     * @param ipc  - electronAPI.invoke for batch IPC handlers
     * @param wcId - WebContentsId of the target webview
     */
    constructor(cdp: CdpSender, ipc: IpcInvoker, wcId: number) {
        this.cdp = cdp;
        this.ipc = ipc;
        this.wcId = wcId;
    }

    // ─── IFrame Piercing ─────────────────────────────────────
    // Enable auto-attach for subframes (cross-origin iframes).
    // Must be called once before getFlatState() if iframe piercing is needed.

    async enableIFramePiercing(): Promise<void> {
        const resp = await this.cdp('Target.setAutoAttachRelated', {
            waitForDebuggerOnStart: false,
            flatten: true,
        });
        if (!resp.ok) {
            // Non-fatal — if the page has no cross-origin iframes this will fail silently
            console.warn('[WORMHOLE/Perception] setAutoAttachRelated failed (may be no iframes):', resp.error);
        }
    }

    // ─── getFlatState ─────────────────────────────────────────
    /**
     * Primary perception method. Returns a flat, deduplicated array of UINodes
     * that are either natively interactive (AX role) or implicitly interactive
     * (V8 event listener mining).
     *
     * Performance budget: ≤150ms on bursty pages (batch IPC for listener mining).
     */
    async getFlatState(): Promise<UINode[]> {
        const axResp = await this.cdp('Accessibility.getFullAXTree', {});
        if (!axResp.ok) {
            throw new CDPConnectionError(
                `Accessibility.getFullAXTree failed: ${axResp.error ?? 'no result'}`
            );
        }

        const rawNodes: any[] = axResp.result?.nodes ?? [];
        if (rawNodes.length === 0) return [];

        // ── Pass 1: parse all AX nodes ───────────────────────
        const nativeNodes: UINode[] = [];
        const candidateIds: number[] = []; // backendNodeIds of non-interactive nodes to mine

        for (const raw of rawNodes) {
            // Skip completely invisible/ignored nodes
            if (raw.ignored === true) continue;

            const role: string = raw.role?.value ?? 'generic';
            const name: string = raw.name?.value ?? '';
            const backendNodeId: number | undefined = raw.backendDOMNodeId;
            if (!backendNodeId) continue;

            const node: UINode = {
                i: backendNodeId,
                r: role,
                n: name,
                p: raw.parentId ?? undefined,
                frameId: raw.frameId ?? undefined,
            };

            // Value (input/combobox current value)
            if (raw.value?.value !== undefined) node.v = String(raw.value.value);

            // State summary
            const stateKeys = Object.keys(raw.states ?? {}).filter(k => raw.states[k] === true);
            if (stateKeys.length > 0) node.s = stateKeys.join(',');

            if (NATIVE_INTERACTIVE_ROLES.has(role)) {
                nativeNodes.push(node);
            } else {
                // Candidate for V8 mining — only keep nodes that could have listeners
                // (skip pure text, images with no role, etc.)
                if (role === 'generic' || role === 'none' || role === 'group' || role === 'region') {
                    candidateIds.push(backendNodeId);
                }
            }
        }

        // ── Pass 2: V8 Event-Listener Mining (Death Trap 1 Fix) ──
        // One single IPC roundtrip for ALL candidate nodes.
        // main.ts handler 'cdp-get-listeners-batch' runs Promise.all internally.
        const implicitIds = new Set<number>();

        if (candidateIds.length > 0) {
            try {
                const batchResult: number[] = await this.ipc(
                    'cdp-get-listeners-batch',
                    this.wcId,
                    candidateIds,
                );
                if (Array.isArray(batchResult)) {
                    batchResult.forEach(id => implicitIds.add(id));
                }
            } catch (e) {
                // Non-fatal: V8 mining is a best-effort enrichment
                console.warn('[WORMHOLE/Perception] cdp-get-listeners-batch failed:', e);
            }
        }

        // ── Pass 3: Merge implicit nodes into output ──────────
        const implicitNodes: UINode[] = [];
        for (const raw of rawNodes) {
            if (raw.ignored === true) continue;
            const backendNodeId: number | undefined = raw.backendDOMNodeId;
            if (!backendNodeId || !implicitIds.has(backendNodeId)) continue;

            implicitNodes.push({
                i: backendNodeId,
                r: raw.role?.value ?? 'generic',
                n: raw.name?.value ?? '',
                p: raw.parentId ?? undefined,
                frameId: raw.frameId ?? undefined,
                implicit_action: true,
            });
        }

        const result = [...nativeNodes, ...implicitNodes];
        console.log(
            `[WORMHOLE/Perception] getFlatState: ${result.length} nodes total` +
            ` (${nativeNodes.length} native, ${implicitNodes.length} implicit_action)`
        );

        return result;
    }
}
