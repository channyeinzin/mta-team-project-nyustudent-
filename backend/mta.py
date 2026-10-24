"""mta.py — Person 1: talking to the MTA's real-time feeds.

Two kinds of live data (both free, no API key):
  - Train arrivals: 8 "GTFS-RT" feeds in protobuf (binary) format
  - Service alerts: one JSON feed with delays and planned work
"""

import time
from concurrent.futures import ThreadPoolExecutor

import requests
from google.transit import gtfs_realtime_pb2

MTA_BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds"
ALERTS_URL = f"{MTA_BASE}/camsys%2Fsubway-alerts.json"

# The MTA splits the subway into 8 feeds. Each one covers a few lines.
FEEDS = {
    f"{MTA_BASE}/nyct%2Fgtfs": ["1", "2", "3", "4", "5", "6", "6X", "7", "7X", "GS"],
    f"{MTA_BASE}/nyct%2Fgtfs-ace": ["A", "C", "E", "FS", "H"],
    f"{MTA_BASE}/nyct%2Fgtfs-bdfm": ["B", "D", "F", "FX", "M"],
    f"{MTA_BASE}/nyct%2Fgtfs-nqrw": ["N", "Q", "R", "W"],
    f"{MTA_BASE}/nyct%2Fgtfs-jz": ["J", "Z"],
    f"{MTA_BASE}/nyct%2Fgtfs-l": ["L"],
    f"{MTA_BASE}/nyct%2Fgtfs-g": ["G"],
    f"{MTA_BASE}/nyct%2Fgtfs-si": ["SI"],
}

# The feeds only update about every 30 seconds, so we keep each download for
# 30 seconds instead of asking the MTA again for every request.
CACHE_SECONDS = 30
_cache = {}  # url -> (time downloaded, data)


class MTAError(Exception):
    """The MTA feed couldn't be downloaded or read."""


def _cached(url, download):
    saved = _cache.get(url)
    if saved and time.time() - saved[0] < CACHE_SECONDS:
        return saved[1]
    try:
        data = download(url)
    except Exception as error:
        raise MTAError(f"Could not load {url}: {error}") from error
    _cache[url] = (time.time(), data)
    return data


def _download_trains(url):
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(response.content)  # decode protobuf -> Python object
    return feed


def _download_json(url):
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Arrivals
# ---------------------------------------------------------------------------

def get_arrivals(station_id, routes, stop_names):
    """Upcoming trains at one station, soonest first.

    station_id  e.g. "L03"
    routes      lines that stop there, e.g. ["L"] (so we only download those feeds)
    stop_names  {station id: name}, used to name each train's last stop
    """
    urls = [url for url, lines in FEEDS.items() if any(r in lines for r in routes)]

    # Download the feeds at the same time instead of one after another.
    with ThreadPoolExecutor() as pool:
        feeds = list(pool.map(lambda url: _cached(url, _download_trains), urls))

    now = time.time()
    arrivals = []

    for feed in feeds:
        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue
            trip = entity.trip_update
            stops = trip.stop_time_update

            for stop in stops:
                # Platforms are the station ID + N or S, e.g. "L03N".
                if stop.stop_id[:-1] != station_id:
                    continue

                arrival_time = stop.arrival.time or stop.departure.time
                if arrival_time < now:
                    continue  # this train already left

                last_stop_id = stops[-1].stop_id[:-1]
                arrivals.append({
                    "route": trip.trip.route_id,
                    "direction": "Northbound" if stop.stop_id.endswith("N") else "Southbound",
                    "destination": stop_names.get(last_stop_id, last_stop_id),
                    "minutes_away": round((arrival_time - now) / 60),
                    "arrival_time": arrival_time,  # Unix timestamp (seconds)
                })

    arrivals.sort(key=lambda a: a["arrival_time"])
    return arrivals


# ---------------------------------------------------------------------------
# Service status
# ---------------------------------------------------------------------------

def _status_of(alert_type):
    """Turn the MTA's many alert types into 4 simple statuses."""
    if "Delays" in alert_type:
        return "Delays"
    if "Suspended" in alert_type:
        return "Suspended"
    if alert_type.startswith("Planned"):
        return "Planned Work"
    return "Service Change"


# Worst first: if a line has several alerts, it shows the worst one.
STATUS_ORDER = ["Delays", "Suspended", "Service Change", "Planned Work", "Good Service"]


def get_status(route_ids):
    """Current status of every line: {route: {"status": ..., "alerts": [...]}}"""
    data = _cached(ALERTS_URL, _download_json)
    now = time.time()

    result = {route: {"status": "Good Service", "alerts": []} for route in route_ids}

    for entity in data.get("entity", []):
        alert = entity.get("alert", {})

        # Skip alerts that haven't started yet or are already over.
        periods = alert.get("active_period", [])
        if periods and not any(p.get("start", 0) <= now < p.get("end", float("inf")) for p in periods):
            continue

        alert_type = alert.get("transit_realtime.mercury_alert", {}).get("alert_type", "Service Change")
        status = _status_of(alert_type)
        texts = alert.get("header_text", {}).get("translation", [])
        text = next((t["text"] for t in texts if t.get("language") == "en"), "")

        # One alert can affect several lines.
        affected = {e["route_id"] for e in alert.get("informed_entity", []) if "route_id" in e}
        for route in affected:
            if route not in result:
                continue
            result[route]["alerts"].append({"type": alert_type, "text": text})
            if STATUS_ORDER.index(status) < STATUS_ORDER.index(result[route]["status"]):
                result[route]["status"] = status

    return result
