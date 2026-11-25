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
