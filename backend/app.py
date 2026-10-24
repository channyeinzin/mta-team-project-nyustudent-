"""app.py — Person 1: the Flask backend.

Start it with:   python app.py      (runs on http://localhost:5001)

Endpoints (all return JSON):
  GET /api/status                          service status of every line
  GET /api/routes                          every line with its colors
  GET /api/arrivals?station=L03            next trains at one station
  GET /api/stations?q=union                search stations by name
  GET /api/stations/nearby?lat=..&lon=..   closest stations to a point
"""

import os
import time

from flask import Flask, jsonify, request

import database
import mta

app = Flask(__name__)

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
    statuses = mta.get_status(list(ROUTES))
    lines = [
        {
            "route": route_id,
            "name": route["long_name"],
            **with_colors(route_id),
            **statuses[route_id],
        }
        for route_id, route in ROUTES.items()
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
