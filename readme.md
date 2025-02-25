# Hass Weather PV Card

## Introduction
A custom Home Assistant card for displaying weather and photovoltaic data.

## Installation

### HACS Installation
1. Open HACS in your Home Assistant instance
2. Click the three dots in the top right corner
3. Select "Custom repositories"
4. Add this repository URL with category "Frontend"
5. Click Install under "Hass Weather PV Card"
6. Restart Home Assistant

### Manual Installation
1. Copy the files to your Home Assistant custom components directory.
2. Add the card resource to your Lovelace configuration:
   ```yaml
   resources:
     - url: /local/hass-weather-pv-card/hass-weather-pv-card.js
       type: module
   ```

## Configuration
Example configuration:
```yaml
type: 'custom:hass-weather-pv-card'
entity: weather.your_weather_entity
pv_forecast_entity: sensor.your_pv_sensor
```

## Usage
Use this card in your Lovelace dashboard to display current weather and PV production data. Customize styling via configuration options.

## Customization
For additional customization options, refer to the options section within the code or the configuration documentation.

