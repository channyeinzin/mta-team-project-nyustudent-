"""database.py — Person 2: the SQLite database.

Tables:
  routes    one row per subway line  (id, name, color, ...)
  stations  one row per station      (id, name, lat, lon, routes)
  transfers where you can walk between stations to change lines (from_id, to_id, seconds)
  shapes    one row per track path   (id, route_id, coordinates) — for the map

The data is filled in by import_data.py. app.py reads it with the helper
functions at the bottom of this file.
"""

import json
import math
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "subway.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS routes (
    id          TEXT PRIMARY KEY,   -- "A", "1", "L", ...
    short_name  TEXT NOT NULL,      -- what's printed on the bullet
    long_name   TEXT NOT NULL,      -- "8 Avenue Express"
    color       TEXT NOT NULL,      -- "#0062CF"
    text_color  TEXT NOT NULL       -- "#FFFFFF"
);

CREATE TABLE IF NOT EXISTS stations (
    id      TEXT PRIMARY KEY,       -- "L03" (platforms add N/S: "L03N")
    name    TEXT NOT NULL,          -- "14 St-Union Sq"
    lat     REAL NOT NULL,
    lon     REAL NOT NULL,
    routes  TEXT NOT NULL           -- lines that stop here, space separated: "L"
);

CREATE TABLE IF NOT EXISTS transfers (
    from_id  TEXT NOT NULL,         -- "127" (Times Sq, 1/2/3)
    to_id    TEXT NOT NULL,         -- "R16" (Times Sq, N/Q/R/W)
    seconds  INTEGER NOT NULL       -- how long the walk takes
);

CREATE TABLE IF NOT EXISTS shapes (
    id           TEXT PRIMARY KEY,  -- "L-0", "L-1", ...
    route_id     TEXT NOT NULL,     -- "L"
    coordinates  TEXT NOT NULL      -- the track as JSON: [[lon, lat], [lon, lat], ...]
);
"""


def connect():
    """Open the database. Rows act like dicts: row["name"]."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def create_tables(conn):
    conn.executescript(SCHEMA)


def get_routes():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM routes").fetchall()
    return [dict(row) for row in rows]


def get_all_stations():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM stations").fetchall()
    return [station_to_dict(row) for row in rows]


def get_route_shapes():
    """{route id: [track, track, ...]} where each track is [[lon, lat], ...]"""
    with connect() as conn:
        rows = conn.execute("SELECT route_id, coordinates FROM shapes").fetchall()
    shapes = {}
    for row in rows:
        shapes.setdefault(row["route_id"], []).append(json.loads(row["coordinates"]))
    return shapes


def get_transfers():
    """{station id: [(station id you can walk to, seconds), ...]}"""
    with connect() as conn:
        rows = conn.execute("SELECT * FROM transfers").fetchall()
    transfers = {}
    for row in rows:
        transfers.setdefault(row["from_id"], []).append((row["to_id"], row["seconds"]))
    return transfers


def get_station(station_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM stations WHERE id = ?", (station_id,)).fetchone()
    return station_to_dict(row) if row else None


def get_station_names():
    """{station id: name} for every station."""
    with connect() as conn:
        rows = conn.execute("SELECT id, name FROM stations").fetchall()
    return {row["id"]: row["name"] for row in rows}


def search_stations(query, limit=10):
    """Stations whose name contains the search text (case-insensitive)."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM stations WHERE name LIKE ? ORDER BY name LIMIT ?",
            (f"%{query}%", limit),
        ).fetchall()
    return [station_to_dict(row) for row in rows]


def nearby_stations(lat, lon, limit=5):
    """The stations closest to a point, with distance in miles."""
    with connect() as conn:
        rows = conn.execute("SELECT * FROM stations").fetchall()

    stations = [station_to_dict(row) for row in rows]
    for station in stations:
        station["distance_miles"] = round(distance_miles(lat, lon, station["lat"], station["lon"]), 2)
    stations.sort(key=lambda s: s["distance_miles"])
    return stations[:limit]


def station_to_dict(row):
    station = dict(row)
    station["routes"] = station["routes"].split()  # "1 2 3" -> ["1", "2", "3"]
    return station


def distance_miles(lat1, lon1, lat2, lon2):
    """Distance between two points on Earth (the "haversine" formula)."""
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 3959 * 2 * math.asin(math.sqrt(a))  # 3959 = Earth's radius in miles
