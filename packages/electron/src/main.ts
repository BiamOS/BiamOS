// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Electron Main Process
// ============================================================
// Creates the desktop window, enables <webview> tags,
// and starts the backend server automatically.
// ============================================================

import { app, BrowserWindow, session, ipcMain } from "electron";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

// ─── Config ─────────────────────────────────────────────────

const DEV_FRONTEND_URL = "http://localhost:5173";
const BACKEND_PORT = 3001;

// ─── Backend auto-start ─────────────────────────────────────

async function killPortProcess(port: number): Promise<void> {
    return new Promise((resolve) => {
        const killer = spawn(
            "powershell",
            ["-Command", `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
            { shell: false, stdio: "ignore" }
        );
        killer.on("close", () => resolve());
        killer.on("error", () => resolve());
    });
}

async function waitForBackend(port: number, maxWaitMs: number = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        try {
            const res = await fetch(`http://localhost:${port}/api/health`);
            if (res.ok) return true;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

async function startBackend(): Promise<void> {
    // Kill any leftover process on the backend port
    await killPortProcess(BACKEND_PORT);

    const backendDir = path.resolve(__dirname, "../../backend");
    console.log("🚀 Starting backend from:", backendDir);

    backendProcess = spawn("npx", ["tsx", "src/server.ts"], {
        cwd: backendDir,
        shell: true,
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
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: "BiamOS",
        backgroundColor: "#0a0a1c",
        autoHideMenuBar: true,  // Hide File/Edit/View/Window/Help menu
        show: false,  // Hidden until splash finishes
        icon: path.join(__dirname, "../assets/icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            webviewTag: true,             // Enable <webview> for web integrations
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,               // Needed for preload script
        },
    });

    // Show maximized once the page has loaded (avoids white flash)
    mainWindow.once("ready-to-show", () => {
        mainWindow?.maximize();
        mainWindow?.show();

        // Lock main window zoom to 100% — we don't want Ctrl+Scroll
        // zooming the entire UI (sidebar, toolbar etc.)
        // The webview inside handles its own zoom independently.
        mainWindow?.webContents.setZoomFactor(1);
        mainWindow?.webContents.setZoomLevel(0);
    });

    // In dev: load Vite dev server
    mainWindow.loadURL(DEV_FRONTEND_URL);

    // Prevent main window zoom via Ctrl+=/- and Ctrl+0
    mainWindow.webContents.on("before-input-event", (_event, input) => {
        if (input.control && (input.key === "=" || input.key === "+" || input.key === "-")) {
            _event.preventDefault();
        }
    });

    // DevTools: open manually with Ctrl+Shift+I (auto-open was intercepting resize drag events)
    // if (process.env.NODE_ENV !== "production") {
    //     mainWindow.webContents.openDevTools({ mode: "detach" });
    // }

    // Forward renderer console.log to terminal
    mainWindow.webContents.on("console-message", (_event, _level, message) => {
        if (message.includes("[TAB")) console.log(`[RENDERER] ${message}`);
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
    ipcMain.handle("page-snapshot", async (_event: Electron.IpcMainInvokeEvent, url: string) => {
        console.log(`  🤖 Autopilot: Getting snapshot of ${url}`);
        let win = autopilotWindows.get(url);

        if (!win || win.isDestroyed()) {
            win = new BrowserWindow({
                show: false, width: 1280, height: 900,
                webPreferences: { contextIsolation: true, nodeIntegration: false },
            });
            autopilotWindows.set(url, win);
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
    ipcMain.handle("autopilot-step", async (_event: Electron.IpcMainInvokeEvent, url: string, script: string) => {
        console.log(`  🤖 Autopilot: Executing step on ${url}`);
        let win = autopilotWindows.get(url);

        if (!win || win.isDestroyed()) {
            win = new BrowserWindow({
                show: false, width: 1280, height: 900,
                webPreferences: { contextIsolation: true, nodeIntegration: false },
            });
            autopilotWindows.set(url, win);
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

// ─── App lifecycle ──────────────────────────────────────────

app.whenReady().then(async () => {
    setupWebviewPermissions();
    setupScrapeIPC();
    setupAutopilotIPC();
    await startBackend();
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

app.on("before-quit", () => {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
});
