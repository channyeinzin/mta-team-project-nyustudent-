"""FR-06: weather context via Open-Meteo (no weather-adjusted travel ETAs)."""

import math
import time

import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MAX_WEATHER_AGE_SECONDS = 90 * 60
MAX_FUTURE_SKEW_SECONDS = 5 * 60
REQUEST_TIMEOUT_SECONDS = 8
SOURCE = "Open-Meteo"


class WeatherError(Exception):
    """Weather data is unavailable or cannot safely be treated as current."""


def valid_coordinates(lat, lon):
    return (math.isfinite(lat) and math.isfinite(lon)
            and -90 <= lat <= 90 and -180 <= lon <= 180)


def describe_weather(code):
    descriptions = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle",
        53: "Moderate drizzle", 55: "Dense drizzle", 56: "Freezing drizzle",
        57: "Dense freezing drizzle", 61: "Slight rain", 63: "Moderate rain",
        65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
        71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
        77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers",
        82: "Violent rain showers", 85: "Slight snow showers",
        86: "Heavy snow showers", 95: "Thunderstorm",
        96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
    }
    return descriptions.get(code, "Condition unavailable")


def make_cautions(code, rain_mm, snowfall_cm, wind_kmh):
    """Qualitative cautions only; never calculate numeric travel delays."""
    cautions = []
    if code in (95, 96, 99):
        cautions.append("Thunderstorms reported. Avoid exposed areas and follow official safety guidance.")
    if code in (66, 67) or 56 <= code <= 57:
        cautions.append("Freezing precipitation reported. Walking surfaces may be slippery.")
    if code in (71, 73, 75, 77, 85, 86) or snowfall_cm > 0:
        cautions.append("Snow reported. Walking surfaces may be slippery; check local conditions.")
    if code in (51, 53, 55, 61, 63, 65, 80, 81, 82) or rain_mm > 0:
        cautions.append("Rain reported. Walking may be uncomfortable; check conditions before leaving.")
    if code in (45, 48):
        cautions.append("Fog reported. Visibility may be reduced.")
    if wind_kmh >= 50:
        cautions.append("Strong winds reported. Take care in exposed areas.")
    return cautions


def _number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise WeatherError("Weather provider returned incomplete conditions")
    return value


def get_current_weather(lat, lon):
    """Fetch current weather for a coordinate, with explicit provider freshness."""
    if not valid_coordinates(lat, lon):
        raise ValueError("Invalid coordinates")

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,rain,snowfall,weather_code,wind_speed_10m",
        "timeformat": "unixtime",
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    try:
        response = requests.get(FORECAST_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as error:
        raise WeatherError("Weather provider temporarily unavailable") from error

    if not isinstance(payload, dict) or not isinstance(payload.get("current"), dict):
        raise WeatherError("Weather provider returned incomplete conditions")

    current = payload["current"]
    now = int(time.time())
    timestamp = current.get("time")
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
        raise WeatherError("Weather source timestamp unavailable")
    timestamp = int(timestamp)
    age = now - timestamp
    if age < -MAX_FUTURE_SKEW_SECONDS:
        raise WeatherError("Weather source timestamp is in the future")
    if age > MAX_WEATHER_AGE_SECONDS:
        raise WeatherError("Weather observations are stale")

    temperature = _number(current.get("temperature_2m"), "temperature_2m")
    rain = _number(current.get("rain"), "rain")
    precipitation = _number(current.get("precipitation"), "precipitation")
    snowfall = _number(current.get("snowfall"), "snowfall")
    wind = _number(current.get("wind_speed_10m"), "wind_speed_10m")
    code = current.get("weather_code")
    if isinstance(code, bool) or not isinstance(code, int):
        raise WeatherError("Weather provider returned incomplete conditions")
    if rain < 0 or precipitation < 0 or snowfall < 0 or wind < 0:
        raise WeatherError("Weather provider returned invalid measurements")

    return {
        "available": True,
        "source": SOURCE,
        "source_updated_at": timestamp,
        "source_age_seconds": max(0, age),
        "freshness_threshold_seconds": MAX_WEATHER_AGE_SECONDS,
        "retrieved_at": now,
        "latitude": lat,
        "longitude": lon,
        "weather": {
            "temperature_c": temperature,
            "precipitation_mm": precipitation,
            "rain_mm": rain,
            "snowfall_cm": snowfall,
            "wind_speed_kmh": wind,
            "weather_code": code,
            "condition": describe_weather(code),
        },
        "cautions": make_cautions(code, rain, snowfall, wind),
        "eta_adjustment_min": None,
        "reason": None,
    }
