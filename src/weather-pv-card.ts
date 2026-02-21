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
    pv_forecast_entities: string[];
    update_interval?: number;  // in minutes
    days_to_show?: number;
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
    @state() private _error?: string;
    private _updateTimer?: number;
    private _lastUpdateDate?: string;
    private _retryCount: number = 0;
    private _maxRetries: number = 3;

    constructor() {
        super();
        //dayjs.locale('cs');
        dayjs.locale(this._hass?.locale?.language ?? 'cs')
    }

    public set hass(value: HomeAssistant) {
        const hassWasSet = this._hass !== undefined;
        const oldHass = this._hass;
        this._hass = value;

        // Start the update timer when hass is first set
        if (!hassWasSet) {
            this.startDataUpdate();
        }
        
        // Check if the day has changed and refresh data if needed
        const currentDate = dayjs().format('YYYY-MM-DD');
        if (this._lastUpdateDate && this._lastUpdateDate !== currentDate) {
            console.log('Day changed, refreshing weather-pv-card data');
            this.updateData();
        }
        
        // Update data if entities changed or became available
        if (oldHass && this.config) {
            const entitiesChanged = this.config.pv_forecast_entities?.some(entityId => 
                oldHass.states[entityId]?.state !== value.states[entityId]?.state
            ) || oldHass.states[this.config.entity]?.state !== value.states[this.config.entity]?.state;
            
            if (entitiesChanged) {
                this.updateData();
            }
        }
    }

    getCardSize() {
        return this.config?.card_size ?? 1;
    }

    public static async getStubConfig(hass: HomeAssistant): Promise<Partial<WeatherPvCardConfig>> {
        return {
            type: `custom:weather-pv-card`,
            entity: "weather.home",
            pv_forecast_entities: [
                "sensor.pv_forecast_today",
                "sensor.pv_forecast_tomorrow",
                "sensor.pv_forecast_day_3",
                "sensor.pv_forecast_day_4",
                "sensor.pv_forecast_day_5"
            ]
        };
    }

    async setConfig(config: WeatherPvCardConfig) {
        this.config = {
            update_interval: 30,  // default 30 minutes
            ...config
        };
        // Don't start timer here - wait for hass to be set in the hass setter
        // If hass is already available, update now
        if (this._hass) {
            this.startDataUpdate();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._updateTimer) {
            window.clearInterval(this._updateTimer);
        }
    }

    private startDataUpdate() {
        // Clear any existing timer
        if (this._updateTimer) {
            window.clearInterval(this._updateTimer);
        }
        
        // Update data immediately
        this.updateData();
        
        // Set up periodic updates
        this._updateTimer = window.setInterval(
            () => this.updateData(),
            (this.config?.update_interval || 30) * 60 * 1000
        );
    }

    private async updateData() {
        if (!this._hass || !this.config?.entity) {
            console.warn('Cannot update data: hass or config not ready');
            return;
        }

        try {
            this._forecasts = await collectForecastData(this.config.entity, this.config.pv_forecast_entities, this._hass);
            this._error = undefined;  // Clear any previous errors
            this._retryCount = 0;  // Reset retry counter on success
            this._lastUpdateDate = dayjs().format('YYYY-MM-DD');  // Track when we last updated
            console.log('Weather PV card data updated successfully');
        } catch (e) {
            console.error("Error fetching forecast:", e);
            this._retryCount++;
            
            // Set error message
            this._error = `Failed to load weather data${this._retryCount > 1 ? ` (attempt ${this._retryCount}/${this._maxRetries})` : ''}`;
            
            // Retry logic with exponential backoff
            if (this._retryCount < this._maxRetries) {
                const retryDelay = Math.min(1000 * Math.pow(2, this._retryCount - 1), 30000); // Max 30 seconds
                console.log(`Retrying in ${retryDelay}ms...`);
                setTimeout(() => this.updateData(), retryDelay);
            } else {
                this._error = 'Failed to load weather data. Please check your configuration and try refreshing the page.';
                console.error('Max retries reached. Data update failed.');
            }
        }
    }

    static styles = css`
        .forecast-container {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            padding: 16px;
        }
        .forecast-container-hourly{
            overflow: auto;
        }
        .forecast-interval {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            border-right:  0.5px solid rgb(47, 52, 60);
        }
        .forecast-interval-daily{
            cursor: pointer;
        }
        .forecast-values {
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
        .forecast-hourly-header{
            display: flex;
            justify-content: flex-start;
            padding: 16px;
            gap: 16px;
            font-size: 1.2em;
            font-weight: bold;
            cursor: pointer;
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
        
        // Check if any of the PV forecast entities are missing
        const missingPvEntities = this.config.pv_forecast_entities?.filter(entityId => 
            !this._hass?.states[entityId]
        );
        if (missingPvEntities && missingPvEntities.length > 0) {
            return html`
                <ha-card>
                    <div style="padding: 16px; color: var(--error-color, #ff0000);">
                        PV forecast entities not found: ${missingPvEntities.join(', ')}
                    </div>
                </ha-card>
            `;
        }

        // Show error state if data fetch failed
        if (this._error && !this._forecasts) {
            return html`
                <ha-card>
                    <div style="padding: 16px; text-align: center;">
                        <div style="color: var(--error-color, #ff0000); margin-bottom: 8px;">
                            ${this._error}
                        </div>
                        <button @click=${() => this.retryNow()} style="padding: 8px 16px; cursor: pointer;">
                            Retry Now
                        </button>
                    </div>
                </ha-card>
            `;
        }

        // Show loading state
        if (!this._forecasts) {
            return html`
                <ha-card>
                    <div style="padding: 16px; text-align: center;">
                        <div>Loading weather data...</div>
                        ${this._retryCount > 0 ? html`<div style="font-size: 0.9em; color: var(--secondary-text-color); margin-top: 8px;">Retry ${this._retryCount}/${this._maxRetries}</div>` : ''}
                    </div>
                </ha-card>
            `;
        }


        return html`
            <ha-card>
                    ${this._selectedDay ?
                this.renderHours(this._forecasts.weatherHourly)
                :
                this.renderDays(this._forecasts.weatherDaily, this._forecasts.pv)
            }
            </ha-card>
        `
    }

    private renderDays(dailyForecast: WeatherForecast[], pvForecast: PvForecast[]) {
        const visibleForecast = this.config?.days_to_show != null
            ? dailyForecast.slice(0, this.config.days_to_show)
            : dailyForecast;
        return html`
            <div class="forecast-container">
                ${visibleForecast.map(day => {
                    const pvData = pvForecast.find(pv => pv.time.format('YYYY-MM-DD') === dayjs(day.datetime).format('YYYY-MM-DD'));
                    return html`
                        <div class="forecast-interval forecast-interval-daily" @click=${() => this._selectedDay = day.datetime}>
                            <div class="day-name">${day.datetime.format('ddd')}</div>
                            <div>${day.datetime.format('D.')}</div>
                            <ha-icon icon=${weatherIconsHassNative[day.condition as keyof typeof weatherIconsHassNative]}></ha-icon>
                            <div class="forecast-values">
                                <weather-value-column
                                    .value=${day.temperature}
                                    .allValues=${visibleForecast.map(d => d.temperature)}
                                    color="#77450D"
                                    units="°C"
                                ></weather-value-column>
                                <weather-value-column
                                    .value=${day.templow}
                                    .allValues=${visibleForecast.map(d => d.templow)}
                                    color="#2F343C"
                                    units="°C"
                                ></weather-value-column>
                                <weather-value-column
                                    .value=${day.precipitation}
                                    .allValues=${visibleForecast.map(d => d.precipitation)}
                                    color="#0C5174"
                                    units="mm"
                                    fontSizeRatio=80
                                ></weather-value-column>
                                <weather-value-column
                                    .value=${day.wind_speed}
                                    .allValues=${visibleForecast.map(d => d.wind_speed)}
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
            `
        
     
    }
    private renderHours(hourlyForecast: WeatherForecast[]) {
        const forecast = hourlyForecast.filter(hour => hour.datetime.format('YYYY-MM-DD') === this._selectedDay?.format('YYYY-MM-DD'));
        if (!forecast) {
            return html`<div>No data for this day</div>`;
        }

        return html`
            <div>
                <div class="forecast-hourly-header" @click=${() => this._selectedDay = undefined}>
                    <div>←</div>
                    <div>${this._selectedDay?.format('dddd D.M.')}</div>
                </div>
                <div class="forecast-container forecast-container-hourly">
                    ${forecast.map(hour => html`
                        <div class="forecast-interval">
                            <div>${hour.datetime.format('HH')}</div>
                            <ha-icon icon=${weatherIconsHassNative[hour.condition as keyof typeof weatherIconsHassNative]}></ha-icon>
                            <div class="forecast-values">
                                <weather-value-column 
                                    .value=${hour.temperature}
                                    .allValues=${hourlyForecast.map(d => d.temperature)}
                                    color="#77450D"
                                    units="°C"
                                ></weather-value-column>
                                <weather-value-column 
                                    .value=${hour.precipitation}
                                    .allValues=${hourlyForecast.map(d => d.precipitation)}
                                    color="#0C5174"
                                    units="mm"
                                    fontSizeRatio=80
                                ></weather-value-column>
                                <weather-value-column 
                                    .value=${hour.wind_speed}
                                    .allValues=${hourlyForecast.map(d => d.wind_speed)}
                                    color="#004D46"
                                    units="km/h"
                                    fontSizeRatio=80
                                ></weather-value-column>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
            `
    }
    
    private retryNow() {
        this._retryCount = 0;
        this._error = undefined;
        this.updateData();
    }
}



(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'weather-pv-card',
    name: 'Weather Photo Voltaic Card',
    description: 'A weather card for Home Assistant that displays the weather and photo voltaic panels forecast.',
    preview: true,
});