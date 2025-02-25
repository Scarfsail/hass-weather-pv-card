import { LitElement, css, html } from "lit-element"
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant } from "../hass-frontend/src/types";
import type { LovelaceCard } from "../hass-frontend/src/panels/lovelace/types";
import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";
import dayjs from "dayjs";
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration);

interface WeatherPvCardConfig extends LovelaceCardConfig {
    entity: string;
    pv_entity: string

}

@customElement("weather-pv-card")
export class WeatherPvCard extends LitElement implements LovelaceCard {

    private config?: WeatherPvCardConfig;
    @state() private _hass?: HomeAssistant;

    public set hass(value: HomeAssistant) {
        this._hass = value;
    }

    getCardSize() {
        return this.config?.card_size ?? 1;
    }

    @state() private expanded = false;

    public static async getStubConfig(hass: HomeAssistant): Promise<Partial<WeatherPvCardConfig>> {
        return {
            type: `custom:weather-pv-card`,
            entity: "weather.home",
            pv_forecast_entity: "sensor.pv_power_forecas"
        };
    }
    async setConfig(config: WeatherPvCardConfig) {
        this.config = config;
    }

    static styles = css`

    `
    render() {

        if (!this.config) {
            return "Config is not defined";
        }
        const entity = this._hass?.states[this.config.entity];
        if (!entity) {
            return `Entity ${this.config.entity} not found`;
        }

        return html`
            <ha-card>
                Weather will be here
            </ha-card>
        `
    }

    private callService(service: string, data: any, entity_id: string) {
        if (!this._hass) {
            return;
        }

        data = { ...data, ...{ entity_id: entity_id } };
        console.log("Calling service", service, data);
        this._hass.callService("door_window_watcher", service, data);
    }

}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
    type: 'weather-pv-card',
    name: 'Weather Photo Voltaic Card',
    description: 'A weather card for Home Assistant that displays the weather and photo voltaic panels forecast.',
    preview: true,
});