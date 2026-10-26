from unittest.mock import patch
import requests
import mta

from app import app


def test_routing_failure():
    with app.test_client() as client:
        with patch("app.mta.plan_trip", return_value=[]), \
             patch("app.routing.get_route",
                   side_effect=requests.Timeout("Routing timed out")):

            response = client.get(
                "/api/commute/compare?from=127&to=120"
            )

    assert response.status_code == 200

    data = response.get_json()

    # No route: walking falls back to a straight-line estimate.
    assert data["walking"]["available"] is True
    assert data["walking"]["estimate_only"] is True
    assert data["walking"]["distance_miles"] > 0
    assert data["walking"]["total_eta_min"] == round(data["walking"]["distance_miles"] * 20, 1)

    assert data["driving"]["available"] is False

    assert data["taxi"]["available"] is False
    assert data["taxi"]["total_eta_min"] is None
    assert data["taxi"]["fare"] is None




def test_mta_failure_keeps_walking_and_taxi_available():
    def fake_route(start, end, profile):
        if profile == "foot-walking":
            return {
                "distance_m": 4701.0,
                "duration_seconds": 3384.6,
                "source": "openrouteservice",
                "updated_at": 1792920202,
            }

        return {
            "distance_m": 5818.4,
            "duration_seconds": 672.7,
            "source": "openrouteservice",
            "updated_at": 1792920202,
            "coordinates": [
                [-73.987495, 40.75529],
                [-73.972323, 40.793919],
            ],
        }

    with app.test_client() as client:
        with patch(
            "app.mta.plan_trip",
            side_effect=mta.MTAError("MTA feed unavailable"),
        ), patch(
            "app.routing.get_route",
            side_effect=fake_route,
        ):
            response = client.get(
                "/api/commute/compare?from=127&to=120"
            )

    assert response.status_code == 200

    data = response.get_json()

    # Subway is unavailable because the MTA failed.
    assert data["subway"]["available"] is False
    assert data["subway"]["options"] == []
    assert data["subway"]["reason"] == "MTA service temporarily unavailable"

    # Walking still works.
    assert data["walking"]["available"] is True
    assert data["walking"]["total_eta_min"] == 56.4
    assert data["walking"]["distance_miles"] == 2.92

    # Driving and taxi still work.
    assert data["driving"]["available"] is True
    assert data["taxi"]["available"] is True
    assert data["taxi"]["total_eta_min"] == 16.2
    assert data["taxi"]["fare"] is not None

def test_alert_failure_keeps_subway_available():
    fake_options = [
        {
            "minutes": 12,
            "transfers": 0,
            "legs": [
                {
                    "route": "1",
                    "direction": "Northbound",
                    "stop_ids": ["127", "123", "120"],
                }
            ],
        }
    ]

    with app.test_client() as client:
        with patch(
            "app.mta.plan_trip",
            return_value=fake_options,
        ), patch(
            "app.mta.get_trip_feed_freshness",
            return_value={
                "source_updated_at": 1792922400,
                "age_seconds": 15,
                "fresh": True,
                "freshness_threshold_seconds": 180,
                "reason": None,
            },
        ), patch(
            "app.mta.get_status",
            side_effect=mta.MTAError("Alert feed unavailable"),
        ), patch(
            "app.routing.get_route",
            side_effect=requests.Timeout("Routing unavailable"),
        ):
            response = client.get(
                "/api/commute/compare?from=127&to=120"
            )

    assert response.status_code == 200

    data = response.get_json()

    assert data["subway"]["available"] is True
    assert data["subway"]["alerts_available"] is False

    leg = data["subway"]["options"][0]["legs"][0]
    assert leg["alerts"] == []
    assert leg["color"] == "#D82233"

    # Taxi is unavailable on its own; walking falls back to an estimate.
    assert data["walking"]["estimate_only"] is True
    assert data["taxi"]["available"] is False


def test_stale_mta_trip_data_is_not_shown():
    fake_options = [{"minutes": 10, "legs": [], "transfers": 0}]
    with app.test_client() as client:
        with patch("app.mta.plan_trip", return_value=fake_options), patch(
            "app.mta.get_trip_feed_freshness",
            return_value={
                "source_updated_at": 100,
                "age_seconds": 999,
                "fresh": False,
                "freshness_threshold_seconds": 180,
                "reason": "MTA trip data is stale",
            },
        ), patch("app.routing.get_route", side_effect=requests.Timeout()):
            response = client.get("/api/commute/compare?from=127&to=120")

    data = response.get_json()
    assert response.status_code == 200
    assert data["subway"]["available"] is False
    assert data["subway"]["options"] == []
    assert data["subway"]["fresh"] is False
    assert data["subway"]["reason"] == "MTA trip data is stale"
    assert data["subway"]["source_updated_at"] == 100


def test_missing_mta_source_timestamp_is_not_shown():
    fake_options = [{"minutes": 10, "legs": [], "transfers": 0}]
    with app.test_client() as client:
        with patch("app.mta.plan_trip", return_value=fake_options), patch(
            "app.mta.get_trip_feed_freshness",
            return_value={
                "source_updated_at": None,
                "age_seconds": None,
                "fresh": False,
                "freshness_threshold_seconds": 180,
                "reason": "MTA feed timestamp unavailable",
            },
        ), patch("app.routing.get_route", side_effect=requests.Timeout()):
            response = client.get("/api/commute/compare?from=127&to=120")

    data = response.get_json()
    assert response.status_code == 200
    assert data["subway"]["available"] is False
    assert data["subway"]["options"] == []
    assert data["subway"]["source_updated_at"] is None


def test_real_feed_header_freshness_checks():
    from types import SimpleNamespace
    from unittest.mock import patch as mocked_patch

    now = 1792922400
    fresh_feed = SimpleNamespace(header=SimpleNamespace(timestamp=now - 45))
    stale_feed = SimpleNamespace(header=SimpleNamespace(timestamp=now - 220))
    undated_feed = SimpleNamespace(header=SimpleNamespace(timestamp=0))

    with mocked_patch("mta.time.time", return_value=now):
        assert mta._train_feed_freshness([fresh_feed])["fresh"] is True
        assert mta._train_feed_freshness([fresh_feed, stale_feed])["fresh"] is False
        assert mta._train_feed_freshness([undated_feed])["fresh"] is False
