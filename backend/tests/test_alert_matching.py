import mta

def test_alert_matching():
    leg = {
        "route": "1",
        "direction": "Northbound",
        "stop_ids": ["127", "126", "125", "124", "123", "122", "121", "120"],
    }

    alerts = [
        {
            "id": "test-alert-1",
            "type": "Planned - Stops Skipped",
            "text": "Downtown 1 trains skip certain stations.",
            "affected_entities": [
                {
                    "route_id": "1",
                    "stop_id": "120",
                    "direction_id": 1,
                }
            ],
        }
    ]

    matches = mta.match_trip_alerts(leg, alerts)

    assert matches == []

def test_matching_direction_and_station():
    leg = {
        "route": "1",
        "direction": "Northbound",
        "stop_ids": ["127", "126", "125", "124", "123", "122", "121", "120"],
    }

    alerts = [
        {
            "id": "test-alert-2",
            "type": "Delays",
            "text": "Northbound 1 trains are delayed.",
            "affected_entities": [
                {
                    "route_id": "1",
                    "stop_id": "120",
                    "direction_id": 0,
                }
            ],
        }
    ]

    matches = mta.match_trip_alerts(leg, alerts)

    assert len(matches) == 1
    assert matches[0]["id"] == "test-alert-2"
    assert matches[0]["relevance"] == "possible"

def test_alert_at_unrelated_station():
    leg = {
        "route": "1",
        "direction": "Northbound",
        "stop_ids": ["127", "126", "125", "124", "123", "122", "121", "120"],
    }

    alerts = [
        {
            "id": "test-alert-3",
            "type": "Planned - Stops Skipped",
            "text": "Service disruption at Van Cortlandt Park-242 St.",
            "affected_entities": [
                {
                    "route_id": "1",
                    "stop_id": "101",
                    "direction_id": None,
                }
            ],
        }
    ]

    matches = mta.match_trip_alerts(leg, alerts)

    assert matches == []