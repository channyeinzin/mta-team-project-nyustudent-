"""FR-06 API tests: mocked Open-Meteo responses; no network calls."""

from unittest.mock import patch
import requests

from app import app
import weather


def mock_payload(now, **changes):
    current = {
        "time": now - 60,
        "temperature_2m": 17.2,
        "precipitation": 0.0,
        "rain": 0.0,
        "snowfall": 0.0,
        "wind_speed_10m": 12.0,
        "weather_code": 1,
    }
    current.update(changes)
    return {"current": current}


def provider_response(data):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return data
    return Response()


def get_weather(data, now=1800000000):
    with patch("weather.time.time", return_value=now), patch(
        "weather.requests.get", return_value=provider_response(data)
    ):
        with app.test_client() as client:
            return client.get("/api/weather?lat=40.75529&lon=-73.987495")


def test_clear_weather_has_no_unsupported_delay():
    result = get_weather(mock_payload(1800000000))
    assert result.status_code == 200
    body = result.get_json()
    assert body["available"] is True
    assert body["source"] == "Open-Meteo"
    assert body["source_age_seconds"] == 60
    assert body["weather"]["condition"] == "Mainly clear"
    assert body["cautions"] == []
    assert body["eta_adjustment_min"] is None


def test_rain_generates_caution():
    body = get_weather(mock_payload(1800000000, weather_code=63, rain=1.5, precipitation=1.5)).get_json()
    assert any("Rain" in caution for caution in body["cautions"])


def test_snow_generates_caution():
    body = get_weather(mock_payload(1800000000, weather_code=73, snowfall=1.0)).get_json()
    assert any("Snow" in caution for caution in body["cautions"])


def test_missing_weather_is_unavailable():
    body = get_weather(mock_payload(1800000000, temperature_2m=None))
    assert body.status_code == 503
    assert body.get_json()["available"] is False


def test_missing_source_timestamp_is_unavailable():
    result = get_weather(mock_payload(1800000000, time=None))
    assert result.status_code == 503
    assert result.get_json()["available"] is False


def test_stale_weather_is_unavailable():
    result = get_weather(mock_payload(1800000000, time=1800000000 - 6000))
    assert result.status_code == 503
    assert "stale" in result.get_json()["reason"]


def test_invalid_coordinates_are_rejected():
    with app.test_client() as client:
        assert client.get("/api/weather?lat=999&lon=0").status_code == 400
        assert client.get("/api/weather?lat=abc&lon=0").status_code == 400
        assert client.get("/api/weather?lat=40").status_code == 400
        assert client.get("/api/weather?lat=nan&lon=0").status_code == 400


def test_provider_failure_does_not_crash():
    with patch("weather.requests.get", side_effect=requests.Timeout("timeout")):
        with app.test_client() as client:
            response = client.get("/api/weather?lat=40.75529&lon=-73.987495")
    assert response.status_code == 503
    assert response.get_json()["available"] is False


def test_future_provider_timestamp_is_unavailable():
    result = get_weather(mock_payload(1800000000, time=1800000400))
    assert result.status_code == 503
    assert "future" in result.get_json()["reason"]
