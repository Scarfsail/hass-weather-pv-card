import type { WeatherForecastRaw } from "./models";

export interface HomeAssistant {
    states: Record<string, { state: string; attributes: Record<string, unknown> }>;
    connection: {
        subscribeMessage<T>(callback: (message: T) => void, subscribeMessage: Record<string, unknown>): Promise<() => Promise<void>>;
    };
    locale: { language: string };
    themes: { darkMode: boolean };
}

export interface LovelaceCardConfig {
    type: string;
    [key: string]: any;
}

export interface LovelaceCard extends HTMLElement {
    hass?: HomeAssistant;
    setConfig(config: LovelaceCardConfig): void;
    getCardSize(): number | Promise<number>;
}

export interface ForecastEvent {
    type: "daily" | "hourly";
    forecast: WeatherForecastRaw[] | null;
}
