"""
app.py Himanika - Added optional route filtering to the status endpoint.

Start with:   python app.py
Server:       http://localhost:5001

Endpoints (all return JSON):
  GET /api/routes                          every subway line with its colors
  GET /api/arrivals?station=L03            next trains arriving at a station
  GET /api/stations?q=union                search stations by name
  GET /api/stations/nearby?lat=..&lon=..   closest stations to a location
  GET /api/trip?from=L03&to=127            next trips between two stations

Subway Map (GeoJSON):
  GET /api/subway/routes                   subway track geometry for all lines
  GET /api/subway/stops                    subway station locations
  GET /api/subway/trains?routes=1,2,3      live trains positioned at their next stop

Service Alerts:
  GET /api/status                          service status of every subway line
  GET /api/status?routes=1,2,3             service status and alerts for selected lines

Notes:
  - All endpoints return JSON.
  - Subway map endpoints return GeoJSON FeatureCollections.
  - Train positions represent upcoming station locations, not actual GPS positions.
  - Service alerts are route-level and are not yet matched to specific journeys.
"""

import os
import taxi
import time
import routing
import requests
import weather

from flask import Flask, jsonify, request

import database
import mta

app = Flask(__name__)
app.json.compact = True  # no extra spaces in JSON: smaller and faster to send

if not os.path.exists(database.DB_PATH):
    raise SystemExit("No database yet. Run this first:  python import_data.py")

# Load the routes once: {"L": {"id": "L", "color": "#A7A9AC", ...}, ...}
ROUTES = {route["id"]: route for route in database.get_routes()}


def with_colors(route_id):
    """Color info for a line, so the frontend can draw its bullet."""
    route = ROUTES.get(route_id, {})
    return {"color": route.get("color", "#808183"), "text_color": route.get("text_color", "#FFFFFF")}


@app.get("/api/status")
def status():
    requested = request.args.get("routes")

    if requested:
        route_ids = [
            route.strip().upper()
            for route in requested.split(",")
            if route.strip().upper() in ROUTES
        ]
    else:
        route_ids = list(ROUTES)

    statuses = mta.get_status(route_ids)

    lines = [
        {
            "route": route_id,
            "name": ROUTES[route_id]["long_name"],
            **with_colors(route_id),
            **statuses[route_id],
        }
        for route_id in route_ids
    ]

    return jsonify({"updated_at": int(time.time()), "lines": lines})

@app.get("/api/routes")
def routes():
    return jsonify({"routes": list(ROUTES.values())})


@app.get("/api/arrivals")
def arrivals():
    station_id = request.args.get("station")
    if not station_id:
        return jsonify({"error": "Add a station, e.g. /api/arrivals?station=L03"}), 400

    station = database.get_station(station_id)
    if not station:
        return jsonify({"error": f"Unknown station: {station_id}"}), 404

    trains = mta.get_arrivals(station_id, station["routes"], database.get_station_names())
    for train in trains:
        train.update(with_colors(train["route"]))

    return jsonify({"updated_at": int(time.time()), "station": station, "arrivals": trains[:20]})


@app.get("/api/stations")
def stations():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Add a search, e.g. /api/stations?q=union"}), 400
    return jsonify({"stations": database.search_stations(query)})


@app.get("/api/stations/nearby")
def nearby():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, ValueError):
        return jsonify({"error": "Add lat and lon, e.g. /api/stations/nearby?lat=40.73&lon=-73.99"}), 400
    return jsonify({"stations": database.nearby_stations(lat, lon)})


@app.get("/api/trip")
def trip():
    from_id = request.args.get("from")
    to_id = request.args.get("to")
    if not from_id or not to_id:
        return jsonify({"error": "Add a start and a destination, e.g. /api/trip?from=L03&to=127"}), 400
    start, end = database.get_station(from_id), database.get_station(to_id)
    if not start or not end:
        return jsonify({"error": "Unknown station"}), 404
    if from_id == to_id:
        return jsonify({"error": "Start and destination are the same station"}), 400

    transfers = database.get_transfers()
    if any(other == to_id for other, _ in transfers.get(from_id, [])):
        # e.g. Union Sq L platform -> Union Sq 4/5/6 platform: no train needed
        return jsonify({"updated_at": int(time.time()), "from": start, "to": end, "options": [], "walk": True})


    options = mta.plan_trip(from_id, to_id, transfers, database.get_station_names())

    # Get service alerts for the subway routes used by the planned trips.
    route_ids = list({
        leg["route"]
        for option in options
        for leg in option["legs"]
    })

    statuses = mta.get_status(route_ids) if route_ids else {}

    # Match alerts to each leg of each journey.
    for option in options:
        for leg in option["legs"]:
            leg.update(with_colors(leg["route"]))

            route_alerts = statuses[leg["route"]]["alerts"]
            leg["alerts"] = mta.match_trip_alerts(leg, route_alerts)

    return jsonify({
        "updated_at": int(time.time()),
        "from": start,
        "to": end,
        "options": options
    })




@app.get("/api/commute/compare")
def compare_commute():
    from_id = request.args.get("from")
    to_id = request.args.get("to")

    if not from_id or not to_id:
        return jsonify({"error": "Missing origin or destination"}), 400

    start = database.get_station(from_id)
    end = database.get_station(to_id)

    if not start or not end:
        return jsonify({"error": "Unknown station"}), 404

    if from_id == to_id:
        return jsonify({
            "error": "Start and destination are the same station"
        }), 400

    # --- Subway journey planning and MTA source freshness ---
    subway_error = None
    subway_options = []
    trip_freshness = {
        "source_updated_at": None,
        "age_seconds": None,
        "fresh": False,
        "freshness_threshold_seconds": mta.MAX_TRAIN_FEED_AGE_SECONDS,
        "reason": "MTA trip-feed timestamps unavailable",
    }

    try:
        transfers = database.get_transfers()
        subway_options = mta.plan_trip(
            from_id, to_id, transfers, database.get_station_names()
        )
        # Reads cached feed headers; does not request MTA feeds again.
        trip_freshness = mta.get_trip_feed_freshness()
        if not trip_freshness["fresh"]:
            subway_options = []
            subway_error = trip_freshness["reason"]
    except mta.MTAError as error:
        app.logger.warning("Subway planning unavailable: %s", error)
        subway_options = []
        subway_error = str(error) if str(error) in (
            "MTA trip data is stale",
            "MTA feed timestamp unavailable",
            "MTA feed timestamp is in the future",
        ) else "MTA service temporarily unavailable"

    # --- Route-relevant service alerts ---
    route_ids = list({
        leg["route"]
        for option in subway_options
        for leg in option["legs"]
    })

    alerts_available = False
    statuses = {}
    if route_ids:
        try:
            statuses = mta.get_status(route_ids)
            alerts_available = True
        except mta.MTAError as error:
            app.logger.warning("MTA alerts unavailable: %s", error)

    for option in subway_options:
        for leg in option["legs"]:
            leg.update(with_colors(leg["route"]))
            route_alerts = statuses.get(leg["route"], {}).get("alerts", [])
            leg["alerts"] = mta.match_trip_alerts(leg, route_alerts)

        option["total_eta_min"] = option["minutes"]
        option["fare_usd"] = 3.00
        option["fare_source"] = "MTA standard subway base fare"

    # --- Walking route ---
    try:
        walking = routing.get_route(
            start, end, "foot-walking"
        )

        walking["available"] = True
        walking["total_eta_min"] = round(
            walking["duration_seconds"] / 60, 1
        )
        walking["distance_miles"] = round(
            walking["distance_m"] / routing.METERS_PER_MILE, 2
        )

    except (
        requests.RequestException,
        KeyError,
        IndexError,
        TypeError,
        ValueError
    ) as error:
        # No route from openrouteservice: estimate the walk from the
        # straight-line distance instead, and say it's an estimate.
        app.logger.warning("Walking route unavailable, estimating: %s", error)

        walking = routing.estimate_walk(start, end)
        walking["available"] = True

    # --- Driving route ---
    try:
        driving = routing.get_route(
            start, end, "driving-car"
        )

        driving["available"] = True

    except (
        requests.RequestException,
        KeyError,
        IndexError,
        TypeError,
        ValueError
    ) as error:
        app.logger.warning("Driving route unavailable: %s", error)

        driving = {
            "available": False,
            "reason": "Driving route temporarily unavailable",
        }

    # --- Taxi fare and ETA ---
    pickup_minutes = 5
    taxi_fare = None
    taxi_total_minutes = None

    if driving["available"]:
        coordinates = driving.get("coordinates", [])

        nys_zone = taxi.crosses_nys_congestion_zone(
            coordinates
        )

        mta_zone = taxi.crosses_mta_congestion_zone(
            coordinates
        )

        # Do not include unverified congestion charges.
        taxi_fare = taxi.estimate_fare(
            driving["distance_m"],
            driving["duration_seconds"],
        )

        taxi_fare["congestion_zones"] = {
            "nys": "possible" if nys_zone else "unknown",
            "mta": "possible" if mta_zone else "unknown",
        }

        taxi_fare["assumptions"].append(
            "Congestion charges are not included because "
            "zone applicability has not been verified."
        )

        taxi_total_minutes = round(
            driving["duration_seconds"] / 60
            + pickup_minutes,
            1
        )

        # Keep driving route coordinates internal.
        driving.pop("coordinates", None)

    # --- Final comparison response ---
    return jsonify({
        "from": start,
        "to": end,

        "subway": {
            "available": bool(subway_options),
            "reason": subway_error,
            "alerts_available": alerts_available,
            "options": subway_options,
            "source": "MTA GTFS-Realtime",
            "source_updated_at": trip_freshness["source_updated_at"],
            "source_age_seconds": trip_freshness["age_seconds"],
            "fresh": trip_freshness["fresh"],
            "freshness_threshold_seconds": trip_freshness["freshness_threshold_seconds"],
            "retrieved_at": int(time.time()),
        },

        "walking": walking,

        "driving": driving,

        "taxi": {
            "available": taxi_fare is not None,
            "total_eta_min": taxi_total_minutes,
            "pickup_assumption_min": pickup_minutes,
            "fare": taxi_fare,
            "source": "openrouteservice + NYC TLC",
            "reason": (
                None if taxi_fare is not None
                else "Driving route temporarily unavailable"
            ),
        },

        "updated_at": int(time.time()),
    })

# --- FR-06: current weather and contextual cautions ---

@app.get("/api/weather")
def current_weather():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Provide numeric lat and lon"}), 400

    if not weather.valid_coordinates(lat, lon):
        return jsonify({"error": "Latitude or longitude out of range"}), 400

    try:
        result = weather.get_current_weather(lat, lon)
    except weather.WeatherError as error:
        app.logger.warning("Weather unavailable: %s", error)
        return jsonify({
            "available": False,
            "source": "Open-Meteo",
            "source_updated_at": None,
            "retrieved_at": int(time.time()),
            "weather": None,
            "cautions": [],
            "reason": str(error),
        }), 503

    return jsonify(result)


# --- map data, in GeoJSON (the standard format map libraries understand) ---

def point(lon, lat, properties):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": properties}


@app.get("/api/subway/routes")
def subway_routes():
    features = [
        {
            "type": "Feature",
            # A line can have several tracks (branches), so it's a MultiLineString.
            "geometry": {"type": "MultiLineString", "coordinates": tracks},
            "properties": {"route": route_id, **with_colors(route_id)},
        }
        for route_id, tracks in database.get_route_shapes().items()
    ]
    response = jsonify({"type": "FeatureCollection", "features": features})
    response.headers["Cache-Control"] = "public, max-age=86400"  # changes rarely: cache 24h
    return response


@app.get("/api/subway/stops")
def subway_stops():
    features = [
        point(s["lon"], s["lat"], {"id": s["id"], "name": s["name"], "borough": s["borough"], "routes": s["routes"]})
        for s in database.get_all_stations()
    ]
    response = jsonify({"type": "FeatureCollection", "features": features})
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@app.get("/api/subway/trains")
def subway_trains():
    routes = request.args.get("routes")
    routes = routes.split(",") if routes else None  # "1,2,3" -> ["1", "2", "3"]

    stations_by_id = {s["id"]: s for s in database.get_all_stations()}
    features = []
    for train in mta.get_trains(stations_by_id, routes):
        lat, lon = train.pop("lat"), train.pop("lon")
        features.append(point(lon, lat, {**train, **with_colors(train["route"])}))

    return jsonify({"type": "FeatureCollection", "updated_at": int(time.time()), "features": features})


# --- error handling: always answer with JSON, never an HTML error page ---

@app.errorhandler(mta.MTAError)
def mta_down(error):
    app.logger.error(error)
    return jsonify({"error": "The MTA feed is not responding. Try again in a minute."}), 502


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Something went wrong on the server"}), 500


if __name__ == "__main__":
    # Port 5001 because macOS uses 5000 for AirPlay.
    app.run(port=5001, debug=True)
