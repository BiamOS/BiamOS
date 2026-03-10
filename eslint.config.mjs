import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
    // Global ignores
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.drizzle/**",
            "**/coverage/**",
        ],
    },

    // Base JS rules
    eslint.configs.recommended,

    // TypeScript rules
    ...tseslint.configs.recommended,

    // Disable rules that conflict with Prettier
    eslintConfigPrettier,

    // Project-specific overrides
    {
        rules: {
            // Allow unused vars prefixed with _
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            // Allow any (too common to fix now, can tighten later)
            "@typescript-eslint/no-explicit-any": "off",
            // Allow empty catch blocks (used for silent migrations)
            "no-empty": ["error", { allowEmptyCatch: true }],
            "@typescript-eslint/no-empty-function": "off",
        },
    }
);
