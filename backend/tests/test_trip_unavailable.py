from unittest.mock import patch

from app import app


def test_no_available_subway_trip():
    client = app.test_client()

    with patch("app.mta.plan_trip", return_value=[]):
        response = client.get("/api/trip?from=127&to=120")

    assert response.status_code == 200
    assert response.get_json()["options"] == []