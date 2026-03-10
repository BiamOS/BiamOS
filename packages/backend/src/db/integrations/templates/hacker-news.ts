// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 📰 Hacker News
import type { IntegrationTemplate } from "../types.js";

export const hackerNews: IntegrationTemplate = {
    id: "tpl-hacker-news",
    name: "Hacker News",
    icon: "📰",
    label: "Tech News",
    description: "Search and browse Hacker News — the top source for tech news, startups, and developer discussions.",
    category: "content",
    auth_type: "none",
    human_triggers: "hacker news|tech news|hn|startup|programming news|technology|developer|nachrichten|tech",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "key_value", "chip_list", "badge_row", "list", "feed", "link_list", "callout"],
    endpoints: [
        {
            name: "Search stories",
            method: "GET",
            path: "https://hn.algolia.com/api/v1/search?query={query}&tags=story&hitsPerPage=10",
            intent_description: "Search Hacker News stories by keyword",
            endpoint_tags: "news,search,hacker news,tech,stories,articles,find",
            param_schema: JSON.stringify([
                { name: "query", in: "query", type: "text", required: true, description: "Search query for tech news (e.g. AI, React, startup)" },
            ]),
            response_type: "list",
            supported_intents: "SEARCH",
        },
        {
            name: "Get front page",
            method: "GET",
            path: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=10",
            intent_description: "Get the current Hacker News front page stories",
            endpoint_tags: "news,top,trending,front page,popular,hot,latest",
            param_schema: "[]",
            response_type: "list",
            supported_intents: "SEARCH|DATA",
        },
    ],
};
