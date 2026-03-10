// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 🍳 TheMealDB — Recipes
import type { IntegrationTemplate } from "../types.js";

export const theMealDB: IntegrationTemplate = {
    id: "tpl-themealdb",
    name: "TheMealDB",
    icon: "🍳",
    label: "Recipes",
    description: "Search for meal recipes, get cooking instructions, ingredients lists, and discover new dishes from around the world.",
    category: "content",
    auth_type: "none",
    human_triggers: "meal|recipe|cook|food|dish|ingredient|dinner|lunch|breakfast|essen|rezept|gericht|kochen",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "hero_image", "key_value", "chip_list", "list", "feed", "accordion", "callout", "link_list"],
    endpoints: [
        {
            name: "Search meal by name",
            method: "GET",
            path: "https://www.themealdb.com/api/json/v1/1/search.php?s={name}",
            intent_description: "Search for a meal recipe by name",
            endpoint_tags: "meal,recipe,search,food,cook,dish,find",
            param_schema: JSON.stringify([
                { name: "name", in: "query", type: "text", required: true, description: "Meal name to search for (e.g. pasta, chicken, sushi)" },
            ]),
            response_type: "article",
            supported_intents: "SEARCH|ARTICLE",
        },
        {
            name: "Get random meal",
            method: "GET",
            path: "https://www.themealdb.com/api/json/v1/1/random.php",
            intent_description: "Get a random meal recipe for inspiration",
            endpoint_tags: "meal,random,recipe,surprise,inspiration,food",
            param_schema: "[]",
            response_type: "article",
            supported_intents: "DATA",
        },
        {
            name: "List meals by category",
            method: "GET",
            path: "https://www.themealdb.com/api/json/v1/1/filter.php?c={category}",
            intent_description: "List all meals in a specific category",
            endpoint_tags: "meal,category,list,type,filter,vegetarian,seafood,dessert",
            param_schema: JSON.stringify([
                { name: "category", in: "query", type: "text", required: true, description: "Category (Beef, Chicken, Dessert, Pasta, Seafood, Vegetarian, Vegan, etc.)" },
            ]),
            response_type: "list",
            supported_intents: "SEARCH",
        },
    ],
};
