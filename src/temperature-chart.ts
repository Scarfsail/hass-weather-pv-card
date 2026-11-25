import { html, css, svg, nothing, LitElement, PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import { fromCelsius, labelColour, maxCelsius, minCelsius, temperatureStops, toCelsius } from "./temperature-colors";

// The vertical scale spans at least this many degrees, so a flat day looks flat
const minSpan = 8;

interface Label {
    series: number;
    left: number;
    top: number;
    text: string;
    colour: string;
}

// Runs of consecutive indices where `isValid` holds; a missing point breaks the line
function runs(length: number, isValid: (index: number) => boolean): number[][] {
    const result: number[][] = [];
    let current: number[] = [];
    for (let index = 0; index < length; index++) {
        if (isValid(index)) {
            current.push(index);
        } else if (current.length > 0) {
            result.push(current);
            current = [];
        }
    }
    if (current.length > 0) {
        result.push(current);
    }
    return result;
}

// Draws one line per series (high, optionally low) with a value label on each point.
// Point i sits at the centre of column i of `series.length` equal columns spanning the chart width.
@customElement("temperature-chart")
export class TemperatureChart extends LitElement {
    static styles = css`
        :host {
            display: block;
            box-sizing: border-box;
            padding: 18px 0;
        }
        .plot {
            position: relative;
            height: 100%;
        }
        svg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
        }
        polyline {
            fill: none;
            stroke-width: 2.5;
            stroke-linejoin: round;
            stroke-linecap: round;
            vector-effect: non-scaling-stroke;
            stroke: url(#temp-gradient) currentColor;
        }
        polyline.series-1 {
            stroke-opacity: 0.45;
        }
        :host([dark]) polyline.series-1 {
            stroke-opacity: 0.6;
        }
        polygon {
            fill: var(--wpv-temp-area);
        }
        .label {
            position: absolute;
            font-size: 13px;
            line-height: 1;
            white-space: nowrap;
        }
        .label.series-0 {
            transform: translate(-50%, calc(-100% - 4px));
            font-weight: 600;
        }
        .label.series-1 {
            transform: translate(-50%, 4px);
            opacity: 0.75;
        }
    `;

    private _columns = 0;
    private _lines: string[][] = [];
    private _areas: string[] = [];
    private _labels: Label[] = [];
    private _gradientY1 = 0;
    private _gradientY2 = 0;
    private _gradientStops: { offset: number; colour: string }[] = [];

    // One (high) or two (high, low) series of equal length
    @property({ attribute: false }) series: number[][] = [];
    @property({ type: Boolean, reflect: true }) dark = false;
    // Unit of the series values; colours are looked up in °C
    @property() unit = "°C";

    willUpdate(changedProperties: PropertyValues<this>) {
        super.willUpdate(changedProperties);
        const finite = this.series.flat().filter(Number.isFinite);
        const lowest = Math.min(...finite);
        const highest = Math.max(...finite);
        const span = Math.max(highest - lowest, minSpan);
        const top = (lowest + highest + span) / 2;

        // The vertical colour gradient runs from 40 °C to −20 °C, placed on the chart's own y axis
        const toY = (celsius: number) => 100 * (top - fromCelsius(celsius, this.unit)) / span;
        this._gradientY1 = toY(maxCelsius);
        this._gradientY2 = toY(minCelsius);
        // No gradient without any finite value: its y would be NaN
        // SVG needs ascending offsets; the stops run from cold to warm, so the mapped copy is reversed
        this._gradientStops = !finite.length ? [] : temperatureStops(this.dark)
            .map(([celsius, colour]) => ({ offset: (maxCelsius - celsius) / (maxCelsius - minCelsius), colour }))
            .reverse();

        // x in column units, y in percent of the plot height; NaN for a missing value
        this._columns = Math.max(0, ...this.series.map(values => values.length));
        const ys = this.series.map(values => values.map(value => 100 * (top - value) / span));
        const point = (y: number[], index: number) => `${index + 0.5},${y[index]}`;

        this._lines = ys.map(y => runs(y.length, index => Number.isFinite(y[index]))
            .map(run => run.map(index => point(y, index)).join(" ")));

        const [high, low] = ys;
        this._areas = low
            ? runs(high.length, index => Number.isFinite(high[index]) && Number.isFinite(low[index]))
                .map(run => [...run.map(index => point(high, index)), ...[...run].reverse().map(index => point(low, index))].join(" "))
            : [];

        this._labels = ys.flatMap((y, series) => y.flatMap((yValue, index) => Number.isFinite(yValue)
            ? [{
                series,
                left: 100 * (index + 0.5) / this._columns,
                top: yValue,
                text: `${this.series[series][index]}°`,
                colour: labelColour(toCelsius(this.series[series][index], this.unit), this.dark),
            }]
            : []));
    }

    render() {
        return html`
            <div class="plot">
                <svg viewBox="0 0 ${this._columns} 100" preserveAspectRatio="none">
                    ${this._gradientStops.length ? svg`<defs>
                        <linearGradient id="temp-gradient" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1=${this._gradientY1} y2=${this._gradientY2}>
                            ${this._gradientStops.map(stop => svg`<stop offset=${stop.offset} stop-color=${stop.colour}></stop>`)}
                        </linearGradient>
                    </defs>` : nothing}
                    ${this._areas.map(points => svg`<polygon points=${points}></polygon>`)}
                    ${this._lines.map((lines, series) => lines.map(points => svg`<polyline class="series-${series}" points=${points}></polyline>`))}
                </svg>
                ${this._labels.map(label => html`
                    <span class="label series-${label.series}" style="left: ${label.left}%; top: ${label.top}%; color: ${label.colour}">${label.text}</span>
                `)}
            </div>
        `;
    }
}
