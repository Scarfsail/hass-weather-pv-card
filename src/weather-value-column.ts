import { html, css, LitElement, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("weather-value-column")
export class WeatherValueColumn extends LitElement {
    static styles = css`
        .weather-value-column {
            padding: 0.3em 0;
            white-space: nowrap;
            font-size: var(--font-size-ratio, 100%);
        }
        .bar {
            width: 100%;
            height: 100%;
        }
        .value {
            font-size: 1.2em;
        }
        .units {
            font-size: 0.7em;
            margin-left: 0.2em;
        }
    `;

    private _barStyle = "";

    @property({ type: Number }) value = 0;
    @property({ type: Number }) min = 0;
    @property({ type: Number }) max = 0;
    @property({ type: String }) color = "";
    @property({ type: String }) units = "";
    @property({ type: Number }) fontSizeRatio = 100;

    willUpdate(changedProperties: PropertyValues<this>) {
        super.willUpdate(changedProperties);
        if (changedProperties.has("fontSizeRatio")) {
            this.style.setProperty('--font-size-ratio', `${this.fontSizeRatio}%`);
        }

        // The bar fills from min to max; a flat series (max === min) or a non-finite value has no bar
        const range = this.max - this.min;
        const percentage = range > 0 && Number.isFinite(this.value) ? Math.round(100 * (this.value - this.min) / range) : 0;
        this._barStyle = percentage > 0
            ? `background: linear-gradient(to top, ${this.color}80, ${this.color} ${percentage}%, transparent ${percentage}%, transparent 100%)`
            : '';
    }

    render() {
        return html`
            <div class="weather-value-column">
                <div class="bar" style=${this._barStyle}>
                    <span class="value">${this.value}</span>
                    <span class="units">${this.units}</span>
                </div>
            </div>
        `;
    }
}
