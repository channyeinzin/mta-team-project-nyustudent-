import os

import requests

ORS_URL = "https://api.openrouteservice.org/v2/directions"


def get_route(start, end, profile):
    """Retrieve route distance and duration from openrouteservice."""
    api_key = os.environ.get("ORS_API_KEY")

    if not api_key:
        raise ValueError("ORS_API_KEY is not configured")

    response = requests.post(
        f"{ORS_URL}/{profile}/geojson",
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
        },
        json={
            "coordinates": [
                [start["lon"], start["lat"]],
                [end["lon"], end["lat"]],
            ]
        },
        timeout=15,
    )

    response.raise_for_status()

    data = response.json()
    summary = data["features"][0]["properties"]["summary"]

    result = {
        "distance_m": summary["distance"],
        "duration_seconds": summary["duration"],
        "source": "openrouteservice",
        "updated_at": data["metadata"]["timestamp"] // 1000,
    }

    if profile == "driving-car":
        result["coordinates"] = data["features"][0]["geometry"]["coordinates"]

    return result
