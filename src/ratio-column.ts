import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ratio-column")
export class RatioColumn extends LitElement {
    @property({ type: Number })
    value = 0;

    @property({ type: Array })
    allValues: number[] = [];

    @property({ type: String })
    color = "";

    static styles = css`
        .ratio-column {
            width: 100%;
            height: 100%;
        }
    `;

    render() {
        const max = this.allValues.length > 0 
            ? this.allValues.reduce((prev, current) => Math.max(prev, current)) 
            : 0;
        const val = this.value ?? 0;
        const percentage = Math.round(100 / max * val);

        const style = percentage > 0 
            ? `background: linear-gradient(to top, ${this.color}80, ${this.color} ${percentage}%, transparent ${percentage}%, transparent 100%)`
            : '';

        return html`
            <div class="ratio-column" style=${style}>
                <slot></slot>
            </div>
        `;
    }
}
