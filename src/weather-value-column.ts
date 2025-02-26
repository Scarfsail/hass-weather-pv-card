import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./ratio-column"
@customElement("weather-value-column")
export class WeatherValueColumn extends LitElement {
    @property({ type: Number }) value = 0;

    @property({ type: Array }) allValues: number[] = [];

    @property({ type: String }) color = "";
    @property({ type: String }) units = "";
    @property({ type: Number }) fontSizeRatio = 100;
    static styles = css`
        .weather-value-column {
            padding: 0.3em 0;
            white-space: nowrap;
            font-size: var(--font-size-ratio, 100%);
        }
        .value {
            font-size: 1.2em;
            
        }
        .units {
            font-size: 0.7em;
            margin-left: 0.2em;
        }
    `;

    updated() {
        this.style.setProperty('--font-size-ratio', `${this.fontSizeRatio}%`);
    }

    render() {

        return html`
            <div class="weather-value-column">
                <ratio-column
                    .allValues=${this.allValues}
                    .value=${this.value}
                    .color=${this.color}                
                >
                    <span class="value">${this.value}</span>
                    <span class="units">${this.units}</span>
                </ratio-column>
            </div>
        `;
    }
}
