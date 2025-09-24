import dayjs from "dayjs";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { Forecasts, PvForecast, PvForecastRaw, WeatherForecastRaw } from "./models";
export async function collectForecastData(entity_weather: string, pv_forecast_entities: string[], hass: HomeAssistant): Promise<Forecasts> {

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
        // Get PV forecast from entity states (each entity represents one day)
        if (pv_forecast_entities && pv_forecast_entities.length > 0) {
            pvForecast = pv_forecast_entities
                .map((entityId, index) => {
                    const entity = hass.states[entityId];
                    if (!entity) return null;
                    
                    // Calculate the date for this forecast (today + index days)
                    const forecastDate = dayjs().add(index, 'day');
                    
                    return {
                        time: forecastDate,
                        power: Math.round(Number(entity.state))
                    };
                })
                .filter((forecast): forecast is PvForecast => forecast !== null);
        }
        return { weatherDaily: dailyForecast, weatherHourly: hourlyForecast, pv: pvForecast };
    } catch (e) {
        console.error("Error fetching forecast:", e);
        throw e;
    }

}