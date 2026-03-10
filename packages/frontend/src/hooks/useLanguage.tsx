// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — useLanguage Hook
// ============================================================
// Loads user language preference from backend, provides
// translations and a setter to change language.
// ============================================================

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { t, type SupportedLanguage, getLanguageName } from "../i18n";

const API_BASE = "http://localhost:3001/api";

interface LanguageContextType {
    language: SupportedLanguage;
    setLanguage: (lang: SupportedLanguage) => Promise<void>;
    tr: ReturnType<typeof t>;
    languageName: string;
}

const LanguageContext = createContext<LanguageContextType>({
    language: "en",
    setLanguage: async () => { },
    tr: t("en"),
    languageName: "English",
});

export function useLanguage() {
    return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLang] = useState<SupportedLanguage>("en");

    // Load language from backend on mount
    useEffect(() => {
        fetch(`${API_BASE}/system/settings`)
            .then((r) => r.json())
            .then((data) => {
                if (data.settings?.user_language) {
                    setLang(data.settings.user_language as SupportedLanguage);
                }
            })
            .catch(() => { }); // Silently fail — default to English
    }, []);

    const setLanguage = useCallback(async (lang: SupportedLanguage) => {
        setLang(lang);
        try {
            await fetch(`${API_BASE}/system/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: "user_language", value: lang }),
            });
        } catch {
            // Silently fail — optimistic UI
        }
    }, []);

    const value: LanguageContextType = {
        language,
        setLanguage,
        tr: t(language),
        languageName: getLanguageName(language),
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}
