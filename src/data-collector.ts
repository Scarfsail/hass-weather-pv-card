import dayjs from "dayjs";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { Forecasts, PvForecast, PvForecastRaw, WeatherForecastRaw } from "./models";
export async function collectForecastData(entity_weather: string, entity_pv: string, hass: HomeAssistant): Promise<Forecasts> {

    try {
        const dailyForecastRaw = await hass.callService('weather', 'get_forecasts',
            { type: 'daily' }, { entity_id: entity_weather }, false, true);

        // Get daily wather forecast from service response
        const dailyForecast = (dailyForecastRaw.response[entity_weather].forecast as WeatherForecastRaw[]).map(forecast => ({
            datetime: dayjs(forecast.datetime),
            condition: forecast.condition,
            wind_bearing: forecast.wind_bearing,
            uv_index: forecast.uv_index,
            temperature: Math.round(forecast.temperature),
            templow: Math.round(forecast.templow),
            wind_speed: Math.round(forecast.wind_speed),
            precipitation: forecast.precipitation,
            humidity: Math.round(forecast.humidity)
        }));

        const hourlyForecastRaw = await hass.callService('weather', 'get_forecasts',
            { type: 'hourly' }, { entity_id: entity_weather }, false, true);
        // Get daily wather forecast from service response
        const hourlyForecast = (hourlyForecastRaw.response[entity_weather].forecast as WeatherForecastRaw[]).map(forecast => ({
            datetime: dayjs(forecast.datetime),
            condition: forecast.condition,
            wind_bearing: forecast.wind_bearing,
            uv_index: forecast.uv_index,
            temperature: Math.round(forecast.temperature),
            templow: Math.round(forecast.templow),
            wind_speed: Math.round(forecast.wind_speed),
            precipitation: forecast.precipitation,
            humidity: Math.round(forecast.humidity)
        }));

        let pvForecast: PvForecast[] = [];
        // Get PV forecast from entity attribute
        if (entity_pv && hass.states[entity_pv]) {
            const pvEntity = hass.states[entity_pv];
            pvForecast = (pvEntity.attributes.forecast as PvForecastRaw[]).map(forecast => ({
                time: dayjs(forecast.time),
                power: Math.round(forecast.power / 1000)
            })) || [];
        }
        return { weatherDaily: dailyForecast, weatherHourly: hourlyForecast, pv: pvForecast };
    } catch (e) {
        console.error("Error fetching forecast:", e);
        throw e;
    }

}