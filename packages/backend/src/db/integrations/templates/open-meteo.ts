// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// 🌤️ Open-Meteo — Weather
import type { IntegrationTemplate } from "../types.js";

export const openMeteo: IntegrationTemplate = {
    id: "tpl-open-meteo",
    name: "Open-Meteo",
    icon: "🌤️",
    label: "Weather",
    description: "Real-time weather data and forecasts. No API key needed. Supports current conditions, hourly, and 7-day forecasts worldwide.",
    category: "data",
    auth_type: "none",
    human_triggers: "weather|forecast|temperature|rain|wind|humidity|sunny|cloudy|storm|snow|wetter",
    allowed_blocks: ["title", "text", "divider", "spacer", "hero", "key_value", "metric_row", "stat_bar", "table", "chip_list", "badge_row", "callout", "list"],
    endpoints: [
        {
            name: "Get current weather",
            method: "GET",
            path: "https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current_weather=true&timezone=auto",
            intent_description: "Get current weather conditions for a location including temperature, wind speed, and weather code",
            endpoint_tags: "weather,current,temperature,wind,conditions,now,today",
            param_schema: JSON.stringify([
                { name: "latitude", in: "query", type: "number", required: true, description: "Latitude of the location (e.g. 48.2 for Vienna, 51.5 for London, 40.7 for New York)" },
                { name: "longitude", in: "query", type: "number", required: true, description: "Longitude of the location (e.g. 16.37 for Vienna, -0.12 for London, -74.0 for New York)" },
            ]),
            response_type: "data",
            supported_intents: "DATA",
        },
        {
            name: "Get weather forecast",
            method: "GET",
            path: "https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&forecast_days={days}",
            intent_description: "Get multi-day weather forecast with daily highs, lows, and precipitation",
            endpoint_tags: "weather,forecast,weekly,daily,prediction,outlook,week",
            param_schema: JSON.stringify([
                { name: "latitude", in: "query", type: "number", required: true, description: "Latitude of the location" },
                { name: "longitude", in: "query", type: "number", required: true, description: "Longitude of the location" },
                { name: "days", in: "query", type: "number", required: false, description: "Number of forecast days (1-16), default 7" },
            ]),
            response_type: "data",
            supported_intents: "DATA",
        },
        {
            name: "Geocode city name",
            method: "GET",
            path: "https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en",
            intent_description: "Convert a city name to latitude/longitude coordinates for weather lookups",
            endpoint_tags: "geocode,city,location,coordinates,latitude,longitude,search",
            param_schema: JSON.stringify([
                { name: "city", in: "query", type: "text", required: true, description: "City name to search for (e.g. London, New York, Vienna)" },
            ]),
            response_type: "data",
            supported_intents: "DATA",
        },
    ],
};
