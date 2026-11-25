// The temperature colour scale: a weather-map spectrum from −20 °C (violet) to 40 °C (red).
// The 0 and 1 °C stops form the freezing split: 0 °C is still a freezing blue, 1 °C already a non-freezing green.
type Stop = [celsius: number, colour: string];

const lightStops: Stop[] = [
    [-20, "#5a3fc0"], [-10, "#3b5fd6"], [0, "#2f8fe6"], [1, "#22a37a"],
    [10, "#6aae3a"], [20, "#e0a526"], [30, "#e8772e"], [40, "#d32f2f"],
];

const darkStops: Stop[] = [
    [-20, "#a08cff"], [-10, "#7d97ff"], [0, "#5cb2ff"], [1, "#3fd09a"],
    [10, "#8fd15a"], [20, "#ffc04d"], [30, "#ff9a5a"], [40, "#ff6b6b"],
];

export const minCelsius = -20;
export const maxCelsius = 40;

export function temperatureStops(dark: boolean): Stop[] {
    return dark ? darkStops : lightStops;
}

function rgb(hex: string): number[] {
    return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}

// The scale colour of a temperature, mixed 25% toward black (light theme) or white (dark theme) for text
export function labelColour(celsius: number, dark: boolean): string {
    const stops = temperatureStops(dark);
    const value = Math.min(Math.max(celsius, minCelsius), maxCelsius);
    const upper = stops.findIndex(([stop]) => stop >= value);
    const [lowerCelsius, lowerColour] = stops[Math.max(upper - 1, 0)];
    const [upperCelsius, upperColour] = stops[upper];
    const ratio = upperCelsius === lowerCelsius ? 1 : (value - lowerCelsius) / (upperCelsius - lowerCelsius);
    const from = rgb(lowerColour);
    const to = rgb(upperColour);
    const target = dark ? 255 : 0;
    const channels = from.map((channel, index) => {
        const scale = channel + (to[index] - channel) * ratio;
        return Math.round(scale + (target - scale) * 0.25);
    });
    return `rgb(${channels.join(", ")})`;
}

export function fromCelsius(celsius: number, unit: string): number {
    return unit === "°F" ? celsius * 9 / 5 + 32 : celsius;
}

export function toCelsius(value: number, unit: string): number {
    return unit === "°F" ? (value - 32) * 5 / 9 : value;
}
