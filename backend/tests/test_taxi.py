"""Local taxi fare tests; no requests to TLC, MTA or openrouteservice."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import taxi

TZ = ZoneInfo("America/New_York")


def test_overnight_surcharge():
    assert taxi.get_time_surcharge(datetime(2026, 10, 25, 5, 0, tzinfo=TZ)) == 1.00


def test_rush_hour_surcharge():
    assert taxi.get_time_surcharge(datetime(2026, 10, 26, 17, 0, tzinfo=TZ)) == 2.50


def test_weekend_daytime_no_surcharge():
    assert taxi.get_time_surcharge(datetime(2026, 10, 25, 12, 0, tzinfo=TZ)) == 0.00


def test_holiday_suppresses_rush_hour_surcharge():
    moment = datetime(2026, 10, 26, 17, 0, tzinfo=TZ)
    assert taxi.get_time_surcharge(moment, is_holiday=True) == 0.00


def test_negative_distance_rejected():
    with pytest.raises(ValueError):
        taxi.estimate_fare(-100, 600)


def test_invalid_numeric_inputs_rejected():
    for distance, duration in [(float("nan"), 60), (100, float("inf")), (None, 60), (True, 60)]:
        with pytest.raises(ValueError):
            taxi.estimate_fare(distance, duration)


def test_fare_estimate_structure():
    result = taxi.estimate_fare(
        distance_m=5818.4,
        duration_seconds=672.7,
        trip_time=datetime(2026, 10, 25, 12, 0, tzinfo=TZ),
    )
    assert result["currency"] == "USD"
    assert result["estimate_only"] is True
    assert result["range_is_guaranteed"] is False
    assert result["fare_status"] == "partial_estimate"
    assert result["min_usd"] <= result["max_usd"]
    assert result["min_usd"] > 0
    assert result["rate_source_url"].startswith("https://www.nyc.gov/")
    assert result["included_surcharges_usd"]["nys_congestion"] == 0
    assert result["included_surcharges_usd"]["mta_congestion"] == 0
    assert result["excluded_charges"]


def test_explicit_congestion_charges_change_fare_by_325():
    kwargs = dict(
        distance_m=5818.4,
        duration_seconds=672.7,
        trip_time=datetime(2026, 10, 25, 12, 0, tzinfo=TZ),
    )
    without = taxi.estimate_fare(**kwargs)
    with_charges = taxi.estimate_fare(**kwargs, nys_congestion=True, mta_congestion=True)
    assert round(with_charges["min_usd"] - without["min_usd"], 2) == 3.25
    assert round(with_charges["max_usd"] - without["max_usd"], 2) == 3.25
    assert with_charges["included_surcharges_usd"]["nys_congestion"] == 2.50
    assert with_charges["included_surcharges_usd"]["mta_congestion"] == 0.75


def test_approximate_zones_do_not_claim_false():
    assert taxi.crosses_nys_congestion_zone([]) is None
    assert taxi.crosses_mta_congestion_zone([]) is None
    coords = [[-73.987495, 40.75529], [-73.972323, 40.793919]]
    assert taxi.crosses_nys_congestion_zone(coords) is True
    assert taxi.crosses_mta_congestion_zone(coords) is True
