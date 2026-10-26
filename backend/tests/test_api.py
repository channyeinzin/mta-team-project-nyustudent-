"""Backend tests — Person 5. Run from the backend folder:   pytest

These tests don't need the internet: they use a tiny fake database and
replace the MTA calls with fake data.
"""

import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import database  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    # A small database with 2 routes and 2 stations.
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "DB_PATH", str(db_path))
    conn = sqlite3.connect(db_path)
    database.create_tables(conn)
    conn.execute("INSERT INTO routes VALUES ('L', 'L', '14 St-Canarsie Local', '#7C858C', '#FFFFFF')")
    conn.execute("INSERT INTO routes VALUES ('6', '6', 'Lexington Av Local', '#009952', '#FFFFFF')")
    conn.execute("INSERT INTO stations VALUES ('L03', '14 St-Union Sq', 40.7348, -73.9907, 'L')")
    conn.execute("INSERT INTO stations VALUES ('L01', '8 Av', 40.7398, -74.0025, 'L')")
    conn.execute("INSERT INTO shapes VALUES ('L-0', 'L', '[[-74.0025, 40.7398], [-73.9907, 40.7348]]')")
    conn.commit()
    conn.close()

    import app as app_module

    monkeypatch.setattr(app_module, "ROUTES", {r["id"]: r for r in database.get_routes()})
    return app_module.app.test_client(), app_module


def test_status_lists_every_line(client, monkeypatch):
    test_client, app_module = client
    monkeypatch.setattr(
        app_module.mta,
        "get_status",
        lambda routes: {r: {"status": "Good Service", "alerts": []} for r in routes},
    )

    response = test_client.get("/api/status")

    assert response.status_code == 200
    lines = response.get_json()["lines"]
    assert {line["route"] for line in lines} == {"L", "6"}
    assert lines[0]["color"].startswith("#")


def test_arrivals_returns_trains_with_colors(client, monkeypatch):
    test_client, app_module = client
    fake_train = {"route": "L", "direction": "Northbound", "destination": "8 Av", "minutes_away": 3, "arrival_time": 0}
    monkeypatch.setattr(app_module.mta, "get_arrivals", lambda *args: [fake_train])

    response = test_client.get("/api/arrivals?station=L03")

    assert response.status_code == 200
    data = response.get_json()
    assert data["station"]["name"] == "14 St-Union Sq"
    assert data["arrivals"][0]["color"] == "#7C858C"


def test_arrivals_needs_a_station(client):
    test_client, _ = client
    assert test_client.get("/api/arrivals").status_code == 400


def test_arrivals_unknown_station(client):
    test_client, _ = client
    response = test_client.get("/api/arrivals?station=NOPE")
    assert response.status_code == 404
    assert "error" in response.get_json()


def test_mta_down_returns_json_error(client, monkeypatch):
    test_client, app_module = client

    def broken(*args):
        raise app_module.mta.MTAError("feed down")

    monkeypatch.setattr(app_module.mta, "get_arrivals", broken)
    response = test_client.get("/api/arrivals?station=L03")

    assert response.status_code == 502
    assert "error" in response.get_json()


def test_search_stations(client):
    test_client, _ = client
    stations = test_client.get("/api/stations?q=union").get_json()["stations"]
    assert [s["id"] for s in stations] == ["L03"]
    assert stations[0]["routes"] == ["L"]


def test_nearby_stations_closest_first(client):
    test_client, _ = client
    stations = test_client.get("/api/stations/nearby?lat=40.7348&lon=-73.9907").get_json()["stations"]
    assert stations[0]["id"] == "L03"
    assert stations[0]["distance_miles"] < stations[1]["distance_miles"]


def test_nearby_needs_numbers(client):
    test_client, _ = client
    assert test_client.get("/api/stations/nearby?lat=abc&lon=1").status_code == 400


def test_map_routes_geojson(client):
    test_client, _ = client
    data = test_client.get("/api/subway/routes").get_json()
    assert data["type"] == "FeatureCollection"
    line = data["features"][0]
    assert line["geometry"]["type"] == "MultiLineString"
    assert line["properties"]["color"] == "#7C858C"


def test_map_stops_geojson(client):
    test_client, _ = client
    features = test_client.get("/api/subway/stops").get_json()["features"]
    assert len(features) == 2
    assert features[0]["geometry"]["type"] == "Point"


def test_map_trains_filters_by_route(client, monkeypatch):
    test_client, app_module = client
    calls = []

    def fake_get_trains(stations, routes):
        calls.append(routes)
        return [{"route": "L", "next_stop": "8 Av", "lat": 40.7398, "lon": -74.0025}]

    monkeypatch.setattr(app_module.mta, "get_trains", fake_get_trains)
    data = test_client.get("/api/subway/trains?routes=L,6").get_json()

    assert calls == [["L", "6"]]
    assert data["features"][0]["geometry"]["coordinates"] == [-74.0025, 40.7398]
    assert data["features"][0]["properties"]["color"] == "#7C858C"


# --- trip planner ---

def fake_trip(route, stops, start_time):
    """A pretend live train: stops is a list of station ids, 2 minutes apart."""
    order = [(station, start_time + 120 * i) for i, station in enumerate(stops)]
    return {
        "route": route,
        "direction": "Northbound",
        "order": order,
        "stops": {station: (i, t) for i, (station, t) in enumerate(order)},
    }


def test_plan_trip_direct_and_transfer(monkeypatch):
    import time as time_module

    import mta

    now = time_module.time()
    monkeypatch.setattr(mta, "_live_trips", lambda: [
        fake_trip("L", ["A", "B", "C"], now + 60),        # direct A -> C
        fake_trip("L", ["A", "B"], now + 30),             # only to B...
        fake_trip("6", ["B", "D", "C"], now + 400),       # ...then the 6 from B to C
        fake_trip("4", ["C", "A"], now + 60),             # wrong direction
    ])
    names = {s: s for s in "ABCD"}

    options = mta.plan_trip("A", "C", {}, names)

    assert [l["route"] for l in options[0]["legs"]] == ["L"]  # direct arrives first
    assert any([l["route"] for l in o["legs"]] == ["L", "6"] for o in options)
    assert all(o["legs"][0]["route"] != "4" for o in options)


def test_plan_trip_skips_too_short_transfers(monkeypatch):
    import time as time_module

    import mta

    now = time_module.time()
    monkeypatch.setattr(mta, "_live_trips", lambda: [
        fake_trip("L", ["A", "B"], now + 30),   # reaches B at now+150
        fake_trip("6", ["B", "C"], now + 200),  # leaves B only 50 s later: too tight
    ])

    assert mta.plan_trip("A", "C", {}, {}) == []


def test_trip_endpoint(client, monkeypatch):
    test_client, app_module = client
    leg = {"route": "L", "direction": "Northbound", "toward": "8 Av", "from": "14 St-Union Sq",
           "to": "8 Av", "from_id": "L03", "to_id": "L01",
           "stop_ids": ["L03", "L02", "L01"], "depart_time": 0, "arrive_time": 120}
    monkeypatch.setattr(app_module.mta, "plan_trip", lambda *args: [{"legs": [leg], "transfers": 0}])

    data = test_client.get("/api/trip?from=L03&to=L01").get_json()

    assert data["from"]["id"] == "L03"
    assert data["options"][0]["legs"][0]["color"] == "#7C858C"


def test_trip_endpoint_errors(client):
    test_client, _ = client
    assert test_client.get("/api/trip?from=L03").status_code == 400
    assert test_client.get("/api/trip?from=L03&to=L03").status_code == 400
    assert test_client.get("/api/trip?from=L03&to=NOPE").status_code == 404


def test_search_words_match_how_people_type():
    import database
    assert database.search_words("25th Street") == ["25", "st"]
    assert database.search_words("Fifth Ave") == ["5", "av"]
    assert database.search_words("Times Sq-42 St") == ["times", "sq", "42", "st"]
