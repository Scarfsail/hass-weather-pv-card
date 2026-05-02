import dayjs from "dayjs";
import type { HomeAssistant } from "../hass-frontend/src/types";
import { Forecasts, PvForecast, SolarForecastWsResponse, WeatherForecastRaw } from "./models";

export async function collectForecastData(
    entity_weather: string,
    solar_forecast_entry: string | undefined,
    hass: HomeAssistant
): Promise<Forecasts> {
    try {
        const dailyForecastRaw = await hass.callService('weather', 'get_forecasts',
            { type: 'daily' }, { entity_id: entity_weather }, false, true);

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

        if (solar_forecast_entry) {
            const wsResponse = await hass.callWS<SolarForecastWsResponse>({
                type: 'energy/solar_forecast',
            });

            const entryData = wsResponse[solar_forecast_entry];
            if (entryData?.wh_hours) {
                const dailyWh: { [date: string]: number } = {};
                for (const [isoTimestamp, wh] of Object.entries(entryData.wh_hours)) {
                    const date = dayjs(isoTimestamp).format('YYYY-MM-DD');
                    dailyWh[date] = (dailyWh[date] ?? 0) + (wh ?? 0);
                }
                pvForecast = Object.entries(dailyWh)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, wh]) => ({
                        time: dayjs(date),
                        power: Math.round(wh / 1000)
                    }));
            }
        }

        return { weatherDaily: dailyForecast, weatherHourly: hourlyForecast, pv: pvForecast };
    } catch (e) {
        console.error("Error fetching forecast:", e);
        throw e;
    }
}
