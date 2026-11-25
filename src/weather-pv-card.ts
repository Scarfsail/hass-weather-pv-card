import { LitElement, PropertyValues, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ForecastEvent, HomeAssistant, LovelaceCard, LovelaceCardConfig } from "./ha-types";
import "./weather-value-column"
import { PvForecast, WeatherForecast } from "./models";
import { toForecast, toPvForecast } from "./data-collector";

interface WeatherPvCardConfig extends LovelaceCardConfig {
    entity: string;
    pv_forecast_entities: string[];
    days_to_show?: number;
}

type ForecastType = "daily" | "hourly";

interface ValueRange {
    min: number;
    max: number;
}

interface ColumnStyle {
    color: string;
    units: string;
    fontSizeRatio: number;
}

interface WeatherColumn extends ColumnStyle {
    value: (forecast: WeatherForecast) => number;
}

const temperatureColumn: WeatherColumn = { value: f => f.temperature, color: "#77450D", units: "°C", fontSizeRatio: 100 };
const templowColumn: WeatherColumn = { value: f => f.templow, color: "#2F343C", units: "°C", fontSizeRatio: 100 };
const precipitationColumn: WeatherColumn = { value: f => f.precipitation, color: "#0C5174", units: "mm", fontSizeRatio: 80 };
const windSpeedColumn: WeatherColumn = { value: f => f.wind_speed, color: "#004D46", units: "km/h", fontSizeRatio: 80 };
const pvColumn: ColumnStyle = { color: "#5C4405", units: "kWh", fontSizeRatio: 80 };

const dailyColumns = [temperatureColumn, templowColumn, precipitationColumn, windSpeedColumn];
const hourlyColumns = [temperatureColumn, precipitationColumn, windSpeedColumn];

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

// Bars fill from min(0, lowest) to highest, so the highest value always has the tallest bar.
// Non-finite values (unavailable sensor, missing forecast field) are ignored.
function valueRange(values: number[]): ValueRange {
    const finite = values.filter(Number.isFinite);
    return { min: Math.min(0, ...finite), max: Math.max(...finite) };
}

function isSameDay(a: Date, b: Date) {
    return a.toDateString() === b.toDateString();
}

@customElement("weather-pv-card")
export class WeatherPvCard extends LitElement implements LovelaceCard {

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
        .error {
            padding: 16px;
            color: var(--error-color, #ff0000);
        }
        .loading {
            padding: 16px;
            text-align: center;
        }
    `

    private _hass?: HomeAssistant;
    // Only pending or successful subscriptions; a failed one is removed so it can be retried
    private _subscriptions: Partial<Record<ForecastType, Promise<(() => Promise<void>) | void>>> = {};
    // Derived in willUpdate
    private _days: WeatherForecast[] = [];
    private _pv: PvForecast[] = [];
    private _pvRange: ValueRange = { min: 0, max: 0 };
    private _hours: WeatherForecast[] = [];
    private _columnRanges: ValueRange[] = [];
    private _weekdayFormat?: Intl.DateTimeFormat;
    private _dayFormat?: Intl.DateTimeFormat;
    private _selectedDayFormat?: Intl.DateTimeFormat;

    @state() private _config?: WeatherPvCardConfig;
    @state() private _daily?: WeatherForecast[];
    @state() private _hourly?: WeatherForecast[];
    @state() private _selectedDay?: Date;
    @state() private _errors: Partial<Record<ForecastType, string>> = {};

    public set hass(hass: HomeAssistant) {
        const oldHass = this._hass;
        this._hass = hass;
        const entityId = this._config?.entity;
        // Subscribe once the entity exists and retry failed subscriptions only when its state changes
        if (entityId && oldHass?.states[entityId] !== hass.states[entityId]) {
            this.subscribeForecasts();
        }
        if (!oldHass || this.watchedHassChanged(oldHass, hass)) {
            this.requestUpdate();
        }
    }

    setConfig(config: WeatherPvCardConfig) {
        const entityChanged = config.entity !== this._config?.entity;
        this._config = config;
        if (entityChanged) {
            this.unsubscribeForecasts();
            this._daily = undefined;
            this._hourly = undefined;
            this._errors = {};
            this.subscribeForecasts();
        }
    }

    getCardSize() {
        return this._config?.card_size ?? 1;
    }

    connectedCallback() {
        super.connectedCallback();
        this.subscribeForecasts();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribeForecasts();
    }

    willUpdate(changedProperties: PropertyValues<this>) {
        super.willUpdate(changedProperties);
        if (!this._config || !this._hass) {
            return;
        }

        const language = this._hass.locale.language;
        this._weekdayFormat = new Intl.DateTimeFormat(language, { weekday: "short" });
        this._dayFormat = new Intl.DateTimeFormat(language, { day: "numeric" });
        this._selectedDayFormat = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "numeric" });

        if (this._selectedDay) {
            const selectedDay = this._selectedDay;
            this._hours = (this._hourly ?? []).filter(hour => isSameDay(hour.datetime, selectedDay));
            this._columnRanges = hourlyColumns.map(column => valueRange(this._hours.map(column.value)));
        } else {
            const daily = this._daily ?? [];
            this._days = this._config.days_to_show != null ? daily.slice(0, this._config.days_to_show) : daily;
            this._columnRanges = dailyColumns.map(column => valueRange(this._days.map(column.value)));
            this._pv = toPvForecast(this._hass, this._config.pv_forecast_entities ?? []);
            this._pvRange = valueRange(this._pv
                .filter(pv => this._days.some(day => isSameDay(pv.time, day.datetime)))
                .map(pv => pv.power));
        }
    }

    render() {
        if (!this._config || !this._hass) {
            return "";
        }
        if (!this._hass.states[this._config.entity]) {
            return this.renderError(`Entity ${this._config.entity} not found`);
        }

        const missingPvEntities = this._config.pv_forecast_entities?.filter(entityId => !this._hass!.states[entityId]);
        if (missingPvEntities && missingPvEntities.length > 0) {
            return this.renderError(`PV forecast entities not found: ${missingPvEntities.join(', ')}`);
        }

        if (this._errors.daily && !this._daily) {
            return this.renderError(this._errors.daily);
        }

        if (!this._daily) {
            return html`
                <ha-card>
                    <div class="loading">Loading weather data...</div>
                </ha-card>
            `;
        }

        return html`
            <ha-card>
                ${this._selectedDay ? this.renderHours(this._selectedDay) : this.renderDays()}
            </ha-card>
        `
    }

    private renderError(message: string) {
        return html`
            <ha-card>
                <div class="error">${message}</div>
            </ha-card>
        `;
    }

    private renderDays() {
        return html`
            <div class="forecast-container">
                ${this._days.map(day => {
                    const pvData = this._pv.find(pv => isSameDay(pv.time, day.datetime));
                    return html`
                        <div class="forecast-interval forecast-interval-daily" @click=${() => this._selectedDay = day.datetime}>
                            <div class="day-name">${this._weekdayFormat!.format(day.datetime)}</div>
                            <div>${this._dayFormat!.format(day.datetime)}</div>
                            <ha-icon icon=${weatherIconsHassNative[day.condition as keyof typeof weatherIconsHassNative]}></ha-icon>
                            <div class="forecast-values">
                                ${dailyColumns.map((column, index) => this.renderValueColumn(column.value(day), this._columnRanges[index], column))}
                                ${pvData ? this.renderValueColumn(pvData.power, this._pvRange, pvColumn) : ''}
                            </div>
                        </div>
                    `;
                })}
            </div>
        `
    }

    private renderHours(selectedDay: Date) {
        return html`
            <div>
                <div class="forecast-hourly-header" @click=${() => this._selectedDay = undefined}>
                    <div>←</div>
                    <div>${this._selectedDayFormat!.format(selectedDay)}</div>
                </div>
                ${this._hours.length === 0
                    ? html`<div class=${this._errors.hourly ? "error" : "loading"}>${this._errors.hourly ?? "No hourly data"}</div>`
                    : ''}
                <div class="forecast-container forecast-container-hourly">
                    ${this._hours.map(hour => html`
                        <div class="forecast-interval">
                            <div>${String(hour.datetime.getHours()).padStart(2, "0")}</div>
                            <ha-icon icon=${weatherIconsHassNative[hour.condition as keyof typeof weatherIconsHassNative]}></ha-icon>
                            <div class="forecast-values">
                                ${hourlyColumns.map((column, index) => this.renderValueColumn(column.value(hour), this._columnRanges[index], column))}
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `
    }

    private renderValueColumn(value: number, range: ValueRange, style: ColumnStyle) {
        return html`
            <weather-value-column
                .value=${value}
                .min=${range.min}
                .max=${range.max}
                .color=${style.color}
                .units=${style.units}
                .fontSizeRatio=${style.fontSizeRatio}
            ></weather-value-column>
        `;
    }

    private watchedHassChanged(oldHass: HomeAssistant, hass: HomeAssistant) {
        if (!this._config) {
            return true;
        }
        return oldHass.locale.language !== hass.locale.language
            || [this._config.entity, ...(this._config.pv_forecast_entities ?? [])]
                .some(entityId => oldHass.states[entityId] !== hass.states[entityId]);
    }

    private subscribeForecasts() {
        // Wait for the entity to exist (e.g. HA still starting); the hass setter retries when its state changes
        if (!this.isConnected || !this._hass || !this._config || !this._hass.states[this._config.entity]) {
            return;
        }
        const connection = this._hass.connection;
        const entityId = this._config.entity;
        for (const forecastType of ["daily", "hourly"] as const) {
            if (this._subscriptions[forecastType]) {
                continue;
            }
            // Ignore events and errors from a subscription replaced by setConfig or disconnect
            const isCurrent = () => this._subscriptions[forecastType] === subscription;
            const subscription = connection.subscribeMessage<ForecastEvent>(
                event => {
                    if (!isCurrent()) {
                        return;
                    }
                    this._errors = { ...this._errors, [forecastType]: undefined };
                    const forecast = (event.forecast ?? []).map(toForecast);
                    if (forecastType === "daily") {
                        this._daily = forecast;
                    } else {
                        this._hourly = forecast;
                    }
                },
                { type: "weather/subscribe_forecast", forecast_type: forecastType, entity_id: entityId }
            ).catch((err: { message: string }) => {
                if (!isCurrent()) {
                    return;
                }
                console.error(`Error subscribing to ${forecastType} forecast:`, err);
                delete this._subscriptions[forecastType];
                this._errors = { ...this._errors, [forecastType]: `Failed to load ${forecastType} forecast for ${entityId}: ${err.message}` };
            });
            this._subscriptions[forecastType] = subscription;
        }
    }

    private unsubscribeForecasts() {
        Object.values(this._subscriptions).forEach(unsubscribe => unsubscribe.then(unsub => unsub?.()).catch(() => {}));
        this._subscriptions = {};
    }
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'weather-pv-card',
    name: 'Weather Photo Voltaic Card',
    description: 'A weather card for Home Assistant that displays the weather and photo voltaic panels forecast.',
    preview: true,
});
