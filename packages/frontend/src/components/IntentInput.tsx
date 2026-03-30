// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Smart Intent Input (Live Trigger Matching)
// ============================================================
// As you type, matched integrations appear as green pills.
// No more useless hint chips — real-time feedback instead.
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, type FormEvent, type SyntheticEvent } from "react";
import { useLanguage } from "../hooks/useLanguage";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import {
    Box,
    Autocomplete,
    TextField,
    IconButton,
    InputAdornment,
    Typography,
    Paper,
    CircularProgress,
    Fade,
} from "@mui/material";
import {
    Send as SendIcon,
    History as HistoryIcon,
    TrendingUp as TrendingIcon,
    Close as CloseIcon,
    CheckCircle as MatchIcon,
    WarningAmber as WarnIcon,
    Mic as MicIcon,
    MicOff as MicOffIcon,
    AutoAwesome as AutoIcon,
} from "@mui/icons-material";
import { accentAlpha } from "./ui/SharedUI";

// ============================================================
// Constants
// ============================================================

const HISTORY_KEY = "BiamOS_search_history";
const MAX_HISTORY = 15;
const MAX_HISTORY_DISPLAY = 5;
const MAX_TRENDING_DISPLAY = 4;
const MIN_WORDS_FOR_WARNING = 3;

const THINKING_MESSAGES = [
    "Searching...",
    "Thinking...",
    "Processing your request...",
    "Almost there...",
    "Analyzing data...",
    "Building your card...",
];

// ============================================================
// Types
// ============================================================

interface SearchOption {
    label: string;
    type: "history" | "suggestion" | "trending";
}

interface IntegrationInfo {
    name: string;
    intent_description: string;
    human_triggers?: string | null;
    group_name?: string | null;
    is_active?: boolean;
    sidebar_icon?: string | null;
    sidebar_label?: string | null;
}

interface MatchedGroup {
    name: string;
    icon: string;
    label: string;
    matchedKeyword: string;
}

interface IntentInputProps {
    onSubmit: (text: string) => void;
    isLoading: boolean;
    activeGroups: string[];
    pipelineStep?: string | null;
    voiceEnabled?: boolean;
}

// ============================================================
// History Helpers
// ============================================================

function getHistory(): string[] {
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addToHistory(query: string): string[] {
    const history = getHistory().filter((h) => h.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
}

function removeFromHistory(query: string): string[] {
    const history = getHistory().filter((h) => h !== query);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return history;
}

function clearHistory(): string[] {
    localStorage.removeItem(HISTORY_KEY);
    return [];
}

// ============================================================
// Static Styles
// ============================================================

const dropdownPaperSx = {
    bgcolor: "rgba(18, 18, 30, 0.98)",
    backdropFilter: "blur(20px)",
    border: `1px solid ${accentAlpha(0.15)}`,
    borderTop: "none",
    borderRadius: "12px 12px 0 0",
    boxShadow: "0 -12px 40px rgba(0, 0, 0, 0.5)",
    mb: -0.5,
    "& .MuiAutocomplete-groupLabel": {
        color: "rgba(255, 255, 255, 0.35)",
        fontWeight: 700,
        fontSize: "0.7rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        bgcolor: "transparent",
        py: 1,
        px: 2,
    },
    "& .MuiAutocomplete-listbox": { py: 0.5 },
};

const inputFieldSx = {
    "& .MuiOutlinedInput-root": {
        borderRadius: "12px",
        bgcolor: "rgba(12, 12, 24, 0.95)",
        border: `1px solid ${accentAlpha(0.2)}`,
        backdropFilter: "blur(24px)",
        boxShadow: `0 8px 40px rgba(0, 0, 0, 0.55), 0 0 30px ${accentAlpha(0.06)}`,
        transition: "all 0.3s ease",
        fontSize: "1rem",
        "&:hover": {
            borderColor: accentAlpha(0.35),
            bgcolor: "rgba(14, 14, 28, 0.98)",
        },
        "&.Mui-focused": {
            borderColor: accentAlpha(0.6),
            boxShadow: `0 8px 40px rgba(0, 0, 0, 0.55), 0 0 40px ${accentAlpha(0.12)}`,
        },
        "& fieldset": { border: "none" },
    },
    "& .MuiInputBase-input": {
        color: "#fff",
        py: 2,
        px: 2.5,
        "&::placeholder": {
            color: "rgba(255, 255, 255, 0.3)",
            opacity: 1,
        },
    },
};

const optionSx = {
    display: "flex !important",
    alignItems: "center",
    gap: 1.5,
    py: "10px !important",
    px: "16px !important",
    "&:hover": { bgcolor: `${accentAlpha(0.08)} !important` },
};

// ============================================================
// Trigger Matching Engine
// ============================================================

/**
 * Match user input against integration human_triggers.
 * Returns matched groups with the keyword that triggered the match.
 * Pure function, no LLM calls.
 */
function matchTriggers(
    input: string,
    integrations: IntegrationInfo[]
): MatchedGroup[] {
    const words = input.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2);
    if (words.length === 0) return [];

    const seen = new Set<string>();
    const matched: MatchedGroup[] = [];

    for (const cap of integrations) {
        if (cap.is_active === false) continue;
        const groupName = cap.group_name || cap.name?.replace(/Widget$/i, "") || "Unknown";
        if (seen.has(groupName)) continue;

        // Collect all trigger keywords for this integration
        const triggerSource = [cap.human_triggers, cap.intent_description].filter(Boolean).join("|");
        const triggers = triggerSource
            .split("|")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length >= 2);

        // Check if any word in the input matches any trigger keyword
        for (const word of words) {
            const hit = triggers.find((t) =>
                t.includes(word) || word.includes(t)
            );
            if (hit) {
                seen.add(groupName);
                matched.push({
                    name: groupName,
                    icon: cap.sidebar_icon || "⚡",
                    label: cap.sidebar_label || groupName,
                    matchedKeyword: hit,
                });
                break;
            }
        }
    }

    return matched;
}

// ============================================================
// Component
// ============================================================

export const IntentInput = React.memo(function IntentInput({
    onSubmit,
    isLoading,
    activeGroups,
    pipelineStep,
}: IntentInputProps) {
    const { tr } = useLanguage();
    const [inputValue, setInputValue] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [open, setOpen] = useState(false);
    const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
    const [thinkingIndex, setThinkingIndex] = useState(0);

    // ─── Speech Recognition ──────────────────────────────────
    const handleVoiceResult = useCallback((transcript: string) => {
        const trimmed = transcript.trim();
        if (trimmed && !isLoading) {
            setInputValue("");
            setHistory(addToHistory(trimmed));
            onSubmit(trimmed);
        }
    }, [isLoading, onSubmit]);

    const { isListening, startListening, stopListening, supported: micSupported } = useSpeechRecognition({
        onResult: handleVoiceResult,
        onInterim: (interim) => setInputValue(interim),
    });

    // Load history + fetch integrations
    useEffect(() => {
        setHistory(getHistory());
        fetch("http://localhost:3001/api/integrations")
            .then((res) => res.json())
            .then((data) => {
                const list = Array.isArray(data) ? data : data.integrations ?? [];
                setIntegrations(list);
            })
            .catch(() => { });
    }, []);

    // Cycle thinking messages
    useEffect(() => {
        if (!isLoading) { setThinkingIndex(0); return; }
        const interval = setInterval(() => {
            setThinkingIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [isLoading]);

    // Extract triggers from integration
    const getTriggers = useCallback((cap: IntegrationInfo): string[] => {
        const source = cap.human_triggers || cap.intent_description;
        if (!source) return [];
        return source.split("|").map((s) => s.trim()).filter(Boolean);
    }, []);

    // Filter by sidebar selection
    const filteredIntegrations = useMemo(() => {
        const active = integrations.filter((c) => c.is_active !== false);
        if (activeGroups.length === 0) return active;
        return active.filter((c) => {
            const group = c.group_name || c.name;
            return activeGroups.includes(group);
        });
    }, [integrations, activeGroups]);

    // ─── Live Trigger Matching ──────────────────────────────
    const matchedGroups = useMemo(
        () => matchTriggers(inputValue, filteredIntegrations),
        [inputValue, filteredIntegrations]
    );

    const wordCount = inputValue.trim().split(/\s+/).filter(Boolean).length;
    const showWarning = wordCount >= MIN_WORDS_FOR_WARNING && matchedGroups.length === 0 && inputValue.trim().length > 0;

    // Autocomplete options (history + trigger suggestions)
    const options = useMemo<SearchOption[]>(() => {
        const list: SearchOption[] = [];
        const query = inputValue.toLowerCase().trim();

        const matchingHistory = query
            ? history.filter((h) => h.toLowerCase().includes(query))
            : history;

        for (const h of matchingHistory.slice(0, MAX_HISTORY_DISPLAY)) {
            list.push({ label: h, type: "history" });
        }

        if (filteredIntegrations.length === 0) return list;

        const allTriggers: string[] = [];
        for (const cap of filteredIntegrations) {
            allTriggers.push(...getTriggers(cap));
        }

        const historySet = new Set(matchingHistory.map((h) => h.toLowerCase()));
        const added = new Set<string>();
        for (const trigger of allTriggers) {
            const lower = trigger.toLowerCase();
            if (historySet.has(lower) || added.has(lower)) continue;
            if (query && !lower.includes(query)) continue;
            list.push({ label: trigger, type: "trending" });
            added.add(lower);
            if (added.size >= MAX_TRENDING_DISPLAY) break;
        }

        return list;
    }, [inputValue, history, filteredIntegrations, getTriggers]);

    // ─── Handlers ───────────────────────────────────────────
    const handleSubmit = useCallback(
        (query: string) => {
            const trimmed = query.trim();
            if (!trimmed || isLoading) return;
            setHistory(addToHistory(trimmed));
            onSubmit(trimmed);
            setInputValue("");
            setOpen(false);
        },
        [isLoading, onSubmit]
    );

    const handleFormSubmit = useCallback(
        (e: FormEvent) => { e.preventDefault(); handleSubmit(inputValue); },
        [handleSubmit, inputValue]
    );

    const handleOptionSelect = useCallback(
        (_: SyntheticEvent, option: SearchOption | string | null) => {
            if (!option) return;
            const query = typeof option === "string" ? option : option.label;
            handleSubmit(query);
        },
        [handleSubmit]
    );

    const handleDeleteHistory = useCallback((item: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setHistory(removeFromHistory(item));
    }, []);

    const handleClearHistory = useCallback(() => { setHistory(clearHistory()); }, []);

    // Dynamic border-radius
    const dynamicInputSx = useMemo(
        () => ({
            ...inputFieldSx,
            "& .MuiOutlinedInput-root": {
                ...inputFieldSx["& .MuiOutlinedInput-root"],
                "&.Mui-focused": {
                    ...inputFieldSx["& .MuiOutlinedInput-root"]["&.Mui-focused"],
                    borderRadius: open ? "0 0 12px 12px" : "12px",
                },
            },
        }),
        [open]
    );

    return (
        <Box
            sx={{
                width: "100%",
                maxWidth: 600,
                mx: "auto",
            }}
        >
            {/* Search Bar */}
            <Box component="form" onSubmit={handleFormSubmit}>
                <Autocomplete
                    freeSolo
                    open={open}
                    onOpen={() => setOpen(true)}
                    onClose={() => setOpen(false)}
                    value={null}
                    inputValue={inputValue}
                    onInputChange={(_, val) => setInputValue(val)}
                    onChange={handleOptionSelect}
                    options={options}
                    getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.label)}
                    filterOptions={(x) => x}
                    groupBy={(opt) => (opt.type === "history" ? "Recent searches" : "Suggestions")}
                    slotProps={{
                        popper: {
                            placement: "top",
                            disablePortal: false,
                            sx: { zIndex: 1400 },
                        },
                    }}
                    renderOption={(props, option) => {
                        const { key, ...rest } = props as unknown as Record<string, unknown>;
                        return (
                            <Box component="li" key={key as string} {...rest} sx={optionSx}>
                                {option.type === "history" ? (
                                    <HistoryIcon sx={{ fontSize: 18, color: "rgba(255, 255, 255, 0.3)" }} />
                                ) : (
                                    <TrendingIcon sx={{ fontSize: 18, color: accentAlpha(0.5) }} />
                                )}
                                <Typography
                                    sx={{
                                        flexGrow: 1,
                                        color: "rgba(255, 255, 255, 0.85)",
                                        fontSize: "0.9rem",
                                    }}
                                >
                                    {option.label}
                                </Typography>
                                {option.type === "history" && (
                                    <IconButton
                                        size="small"
                                        onClick={(e) => handleDeleteHistory(option.label, e)}
                                        sx={{
                                            p: 0.3,
                                            color: "rgba(255, 255, 255, 0.2)",
                                            "&:hover": { color: "rgba(255, 80, 80, 0.8)" },
                                        }}
                                    >
                                        <CloseIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                )}
                            </Box>
                        );
                    }}
                    PaperComponent={({ children, ...props }) => (
                        <Paper {...props} sx={dropdownPaperSx}>
                            {children}
                            {history.length > 0 && !inputValue && (
                                <Box
                                    sx={{
                                        textAlign: "center",
                                        py: 1,
                                        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        onClick={handleClearHistory}
                                        sx={{
                                            color: accentAlpha(0.6),
                                            cursor: "pointer",
                                            "&:hover": {
                                                color: accentAlpha(0.9),
                                                textDecoration: "underline",
                                            },
                                        }}
                                    >
                                        Clear search history
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    )}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            placeholder={
                                isLoading
                                    ? (pipelineStep || THINKING_MESSAGES[thinkingIndex])
                                    : integrations.length === 0
                                        ? "Add integrations first to get started..."
                                        : tr.searchPlaceholder
                            }
                            disabled={isLoading}
                            autoFocus
                            id="intent-input"
                            slotProps={{
                                input: {
                                    ...params.InputProps,
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {params.InputProps.endAdornment}
                                            {isLoading ? (
                                                <CircularProgress
                                                    size={22}
                                                    sx={{ color: accentAlpha(0.8) }}
                                                />
                                            ) : (
                                                <>
                                                    {inputValue.trim() && (
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => setInputValue("")}
                                                            sx={{
                                                                color: "rgba(255, 255, 255, 0.25)",
                                                                "&:hover": { color: "rgba(255, 255, 255, 0.6)" },
                                                                mr: 0.3,
                                                            }}
                                                        >
                                                            <CloseIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    )}
                                                    <IconButton
                                                        type="submit"
                                                        disabled={!inputValue.trim()}
                                                        id="intent-submit"
                                                        sx={{
                                                            color: inputValue.trim()
                                                                ? accentAlpha(0.9)
                                                                : "rgba(255, 255, 255, 0.2)",
                                                            transition: "all 0.3s ease",
                                                            "&:hover": {
                                                                color: "#fff",
                                                                bgcolor: accentAlpha(0.2),
                                                            },
                                                        }}
                                                    >
                                                        <SendIcon />
                                                    </IconButton>
                                                    {micSupported && (
                                                        <IconButton
                                                            onClick={isListening ? stopListening : startListening}
                                                            disabled={isLoading}
                                                            id="voice-input"
                                                            sx={{
                                                                color: isListening
                                                                    ? "rgba(255, 80, 80, 0.9)"
                                                                    : "rgba(255, 255, 255, 0.25)",
                                                                transition: "all 0.3s ease",
                                                                animation: isListening
                                                                    ? "pulseGlow 1.2s ease-in-out infinite"
                                                                    : "none",
                                                                "&:hover": {
                                                                    color: isListening
                                                                        ? "rgba(255, 60, 60, 1)"
                                                                        : "rgba(255, 255, 255, 0.6)",
                                                                    bgcolor: isListening
                                                                        ? "rgba(255, 80, 80, 0.1)"
                                                                        : "rgba(255, 255, 255, 0.05)",
                                                                },
                                                            }}
                                                        >
                                                            {isListening ? <MicIcon /> : <MicOffIcon />}
                                                        </IconButton>
                                                    )}
                                                </>
                                            )}
                                        </InputAdornment>
                                    ),
                                },
                            }}
                            sx={{
                                ...dynamicInputSx,
                                ...(isLoading && {
                                    "& .MuiOutlinedInput-root": {
                                        ...((dynamicInputSx as Record<string, unknown>)["& .MuiOutlinedInput-root"] as Record<string, unknown>),
                                        boxShadow: `0 0 20px ${accentAlpha(0.3)}, 0 0 40px rgba(0, 200, 255, 0.15)`,
                                        animation: "pulseGlow 1.5s ease-in-out infinite",
                                    },
                                }),
                            }}
                        />
                    )}
                />
            </Box>

            {/* ═══ Live Matched Integrations ═══ */}
            <Fade in={matchedGroups.length > 0 || showWarning} timeout={200}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.8,
                        px: 1.5,
                        pt: 0.8,
                        pb: 0.3,
                        flexWrap: "wrap",
                        minHeight: matchedGroups.length > 0 || showWarning ? 28 : 0,
                    }}
                >
                    {matchedGroups.length > 0 && (
                        <>
                            {matchedGroups.map((group) => (
                                <Box
                                    key={group.name}
                                    sx={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                        px: 1,
                                        py: 0.3,
                                        borderRadius: "10px",
                                        bgcolor: "rgba(0, 220, 100, 0.08)",
                                        border: "1px solid rgba(0, 220, 100, 0.2)",
                                        transition: "all 0.2s ease",
                                        animation: "fadeInScale 0.2s ease-out",
                                    }}
                                >
                                    <MatchIcon sx={{ fontSize: 13, color: "rgba(0, 220, 100, 0.7)" }} />
                                    <AutoIcon
                                        sx={{ fontSize: 14, color: "rgba(255, 255, 255, 0.6)" }}
                                    />
                                    <Typography
                                        sx={{
                                            fontSize: "0.68rem",
                                            fontWeight: 600,
                                            color: "rgba(0, 220, 100, 0.85)",
                                            letterSpacing: "0.02em",
                                        }}
                                    >
                                        {group.label}
                                    </Typography>
                                </Box>
                            ))}
                        </>
                    )}

                    {showWarning && (
                        <Box
                            sx={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 0.5,
                                px: 1,
                                py: 0.3,
                            }}
                        >
                            <WarnIcon sx={{ fontSize: 13, color: "rgba(255, 180, 0, 0.6)" }} />
                            <Typography
                                sx={{
                                    fontSize: "0.65rem",
                                    color: "rgba(255, 180, 0, 0.6)",
                                    fontStyle: "italic",
                                }}
                            >
                                No matching integration — AI will try its best
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Fade>
        </Box>
    );
});
