// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 🌍 REST Countries
import type { IntegrationTemplate } from "../types.js";

export const restCountries: IntegrationTemplate = {
    id: "tpl-rest-countries",
    name: "REST Countries",
    icon: "🌍",
    label: "Countries",
    description: "Comprehensive country data including population, capital, languages, currencies, and flags for every nation.",
    category: "data",
    auth_type: "none",
    human_triggers: "country|nation|capital|population|flag|language|currency|continent|region|land",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "key_value", "metric_row", "chip_list", "badge_row", "list", "feed", "link_list", "table", "callout", "hero_image"],
    endpoints: [
        {
            name: "Search country by name",
            method: "GET",
            path: "https://restcountries.com/v3.1/name/{name}?fields=name,capital,population,region,subregion,languages,currencies,flags,area,timezones",
            intent_description: "Search for a country by name and get detailed information",
            endpoint_tags: "country,search,name,information,details,nation",
            param_schema: JSON.stringify([
                { name: "name", in: "path", type: "text", required: true, description: "Country name to search for (e.g. Germany, Japan, Brazil)" },
            ]),
            response_type: "data",
            supported_intents: "DATA|ARTICLE",
        },
        {
            name: "Get countries by region",
            method: "GET",
            path: "https://restcountries.com/v3.1/region/{region}?fields=name,capital,population,flags",
            intent_description: "List all countries in a specific region/continent",
            endpoint_tags: "countries,region,continent,list,europe,asia,africa,americas",
            param_schema: JSON.stringify([
                { name: "region", in: "path", type: "text", required: true, description: "Region name (europe, asia, africa, americas, oceania)" },
            ]),
            response_type: "list",
            supported_intents: "SEARCH|DATA",
        },
    ],
};
