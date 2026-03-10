// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Speech Recognition Hook (MediaRecorder + Whisper)
// ============================================================
// Records audio via MediaRecorder, converts to WAV, sends to
// backend for transcription via audio LLM. Works in Electron.
// ============================================================

import { useState, useCallback, useRef } from "react";
import { debug } from "../utils/debug";

interface UseSpeechRecognitionOptions {
    onResult?: (transcript: string) => void;
    onInterim?: (transcript: string) => void;
}

interface SpeechRecognitionHook {
    isListening: boolean;
    transcript: string;
    startListening: () => void;
    stopListening: () => void;
    supported: boolean;
}

// ─── WAV Encoder ────────────────────────────────────────────
// Converts an AudioBuffer to a WAV Blob (PCM16, mono, 16kHz)

function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = 1; // mono
    const sampleRate = 16000;

    // Resample to 16kHz mono
    const offlineCtx = new OfflineAudioContext(numChannels, buffer.duration * sampleRate, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    // Can't use async in a sync function, so we'll do raw conversion
    // Get raw samples from first channel
    const rawSamples = buffer.getChannelData(0);

    // Simple downsample: pick every Nth sample
    const ratio = buffer.sampleRate / sampleRate;
    const newLength = Math.floor(rawSamples.length / ratio);
    const samples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        samples[i] = rawSamples[Math.floor(i * ratio)];
    }

    // Convert float32 to int16
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Build WAV file
    const wavBuffer = new ArrayBuffer(44 + int16.length * 2);
    const view = new DataView(wavBuffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + int16.length * 2, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);           // chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);   // channels
    view.setUint32(24, sampleRate, true);    // sample rate
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true);           // bits per sample

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, int16.length * 2, true);

    // Write PCM samples
    const output = new Int16Array(wavBuffer, 44);
    output.set(int16);

    return new Blob([wavBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// ─── Hook ───────────────────────────────────────────────────

export function useSpeechRecognition({
    onResult,
    onInterim,
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionHook {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    const startListening = useCallback(async () => {
        try {
            debug.log("[Voice] Requesting microphone...");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
            });
            streamRef.current = stream;

            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm";

            const recorder = new MediaRecorder(stream, { mimeType });
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = async () => {
                debug.log("[Voice] Recording stopped, chunks:", chunksRef.current.length);
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;

                if (chunksRef.current.length === 0) {
                    setIsListening(false);
                    return;
                }

                const webmBlob = new Blob(chunksRef.current, { type: mimeType });
                debug.log("[Voice] WebM blob size:", webmBlob.size, "bytes");

                onInterim?.("Transcribing...");

                try {
                    // Decode WebM → AudioBuffer → WAV
                    debug.log("[Voice] Converting to WAV...");
                    const arrayBuffer = await webmBlob.arrayBuffer();
                    const audioCtx = new AudioContext();
                    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                    await audioCtx.close();

                    const wavBlob = audioBufferToWav(audioBuffer);
                    debug.log("[Voice] WAV blob size:", wavBlob.size, "bytes");

                    // Convert WAV to base64
                    const wavBuffer = await wavBlob.arrayBuffer();
                    const base64 = btoa(
                        new Uint8Array(wavBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
                    );

                    // Send to backend
                    const res = await fetch("http://localhost:3001/api/system/transcribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ audio: base64, mimeType: "audio/wav" }),
                    });

                    const data = await res.json();
                    if (data.text) {
                        debug.log("[Voice] Transcript:", data.text);
                        setTranscript(data.text);
                        onResult?.(data.text);
                    } else {
                        console.warn("[Voice] No transcript received:", data);
                        onInterim?.("");
                    }
                } catch (err) {
                    console.error("[Voice] Transcription error:", err);
                    onInterim?.("");
                }

                setIsListening(false);
            };

            recorder.onerror = (e) => {
                console.error("[Voice] Recorder error:", e);
                setIsListening(false);
            };

            mediaRecorderRef.current = recorder;
            recorder.start(250);
            setIsListening(true);
            debug.log("[Voice] Recording started");
        } catch (err) {
            console.error("[Voice] Mic access denied:", err);
            setIsListening(false);
        }
    }, [onResult, onInterim]);

    const stopListening = useCallback(() => {
        debug.log("[Voice] Stop requested");
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    return {
        isListening,
        transcript,
        startListening,
        stopListening,
        supported: !!navigator.mediaDevices?.getUserMedia,
    };
}
