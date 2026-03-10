// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 🪙 CoinGecko — Crypto
import type { IntegrationTemplate } from "../types.js";

export const coinGecko: IntegrationTemplate = {
    id: "tpl-coingecko",
    name: "CoinGecko",
    icon: "🪙",
    label: "Crypto",
    description: "Real-time cryptocurrency prices, market data, and trends. Track Bitcoin, Ethereum, and 10,000+ coins.",
    category: "data",
    auth_type: "none",
    human_triggers: "crypto|bitcoin|ethereum|coin|price|market|btc|eth|cryptocurrency|token|krypto",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "key_value", "metric_row", "stat_bar", "badge_row", "chip_list", "list", "feed", "table", "callout"],
    endpoints: [
        {
            name: "Get simple price",
            method: "GET",
            path: "https://api.coingecko.com/api/v3/simple/price?ids={coin}&vs_currencies={currency}&include_24hr_change=true&include_market_cap=true",
            intent_description: "Get the current price of a cryptocurrency in a target currency",
            endpoint_tags: "crypto,price,bitcoin,ethereum,coin,value,cost,current",
            param_schema: JSON.stringify([
                { name: "coin", in: "query", type: "text", required: true, description: "Coin ID (bitcoin, ethereum, dogecoin, solana, etc.)" },
                { name: "currency", in: "query", type: "text", required: false, description: "Target currency (usd, eur, gbp). Default: usd" },
            ]),
            response_type: "data",
            supported_intents: "DATA",
        },
        {
            name: "Get coin market data",
            method: "GET",
            path: "https://api.coingecko.com/api/v3/coins/markets?vs_currency={currency}&order=market_cap_desc&per_page=10&sparkline=false",
            intent_description: "List top cryptocurrencies by market cap with prices and changes",
            endpoint_tags: "crypto,market,top,ranking,list,coins,overview",
            param_schema: JSON.stringify([
                { name: "currency", in: "query", type: "text", required: false, description: "Target currency (usd, eur). Default: usd" },
            ]),
            response_type: "list",
            supported_intents: "DATA|SEARCH",
        },
        {
            name: "Get trending coins",
            method: "GET",
            path: "https://api.coingecko.com/api/v3/search/trending",
            intent_description: "Get currently trending cryptocurrencies",
            endpoint_tags: "crypto,trending,popular,hot,rising,coins",
            param_schema: "[]",
            response_type: "list",
            supported_intents: "DATA|SEARCH",
        },
    ],
};
