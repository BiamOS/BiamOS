// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Electron Main Process
// ============================================================
// Creates the desktop window, enables <webview> tags,
// and starts the backend server automatically.
// ============================================================

import { app, BrowserWindow, session, ipcMain, webContents } from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn, ChildProcess } from "child_process";

// ─── Global popup handler for ALL web contents ─────────────
// Same-origin popups → navigate within the same webview (Gmail emails, account switch)
// Cross-origin popups → open as a new BiamOS tab (YouTube, Drive, etc.)
app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        // ── OAuth popups: allow as real popup windows ──────────
        // Providers like Google Sign-In use window.open() + postMessage
        // to send the auth result back to the parent page. Redirecting
        // these to BiamOS tabs breaks that callback channel.
        const OAUTH_POPUP_PATTERNS = [
            "accounts.google.com",
            "appleid.apple.com",
            "login.microsoftonline.com",
            "login.live.com",
            "github.com/login/oauth",
        ];
        const isOAuthPopup = OAUTH_POPUP_PATTERNS.some((p) => url.includes(p));

        if (isOAuthPopup) {
            console.log(`🔐 [Popup] OAuth provider detected → real popup: ${url}`);
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    width: 500,
                    height: 700,
                    autoHideMenuBar: true,
                    webPreferences: {
                        partition: "persist:lura", // share cookies with webview
                    },
                },
            };
        }

        // ── Normal popups: same-origin vs cross-origin ────────
        let popupHost = "";
        let currentHost = "";
        try {
            popupHost = new URL(url).hostname.replace("www.", "");
            currentHost = new URL(contents.getURL()).hostname.replace("www.", "");
        } catch { /* invalid URL */ }

        // Guard: if either host is empty/unparseable, deny the popup
        // (prevents about:blank loop where "" === "" matches as same-origin)
        if (!popupHost || !currentHost) {
            console.log(`🚫 [Popup] Denied — unparseable URL: ${url}`);
            return { action: "deny" };
        }

        // Same-origin or Google-internal → navigate within the same webview
        const isGoogleInternal = popupHost.endsWith("google.com") && currentHost.endsWith("google.com");
        const isSameOrigin = popupHost === currentHost;

        if (isSameOrigin || isGoogleInternal) {
            console.log(`🔗 [Popup] Same-origin → navigating in-place: ${url}`);
            contents.loadURL(url).catch(() => { /* redirect abort is normal */ });
        } else {
            console.log(`🪟 [Popup] Cross-origin → new BiamOS tab: ${url}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("open-url-in-tab", url);
            }
        }
        return { action: "deny" };
    });
});

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

// ─── Config ─────────────────────────────────────────────────

const IS_PACKAGED = app.isPackaged;
const DEV_FRONTEND_URL = "http://localhost:5173";
const BACKEND_PORT = 3001;

// ─── Backend auto-start ─────────────────────────────────────

async function killPortProcess(port: number): Promise<void> {
    return new Promise((resolve) => {
        const isWin = process.platform === "win32";
        const cmd = isWin ? "powershell" : "sh";
        const args = isWin
            ? ["-Command", `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`]
            : ["-c", `lsof -ti:${port} | xargs kill -9 2>/dev/null || true`];
        const killer = spawn(cmd, args, { shell: false, stdio: "ignore" });
        killer.on("close", () => resolve());
        killer.on("error", () => resolve());
    });
}

async function waitForBackend(port: number, maxWaitMs: number = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://localhost:${port}/api/system/provider`);
            if (res.ok) return true;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

async function startBackend(): Promise<void> {
    // Kill any leftover process on the backend port
    await killPortProcess(BACKEND_PORT);

    let backendDir: string;
    let spawnCmd: string;
    let spawnArgs: string[];

    if (IS_PACKAGED) {
        // ── Packaged app (.app / .exe) ────────────────────────
        // Backend is bundled into <resources>/backend by electron-builder.
        // It's pre-compiled (npm run build) so we run `node dist/server.js`.
        backendDir = path.join(process.resourcesPath, "backend");
        spawnCmd = process.execPath; // use the embedded Node that ships with Electron
        spawnArgs = [path.join(backendDir, "dist", "server.js")];
    } else {
        // ── Development mode ──────────────────────────────────
        // Backend lives next to electron package, run via tsx for hot-reload.
        backendDir = path.resolve(__dirname, "../../backend");
        spawnCmd = "npx";
        spawnArgs = ["tsx", "src/server.ts"];
    }

    console.log(`🚀 Starting backend from: ${backendDir} (${IS_PACKAGED ? 'packaged' : 'dev'})`);

    backendProcess = spawn(spawnCmd, spawnArgs, {
        cwd: backendDir,
        shell: !IS_PACKAGED, // shell needed for npx on Windows; not needed for node
        stdio: "pipe",
        env: { ...process.env, PORT: String(BACKEND_PORT) },
    });

    backendProcess.stdout?.on("data", (data: Buffer) => {
        process.stdout.write(`[BACKEND] ${data}`);
    });

    backendProcess.stderr?.on("data", (data: Buffer) => {
        process.stderr.write(`[BACKEND] ${data}`);
    });

    backendProcess.on("close", (code: number | null) => {
        console.log(`[BACKEND] Exited with code ${code}`);
    });

    // Wait for backend to be healthy
    const healthy = await waitForBackend(BACKEND_PORT);
    if (healthy) {
        console.log("✅ Backend is healthy and ready");
    } else {
        console.log("⚠️ Backend health check timed out — proceeding anyway");
    }
}

// ─── Window creation ────────────────────────────────────────

function createWindow(): void {
    const iconPath = path.join(__dirname, "../assets/icon.png");
    const hasIcon = fs.existsSync(iconPath);
    console.log(`🪟 Creating window... icon=${hasIcon ? iconPath : "none"}`);

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: "BiamOS",
        backgroundColor: "#000000",
        autoHideMenuBar: true,
        show: false,
        icon: hasIcon ? iconPath : undefined,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            webviewTag: true,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    // In packaged mode: load the bundled frontend-dist from resources
    // In dev mode: connect to Vite dev server
    const frontendUrl = IS_PACKAGED
        ? `file://${path.join(process.resourcesPath, 'frontend-dist', 'index.html')}`
        : DEV_FRONTEND_URL;

    console.log("🪟 BrowserWindow created, loading URL:", frontendUrl);
    mainWindow.loadURL(frontendUrl);

    // Show maximized once DOM is ready (so the native splash screen is visible)
    // NOTE: we use dom-ready instead of ready-to-show, because ready-to-show
    // fires AFTER React hydrates — by which time the 2.8s splash is already over.
    mainWindow.webContents.once("dom-ready", () => {
        console.log("🪟 dom-ready fired — showing window (splash visible)");
        mainWindow?.maximize();
        mainWindow?.show();
        mainWindow?.webContents.setZoomFactor(1);
        mainWindow?.webContents.setZoomLevel(0);
    });

    // Fallback: force-show after 10 seconds if ready-to-show never fires
    setTimeout(() => {
        if (mainWindow && !mainWindow.isVisible()) {
            console.warn("⚠️ ready-to-show never fired! Force-showing window...");
            mainWindow.maximize();
            mainWindow.show();
        }
    }, 10_000);

    // Load the Vite dev server
    mainWindow.loadURL(DEV_FRONTEND_URL).catch((err) => {
        console.error("❌ loadURL failed:", err);
    });

    // Log renderer crashes
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        console.error("💀 Renderer process gone:", details.reason, details.exitCode);
    });

    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        console.error("❌ did-fail-load:", errorCode, errorDescription);
    });

    // Prevent main window zoom via Ctrl+=/- and Ctrl+0
    mainWindow.webContents.on("before-input-event", (_event, input) => {
        if (input.control && (input.key === "=" || input.key === "+" || input.key === "-")) {
            _event.preventDefault();
        }
    });

    // Forward renderer console.log to terminal
    mainWindow.webContents.on("console-message", (_event, _level, message) => {
        if (message.includes("[TAB")) console.log(`[RENDERER] ${message}`);
    });

    // Force allowpopups for all webviews from main process
    // This is the ONLY reliable way — React JSX and DOM setAttribute
    // both fail because Electron reads this at webview creation time.
    mainWindow.webContents.on("will-attach-webview", (_event, _webPreferences, params) => {
        (params as any).allowpopups = true;
        console.log("🔓 [Webview] Forced allowpopups via will-attach-webview");
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    console.log("🖥️  BiamOS Desktop window created");
}

// ─── Webview permissions ────────────────────────────────────

/** Apply header stripping + permission grants to a session */
function configureSession(sess: Electron.Session, label: string): void {
    // Strip X-Frame-Options and relax CSP so webviews can load any site
    sess.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };

        delete headers["x-frame-options"];
        delete headers["X-Frame-Options"];

        if (headers["content-security-policy"]) {
            headers["content-security-policy"] = headers["content-security-policy"].map(
                (csp: string) => csp.replace(/frame-ancestors[^;]*(;|$)/gi, "")
            );
        }

        callback({ responseHeaders: headers });
    });

    // Allow microphone access for Speech Recognition
    sess.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = ["media", "audioCapture", "microphone"];
        callback(allowed.includes(permission));
    });

    sess.setPermissionCheckHandler((_webContents, permission) => {
        const allowed = ["media", "audioCapture", "microphone"];
        return allowed.includes(permission);
    });

    console.log(`🔓 [${label}] Session configured — X-Frame-Options stripped, microphone allowed`);
}

function setupWebviewPermissions(): void {
    // Configure the default session (used by the main window)
    configureSession(session.defaultSession, "default");

    // Configure the persist:lura session (used by <webview> tags)
    // This is the key session — it persists cookies/login across restarts
    const webviewSession = session.fromPartition("persist:lura");
    configureSession(webviewSession, "persist:lura");

    console.log("🔓 All sessions configured — webview logins will persist across restarts");
}

// ─── Ghost-Auth: Hidden Webview Scraping (Phase 2) ──────────

function setupScrapeIPC(): void {
    ipcMain.handle("scrape-url", async (_event: Electron.IpcMainInvokeEvent, url: string) => {
        console.log(`  👻 Ghost-Auth: Scraping ${url}`);

        const hidden = new BrowserWindow({
            show: false,
            width: 1280,
            height: 900,
            webPreferences: {
                // Inherit default session (same cookies the user has)
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        try {
            // Load the URL — cookies are inherited from the default session
            await hidden.loadURL(url);

            // Wait for page to settle (SPAs may load async content)
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 5000);
                hidden.webContents.once("did-finish-load", () => {
                    clearTimeout(timeout);
                    // Give JS frameworks a moment to render
                    setTimeout(resolve, 2000);
                });
            });

            // Extract page data
            const result = await hidden.webContents.executeJavaScript(`
                ({
                    url: location.href,
                    title: document.title || "",
                    text: (document.body?.innerText || "").substring(0, 5000)
                })
            `);

            console.log(`  👻 Ghost-Auth: Extracted ${result.text.length} chars from ${url}`);
            return result;
        } catch (err) {
            console.error(`  ❌ Ghost-Auth scrape failed:`, err);
            return {
                url,
                title: "",
                text: "",
                error: err instanceof Error ? err.message : "Scrape failed",
            };
        } finally {
            hidden.destroy();
        }
    });

    console.log("👻 Ghost-Auth IPC handler registered");
}

// ─── Autopilot: Step Execution (Phase 4) ────────────────────

/**
 * Maintains a hidden BrowserWindow per URL for multi-step autopilot
 * sequences (so state persists across steps).
 */
const autopilotWindows = new Map<string, BrowserWindow>();

function setupAutopilotIPC(): void {
    // Get DOM snapshot for planning
    ipcMain.handle("page-snapshot", async (_event: Electron.IpcMainInvokeEvent, taskId: string, url: string) => {
        console.log(`  🤖 Autopilot: Getting snapshot for task ${taskId} (${url})`);
        let win = autopilotWindows.get(taskId);

        if (!win || win.isDestroyed()) {
            win = new BrowserWindow({
                show: false, width: 1280, height: 900,
                webPreferences: { contextIsolation: true, nodeIntegration: false },
            });
            autopilotWindows.set(taskId, win);
            await win.loadURL(url);
            await new Promise<void>((r) => setTimeout(r, 3000)); // Wait for SPA render
        }

        const result = await win.webContents.executeJavaScript(`
            ({
                url: location.href,
                title: document.title || "",
                text: (function() {
                    var els = document.querySelectorAll('a, button, input, select, textarea, [role=button], [onclick]');
                    var items = [];
                    for (var i = 0; i < Math.min(els.length, 100); i++) {
                        var el = els[i];
                        var tag = el.tagName.toLowerCase();
                        var id = el.id ? '#' + el.id : '';
                        var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\\\s+/).slice(0,2).join('.') : '';
                        var text = (el.innerText || el.value || el.placeholder || '').substring(0, 50);
                        var name = el.getAttribute('name') || '';
                        var type = el.getAttribute('type') || '';
                        var aria = el.getAttribute('aria-label') || '';
                        items.push(tag + id + cls + (name ? '[name=' + name + ']' : '') + (type ? '[type=' + type + ']' : '') + (aria ? '[aria-label=' + aria + ']' : '') + (text ? ' "' + text + '"' : ''));
                    }
                    return 'Interactive elements:\\n' + items.join('\\n') + '\\n\\nPage text:\\n' + (document.body?.innerText || '').substring(0, 2000);
                })()
            })
        `);

        return result;
    });

    // Execute a single autopilot step
    ipcMain.handle("autopilot-step", async (_event: Electron.IpcMainInvokeEvent, taskId: string, url: string, script: string) => {
        console.log(`  🤖 Autopilot: Executing step for task ${taskId}`);
        let win = autopilotWindows.get(taskId);

        if (!win || win.isDestroyed()) {
            win = new BrowserWindow({
                show: false, width: 1280, height: 900,
                webPreferences: { contextIsolation: true, nodeIntegration: false },
            });
            autopilotWindows.set(taskId, win);
            await win.loadURL(url);
            await new Promise<void>((r) => setTimeout(r, 3000));
        }

        try {
            const result = await win.webContents.executeJavaScript(script);
            return result || { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : "Step execution failed",
            };
        }
    });

    // Cleanup: destroy autopilot windows when app is about to quit
    app.on("before-quit", () => {
        for (const [, win] of autopilotWindows) {
            if (!win.isDestroyed()) win.destroy();
        }
        autopilotWindows.clear();
    });

    console.log("🤖 Autopilot IPC handlers registered");
}

// ─── Spatial Input: Native Mouse Events for Vision Agent ────
// sendInputEvent() is WebContents-only (Main Process). The Renderer
// cannot call it directly on a <webview> tag — this IPC bridge is
// the ONLY correct path for vision_click / vision_drag / vision_hover.

function setupSpatialInputIPC(): void {
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    // Accept only wcId + events. No dpr — sendInputEvent uses CSS pixels (DIPs).
    // Chromium handles OS DPI scaling internally.
    ipcMain.handle('spatial-input', async (_event, wcId: number, events: any[]) => {
        const wc = webContents.fromId(wcId);
        if (!wc) return { success: false, error: 'WebContents not found' };

        for (const evt of events) {
            if (evt.type === 'vision_drag') {
                const { startX, startY, endX, endY } = evt;

                wc.sendInputEvent({ type: 'mouseMove', x: startX, y: startY });
                await delay(40); // hover-frame: let SPA :hover listeners fire
                wc.sendInputEvent({ type: 'mouseDown', x: startX, y: startY, button: 'left', clickCount: 1 });
                await delay(150);

                const STEPS = 15;
                for (let i = 1; i <= STEPS; i++) {
                    const cx = Math.round(startX + (endX - startX) * (i / STEPS));
                    const cy = Math.round(startY + (endY - startY) * (i / STEPS));
                    wc.sendInputEvent({ type: 'mouseMove', x: cx, y: cy });
                    await delay(10);
                }

                await delay(100);
                wc.sendInputEvent({ type: 'mouseUp', x: endX, y: endY, button: 'left', clickCount: 1 });
                await delay(50);

            } else {
                // Pass events through with CSS pixel coordinates (no DPR scaling)
                wc.sendInputEvent(evt as Electron.MouseInputEvent);
                // hover-frame after mouseMove — SPA apps bind click listeners on :hover
                if (evt.type === 'mouseMove') await delay(40);
                if (evt.type === 'mouseDown') await delay(50);
            }
        }

        return { success: true };
    });

    console.log('🖱️  Spatial Input IPC handler registered');
}

// ─── WORMHOLE: Network Sandbox IPC ──────────────────────────
// Provides Fetch interception capability to the renderer.
// When a webview's network request is paused, the debugger 'message' event
// fires in the main process. We forward it to the renderer window as a
// CustomEvent so NetworkSandbox.ts can hear it without extra IPC round-trips.

function setupFetchInterceptIPC(): void {
    // Map wcId → handler teardown function (to avoid memory leaks on detach)
    const debuggerListeners = new Map<number, () => void>();

    ipcMain.handle('cdp-fetch-enable', async (_event, wcId: number, patterns: any[]) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'WebContents not found' };

        // Attach debugger if not already attached (cdp-send auto-attaches, but be explicit)
        try {
            wc.debugger.attach('1.3');
        } catch { /* already attached — fine */ }

        // Forward Fetch.requestPaused events to the renderer
        // The renderer's NetworkSandbox listens for 'wormhole:fetch-event' CustomEvents
        const msgHandler = (_: Electron.Event, method: string, params: any) => {
            if (method !== 'Fetch.requestPaused') return;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('wormhole-fetch-event', { wcId, params });
            }
        };
        wc.debugger.on('message', msgHandler);

        // Store teardown
        const prev = debuggerListeners.get(wcId);
        if (prev) prev(); // remove old listener if re-attaching
        debuggerListeners.set(wcId, () => wc.debugger.removeListener?.('message', msgHandler));

        try {
            await wc.debugger.sendCommand('Fetch.enable', { patterns });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('cdp-fetch-disable', async (_event, wcId: number) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: true };
        // Remove listener
        const teardown = debuggerListeners.get(wcId);
        if (teardown) { teardown(); debuggerListeners.delete(wcId); }
        try {
            await wc.debugger.sendCommand('Fetch.disable', {});
        } catch { /* already disabled */ }
        return { ok: true };
    });

    ipcMain.handle('cdp-fetch-continue', async (_event, wcId: number, requestId: string) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'WebContents not found' };
        try {
            await wc.debugger.sendCommand('Fetch.continueRequest', { requestId });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('cdp-fetch-fail', async (_event, wcId: number, requestId: string, errorReason: string) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'WebContents not found' };
        try {
            await wc.debugger.sendCommand('Fetch.failRequest', { requestId, errorReason: errorReason ?? 'AccessDenied' });
            return { ok: true };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    });

    console.log('🛡️  [WORMHOLE] Network Sandbox IPC handlers registered (cdp-fetch-enable/continue/fail)');
}

// ─── WORMHOLE: Perception Batch IPC ─────────────────────────
// Death Trap 1 Fix: instead of N×ipcMain.invoke roundtrips (one per node),
// the renderer sends ONE array of backendNodeIds. The main process resolves
// them all via Promise.all (native C++-level CDP) and returns only the IDs
// that have 'click' or 'mousedown' V8 event listeners attached.

function setupWormholeIPC(): void {
    /**
     * cdp-get-listeners-batch
     * @param wcId      - WebContentsId of the target webview
     * @param nodeIds   - Array of backendNodeIds to check (candidates from AXTree)
     * @returns         - Array of backendNodeIds that have click/mousedown listeners
     */
    ipcMain.handle('cdp-get-listeners-batch', async (_event, wcId: number, nodeIds: number[]) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return [];

        const CLICK_EVENTS = new Set(['click', 'mousedown']);

        // Resolve all nodeIds in parallel — one C++-level call per node, but all concurrent
        const results = await Promise.all(
            nodeIds.map(async (backendNodeId) => {
                try {
                    // Step 1: backendNodeId → JS objectId
                    const resolveResp = await wc.debugger.sendCommand('DOM.resolveNode', { backendNodeId });
                    const objectId = resolveResp?.object?.objectId;
                    if (!objectId) return null;

                    // Step 2: query V8 for event listeners on that JS object
                    const listenersResp = await wc.debugger.sendCommand('DOMDebugger.getEventListeners', {
                        objectId,
                        depth: 1,
                        pierce: false,
                    });
                    const listeners: any[] = listenersResp?.listeners ?? [];
                    const hasClickable = listeners.some(l => CLICK_EVENTS.has(l.type));
                    return hasClickable ? backendNodeId : null;
                } catch {
                    // Node may have been GC'd between AXTree scan and this call — skip silently
                    return null;
                }
            })
        );

        // Return only the IDs with matching listeners (filter nulls)
        return results.filter((id): id is number => id !== null);
    });

    console.log('🔭 [WORMHOLE] Perception IPC handlers registered (cdp-get-listeners-batch)');
}

// ─── App lifecycle ──────────────────────────────────────────

// ─── CDP Bridge: Chrome DevTools Protocol ───────────────────
// Gives the renderer full CDP access to any webview's WebContents
// from the privileged main process. Zero JS injection into guest pages.
// CSP cannot block it. React cannot interfere. It cannot crash.

function setupCdpIPC(): void {
    // Track attached debugger wcIds to prevent double-attach errors
    const attached = new Set<number>();

    ipcMain.handle('cdp-attach', async (_event, wcId: number) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'WebContents not found' };
        if (attached.has(wcId)) return { ok: true };
        try {
            wc.debugger.attach('1.3');
            attached.add(wcId);
            wc.once('destroyed', () => attached.delete(wcId));
            return { ok: true };
        } catch (e: any) {
            // Already attached by DevTools or another caller — treat as success
            if (String(e).includes('already')) {
                attached.add(wcId);
                return { ok: true };
            }
            return { ok: false, error: String(e) };
        }
    });

    ipcMain.handle('cdp-detach', async (_event, wcId: number) => {
        const wc = webContents.fromId(wcId);
        if (!wc || !attached.has(wcId)) return { ok: true };
        try { wc.debugger.detach(); } catch { /* already detached */ }
        attached.delete(wcId);
        return { ok: true };
    });

    ipcMain.handle('cdp-send', async (_event, wcId: number, method: string, params?: object) => {
        const wc = webContents.fromId(wcId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'WebContents not found' };
        // Auto-attach if not already attached
        if (!attached.has(wcId)) {
            try {
                wc.debugger.attach('1.3');
                attached.add(wcId);
                wc.once('destroyed', () => attached.delete(wcId));
            } catch (e: any) {
                if (!String(e).includes('already')) {
                    return { ok: false, error: `CDP attach failed: ${e}` };
                }
                attached.add(wcId);
            }
        }
        try {
            const result = await wc.debugger.sendCommand(method, params ?? {});
            return { ok: true, result };
        } catch (e: any) {
            return { ok: false, error: String(e) };
        }
    });

    console.log('🔌 CDP Bridge IPC handlers registered (attach/detach/send)');
}

app.whenReady().then(async () => {
    // Allow Chrome DevTools to connect on port 9222 without conflicting
    // with the agent's debugger.attach() — two debuggers cannot share one WebContents.
    // Dev: open chrome://inspect in Chrome to debug any webview live.
    if (!app.isPackaged) {
        app.commandLine.appendSwitch('remote-debugging-port', '9222');
    }
    setupWebviewPermissions();
    setupScrapeIPC();
    setupAutopilotIPC();
    setupSpatialInputIPC();
    setupCdpIPC();
    setupFetchInterceptIPC();
    setupWormholeIPC();
    // Start backend FIRST, wait for it, THEN show window (splash runs during wait)
    await startBackend().catch((err) => console.error("⚠️ Backend start failed:", err));
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    // Kill backend when app closes
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", async () => {
    // Graceful HTTP shutdown first (kills the actual Node process, not just the shell)
    try {
        await fetch(`http://localhost:${BACKEND_PORT}/api/shutdown`, { method: "POST" }).catch(() => {});
    } catch { /* backend may already be down */ }
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
});
