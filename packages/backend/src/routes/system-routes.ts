// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — System Routes (Barrel Re-export)
// ============================================================
// Composes sub-routers to preserve /api/system/* URL structure.
// Implementation split into:
//   - settings-routes.ts  (settings CRUD, key, audit, data purge)
//   - provider-routes.ts  (LLM config, testing, voice)
//   - usage-routes.ts     (stats, token reset)
// ============================================================

import { Hono } from "hono";
import { settingsRoutes } from "./settings-routes.js";
import { providerRoutes } from "./provider-routes.js";
import { usageRoutes } from "./usage-routes.js";
import { MODEL_TRANSCRIBE, MODEL_TTS } from "../config/models.js";

const systemRoutes = new Hono();

// /api/system/provider/*  — LLM provider CRUD + voice
systemRoutes.route("/provider", providerRoutes);

// /api/system/settings/*  — Settings CRUD
systemRoutes.route("/settings", settingsRoutes);

// /api/system/key          — Settings sub-route at root level
systemRoutes.route("/", settingsRoutes);

// /api/system/stats        — Usage stats
// /api/system/tokens       — Token reset
systemRoutes.route("/", usageRoutes);

// /api/system/transcribe   — Voice transcription (mounted at root from provider)
systemRoutes.post("/transcribe", async (c) => {
    const config = await import("../services/llm-provider.js").then(m => m.getProviderConfig());
    if (!config.apiKey) return c.json({ error: "No API key configured" }, 400);

    const body = await c.req.json<{ audio: string; mimeType?: string }>();
    if (!body.audio) return c.json({ error: "No audio data" }, 400);

    const mime = body.mimeType || "audio/webm";
    const format = mime.includes("wav") ? "wav"
        : mime.includes("mp3") ? "mp3"
            : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
                : mime.includes("ogg") ? "ogg" : "wav";

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "BiamOS Voice Transcription",
        },
        body: JSON.stringify({
            model: MODEL_TRANSCRIBE,
            messages: [{
                role: "user",
                content: [
                    { type: "input_audio", input_audio: { data: body.audio, format } },
                    { type: "text", text: "Provide a verbatim transcript of the speech above. Output ONLY the spoken words, no other text. Preserve the original language." },
                ],
            }],
            max_tokens: 300,
            temperature: 0,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: `Transcription failed: ${response.status}`, details: errText }, 500);
    }

    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = result.choices?.[0]?.message?.content?.trim() || "";
    return c.json({ text });
});

systemRoutes.post("/speak", async (c) => {
    const config = await import("../services/llm-provider.js").then(m => m.getProviderConfig());
    if (!config.apiKey) return c.json({ error: "No API key configured" }, 400);

    const body = await c.req.json<{ text: string; voice?: string }>();
    if (!body.text?.trim()) return c.json({ error: "No text provided" }, 400);

    const response = await fetch(`${config.baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "BiamOS Voice Output",
        },
        body: JSON.stringify({
            model: MODEL_TTS,
            input: body.text.slice(0, 4096),
            voice: body.voice || "nova",
            response_format: "mp3",
            speed: 1.05,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        return c.json({ error: `TTS failed: ${response.status}`, details: errText }, 500);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");
    return c.json({ audio: base64, format: "mp3" });
});

export { systemRoutes };
