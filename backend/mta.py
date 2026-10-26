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

# We keep each download for 10 seconds instead of asking the MTA again for every
# request. 10 seconds matches how often the map asks for new train positions.
CACHE_SECONDS = 10
MAX_TRAIN_FEED_AGE_SECONDS = 180  # Treat old or undated predictions as unavailable.
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


def _load_feeds(routes=None):
    """Download the feeds that cover these lines (or all feeds if routes is None)."""
    urls = [url for url, lines in FEEDS.items() if routes is None or any(r in lines for r in routes)]

    # Download the feeds at the same time instead of one after another.
    with ThreadPoolExecutor() as pool:
        return list(pool.map(lambda url: _cached(url, _download_trains), urls))


def _train_feed_freshness(feeds, now=None):
    """Summarize GTFS-RT header timestamps; the oldest feed governs freshness.

    Feed timestamps describe MTA source data, not when Flask fetched a response.
    Unknown, future-dated, or stale feeds are not safe to display as live.
    """
    now = time.time() if now is None else now
    timestamps = [int(feed.header.timestamp) for feed in feeds]

    result = {
        "source_updated_at": min(timestamps) if timestamps and all(timestamps) else None,
        "age_seconds": None,
        "fresh": False,
        "freshness_threshold_seconds": MAX_TRAIN_FEED_AGE_SECONDS,
        "reason": None,
    }

    if not timestamps or any(not timestamp for timestamp in timestamps):
        result["reason"] = "MTA feed timestamp unavailable"
        return result

    ages = [now - timestamp for timestamp in timestamps]
    if any(age < -60 for age in ages):
        result["reason"] = "MTA feed timestamp is in the future"
        return result

    result["age_seconds"] = max(0, round(max(ages)))
    if any(age > MAX_TRAIN_FEED_AGE_SECONDS for age in ages):
        result["reason"] = "MTA trip data is stale"
        return result

    result["fresh"] = True
    return result


def get_trip_feed_freshness():
    """Read timestamps from the cached feeds used by the last trip-planning call.

    No network requests are made. Missing cached feeds are reported as unknown.
    """
    feeds = []
    for url in FEEDS:
        saved = _cache.get(url)
        if saved is None:
            return {
                "source_updated_at": None,
                "age_seconds": None,
                "fresh": False,
                "freshness_threshold_seconds": MAX_TRAIN_FEED_AGE_SECONDS,
                "reason": "MTA trip-feed timestamps unavailable",
            }
        feeds.append(saved[1])
    return _train_feed_freshness(feeds)


# ---------------------------------------------------------------------------
# Trains (for the map)
# ---------------------------------------------------------------------------

def get_trains(stations_by_id, routes=None):
    """Every train that's running, placed at its next stop.

    stations_by_id  {station id: station dict with lat/lon/name}
    routes          only these lines, e.g. ["1", "2", "3"] (None = all lines)

    To keep it simple, a train is drawn AT its next station instead of
    somewhere on the track between two stations.
    """
    now = time.time()
    trains = []

    for feed in _load_feeds(routes):
        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue
            trip = entity.trip_update
            if routes and trip.trip.route_id not in routes:
                continue

            # The next stop is the first one the train hasn't reached yet.
            upcoming = [s for s in trip.stop_time_update if (s.arrival.time or s.departure.time) >= now]
            if not upcoming:
                continue
            next_stop = stations_by_id.get(upcoming[0].stop_id[:-1])
            last_stop = stations_by_id.get(upcoming[-1].stop_id[:-1])
            if not next_stop:
                continue

            arrival_time = upcoming[0].arrival.time or upcoming[0].departure.time
            trains.append({
                "trip_id": trip.trip.trip_id,
                "route": trip.trip.route_id,
                "direction": "Northbound" if upcoming[0].stop_id.endswith("N") else "Southbound",
                "next_stop": next_stop["name"],
                "destination": last_stop["name"] if last_stop else None,
                "minutes_away": round((arrival_time - now) / 60),
                "lat": next_stop["lat"],
                "lon": next_stop["lon"],
            })

    return trains


# ---------------------------------------------------------------------------
# Arrivals
# ---------------------------------------------------------------------------

def get_arrivals(station_id, routes, stop_names):
    """Upcoming trains at one station, soonest first.

    station_id  e.g. "L03"
    routes      lines that stop there, e.g. ["L"] (so we only download those feeds)
    stop_names  {station id: name}, used to name each train's last stop
    """
    feeds = _load_feeds(routes)
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
        alert_updated_at = alert.get("transit_realtime.mercury_alert", {}).get("updated_at")
        status = _status_of(alert_type)
        texts = alert.get("header_text", {}).get("translation", [])
        text = next((t["text"] for t in texts if t.get("language") == "en"), "")

        # Preserve affected routes, stops, and directions for future trip matching.
        affected_entities = [
            {
                "route_id": e.get("route_id"),
                "stop_id": e.get("stop_id"),
                "direction_id": e.get("direction_id"),
            }
            for e in alert.get("informed_entity", [])
        ]

        affected_routes = {
            e["route_id"]
            for e in affected_entities
            if e["route_id"] is not None
        }

        for route in affected_routes:
            if route not in result:
                continue

            # Store only the affected entities for this route.
            route_entities = [
                e for e in affected_entities
                if e["route_id"] == route
            ]

            result[route]["alerts"].append({
                "id": entity.get("id"),
                "type": alert_type,
                "text": text,
                "updated_at": alert_updated_at,
                "affected_entities": route_entities,
            })

            if STATUS_ORDER.index(status) < STATUS_ORDER.index(result[route]["status"]):
                result[route]["status"] = status

    return result


# ---------------------------------------------------------------------------
# Trip planner
# ---------------------------------------------------------------------------

DEFAULT_TRANSFER_SECONDS = 180  # 3 minutes to change trains if the MTA doesn't say


def _live_trips():
    """Every running train as a simple dict:
    {"route": "L", "direction": "Northbound", "stops": {station id: (position, time)}, "order": [...]}"""
    now = time.time()
    trips = []
    feeds = _load_feeds()
    freshness = _train_feed_freshness(feeds)
    if not freshness["fresh"]:
        raise MTAError(freshness["reason"])

    for feed in feeds:
        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue
            trip = entity.trip_update
            order = []  # [(station id, time), ...] in the order the train visits them
            for stop in trip.stop_time_update:
                t = stop.arrival.time or stop.departure.time
                if t >= now:
                    order.append((stop.stop_id[:-1], t))
            if len(order) < 2:
                continue
            trips.append({
                "route": trip.trip.route_id,
                "direction": "Northbound" if trip.stop_time_update[0].stop_id.endswith("N") else "Southbound",
                "order": order,
                # station id -> (position in the trip, time the train gets there)
                "stops": {station: (i, t) for i, (station, t) in enumerate(order)},
            })
    return trips


def _walkable(station_id, transfers):
    """Stations you can walk to from here (including here), with the walk time.
    For example, Times Sq 1/2/3 ("127") connects to Times Sq N/Q/R/W ("R16")."""
    options = {station_id: 0}
    for other, seconds in transfers.get(station_id, []):
        if other != station_id:
            options[other] = seconds
    return options


def plan_trip(from_id, to_id, transfers, stop_names, max_options=5):
    """The next trips from one station to another: direct trains, or one transfer.

    How it works:
      1. Take every live train and the stations it will still visit.
      2. Direct: a train that stops at the start and LATER at the destination.
      3. One transfer: ride train 1 to some station, walk to another platform
         (if needed), and catch a later train 2 that goes to the destination.
    We return the options that arrive soonest.
    """
    now = time.time()
    trips = _live_trips()
    starts = _walkable(from_id, transfers)  # where you can board
    ends = _walkable(to_id, transfers)      # where you can get off

    # Trains that reach the destination: trip index -> (end station, position, time)
    reaches_end = {}
    for n, trip in enumerate(trips):
        for end in ends:
            if end in trip["stops"]:
                pos, t = trip["stops"][end]
                if n not in reaches_end or t < reaches_end[n][2]:
                    reaches_end[n] = (end, pos, t)

    def leg(trip, board, board_time, alight, alight_time):
        last_stop = trip["order"][-1][0]

        start_pos = trip["stops"][board][0]
        end_pos = trip["stops"][alight][0]

        stop_ids = [
            station_id
            for station_id, _ in trip["order"][start_pos:end_pos + 1]
        ]

        return {
            "route": trip["route"],
            "direction": trip["direction"],
            "toward": stop_names.get(last_stop, last_stop),
            "from": stop_names.get(board, board),
            "to": stop_names.get(alight, alight),
            "from_id": board,
            "to_id": alight,
            "stop_ids": stop_ids,
            "depart_time": board_time,
            "arrive_time": alight_time,
        }

    options = []
    for n, trip in enumerate(trips):
        for start, walk in starts.items():
            if start not in trip["stops"]:
                continue
            start_pos, depart = trip["stops"][start]
            if depart < now + walk:
                continue  # you can't make it to this platform in time

            # 1. Direct train
            if n in reaches_end and reaches_end[n][1] > start_pos:
                end, _, arrive = reaches_end[n]
                options.append([leg(trip, start, depart, end, arrive)])
                continue

            # 2. One transfer: try getting off at each later station
            for station, t1 in trip["order"][start_pos + 1:]:
                for transfer_station, seconds in _walkable(station, transfers).items():
                    seconds = seconds or DEFAULT_TRANSFER_SECONDS
                    for m, (end, end_pos, arrive) in reaches_end.items():
                        other = trips[m]
                        if other["route"] == trip["route"] or transfer_station not in other["stops"]:
                            continue
                        pos2, t2 = other["stops"][transfer_station]
                        if pos2 < end_pos and t2 >= t1 + seconds:
                            options.append([
                                leg(trip, start, depart, station, t1),
                                leg(other, transfer_station, t2, end, arrive),
                            ])

    # Soonest arrival first. Keep the next 3 trains for a direct line, but only
    # the best trip for each transfer combination (e.g. one "L -> 6" option).
    options.sort(key=lambda legs: (legs[-1]["arrive_time"], len(legs)))
    best, count = [], {}
    for legs in options:
        lines = tuple(l["route"] for l in legs)
        limit = 3 if len(legs) == 1 else 1
        if count.get(lines, 0) >= limit:
            continue
        count[lines] = count.get(lines, 0) + 1
        best.append({
            "legs": legs,
            "transfers": len(legs) - 1,
            "depart_time": legs[0]["depart_time"],
            "arrive_time": legs[-1]["arrive_time"],
            "minutes": round((legs[-1]["arrive_time"] - now) / 60),
        })
        if len(best) == max_options:
            break
    return best

# ---------------------------------------------------------------------------
# Journey-specific service alert matching
# ---------------------------------------------------------------------------

def match_trip_alerts(leg, alerts):
    """Find service alerts potentially affecting one subway journey leg."""

    route = leg["route"]
    direction = leg["direction"]
    stop_ids = set(leg["stop_ids"])

    # MTA direction IDs: 0 = Northbound, 1 = Southbound
    direction_id = 0 if direction == "Northbound" else 1

    matched = []

    for alert in alerts:
        entities = alert.get("affected_entities", [])

        # Some alerts apply to the whole route without specifying stations.
        if not entities:
            matched.append({
                **alert,
                "relevance": "possible",
                "reason": "Route-level alert without specific station information",
            })
            continue

        for entity in entities:
            # Check the subway route.
            if entity.get("route_id") != route:
                continue

            # Check direction, if specified.
            alert_direction = entity.get("direction_id")

            if alert_direction is not None and alert_direction != direction_id:
                continue

            # Check affected stations, if specified.
            alert_stop = entity.get("stop_id")

            if alert_stop is not None and alert_stop not in stop_ids:
                continue

            matched.append({
                **alert,
                "relevance": "possible",
                "reason": "Alert matches the journey route, direction, and/or stations",
            })

            break

    return matched