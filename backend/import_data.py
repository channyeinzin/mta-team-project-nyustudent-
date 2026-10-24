"""import_data.py — Person 2: fill the database with MTA station and route data.

Run once (takes about a minute):   python import_data.py

The MTA publishes a zip of "static" subway data (GTFS) that only changes a few
times a year. We read four files from it:
  routes.txt      the subway lines and their colors
  stops.txt       every station and its location
  trips.txt       every scheduled trip and which line it belongs to
  stop_times.txt  every stop of every trip (used to work out which lines stop where)
"""

import csv
import io
import zipfile

import requests

import database

GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip"


def main():
    print("Downloading MTA subway data...")
    response = requests.get(GTFS_URL, timeout=60)
    response.raise_for_status()
    zip_file = zipfile.ZipFile(io.BytesIO(response.content))

    conn = database.connect()
    database.create_tables(conn)
    conn.execute("DELETE FROM routes")
    conn.execute("DELETE FROM stations")

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
    route_of_trip = {}
    with zip_file.open("trips.txt") as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")):
            route_of_trip[row["trip_id"]] = row["route_id"]

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

    conn.commit()
    conn.close()
    print(f"Done! Saved {count} stations to {database.DB_PATH}")


if __name__ == "__main__":
    main()
