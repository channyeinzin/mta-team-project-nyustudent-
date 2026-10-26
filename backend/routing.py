import math
import os

import requests

ORS_URL = "https://api.openrouteservice.org/v2/directions"

METERS_PER_MILE = 1609.344
# NYC streets are a grid, so a real walk is longer than a straight line.
# 1.3x the straight-line distance is a common rule of thumb for city grids.
GRID_DETOUR = 1.3
WALK_MIN_PER_MILE = 20  # 3 mph, the same pace the "Near you" list uses


def estimate_walk(start, end):
    """Walking distance and time from the straight-line distance, for when
    openrouteservice is unavailable (no ORS_API_KEY, or it's down)."""
    lat1, lon1 = math.radians(start["lat"]), math.radians(start["lon"])
    lat2, lon2 = math.radians(end["lat"]), math.radians(end["lon"])
    a = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    straight_miles = 3958.8 * 2 * math.asin(math.sqrt(a))  # 3958.8 = Earth's radius in miles

    miles = straight_miles * GRID_DETOUR
    return {
        "distance_miles": round(miles, 2),
        "total_eta_min": round(miles * WALK_MIN_PER_MILE, 1),
        "estimate_only": True,
        "source": "straight-line estimate",
    }


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
