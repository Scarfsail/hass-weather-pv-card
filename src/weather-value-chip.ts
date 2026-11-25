import { html, css, LitElement, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("weather-value-chip")
export class WeatherValueChip extends LitElement {
    static styles = css`
        .chip {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 24px;
            border-radius: 7px;
            white-space: nowrap;
            overflow: hidden;
            min-width: 0;
        }
        .value {
            font-size: 13px;
            font-weight: 600;
        }
        .units {
            font-size: 10px;
            margin-left: 2px;
            color: var(--secondary-text-color);
        }
        .dash {
            color: var(--secondary-text-color);
            opacity: 0.6;
        }
    `;

    private _empty = false;
    private _chipStyle = "";

    @property({ type: Number }) value = 0;
    @property({ type: Number }) min = 0;
    @property({ type: Number }) max = 0;
    // Name of a CSS variable holding an "r, g, b" triplet
    @property({ type: String }) color = "";
    @property({ type: String }) units = "";
    @property({ type: Boolean }) dashOnZero = false;

    willUpdate(changedProperties: PropertyValues<this>) {
        super.willUpdate(changedProperties);
        this._empty = !Number.isFinite(this.value) || (this.dashOnZero && this.value === 0);

        // The fill rises from min to max and gets stronger with it; a flat series (max === min) has no fill
        const range = this.max - this.min;
        const fraction = range > 0 && !this._empty ? (this.value - this.min) / range : 0;
        const percentage = Math.round(100 * fraction);
        const alpha = (0.14 + 0.5 * fraction).toFixed(2);
        this._chipStyle = `background: linear-gradient(to top, rgba(var(${this.color}), ${alpha}) ${percentage}%, rgba(var(${this.color}), 0.08) ${percentage}%)`;
    }

    render() {
        if (this._empty) {
            return html`<div class="chip dash">–</div>`;
        }
        return html`
            <div class="chip" style=${this._chipStyle}>
                <span class="value">${this.value}</span>
                <span class="units">${this.units}</span>
            </div>
        `;
    }
}
