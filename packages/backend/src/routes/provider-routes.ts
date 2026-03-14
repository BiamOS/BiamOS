// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Provider Routes
// ============================================================
// LLM provider configuration, testing, and voice services.
// ============================================================

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { getProviderConfig, type LLMProvider } from "../services/llm-provider.js";
import { log } from "../utils/logger.js";

const providerRoutes = new Hono();

// ─── GET /provider — Current LLM provider config ───────────

providerRoutes.get("/", async (c) => {
    try {
        const config = await getProviderConfig();
        return c.json({
            provider: config.provider,
            baseUrl: config.baseUrl,
            hasApiKey: !config.requiresAuth || !!config.apiKey,
            requiresAuth: config.requiresAuth,
        });
    } catch (err) {
        return c.json({ error: "Failed to load provider config" }, 500);
    }
});

// ─── POST /provider — Update LLM provider ──────────────────

providerRoutes.post("/", async (c) => {
    try {
        const body = await c.req.json<{
            provider: LLMProvider;
            baseUrl?: string;
            apiKey?: string;
        }>();

        const validProviders = ["openrouter", "ollama", "lmstudio", "custom"];
        if (!validProviders.includes(body.provider)) {
            return c.json({ error: "Invalid provider" }, 400);
        }

        await db.run(sql`
            INSERT INTO system_settings (key, value) VALUES ('LLM_PROVIDER', ${body.provider})
            ON CONFLICT(key) DO UPDATE SET value = ${body.provider}
        `);

        if (body.baseUrl) {
            await db.run(sql`
                INSERT INTO system_settings (key, value) VALUES ('LLM_BASE_URL', ${body.baseUrl})
                ON CONFLICT(key) DO UPDATE SET value = ${body.baseUrl}
            `);
        }

        if (body.apiKey !== undefined) {
            const keyName = body.provider === "openrouter" ? "OPENROUTER_API_KEY" : "LLM_CUSTOM_API_KEY";
            await db.run(sql`
                INSERT INTO system_settings (key, value) VALUES (${keyName}, ${body.apiKey})
                ON CONFLICT(key) DO UPDATE SET value = ${body.apiKey}
            `);
        }

        return c.json({ ok: true, provider: body.provider });
    } catch (err) {
        return c.json({ error: "Failed to save provider config" }, 500);
    }
});

// ─── POST /provider/test — Test LLM connection ─────────────

providerRoutes.post("/test", async (c) => {
    try {
        const config = await getProviderConfig();

        if (config.provider === "openrouter" && !config.apiKey) {
            return c.json({ ok: false, provider: "openrouter", message: "No API key configured" });
        }

        const testUrl = `${config.baseUrl}/models`;
        const headers: Record<string, string> = {};
        if (config.apiKey) {
            headers["Authorization"] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(testUrl, {
            headers,
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const data = await response.json();
            const modelCount = (data.data || data.models || []).length;
            return c.json({
                ok: true,
                provider: config.provider,
                message: `Connected! ${modelCount} models available.`,
            });
        } else {
            return c.json({
                ok: false,
                provider: config.provider,
                message: `Connection failed: HTTP ${response.status}`,
            });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return c.json({
            ok: false,
            message: msg.includes("abort") || msg.includes("timeout")
                ? "Connection timed out — is the service running?"
                : `Connection failed: ${msg}`,
        });
    }
});

// ─── POST /provider/test-url — Test arbitrary provider ──────

providerRoutes.post("/test-url", async (c) => {
    try {
        const body = await c.req.json<{ baseUrl: string; apiKey?: string }>();
        const testUrl = `${body.baseUrl}/models`;

        const headers: Record<string, string> = {};
        if (body.apiKey) headers["Authorization"] = `Bearer ${body.apiKey}`;

        const response = await fetch(testUrl, { headers, signal: AbortSignal.timeout(5000) });
        return c.json({ ok: response.ok });
    } catch {
        return c.json({ ok: false });
    }
});

// ─── DELETE /provider/key — Remove API key ──────────────────

providerRoutes.delete("/key", async (c) => {
    try {
        const body = await c.req.json<{ provider: string }>();
        const keyName = body.provider === "openrouter" ? "OPENROUTER_API_KEY" : "LLM_CUSTOM_API_KEY";
        await db.run(sql`DELETE FROM system_settings WHERE key = ${keyName}`);
        return c.json({ ok: true });
    } catch (err) {
        return c.json({ error: "Failed to delete key" }, 500);
    }
});

// ─── POST /transcribe — Voice-to-Text via Audio LLM ────────

providerRoutes.post("/transcribe", async (c) => {
    try {
        const body = await c.req.json<{ audio: string; mimeType?: string }>();
        if (!body.audio) {
            return c.json({ error: "No audio data" }, 400);
        }

        const config = await getProviderConfig();
        if (!config.apiKey) {
            return c.json({ error: "No API key configured" }, 400);
        }

        const mime = body.mimeType || "audio/webm";
        const format = mime.includes("wav") ? "wav"
            : mime.includes("mp3") ? "mp3"
                : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
                    : mime.includes("ogg") ? "ogg"
                        : "wav";

        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "X-Title": "BiamOS Voice Transcription",
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "input_audio", input_audio: { data: body.audio, format } },
                            { type: "text", text: "Provide a verbatim transcript of the speech above. Output ONLY the spoken words, no other text. Preserve the original language." },
                        ],
                    },
                ],
                max_tokens: 300,
                temperature: 0,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            log.error("[Transcribe] API error:", response.status, errText);
            return c.json({ error: `Transcription failed: ${response.status}`, details: errText }, 500);
        }

        const result = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const text = result.choices?.[0]?.message?.content?.trim() || "";
        log.debug("[Transcribe] Result:", text);
        return c.json({ text });
    } catch (err) {
        log.error("💥 Transcribe error:", err);
        return c.json({ error: "Transcription failed" }, 500);
    }
});

// ─── POST /speak — Text-to-Speech via OpenAI TTS ────────────

providerRoutes.post("/speak", async (c) => {
    try {
        const body = await c.req.json<{ text: string; voice?: string }>();
        if (!body.text?.trim()) {
            return c.json({ error: "No text provided" }, 400);
        }

        const config = await getProviderConfig();
        if (!config.apiKey) {
            return c.json({ error: "No API key configured" }, 400);
        }

        const response = await fetch(`${config.baseUrl}/audio/speech`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
                "X-Title": "BiamOS Voice Output",
            },
            body: JSON.stringify({
                model: "openai/tts-1",
                input: body.text.slice(0, 4096),
                voice: body.voice || "nova",
                response_format: "mp3",
                speed: 1.05,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            log.error("[TTS] API error:", response.status, errText);
            return c.json({ error: `TTS failed: ${response.status}`, details: errText }, 500);
        }

        const audioBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(audioBuffer).toString("base64");
        return c.json({ audio: base64, format: "mp3" });
    } catch (err) {
        log.error("💥 TTS error:", err);
        return c.json({ error: "TTS failed" }, 500);
    }
});

export { providerRoutes };
