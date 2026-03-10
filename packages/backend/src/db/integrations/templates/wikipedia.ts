// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 📖 Wikipedia
import type { IntegrationTemplate } from "../types.js";

export const wikipedia: IntegrationTemplate = {
    id: "tpl-wikipedia",
    name: "Wikipedia",
    icon: "📖",
    label: "Encyclopedia",
    description: "Access the world's largest encyclopedia. Search articles, get summaries, and explore knowledge on any topic.",
    category: "content",
    auth_type: "none",
    human_triggers: "wikipedia|wiki|article|encyclopedia|knowledge|information|tell me about|who is|what is",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "hero_image", "key_value", "chip_list", "list", "feed", "link_list", "accordion", "callout"],
    endpoints: [
        {
            name: "Search articles",
            method: "GET",
            path: "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}&format=json&srlimit=5",
            intent_description: "Search Wikipedia for articles matching a query",
            endpoint_tags: "wikipedia,search,articles,find,lookup,query",
            param_schema: JSON.stringify([
                { name: "query", in: "query", type: "text", required: true, description: "The search query to find articles about" },
            ]),
            response_type: "article",
            supported_intents: "SEARCH",
        },
        {
            name: "Get article summary",
            method: "GET",
            path: "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles={title}&format=json",
            intent_description: "Get a summary extract of a specific Wikipedia article",
            endpoint_tags: "wikipedia,summary,article,extract,about,information,detail",
            param_schema: JSON.stringify([
                { name: "title", in: "query", type: "text", required: true, description: "The exact title of the Wikipedia article" },
            ]),
            response_type: "article",
            supported_intents: "ARTICLE",
        },
        {
            name: "Get article content",
            method: "GET",
            path: "https://en.wikipedia.org/w/api.php?action=parse&page={title}&prop=wikitext&format=json",
            intent_description: "Get the full content/wikitext of a Wikipedia article",
            endpoint_tags: "wikipedia,content,full,article,page,read,detail",
            param_schema: JSON.stringify([
                { name: "title", in: "query", type: "text", required: true, description: "The exact title of the Wikipedia article" },
            ]),
            response_type: "article",
            supported_intents: "ARTICLE",
        },
        {
            name: "Get random article",
            method: "GET",
            path: "https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=1&format=json",
            intent_description: "Get a random Wikipedia article",
            endpoint_tags: "wikipedia,random,surprise,discover,article",
            param_schema: "[]",
            response_type: "article",
            supported_intents: "ARTICLE",
        },
    ],
};
