import dijkstra


def trip(route, stops):
    """A fake live train: stops = [(station, seconds from now), ...]"""
    return {"route": route, "order": stops}


def test_takes_the_faster_line_even_with_a_transfer():
    trips = [
        # The A goes straight from X to Z, but slowly (20 minutes).
        trip("A", [("X", 0), ("Z", 1200)]),
        # The 1 reaches Y in 2 minutes, and the 2 goes Y to Z in 3 minutes.
        trip("1", [("X", 0), ("Y", 120)]),
        trip("2", [("Y", 0), ("Z", 180)]),
    ]
    graph = dijkstra.build_graph(trips, {})
    found = dijkstra.shortest_path(graph, {"X"}, {"Z"})

    # 1 then 2: wait 3 + ride 2 + wait 3 + ride 3 = 11 min, beats wait 3 + ride 20 = 23 min.
    assert found["seconds"] == 180 + 120 + 180 + 180
    legs = dijkstra.to_legs(found["steps"])
    assert [leg["line"] for leg in legs] == ["1", "2"]


def test_stays_on_one_line_when_changing_does_not_help():
    trips = [trip("L", [("A", 0), ("B", 60), ("C", 120)])]
    found = dijkstra.shortest_path(dijkstra.build_graph(trips, {}), {"A"}, {"C"})
    legs = dijkstra.to_legs(found["steps"])
    assert legs == [{"kind": "ride", "line": "L", "stops": ["A", "B", "C"], "seconds": 120}]


def test_walks_between_connected_stations():
    trips = [trip("L", [("A", 0), ("B", 60)]), trip("6", [("C", 0), ("D", 60)])]
    graph = dijkstra.build_graph(trips, {"B": [("C", 90)]})
    legs = dijkstra.to_legs(dijkstra.shortest_path(graph, {"A"}, {"D"})["steps"])
    assert [leg["kind"] for leg in legs] == ["ride", "walk", "ride"]


def test_no_route_when_nothing_connects():
    graph = dijkstra.build_graph([trip("L", [("A", 0), ("B", 60)])], {})
    assert dijkstra.shortest_path(graph, {"A"}, {"Z"}) is None


def test_can_ride_away_from_the_end_of_the_line():
    # Right now trains only arrive at the terminal T; we can still leave it.
    graph = dijkstra.build_graph([trip("1", [("S", 0), ("T", 90)])], {})
    found = dijkstra.shortest_path(graph, {"T"}, {"S"})
    assert found["seconds"] == 180 + 90


def test_any_platform_of_the_station_can_start():
    # Union Sq: board the N at its own platform instead of walking from the L platform.
    trips = [trip("N", [("R20", 0), ("R16", 300)])]
    graph = dijkstra.build_graph(trips, {"L03": [("R20", 180)]})
    found = dijkstra.shortest_path(graph, {"L03", "R20"}, {"R16"})
    assert [leg["kind"] for leg in dijkstra.to_legs(found["steps"])] == ["ride"]
