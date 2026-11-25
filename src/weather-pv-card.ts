import { LitElement, PropertyValues, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ForecastEvent, HomeAssistant, LovelaceCard, LovelaceCardConfig } from "./ha-types";
import "./weather-value-chip";
import "./temperature-chart";
import { WeatherForecast } from "./models";
import { isSameDay, toForecast, toHourlyPv, toPvForecast } from "./data-collector";

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
    // Name of a CSS variable holding an "r, g, b" triplet
    color: string;
    units: string;
    dashOnZero: boolean;
}

interface WeatherColumn extends ColumnStyle {
    value: (forecast: WeatherForecast) => number;
}

const precipitationColumn: WeatherColumn = { value: f => f.precipitation, color: "--wpv-rain-rgb", units: "mm", dashOnZero: true };
const windSpeedColumn: WeatherColumn = { value: f => f.wind_speed, color: "--wpv-wind-rgb", units: "km/h", dashOnZero: false };
const pvColumn: ColumnStyle = { color: "--wpv-pv-rgb", units: "kWh", dashOnZero: true };

const weatherColumns = [precipitationColumn, windSpeedColumn];

// Icon colour names a --wpv-cond-* palette variable
const weatherIconsHassNative: Record<string, { icon: string; color: "sun" | "cloud" | "rain" }> = {
    'clear-night': { icon: 'hass:weather-night', color: 'cloud' },
    'cloudy': { icon: 'hass:weather-cloudy', color: 'cloud' },
    'exceptional': { icon: 'mdi:alert-circle-outline', color: 'cloud' },
    'fog': { icon: 'hass:weather-fog', color: 'cloud' },
    'hail': { icon: 'hass:weather-hail', color: 'rain' },
    'lightning': { icon: 'hass:weather-lightning', color: 'sun' },
    'lightning-rainy': { icon: 'hass:weather-lightning-rainy', color: 'sun' },
    'partlycloudy': { icon: 'hass:weather-partly-cloudy', color: 'sun' },
    'pouring': { icon: 'hass:weather-pouring', color: 'rain' },
    'rainy': { icon: 'hass:weather-rainy', color: 'rain' },
    'snowy': { icon: 'hass:weather-snowy', color: 'rain' },
    'snowy-rainy': { icon: 'hass:weather-snowy-rainy', color: 'rain' },
    'sunny': { icon: 'hass:weather-sunny', color: 'sun' },
    'windy': { icon: 'hass:weather-windy', color: 'cloud' },
    'windy-variant': { icon: 'hass:weather-windy-variant', color: 'cloud' }
};

// Chips fill from min(0, lowest) to highest, so the highest value always has the tallest fill.
// Non-finite values (unavailable sensor, missing forecast field) are ignored.
function valueRange(values: number[]): ValueRange {
    const finite = values.filter(Number.isFinite);
    return { min: Math.min(0, ...finite), max: Math.max(...finite) };
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
        /* The only place colours are defined: data accents for light and dark themes */
        :host {
            --wpv-temp-high: #E8772E;
            --wpv-temp-low: #3D7FD9;
            --wpv-temp-high-label: #B85A1A;
            --wpv-temp-low-label: #2F66B3;
            --wpv-temp-area: rgba(61, 127, 217, 0.1);
            --wpv-rain-rgb: 40, 110, 230;
            --wpv-wind-rgb: 20, 160, 140;
            --wpv-pv-rgb: 235, 170, 0;
            --wpv-cond-sun: #F0A020;
            --wpv-cond-cloud: #8A9099;
            --wpv-cond-rain: #3D8FE0;
        }
        :host([dark]) {
            --wpv-temp-high: #FF9A5A;
            --wpv-temp-low: #6FA8F0;
            --wpv-temp-high-label: #FFB98A;
            --wpv-temp-low-label: #9CC3F5;
            --wpv-temp-area: rgba(111, 168, 240, 0.12);
            --wpv-rain-rgb: 70, 140, 255;
            --wpv-wind-rgb: 60, 198, 176;
            --wpv-pv-rgb: 245, 190, 40;
            --wpv-cond-sun: #FFB74D;
            --wpv-cond-cloud: #9AA0A6;
            --wpv-cond-rain: #64B5F6;
        }
        .view {
            box-sizing: border-box;
            height: 260px;
            padding: 8px;
            color: var(--primary-text-color);
        }
        button {
            font: inherit;
            color: inherit;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
        }
        button:focus-visible {
            outline: 2px solid var(--primary-color);
            outline-offset: -2px;
        }
        /* Columns share rows (header, chart, chips) so the chart, drawn over them, lines up with every column.
           Columns are placed explicitly, otherwise auto-placement moves them out of the chart's columns. */
        .columns {
            display: grid;
            grid-template-rows: auto 1fr auto;
        }
        .column {
            grid-row: 1 / -1;
            display: grid;
            grid-template-rows: subgrid;
            padding: 0 4px;
            border-radius: 12px;
            text-align: center;
        }
        .columns temperature-chart {
            grid-row: 2;
            grid-column: 1 / -1;
            pointer-events: none;
        }
        .column-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding-top: 6px;
        }
        .day.today {
            background: color-mix(in srgb, var(--secondary-text-color) 8%, transparent);
        }
        .day:hover {
            background: color-mix(in srgb, var(--secondary-text-color) 14%, transparent);
        }
        .weekday, .hour {
            font-size: 15px;
            font-weight: 600;
        }
        .date {
            font-size: 13px;
            color: var(--secondary-text-color);
        }
        .column-header ha-icon {
            margin-top: 4px;
        }
        .chips {
            grid-row: 3;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px 0;
        }
        .hourly {
            display: flex;
            flex-direction: column;
        }
        .back {
            display: flex;
            align-items: center;
            gap: 8px;
            align-self: flex-start;
            padding: 6px 16px 6px 8px;
            border-radius: 18px;
            font-size: 16px;
            font-weight: 600;
            background: color-mix(in srgb, var(--secondary-text-color) 8%, transparent);
        }
        .back:hover {
            background: color-mix(in srgb, var(--secondary-text-color) 14%, transparent);
        }
        .scroller {
            flex: 1;
            min-height: 0;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
        }
        .scroller .columns {
            height: 100%;
            grid-template-rows: auto 72px auto;
            align-content: start;
        }
        .error {
            padding: 16px;
            color: var(--error-color, red);
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
    private _hours: WeatherForecast[] = [];
    // High (and low) temperatures of the shown days or hours
    private _temperatures: number[][] = [];
    private _columnRanges: ValueRange[] = [];
    // PV per shown day or hour; empty hides the PV row
    private _pv: number[] = [];
    private _pvRange: ValueRange = { min: 0, max: 0 };
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

        this.toggleAttribute("dark", this._hass.themes.darkMode);
        const language = this._hass.locale.language;
        this._weekdayFormat = new Intl.DateTimeFormat(language, { weekday: "short" });
        this._dayFormat = new Intl.DateTimeFormat(language, { day: "numeric" });
        this._selectedDayFormat = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "numeric" });

        if (this._selectedDay) {
            const selectedDay = this._selectedDay;
            this._hours = (this._hourly ?? []).filter(hour => isSameDay(hour.datetime, selectedDay));
            this._temperatures = [this._hours.map(hour => hour.temperature)];
            this._columnRanges = weatherColumns.map(column => valueRange(this._hours.map(column.value)));
            const hourlyPv = toHourlyPv(this._hass, this._config.pv_forecast_entities ?? [], selectedDay);
            // An hour missing from the forecast (night) produces nothing
            this._pv = hourlyPv.length > 0
                ? this._hours.map(hour => hourlyPv.find(pv => pv.time.getHours() === hour.datetime.getHours())?.power ?? 0)
                : [];
        } else {
            const daily = this._daily ?? [];
            this._days = this._config.days_to_show != null ? daily.slice(0, this._config.days_to_show) : daily;
            this._temperatures = [this._days.map(day => day.temperature), this._days.map(day => day.templow)];
            this._columnRanges = weatherColumns.map(column => valueRange(this._days.map(column.value)));
            const pv = toPvForecast(this._hass, this._config.pv_forecast_entities ?? []);
            this._pv = pv.length > 0
                ? this._days.map(day => pv.find(forecast => isSameDay(forecast.time, day.datetime))?.power ?? NaN)
                : [];
        }
        this._pvRange = valueRange(this._pv);
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
            <div class="view columns" style="grid-template-columns: repeat(${this._days.length}, minmax(0, 1fr))">
                ${this._days.map((day, index) => html`
                    <button class="column day ${index === 0 ? "today" : ""}" style="grid-column: ${index + 1}" @click=${() => this._selectedDay = day.datetime}>
                        <div class="column-header">
                            <div class="weekday">${this._weekdayFormat!.format(day.datetime)}</div>
                            <div class="date">${this._dayFormat!.format(day.datetime)}</div>
                            ${this.renderConditionIcon(day.condition)}
                        </div>
                        ${this.renderChips(day, index)}
                    </button>
                `)}
                <temperature-chart .series=${this._temperatures}></temperature-chart>
            </div>
        `
    }

    private renderHours(selectedDay: Date) {
        return html`
            <div class="view hourly">
                <button class="back" @click=${() => this._selectedDay = undefined}>
                    <ha-icon icon="mdi:chevron-left"></ha-icon>
                    ${this._selectedDayFormat!.format(selectedDay)}
                </button>
                ${this._hours.length === 0
                    ? html`<div class=${this._errors.hourly ? "error" : "loading"}>${this._errors.hourly ?? "No hourly data"}</div>`
                    : html`
                        <div class="scroller">
                            <div class="columns" style="grid-template-columns: repeat(${this._hours.length}, 52px)">
                                ${this._hours.map((hour, index) => html`
                                    <div class="column" style="grid-column: ${index + 1}">
                                        <div class="column-header">
                                            <div class="hour">${String(hour.datetime.getHours()).padStart(2, "0")}</div>
                                            ${this.renderConditionIcon(hour.condition)}
                                        </div>
                                        ${this.renderChips(hour, index)}
                                    </div>
                                `)}
                                <temperature-chart .series=${this._temperatures}></temperature-chart>
                            </div>
                        </div>
                    `}
            </div>
        `
    }

    private renderConditionIcon(condition: string) {
        const icon = weatherIconsHassNative[condition];
        return html`<ha-icon icon=${icon?.icon} style="--icon-primary-color: var(--wpv-cond-${icon?.color})"></ha-icon>`;
    }

    // Chip rows of one column: rain, wind and, when PV data is available, PV
    private renderChips(forecast: WeatherForecast, index: number) {
        return html`
            <div class="chips">
                ${weatherColumns.map((column, columnIndex) => this.renderChip(column.value(forecast), this._columnRanges[columnIndex], column))}
                ${this._pv.length > 0 ? this.renderChip(this._pv[index], this._pvRange, pvColumn) : ""}
            </div>
        `;
    }

    private renderChip(value: number, range: ValueRange, style: ColumnStyle) {
        return html`
            <weather-value-chip
                .value=${value}
                .min=${range.min}
                .max=${range.max}
                .color=${style.color}
                .units=${style.units}
                .dashOnZero=${style.dashOnZero}
            ></weather-value-chip>
        `;
    }

    private watchedHassChanged(oldHass: HomeAssistant, hass: HomeAssistant) {
        if (!this._config) {
            return true;
        }
        return oldHass.locale.language !== hass.locale.language
            || oldHass.themes.darkMode !== hass.themes.darkMode
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
