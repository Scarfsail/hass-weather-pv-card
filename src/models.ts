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
    datetime: Date;
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
    time: Date;
    power: number;
}
