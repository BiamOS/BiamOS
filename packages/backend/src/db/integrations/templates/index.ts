// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ============================================================
// BiamOS — Template Shop Index
// ============================================================
// All built-in integration templates, re-exported as a single array.
// To add a new template: create a new file in this folder and add it here.
// ============================================================

import type { IntegrationTemplate } from "../types.js";
import { openMeteo } from "./open-meteo.js";
import { restCountries } from "./rest-countries.js";
import { coinGecko } from "./coingecko.js";
import { exchangeRates } from "./exchange-rates.js";
import { wikipedia } from "./wikipedia.js";
import { hackerNews } from "./hacker-news.js";
import { theMealDB } from "./themealdb.js";

export const INTEGRATION_TEMPLATES: IntegrationTemplate[] = [
    openMeteo,
    restCountries,
    coinGecko,
    exchangeRates,
    wikipedia,
    hackerNews,
    theMealDB,
];

// Re-export types for convenience
export type { IntegrationTemplate, TemplateEndpoint } from "../types.js";
