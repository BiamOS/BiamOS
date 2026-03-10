// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 💱 Exchange Rates
import type { IntegrationTemplate } from "../types.js";

export const exchangeRates: IntegrationTemplate = {
    id: "tpl-exchange-rates",
    name: "Exchange Rates",
    icon: "💱",
    label: "Currency",
    description: "Real-time currency exchange rates. Convert between 150+ currencies including USD, EUR, GBP, and more.",
    category: "data",
    auth_type: "none",
    human_triggers: "exchange rate|currency|convert|dollar|euro|pound|yen|forex|umrechnung|währung",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "key_value", "metric_row", "badge_row", "table", "callout"],
    endpoints: [
        {
            name: "Get latest exchange rates",
            method: "GET",
            path: "https://open.er-api.com/v6/latest/{base}",
            intent_description: "Get the latest exchange rates for a base currency against all other currencies",
            endpoint_tags: "exchange,rate,currency,convert,forex,latest,dollar,euro",
            param_schema: JSON.stringify([
                { name: "base", in: "path", type: "text", required: true, description: "Base currency code (USD, EUR, GBP, JPY, CHF, etc.)" },
            ]),
            response_type: "data",
            supported_intents: "DATA",
        },
    ],
};
