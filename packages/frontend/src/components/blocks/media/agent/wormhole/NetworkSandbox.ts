// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── WORMHOLE / NetworkSandbox ────────────────────────────────
// Sprint 4: Blast Radius Containment — intercepts destructive HTTP requests
// before they hit the network, giving the user (or supervisor agent)
// approve/deny control over every mutation.
//
// Architecture:
//   - Extends EventEmitter → emits 'mutation_intercepted' with MutationAlert
//   - GET/HEAD/OPTIONS pass through immediately (zero latency path)
//   - POST/PUT/PATCH/DELETE are frozen via CDP Fetch.requestPaused
//   - BLOCKING: agent/user must approve() or deny() each paused request
//   - Death Trap 4 Fix: payload extracted from event.request.postData
//     (Fetch.getResponseBody is unavailable at Request phase — using postData)
//   - Memory Leak Guard: 30s watchdog auto-denies unresolved requests
//     (prevents Chromium network stack freeze)
//
// Transport: 'cdp-fetch-enable/continue/fail' IPC handlers in main.ts
// + 'cdp-fetch-event' event forwarded from debugger.on('message')

import { EventEmitter } from 'events';
import type { CdpSender, IpcInvoker } from './PerceptionEngine';

// ─── Exported Interfaces ──────────────────────────────────────

export interface MutationAlert {
    /** CDP requestId — pass to approve() or deny() */
    requestId: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    /**
     * Truncated request body (max 300 chars) for AI/user inspection.
     * Death Trap 4 Fix: sourced from postData in Fetch.requestPaused event,
     * NOT from Fetch.getResponseBody (which is only valid in Response phase).
     */
    payloadSummary: string;
    timestamp: number;
}

// ─── Internal types ───────────────────────────────────────────

type PendingEntry = {
    timer: ReturnType<typeof setTimeout>;
};

const PASS_THROUGH_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const INTERCEPT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const WATCHDOG_MS = 30_000;

// ─── NetworkSandbox ───────────────────────────────────────────

export class NetworkSandbox extends EventEmitter {
    private readonly cdp: CdpSender;
    private readonly ipc: IpcInvoker;
    private readonly wcId: number;

    /** Map of paused requestId → watchdog timer */
    private readonly pending = new Map<string, PendingEntry>();

    private attached = false;
    private removeEventListener: (() => void) | null = null;

    /**
     * @param cdp   - CDP sender for the target webview
     * @param ipc   - IPC invoker (electronAPI.invoke)
     * @param wcId  - WebContentsId of the target webview
     */
    constructor(cdp: CdpSender, ipc: IpcInvoker, wcId: number) {
        super();
        this.cdp = cdp;
        this.ipc = ipc;
        this.wcId = wcId;
    }

    // ─── attach ──────────────────────────────────────────────

    /**
     * Enables Fetch domain interception and starts listening for paused requests.
     * Must be called once before the agent begins navigating.
     */
    async attach(): Promise<void> {
        if (this.attached) return;

        // Enable Fetch interception for all requests (Request phase)
        await this.cdp('Fetch.enable', {
            patterns: [{ requestStage: 'Request' }],
        });

        // Listen for forwarded Fetch.requestPaused events from main.ts
        // (main.ts forwards debugger messages via 'cdp-fetch-event' IPC channel)
        const handler = (_event: Event) => {
            const customEvent = _event as CustomEvent<{ wcId: number; params: any }>;
            if (customEvent.detail.wcId !== this.wcId) return;
            this.handlePausedRequest(customEvent.detail.params);
        };

        window.addEventListener('wormhole:fetch-event', handler);
        this.removeEventListener = () => window.removeEventListener('wormhole:fetch-event', handler);

        this.attached = true;
        console.log(`[WORMHOLE/Sandbox] Attached to wcId=${this.wcId} — intercepting mutations`);
    }

    /**
     * Disables Fetch interception and cleans up all pending requests.
     * Call when the agent loop ends.
     */
    async detach(): Promise<void> {
        if (!this.attached) return;

        // Auto-deny all pending requests on detach to prevent stack freeze
        for (const [requestId] of this.pending) {
            await this._deny(requestId, 'Aborted').catch(() => { /* already resolved */ });
        }

        await this.cdp('Fetch.disable', {}).catch(() => { /* best-effort */ });
        this.removeEventListener?.();
        this.attached = false;
        console.log(`[WORMHOLE/Sandbox] Detached from wcId=${this.wcId}`);
    }

    // ─── Internal event handler ───────────────────────────────

    private handlePausedRequest(params: any): void {
        const requestId: string = params.requestId;
        const method: string = (params.request?.method ?? 'GET').toUpperCase();
        const url: string = params.request?.url ?? '';

        // ── Fast path: pass-through safe methods ──────────────
        if (PASS_THROUGH_METHODS.has(method)) {
            void this.cdp('Fetch.continueRequest', { requestId });
            return;
        }

        // ── Intercept: destructive mutation ───────────────────
        if (!INTERCEPT_METHODS.has(method as any)) {
            // Unknown method — pass through conservatively
            void this.cdp('Fetch.continueRequest', { requestId });
            return;
        }

        // Death Trap 4 Fix: extract body from postData (available at Request phase)
        // Fetch.getResponseBody would require Response phase — not available here.
        const rawBody: string = params.request?.postData ?? '';
        const payloadSummary = rawBody.length > 300
            ? rawBody.substring(0, 297) + '…'
            : rawBody;

        // Start the 30s watchdog memory-leak guard
        const timer = setTimeout(async () => {
            if (this.pending.has(requestId)) {
                console.warn(
                    `[WORMHOLE/Sandbox] ⏰ Watchdog: request ${requestId} unresolved after ` +
                    `${WATCHDOG_MS}ms — auto-denying to prevent network stack freeze`
                );
                await this._deny(requestId, 'Aborted').catch(() => { /* already gone */ });
            }
        }, WATCHDOG_MS);

        this.pending.set(requestId, { timer });

        const alert: MutationAlert = {
            requestId,
            method: method as MutationAlert['method'],
            url,
            payloadSummary,
            timestamp: Date.now(),
        };

        console.log(`[WORMHOLE/Sandbox] 🛑 Intercepted ${method} ${url} — awaiting approval`);
        this.emit('mutation_intercepted', alert);
    }

    // ─── Resolution methods ───────────────────────────────────

    /**
     * Approve: allow the intercepted request to proceed through to the network.
     */
    async approve(requestId: string): Promise<void> {
        const entry = this.pending.get(requestId);
        if (!entry) {
            console.warn(`[WORMHOLE/Sandbox] approve() called for unknown requestId: ${requestId}`);
            return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(requestId);
        await this.cdp('Fetch.continueRequest', { requestId });
        console.log(`[WORMHOLE/Sandbox] ✅ Approved: ${requestId}`);
    }

    /**
     * Deny: immediately abort the request with AccessDenied (or a custom reason).
     */
    async deny(requestId: string): Promise<void> {
        await this._deny(requestId, 'AccessDenied');
    }

    private async _deny(requestId: string, errorReason: string): Promise<void> {
        const entry = this.pending.get(requestId);
        if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(requestId);
        }
        await this.cdp('Fetch.failRequest', { requestId, errorReason });
        console.log(`[WORMHOLE/Sandbox] 🚫 Denied (${errorReason}): ${requestId}`);
    }

    /** Number of requests currently awaiting resolution. */
    get pendingCount(): number {
        return this.pending.size;
    }
}
