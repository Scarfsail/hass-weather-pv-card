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

export interface PvForecastRaw {
    time: string;
    power: number;
}
export interface PvForecast {
    time: dayjs.Dayjs;
    power: number;
}