"""NYC yellow taxi fare scenarios for the commute comparison MVP.

This is a planning estimate, not a quote or guaranteed fare range.
Official rates: https://www.nyc.gov/site/tlc/passengers/taxi-fare.page
"""

import math
from datetime import datetime
from zoneinfo import ZoneInfo

METERS_PER_MILE = 1609.344

# TLC standard city-meter rates (not airport or other special-rate trips).
BASE_FARE = 3.00
RATE_PER_UNIT = 0.70
DISTANCE_PER_UNIT_MILES = 0.2

MTA_STATE_SURCHARGE = 0.50
IMPROVEMENT_SURCHARGE = 1.00
NYS_CONGESTION_SURCHARGE = 2.50
MTA_CONGESTION_TOLL = 0.75

NYC_TIMEZONE = ZoneInfo("America/New_York")
TLC_FARE_URL = "https://www.nyc.gov/site/tlc/passengers/taxi-fare.page"


def get_time_surcharge(trip_time=None, is_holiday=False):
    """Return the applicable overnight/rush-hour surcharge in dollars.

    `is_holiday` must be determined by the caller. The default assumes the
    date is not a holiday; the fare response discloses that limitation.
    """
    if trip_time is None:
        trip_time = datetime.now(NYC_TIMEZONE)
    elif trip_time.tzinfo is None or trip_time.utcoffset() is None:
        raise ValueError("trip_time must include a timezone")
    else:
        trip_time = trip_time.astimezone(NYC_TIMEZONE)

    hour = trip_time.hour
    if hour >= 20 or hour < 6:
        return 1.00
    if trip_time.weekday() < 5 and 16 <= hour < 20 and not is_holiday:
        return 2.50
    return 0.00


def crosses_nys_congestion_zone(coordinates):
    """Rough screening only; True means *possible*, None means unknown.

    Bounding-box checks cannot establish the actual Manhattan zone boundary.
    Do not use the result to automatically apply the surcharge.
    """
    if not coordinates:
        return None
    for lon, lat in coordinates:
        if 40.70 <= lat < 40.795 and -74.02 <= lon <= -73.93:
            return True
    return None


def crosses_mta_congestion_zone(coordinates):
    """Rough screening only; True means *possible*, None means unknown.

    Cannot distinguish exempt roads such as the FDR/West Side Highway.
    Do not use the result to automatically apply the toll.
    """
    if not coordinates:
        return None
    for lon, lat in coordinates:
        if 40.70 <= lat <= 40.769 and -74.02 <= lon <= -73.93:
            return True
    return None


def estimate_fare(
    distance_m,
    duration_seconds,
    nys_congestion=False,
    mta_congestion=False,
    trip_time=None,
    is_holiday=False,
):
    """Return two illustrative standard-meter scenarios, never true bounds.

    The routing provider supplies only aggregate distance and travel duration.
    It does not reveal precisely when the meter switches between distance and
    time increments. The slow-traffic scenario is a modeling assumption.
    Congestion charges are included only when the caller explicitly asserts
    their applicability; the approximate zone helpers do not verify them.
    """
    for name, value in (("distance_m", distance_m), ("duration_seconds", duration_seconds)):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be a non-negative finite number")
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be a non-negative finite number")

    distance_miles = distance_m / METERS_PER_MILE
    duration_minutes = duration_seconds / 60

    # Scenario 1: the entire route is billed by distance.
    distance_fare = BASE_FARE + math.ceil(
        distance_miles / DISTANCE_PER_UNIT_MILES
    ) * RATE_PER_UNIT

    # Scenario 2: assume 30% of modeled travel time occurs in slow traffic.
    # The same fraction of distance is allocated to that interval so distance
    # and slow-time increments are not both billed for the same interval.
    slow_fraction = 0.30
    moving_miles = distance_miles * (1 - slow_fraction)
    slow_minutes = duration_minutes * slow_fraction
    modeled_units = moving_miles / DISTANCE_PER_UNIT_MILES + slow_minutes
    slow_traffic_fare = BASE_FARE + math.ceil(modeled_units) * RATE_PER_UNIT

    time_charge = get_time_surcharge(trip_time, is_holiday)
    congestion_nys_charge = NYS_CONGESTION_SURCHARGE if nys_congestion else 0.0
    congestion_mta_charge = MTA_CONGESTION_TOLL if mta_congestion else 0.0
    surcharges = (
        MTA_STATE_SURCHARGE
        + IMPROVEMENT_SURCHARGE
        + time_charge
        + congestion_nys_charge
        + congestion_mta_charge
    )

    return {
        "min_usd": round(min(distance_fare, slow_traffic_fare) + surcharges, 2),
        "max_usd": round(max(distance_fare, slow_traffic_fare) + surcharges, 2),
        "currency": "USD",
        "source": "NYC TLC standard metered fare rules",
        "rate_source_url": TLC_FARE_URL,
        "estimate_only": True,
        "range_is_guaranteed": False,
        "fare_status": "partial_estimate",
        "included_surcharges_usd": {
            "mta_state": MTA_STATE_SURCHARGE,
            "improvement": IMPROVEMENT_SURCHARGE,
            "time_of_day": time_charge,
            "nys_congestion": congestion_nys_charge,
            "mta_congestion": congestion_mta_charge,
        },
        "excluded_charges": [
            "Tip",
            "Bridge and tunnel tolls",
            "Congestion charges not explicitly verified by the caller",
            "Airport and special-rate surcharges",
        ],
        "assumptions": [
            "Standard NYC yellow taxi meter, not an airport or special-rate trip.",
            "One scenario assumes distance-based metering throughout.",
            "A second scenario models 30% of the route's estimated time as slow traffic.",
            "The two values are illustrative scenarios, not guaranteed fare bounds.",
            "The driving ETA is not a live traffic or taxi-meter reading.",
            "NYS/MTA congestion charges are included only when explicitly supplied as applicable.",
            "Default is_holiday=False assumes a non-holiday; no holiday calendar is connected.",
            "Tips, road tolls and special-rate trip charges are excluded.",
        ],
    }
