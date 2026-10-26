"""import_data.py — Person 2: fill the database with MTA station and route data.

Run once (takes about a minute):   python import_data.py

The MTA publishes a zip of "static" subway data (GTFS) that only changes a few
times a year. We read four files from it:
  routes.txt      the subway lines and their colors
  stops.txt       every station and its location
  trips.txt       every scheduled trip and which line it belongs to
  stop_times.txt  every stop of every trip (used to work out which lines stop where)
  shapes.txt      the path of the tracks, for drawing lines on the map
  transfers.txt   where you can walk between stations to change lines
"""

import csv
import io
import json
import zipfile

import requests

import database

GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"

# The MTA's list of subway stations on NY Open Data, which includes each one's borough.
BOROUGHS_URL = "https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD"
BOROUGH_NAMES = {"M": "Manhattan", "Bk": "Brooklyn", "Bx": "Bronx", "Q": "Queens", "SI": "Staten Island"}


def main():
    print("Downloading MTA subway data...")
    response = requests.get(GTFS_URL, timeout=60)
    response.raise_for_status()
    zip_file = zipfile.ZipFile(io.BytesIO(response.content))

    conn = database.connect()
    database.create_tables(conn)
    conn.execute("DELETE FROM routes")
    conn.execute("DELETE FROM stations")
    conn.execute("DELETE FROM shapes")
    conn.execute("DELETE FROM transfers")

    # --- routes ---
    with zip_file.open("routes.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            conn.execute(
                "INSERT INTO routes VALUES (?, ?, ?, ?, ?)",
                (
                    row["route_id"],
                    row["route_short_name"],
                    row["route_long_name"],
                    "#" + (row["route_color"] or "808183"),
                    "#" + (row["route_text_color"] or "FFFFFF"),
                ),
            )

    # --- which lines stop at which station ---
    # trips.txt tells us the line of each trip...
    # (It also tells us which track shapes each line uses, for the map.)
    route_of_trip = {}
    route_of_shape = {}
    with zip_file.open("trips.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            route_of_trip[row["trip_id"]] = row["route_id"]
            if row["shape_id"]:
                route_of_shape[row["shape_id"]] = row["route_id"]

    # ...and stop_times.txt tells us where each trip stops.
    # Platform IDs look like "L03N", so we cut off the N/S to get the station "L03".
    routes_at_station = {}
    with zip_file.open("stop_times.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            station_id = row["stop_id"][:-1] if row["stop_id"][-1] in "NS" else row["stop_id"]
            route_id = route_of_trip.get(row["trip_id"])
            if route_id:
                routes_at_station.setdefault(station_id, set()).add(route_id)

    # --- stations ---
    count = 0
    with zip_file.open("stops.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            # location_type 1 = the station itself (not one of its platforms)
            if row["location_type"] != "1":
                continue
            routes = sorted(routes_at_station.get(row["stop_id"], []))
            conn.execute(
                "INSERT INTO stations VALUES (?, ?, ?, ?, ?)",
                (row["stop_id"], row["stop_name"], float(row["stop_lat"]), float(row["stop_lon"]), " ".join(routes)),
            )
            count += 1

    # --- transfers: where you can change lines, and how long the walk is ---
    with zip_file.open("transfers.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            conn.execute(
                "INSERT INTO transfers VALUES (?, ?, ?)",
                (row["from_stop_id"], row["to_stop_id"], int(row["min_transfer_time"] or 0)),
            )

    # --- track shapes for the map ---
    # shapes.txt is a list of points: (shape id, point number, lat, lon).
    points_of_shape = {}
    with zip_file.open("shapes.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            points_of_shape.setdefault(row["shape_id"], []).append(
                (int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]), float(row["shape_pt_lat"]))
            )

    # Each line has many shapes that mostly lie on top of each other (one per
    # direction and service pattern). To keep the map fast we only keep a shape
    # if it adds new track — like a branch — that the kept shapes don't cover.
    shapes_of_route = {}
    for shape_id, points in points_of_shape.items():
        if shape_id in route_of_shape:  # skip shapes no trip uses
            shapes_of_route.setdefault(route_of_shape[shape_id], []).append(sorted(points))

    for route_id, shapes in shapes_of_route.items():
        shapes.sort(key=len, reverse=True)  # longest first
        covered = set()  # points (rounded to ~10 m) already on the map
        for number, points in enumerate(shapes):
            coordinates = [[round(lon, 5), round(lat, 5)] for _, lon, lat in points]  # GeoJSON: lon, lat
            rounded = {(round(lon, 4), round(lat, 4)) for lon, lat in coordinates}
            if len(rounded - covered) < 0.1 * len(rounded):
                continue  # 90% of this shape is already drawn
            covered |= rounded
            conn.execute(
                "INSERT INTO shapes VALUES (?, ?, ?)",
                (f"{route_id}-{number}", route_id, json.dumps(coordinates)),
            )

    conn.commit()
    conn.close()
    print(f"Done! Saved {count} stations to {database.DB_PATH}")

    save_boroughs()


def save_boroughs():
    """GTFS has no borough, so we take it from the MTA's station list on NY Open
    Data and save {station id: borough} to station_boroughs.json."""
    print("Downloading station boroughs...")
    response = requests.get(BOROUGHS_URL, timeout=60)
    response.raise_for_status()
    rows = csv.DictReader(io.StringIO(response.content.decode("utf-8-sig")))
    boroughs = {row["GTFS Stop ID"]: BOROUGH_NAMES[row["Borough"]] for row in rows}
    with open(database.BOROUGHS_PATH, "w") as file:
        json.dump(boroughs, file, indent=0, sort_keys=True)
    print(f"Saved the borough of {len(boroughs)} stations to {database.BOROUGHS_PATH}")


if __name__ == "__main__":
    main()
