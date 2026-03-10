// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — i18n Module
// ============================================================
// Simple key-value translations for UI strings.
// No framework needed — just an object per language.
// ============================================================

export type SupportedLanguage = "en" | "de" | "es" | "fr" | "ja";

export interface LanguageOption {
    code: SupportedLanguage;
    label: string;
    flag: string;
}

export const LANGUAGES: LanguageOption[] = [
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "de", label: "Deutsch", flag: "🇩🇪" },
    { code: "es", label: "Español", flag: "🇪🇸" },
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "ja", label: "日本語", flag: "🇯🇵" },
];

// ─── Translation Keys ───────────────────────────────────────

interface Translations {
    searchPlaceholder: string;
    searchPlaceholderActive: string;
    noResults: string;
    noResultsDescription: string;
    settings: string;
    personal: string;
    language: string;
    languageDescription: string;
    integrations: string;
    blocks: string;
    agents: string;
    llm: string;
    loading: string;
    error: string;
    save: string;
    cancel: string;
    delete: string;
    close: string;
    clearAll: string;
    generateWith: string;
    // Thinking steps
    thinkingTranslate: string;
    thinkingAnalyze: string;
    thinkingRoute: string;
    thinkingParams: string;
    thinkingFetch: string;
    thinkingLayout: string;
    resultReady: string;
    biamAssistant: string;
    messages: string;
}

// ─── Translation Dictionaries ───────────────────────────────

const translations: Record<SupportedLanguage, Translations> = {
    en: {
        searchPlaceholder: "What can I help you with?",
        searchPlaceholderActive: "Ask about {group}...",
        noResults: "No Results",
        noResultsDescription: "No results found. Try a different search term.",
        settings: "Settings",
        personal: "Personal",
        language: "Language",
        languageDescription: "Choose your preferred UI and output language",
        integrations: "Integrations",
        blocks: "Blocks",
        agents: "Agents",
        llm: "LLM",
        loading: "Loading...",
        error: "Error",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        close: "Close",
        clearAll: "Clear All",
        generateWith: "Generate with",
        thinkingTranslate: "Translating query...",
        thinkingAnalyze: "Analyzing intent...",
        thinkingRoute: "Finding the right API...",
        thinkingParams: "Extracting parameters...",
        thinkingFetch: "Fetching data...",
        thinkingLayout: "Building layout...",
        resultReady: "Result is ready!",
        biamAssistant: "BiamOS Assistant",
        messages: "messages",
    },
    de: {
        searchPlaceholder: "Wie kann ich dir helfen?",
        searchPlaceholderActive: "Frag nach {group}...",
        noResults: "Keine Ergebnisse",
        noResultsDescription: "Keine Ergebnisse gefunden. Versuche einen anderen Suchbegriff.",
        settings: "Einstellungen",
        personal: "Persönlich",
        language: "Sprache",
        languageDescription: "Wähle deine bevorzugte UI- und Ausgabesprache",
        integrations: "Integrationen",
        blocks: "Blöcke",
        agents: "Agenten",
        llm: "LLM",
        loading: "Wird geladen...",
        error: "Fehler",
        save: "Speichern",
        cancel: "Abbrechen",
        delete: "Löschen",
        close: "Schließen",
        clearAll: "Alles löschen",
        generateWith: "Generieren mit",
        thinkingTranslate: "Übersetze Anfrage...",
        thinkingAnalyze: "Analysiere Intent...",
        thinkingRoute: "Suche passende API...",
        thinkingParams: "Extrahiere Parameter...",
        thinkingFetch: "Rufe Daten ab...",
        thinkingLayout: "Erstelle Layout...",
        resultReady: "Ergebnis wird angezeigt!",
        biamAssistant: "BiamOS Assistent",
        messages: "Nachrichten",
    },
    es: {
        searchPlaceholder: "¿En qué puedo ayudarte?",
        searchPlaceholderActive: "Pregunta sobre {group}...",
        noResults: "Sin resultados",
        noResultsDescription: "No se encontraron resultados. Intenta otro término.",
        settings: "Configuración",
        personal: "Personal",
        language: "Idioma",
        languageDescription: "Elige tu idioma preferido para la interfaz y la salida",
        integrations: "Integraciones",
        blocks: "Bloques",
        agents: "Agentes",
        llm: "LLM",
        loading: "Cargando...",
        error: "Error",
        save: "Guardar",
        cancel: "Cancelar",
        delete: "Eliminar",
        close: "Cerrar",
        clearAll: "Limpiar todo",
        generateWith: "Generar con",
        thinkingTranslate: "Traduciendo consulta...",
        thinkingAnalyze: "Analizando intención...",
        thinkingRoute: "Buscando la API correcta...",
        thinkingParams: "Extrayendo parámetros...",
        thinkingFetch: "Obteniendo datos...",
        thinkingLayout: "Creando diseño...",
        resultReady: "¡Resultado listo!",
        biamAssistant: "BiamOS Asistente",
        messages: "mensajes",
    },
    fr: {
        searchPlaceholder: "Comment puis-je vous aider ?",
        searchPlaceholderActive: "Demandez à propos de {group}...",
        noResults: "Aucun résultat",
        noResultsDescription: "Aucun résultat trouvé. Essayez un autre terme.",
        settings: "Paramètres",
        personal: "Personnel",
        language: "Langue",
        languageDescription: "Choisissez votre langue préférée pour l'interface et la sortie",
        integrations: "Intégrations",
        blocks: "Blocs",
        agents: "Agents",
        llm: "LLM",
        loading: "Chargement...",
        error: "Erreur",
        save: "Enregistrer",
        cancel: "Annuler",
        delete: "Supprimer",
        close: "Fermer",
        clearAll: "Tout effacer",
        generateWith: "Générer avec",
        thinkingTranslate: "Traduction de la requête...",
        thinkingAnalyze: "Analyse de l'intention...",
        thinkingRoute: "Recherche de la bonne API...",
        thinkingParams: "Extraction des paramètres...",
        thinkingFetch: "Récupération des données...",
        thinkingLayout: "Création de la mise en page...",
        resultReady: "Résultat prêt !",
        biamAssistant: "BiamOS Assistant",
        messages: "messages",
    },
    ja: {
        searchPlaceholder: "何かお手伝いできますか？",
        searchPlaceholderActive: "{group}について聞く...",
        noResults: "結果なし",
        noResultsDescription: "結果が見つかりませんでした。別の検索語を試してください。",
        settings: "設定",
        personal: "個人設定",
        language: "言語",
        languageDescription: "UIと出力の言語を選択してください",
        integrations: "統合",
        blocks: "ブロック",
        agents: "エージェント",
        llm: "LLM",
        loading: "読み込み中...",
        error: "エラー",
        save: "保存",
        cancel: "キャンセル",
        delete: "削除",
        close: "閉じる",
        clearAll: "すべてクリア",
        generateWith: "生成する",
        thinkingTranslate: "クエリを翻訳中...",
        thinkingAnalyze: "意図を分析中...",
        thinkingRoute: "適切なAPIを検索中...",
        thinkingParams: "パラメータを抽出中...",
        thinkingFetch: "データを取得中...",
        thinkingLayout: "レイアウトを作成中...",
        resultReady: "結果の準備ができました！",
        biamAssistant: "Luraアシスタント",
        messages: "メッセージ",
    },
};

/**
 * Get translations for a given language code.
 * Falls back to English if the language is not supported.
 */
export function t(lang: SupportedLanguage): Translations {
    return translations[lang] || translations.en;
}

/**
 * Get the full language name for Layout Architect prompt.
 */
export function getLanguageName(code: SupportedLanguage): string {
    const names: Record<SupportedLanguage, string> = {
        en: "English",
        de: "German",
        es: "Spanish",
        fr: "French",
        ja: "Japanese",
    };
    return names[code] || "English";
}
