import { LitElement, css, html } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import dayjs from "dayjs";
import duration from 'dayjs/plugin/duration'
import "./weather-value-column"
import { Forecasts, PvForecast, PvForecastRaw, WeatherForecast, WeatherForecastRaw } from "./models";
import 'dayjs/locale/cs';
import { collectForecastData } from "./data-collector";

dayjs.extend(duration);

interface WeatherPvCardConfig extends LovelaceCardConfig {
    entity: string;
    pv_entity: string;
    update_interval?: number;  // in minutes
}


const weatherIconsHassNative = {
    'clear-night': 'hass:weather-night',
    'cloudy': 'hass:weather-cloudy',
    'exceptional': 'mdi:alert-circle-outline',
    'fog': 'hass:weather-fog',
    'hail': 'hass:weather-hail',
    'lightning': 'hass:weather-lightning',
    'lightning-rainy': 'hass:weather-lightning-rainy',
    'partlycloudy': 'hass:weather-partly-cloudy',
    'pouring': 'hass:weather-pouring',
    'rainy': 'hass:weather-rainy',
    'snowy': 'hass:weather-snowy',
    'snowy-rainy': 'hass:weather-snowy-rainy',
    'sunny': 'hass:weather-sunny',
    'windy': 'hass:weather-windy',
    'windy-variant': 'hass:weather-windy-variant'
};

@customElement("weather-pv-card")
export class WeatherPvCard extends LitElement implements LovelaceCard {

    private config?: WeatherPvCardConfig;
    @state() private _hass?: HomeAssistant;
    @state() private _forecasts?: Forecasts;
    @state() private _selectedDay?: dayjs.Dayjs;
    private _updateTimer?: number;

    public set hass(value: HomeAssistant) {
        const hassWasSet = this._hass !== undefined;
        this._hass = value;

        if (!hassWasSet) {
            this.updateData();
        }
    }

    getCardSize() {
        return this.config?.card_size ?? 1;
    }

    public static async getStubConfig(hass: HomeAssistant): Promise<Partial<WeatherPvCardConfig>> {
        return {
            type: `custom:weather-pv-card`,
            entity: "weather.home",
            pv_forecast_entity: "sensor.pv_power_forecas"
        };
    }

    async setConfig(config: WeatherPvCardConfig) {
        this.config = {
            update_interval: 30,  // default 30 minutes
            ...config
        };
        this.startDataUpdate();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._updateTimer) {
            window.clearInterval(this._updateTimer);
        }
    }

    private startDataUpdate() {
        this.updateData();
        this._updateTimer = window.setInterval(
            () => this.updateData(),
            (this.config?.update_interval || 30) * 60 * 1000
        );
    }

    private async updateData() {
        if (!this._hass || !this.config?.entity)
            return;

        try {
            this._forecasts = await collectForecastData(this.config.entity, this.config.pv_entity, this._hass);
        } catch (e) {
            console.error("Error fetching forecast:", e);
        }
    }

    static styles = css`
        .forecast-container {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            padding: 16px;
        }
        .forecast-day {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            border-right:  0.5px solid rgb(47, 52, 60);
        }
        .forecast-bar {
            //height: 100px;
            margin-top: 8px;
            width: 100%;
            text-align: center;
            display: flex;
            flex-wrap: nowrap;
            flex-direction: column;
        }
        .day-name{
            font-size: 1.2em;
            font-weight: bold;
        }
    `

    render() {

        if (!this.config) {
            return "Config is not defined";
        }
        const entity = this._hass?.states[this.config.entity];
        if (!entity) {
            return `Entity ${this.config.entity} not found`;
        }
        if (!this._hass?.states[this.config.pv_entity]) {
            return `Entity ${this.config.pv_entity} not found`;
        }
        
        if (!this._forecasts) {
            return "Loading...";
        }

        const dailyForecast = this._forecasts.weatherDaily;
        const pvForecast = this._forecasts.pv;

        return html`
            <ha-card>
                <div class="forecast-container">
                    ${dailyForecast.map(day => {
                        const pvData = pvForecast.find(pv =>pv.time.format('YYYY-MM-DD') === dayjs(day.datetime).format('YYYY-MM-DD'));

                        return html`
                            <div class="forecast-day">
                                <div class="day-name">${day.datetime.locale(this._hass?.locale?.language ?? 'en').format('ddd')}</div>
                                <div>${day.datetime.format('D.')}</div>
                                <ha-icon icon=${weatherIconsHassNative[day.condition as keyof typeof weatherIconsHassNative]}></ha-icon>
                                <div class="forecast-bar">
                                    <weather-value-column 
                                        .value=${day.temperature}
                                        .allValues=${dailyForecast.map(d => d.temperature)}
                                        color="#77450D"
                                        units="°C"
                                    ></weather-value-column>
                                    <weather-value-column 
                                        .value=${day.templow}
                                        .allValues=${dailyForecast.map(d => d.templow)}
                                        color="#2F343C"
                                        units="°C"
                                    ></weather-value-column>
                                    <weather-value-column 
                                        .value=${day.precipitation}
                                        .allValues=${dailyForecast.map(d => d.precipitation)}
                                        color="#0C5174"
                                        units="mm"
                                        fontSizeRatio=80
                                    ></weather-value-column>
                                    <weather-value-column 
                                        .value=${day.wind_speed}
                                        .allValues=${dailyForecast.map(d => d.wind_speed)}
                                        color="#004D46"
                                        units="km/h"
                                        fontSizeRatio=80
                                    ></weather-value-column>                        
                                    ${pvData ? html`
                                        <weather-value-column
                                            .value=${pvData.power}
                                            .allValues=${pvForecast.map(d => d.power)}
                                            color="#5C4405"
                                            units="kWh"
                                            fontSizeRatio=80
                                            ></weather-value-column>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </ha-card>
        `
    }

}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'weather-pv-card',
    name: 'Weather Photo Voltaic Card',
    description: 'A weather card for Home Assistant that displays the weather and photo voltaic panels forecast.',
    preview: true,
});