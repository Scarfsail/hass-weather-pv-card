import dayjs from "dayjs";

export interface WeatherForecastRaw {
    datetime: string;
    condition: string;
    wind_bearing: number;
    uv_index: number;
    temperature: number;
    templow: number;
    wind_speed: number;
    precipitation: number;
    humidity: number;
}
export interface WeatherForecast {
    datetime: dayjs.Dayjs;
    condition: string;
    wind_bearing: number;
    uv_index: number;
    temperature: number;
    templow: number;
    wind_speed: number;
    precipitation: number;
    humidity: number;
}

export interface PvForecast {
    time: dayjs.Dayjs;
    power: number;
}
export interface Forecasts {
    weatherDaily: WeatherForecast[];
    weatherHourly: WeatherForecast[];
    pv: PvForecast[];
}

export interface SolarForecastWsResponse {
    [configEntryId: string]: {
        wh_hours: { [isoTimestamp: string]: number | null };
    };
}