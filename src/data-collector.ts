import type { HomeAssistant } from "./ha-types";
import { PvForecast, WeatherForecast, WeatherForecastRaw } from "./models";

export function toForecast(forecast: WeatherForecastRaw): WeatherForecast {
    return {
        datetime: new Date(forecast.datetime),
        condition: forecast.condition,
        wind_bearing: forecast.wind_bearing,
        uv_index: forecast.uv_index,
        temperature: Math.round(forecast.temperature),
        templow: Math.round(forecast.templow),
        wind_speed: Math.round(forecast.wind_speed),
        precipitation: forecast.precipitation,
        humidity: Math.round(forecast.humidity)
    };
}

// Each PV entity represents one day: today + its index
export function toPvForecast(hass: HomeAssistant, pv_forecast_entities: string[]): PvForecast[] {
    return pv_forecast_entities
        .map((entityId, index) => {
            const entity = hass.states[entityId];
            if (!entity) return null;

            const time = new Date();
            time.setDate(time.getDate() + index);
            return {
                time,
                power: Math.round(Number(entity.state))
            };
        })
        .filter((forecast): forecast is PvForecast => forecast !== null);
}

// Hourly PV from a Forecast.Solar style `wh_period` attribute (ISO hour -> Wh), taken from the entity whose hours fall on `day`
export function toHourlyPv(hass: HomeAssistant, pv_forecast_entities: string[], day: Date): PvForecast[] {
    for (const entityId of pv_forecast_entities) {
        const whPeriod = hass.states[entityId]?.attributes.wh_period;
        if (typeof whPeriod !== "object" || whPeriod === null) continue;

        const hours = Object.entries(whPeriod)
            .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
            .map(([key, wh]) => ({ time: new Date(key), power: Math.round(wh / 100) / 10 }))
            .filter(pv => isSameDay(pv.time, day));
        if (hours.length > 0) return hours;
    }
    return [];
}

export function isSameDay(a: Date, b: Date) {
    return a.toDateString() === b.toDateString();
}
