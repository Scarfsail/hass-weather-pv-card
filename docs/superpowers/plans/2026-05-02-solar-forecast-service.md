# Solar Forecast Service Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `pv_forecast_entities: string[]` (a manually-listed array of per-day sensor IDs) with `solar_forecast_entry: string` — a single HA energy solar forecast config entry ID, identical to what the user picks in the Energy dashboard.

**Architecture:** The card switches from reading N entity states via `hass.states[id]` to calling `hass.callWS({ type: 'energy/solar_forecast' })` once, which returns all providers' hourly Wh data keyed by config entry ID. The card picks the entry matching `solar_forecast_entry`, aggregates hourly `wh_hours` values per calendar day, and converts Wh → kWh to produce the same `PvForecast[]` shape as before — so everything downstream (rendering, `days_to_show`, etc.) is unchanged.

**Tech Stack:** TypeScript, LitElement, Vite. No test framework — verification is TypeScript compilation (`npm run build-dev`) plus manual load in Home Assistant.

---

## File Map

| File | Change |
|---|---|
| `src/models.ts` | Add `SolarForecastWsResponse` type |
| `src/data-collector.ts` | Replace entity-state PV collection with websocket call + daily aggregation |
| `src/weather-pv-card.ts` | Update config interface, remove entity-change detection, update render guard, update `getStubConfig` |

---

### Task 1: Add websocket response type to models

**Files:**
- Modify: `src/models.ts`

- [ ] **Step 1: Add `SolarForecastWsResponse` type**

  The HA `energy/solar_forecast` websocket returns an object keyed by config entry ID. Each value has a `wh_hours` dict mapping ISO timestamps to Wh values.

  In `src/models.ts`, append after the existing `Forecasts` interface:

  ```typescript
  export interface SolarForecastWsResponse {
      [configEntryId: string]: {
          wh_hours: { [isoTimestamp: string]: number };
      };
  }
  ```

- [ ] **Step 2: Verify compilation**

  ```bash
  npm run build-dev
  ```

  Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/models.ts
  git commit -m "feat: add SolarForecastWsResponse type for energy websocket"
  ```

---

### Task 2: Replace entity-state PV collection with websocket call

**Files:**
- Modify: `src/data-collector.ts`

The current function signature is:
```typescript
collectForecastData(entity_weather: string, pv_forecast_entities: string[], hass: HomeAssistant): Promise<Forecasts>
```

It must become:
```typescript
collectForecastData(entity_weather: string, solar_forecast_entry: string | undefined, hass: HomeAssistant): Promise<Forecasts>
```

The PV section (lines 38–55) reads entity states and maps by array index. Replace it with a `hass.callWS` call that fetches all solar forecast data, picks the entry matching `solar_forecast_entry`, then aggregates `wh_hours` entries by calendar date (YYYY-MM-DD), summing Wh values and dividing by 1000 to produce kWh.

- [ ] **Step 1: Update the function signature and PV collection logic**

  Replace the entire contents of `src/data-collector.ts` with:

  ```typescript
  import dayjs from "dayjs";
  import type { HomeAssistant } from "../hass-frontend/src/types";
  import { Forecasts, PvForecast, SolarForecastWsResponse, WeatherForecastRaw } from "./models";

  export async function collectForecastData(
      entity_weather: string,
      solar_forecast_entry: string | undefined,
      hass: HomeAssistant
  ): Promise<Forecasts> {
      try {
          const dailyForecastRaw = await hass.callService('weather', 'get_forecasts',
              { type: 'daily' }, { entity_id: entity_weather }, false, true);

          const dailyForecast = (dailyForecastRaw.response[entity_weather].forecast as WeatherForecastRaw[]).map(forecast => ({
              datetime: dayjs(forecast.datetime),
              condition: forecast.condition,
              wind_bearing: forecast.wind_bearing,
              uv_index: forecast.uv_index,
              temperature: Math.round(forecast.temperature),
              templow: Math.round(forecast.templow),
              wind_speed: Math.round(forecast.wind_speed),
              precipitation: forecast.precipitation,
              humidity: Math.round(forecast.humidity)
          }));

          const hourlyForecastRaw = await hass.callService('weather', 'get_forecasts',
              { type: 'hourly' }, { entity_id: entity_weather }, false, true);

          const hourlyForecast = (hourlyForecastRaw.response[entity_weather].forecast as WeatherForecastRaw[]).map(forecast => ({
              datetime: dayjs(forecast.datetime),
              condition: forecast.condition,
              wind_bearing: forecast.wind_bearing,
              uv_index: forecast.uv_index,
              temperature: Math.round(forecast.temperature),
              templow: Math.round(forecast.templow),
              wind_speed: Math.round(forecast.wind_speed),
              precipitation: forecast.precipitation,
              humidity: Math.round(forecast.humidity)
          }));

          let pvForecast: PvForecast[] = [];

          if (solar_forecast_entry) {
              const wsResponse = await hass.callWS<SolarForecastWsResponse>({
                  type: 'energy/solar_forecast',
              });

              const entryData = wsResponse[solar_forecast_entry];
              if (entryData?.wh_hours) {
                  const dailyWh: { [date: string]: number } = {};
                  for (const [isoTimestamp, wh] of Object.entries(entryData.wh_hours)) {
                      const date = dayjs(isoTimestamp).format('YYYY-MM-DD');
                      dailyWh[date] = (dailyWh[date] ?? 0) + wh;
                  }
                  pvForecast = Object.entries(dailyWh)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([date, wh]) => ({
                          time: dayjs(date),
                          power: Math.round(wh / 1000)
                      }));
              }
          }

          return { weatherDaily: dailyForecast, weatherHourly: hourlyForecast, pv: pvForecast };
      } catch (e) {
          console.error("Error fetching forecast:", e);
          throw e;
      }
  }
  ```

- [ ] **Step 2: Verify compilation**

  ```bash
  npm run build-dev
  ```

  Expected: build succeeds. There will be a TypeScript error about `collectForecastData` call in `weather-pv-card.ts` because the signature changed — that is expected and fixed in Task 3.

- [ ] **Step 3: Commit**

  ```bash
  git add src/data-collector.ts
  git commit -m "feat: replace entity-state PV collection with energy/solar_forecast websocket call"
  ```

---

### Task 3: Update card config, hass setter, render guard, and stub config

**Files:**
- Modify: `src/weather-pv-card.ts`

Four things to change:
1. `WeatherPvCardConfig`: replace `pv_forecast_entities: string[]` with `solar_forecast_entry?: string`
2. `hass` setter: remove the `pv_forecast_entities`-based entity-change detection (PV data now comes from websocket on a timer, not entity state changes)
3. `render()`: remove the missing-entity guard that checks `pv_forecast_entities`
4. `getStubConfig()`: replace stub `pv_forecast_entities` with `solar_forecast_entry`
5. `updateData()`: update call to `collectForecastData` to pass `solar_forecast_entry`

- [ ] **Step 1: Update `WeatherPvCardConfig` interface (line 15–20)**

  ```typescript
  interface WeatherPvCardConfig extends LovelaceCardConfig {
      entity: string;
      solar_forecast_entry?: string;
      update_interval?: number;  // in minutes
      days_to_show?: number;
  }
  ```

- [ ] **Step 2: Update the `hass` setter — remove entity-change detection (lines 78–86)**

  Replace the block:
  ```typescript
  // Update data if entities changed or became available
  if (oldHass && this.config) {
      const entitiesChanged = this.config.pv_forecast_entities?.some(entityId => 
          oldHass.states[entityId]?.state !== value.states[entityId]?.state
      ) || oldHass.states[this.config.entity]?.state !== value.states[this.config.entity]?.state;
      
      if (entitiesChanged) {
          this.updateData();
      }
  }
  ```

  With (only weather entity change triggers a refresh — PV comes from the periodic timer):
  ```typescript
  if (oldHass && this.config) {
      if (oldHass.states[this.config.entity]?.state !== value.states[this.config.entity]?.state) {
          this.updateData();
      }
  }
  ```

- [ ] **Step 3: Update `getStubConfig` (lines 93–105)**

  ```typescript
  public static async getStubConfig(hass: HomeAssistant): Promise<Partial<WeatherPvCardConfig>> {
      return {
          type: `custom:weather-pv-card`,
          entity: "weather.home",
          solar_forecast_entry: ""
      };
  }
  ```

- [ ] **Step 4: Remove the missing-entity render guard (lines 228–239)**

  Delete the entire block:
  ```typescript
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
  ```

- [ ] **Step 5: Update `updateData()` call to `collectForecastData` (line 149)**

  Replace:
  ```typescript
  this._forecasts = await collectForecastData(this.config.entity, this.config.pv_forecast_entities, this._hass);
  ```

  With:
  ```typescript
  this._forecasts = await collectForecastData(this.config.entity, this.config.solar_forecast_entry, this._hass);
  ```

- [ ] **Step 6: Verify compilation**

  ```bash
  npm run build-dev
  ```

  Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Remove unused `PvForecastRaw` import from `weather-pv-card.ts` if flagged**

  The import line (line 9) currently includes `PvForecastRaw`. If TypeScript warns about unused imports, update it:
  ```typescript
  import { Forecasts, PvForecast, WeatherForecast, WeatherForecastRaw } from "./models";
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/weather-pv-card.ts
  git commit -m "feat: migrate card config from pv_forecast_entities to solar_forecast_entry"
  ```

---

### Task 4: Clean up unused models and do a production build

**Files:**
- Modify: `src/models.ts` — remove unused `PvForecastRaw` if nothing else references it
- Verify: production build passes

- [ ] **Step 1: Check if `PvForecastRaw` is still referenced**

  ```bash
  grep -r "PvForecastRaw" src/
  ```

  Expected output: nothing (it was only used in the old `data-collector.ts`).

- [ ] **Step 2: Remove `PvForecastRaw` from `src/models.ts`**

  Delete lines:
  ```typescript
  export interface PvForecastRaw {
      time: string;
      power: number;
  }
  ```

- [ ] **Step 3: Production build**

  ```bash
  npm run build-prod
  ```

  Expected: build succeeds, `dist/weather-pv-card-prod.js` is generated.

- [ ] **Step 4: Commit**

  ```bash
  git add src/models.ts
  git commit -m "chore: remove unused PvForecastRaw model"
  ```

---

### Task 5: Manual verification in Home Assistant

This card has no automated test suite. Verification is done by loading the card in HA.

- [ ] **Step 1: Deploy to HA**

  Copy `dist/weather-pv-card-prod.js` to the HA `www/` folder (or wherever the card is served from), then clear the browser cache and reload HA.

- [ ] **Step 2: Add card with valid config**

  Add the card with a known-good config entry ID (find yours via **Developer Tools → Template** or inspect the energy dashboard network tab for the `energy/solar_forecast` websocket response):

  ```yaml
  type: custom:weather-pv-card
  entity: weather.forecast_home
  solar_forecast_entry: 01KJB1TYTMRN3T5Y0PE2XYDD6V
  ```

  Expected: card renders with daily PV kWh values matching what the energy dashboard shows.

- [ ] **Step 3: Verify with no entry configured**

  ```yaml
  type: custom:weather-pv-card
  entity: weather.forecast_home
  ```

  Expected: card renders normally, PV column absent (no errors, no crash).

- [ ] **Step 4: Verify days_to_show still works**

  ```yaml
  type: custom:weather-pv-card
  entity: weather.forecast_home
  solar_forecast_entry: 01KJB1TYTMRN3T5Y0PE2XYDD6V
  days_to_show: 3
  ```

  Expected: only 3 days shown, each with a PV kWh value.

---

## Self-Review

**Spec coverage:**
- ✅ Replace array config with single entry ID → Task 3
- ✅ Fetch from `energy/solar_forecast` websocket → Task 2
- ✅ Aggregate `wh_hours` by date → Task 2
- ✅ `solar_forecast_entry` is optional (PV column absent if not set) → Task 2 + Task 3
- ✅ Remove entity-change detection for PV entities → Task 3
- ✅ Remove missing-entity render guard → Task 3
- ✅ Type for websocket response → Task 1
- ✅ Production build → Task 4
- ✅ Manual HA verification → Task 5

**Breaking change note:** Existing card configs using `pv_forecast_entities` will silently lose PV data (the field is simply ignored). Users must update their card YAML to use `solar_forecast_entry`. This is intentional — the two config shapes are incompatible. Document this in the commit message or release notes if needed.
