// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Calculator Block (System Block)
// ============================================================
// Premium calculator widget with Apple-style buttons, display,
// and Math.js API integration. Fully self-contained.
// ============================================================

import React, { useState, useCallback } from "react";
import { Box, Typography, ButtonBase } from "@mui/material";
import { COLORS } from "../ui/SharedUI";

// ─── Types ──────────────────────────────────────────────────

export interface CalculatorBlockSpec {
    type: "calculator";
    blockId?: string;
}

// ─── Styles ─────────────────────────────────────────────────

const API_URL = "http://api.mathjs.org/v4/";

const BTN_COLORS = {
    number: "rgba(255, 255, 255, 0.08)",
    numberHover: "rgba(255, 255, 255, 0.14)",
    operator: "rgba(0, 200, 255, 0.15)",
    operatorHover: "rgba(0, 200, 255, 0.28)",
    equals: "linear-gradient(135deg, #00c8ff, #7c4dff)",
    equalsHover: "linear-gradient(135deg, #33d4ff, #9c7cff)",
    special: "rgba(255, 255, 255, 0.04)",
    specialHover: "rgba(255, 255, 255, 0.1)",
};

// ─── Component ──────────────────────────────────────────────

export const CalculatorBlock = React.memo(function CalculatorBlock(_props: CalculatorBlockSpec) {
    const [expression, setExpression] = useState("");
    const [result, setResult] = useState("");
    const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastCalc, setLastCalc] = useState(false);

    // ─── API Call ────────────────────────────────────────────

    const calculate = useCallback(async () => {
        if (!expression.trim()) return;
        setLoading(true);

        try {
            // Convert display symbols to math symbols
            const mathExpr = expression
                .replace(/×/g, "*")
                .replace(/÷/g, "/")
                .replace(/−/g, "-");

            const res = await fetch(`${API_URL}?expr=${encodeURIComponent(mathExpr)}`);
            const data = await res.text();

            if (res.ok) {
                setResult(data);
                setHistory(prev => [{ expr: expression, result: data }, ...prev].slice(0, 5));
                setLastCalc(true);
            } else {
                setResult("Error");
            }
        } catch {
            setResult("Error");
        } finally {
            setLoading(false);
        }
    }, [expression]);

    // ─── Button Handler ─────────────────────────────────────

    const handleButton = useCallback((value: string) => {
        switch (value) {
            case "C":
                setExpression("");
                setResult("");
                setLastCalc(false);
                break;
            case "⌫":
                setExpression(prev => prev.slice(0, -1));
                setLastCalc(false);
                break;
            case "=":
                calculate();
                break;
            default:
                if (lastCalc && !["×", "÷", "+", "−", "(", ")"].includes(value)) {
                    // New number after calculation → start fresh
                    setExpression(value);
                    setResult("");
                    setLastCalc(false);
                } else {
                    setExpression(prev => prev + value);
                    setLastCalc(false);
                }
        }
    }, [calculate, lastCalc]);

    // ─── Keyboard Support ───────────────────────────────────

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        e.preventDefault();
        const key = e.key;
        if (/^[0-9.]$/.test(key)) handleButton(key);
        else if (key === "+") handleButton("+");
        else if (key === "-") handleButton("−");
        else if (key === "*") handleButton("×");
        else if (key === "/") handleButton("÷");
        else if (key === "(") handleButton("(");
        else if (key === ")") handleButton(")");
        else if (key === "Enter" || key === "=") handleButton("=");
        else if (key === "Backspace") handleButton("⌫");
        else if (key === "Escape" || key === "c" || key === "C") handleButton("C");
    }, [handleButton]);

    // ─── Button Grid ────────────────────────────────────────

    const buttons = [
        { label: "C", type: "special" as const, span: 1 },
        { label: "(", type: "special" as const, span: 1 },
        { label: ")", type: "special" as const, span: 1 },
        { label: "÷", type: "operator" as const, span: 1 },

        { label: "7", type: "number" as const, span: 1 },
        { label: "8", type: "number" as const, span: 1 },
        { label: "9", type: "number" as const, span: 1 },
        { label: "×", type: "operator" as const, span: 1 },

        { label: "4", type: "number" as const, span: 1 },
        { label: "5", type: "number" as const, span: 1 },
        { label: "6", type: "number" as const, span: 1 },
        { label: "−", type: "operator" as const, span: 1 },

        { label: "1", type: "number" as const, span: 1 },
        { label: "2", type: "number" as const, span: 1 },
        { label: "3", type: "number" as const, span: 1 },
        { label: "+", type: "operator" as const, span: 1 },

        { label: "0", type: "number" as const, span: 2 },
        { label: ".", type: "number" as const, span: 1 },
        { label: "=", type: "equals" as const, span: 1 },
    ];

    return (
        <Box
            tabIndex={0}
            onKeyDown={handleKeyDown}
            sx={{
                outline: "none",
                borderRadius: 3,
                overflow: "hidden",
                bgcolor: "rgba(10, 10, 25, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                backdropFilter: "blur(20px)",
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* ─── Display ─────────────────────────────────── */}
            <Box sx={{ p: 2, pb: 1.5, minHeight: 90, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {/* Expression */}
                <Typography
                    sx={{
                        color: COLORS.textMuted,
                        fontSize: "0.85rem",
                        textAlign: "right",
                        minHeight: 22,
                        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
                        letterSpacing: "0.02em",
                        wordBreak: "break-all",
                    }}
                >
                    {expression || " "}
                </Typography>

                {/* Result */}
                <Typography
                    sx={{
                        fontWeight: 800,
                        fontSize: result.length > 12 ? "1.5rem" : result.length > 8 ? "2rem" : "2.5rem",
                        textAlign: "right",
                        lineHeight: 1.2,
                        mt: 0.3,
                        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
                        background: result === "Error"
                            ? "linear-gradient(135deg, #ff5252, #ff8a80)"
                            : "linear-gradient(135deg, #fff, rgba(0, 200, 255, 0.9))",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        transition: "all 0.2s ease",
                        minHeight: 36,
                    }}
                >
                    {loading ? "..." : result || "0"}
                </Typography>
            </Box>

            {/* ─── History ─────────────────────────────────── */}
            {history.length > 0 && (
                <Box sx={{ px: 2, pb: 1, maxHeight: 48, overflow: "hidden" }}>
                    {history.slice(0, 2).map((h, i) => (
                        <Typography
                            key={i}
                            sx={{
                                color: "rgba(255, 255, 255, 0.2)",
                                fontSize: "0.65rem",
                                textAlign: "right",
                                fontFamily: "monospace",
                                lineHeight: 1.6,
                            }}
                        >
                            {h.expr} = {h.result}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* ─── Button Grid ─────────────────────────────── */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "1px",
                    p: 0.5,
                    pt: 0,
                    flex: 1,
                    minHeight: 0,
                }}
            >
                {buttons.map((btn) => (
                    <ButtonBase
                        key={btn.label}
                        onClick={() => handleButton(btn.label)}
                        sx={{
                            gridColumn: btn.span > 1 ? `span ${btn.span}` : undefined,
                            py: 1.5,
                            borderRadius: 2,
                            fontSize: btn.type === "equals" ? "1.3rem" : "1.1rem",
                            fontWeight: btn.type === "number" ? 600 : 700,
                            fontFamily: btn.type === "number" ? "'SF Mono', monospace" : "inherit",
                            color: btn.type === "operator"
                                ? COLORS.accent
                                : btn.type === "equals"
                                    ? "#fff"
                                    : btn.type === "special"
                                        ? COLORS.textMuted
                                        : COLORS.textPrimary,
                            background: btn.type === "equals"
                                ? BTN_COLORS.equals
                                : BTN_COLORS[btn.type],
                            transition: "all 0.15s ease",
                            "&:hover": {
                                background: btn.type === "equals"
                                    ? BTN_COLORS.equalsHover
                                    : `${BTN_COLORS[`${btn.type}Hover` as keyof typeof BTN_COLORS]}`,
                                transform: "scale(1.03)",
                            },
                            "&:active": {
                                transform: "scale(0.97)",
                            },
                        }}
                    >
                        {btn.label}
                    </ButtonBase>
                ))}
            </Box>
        </Box>
    );
});
