"""dijkstra.py — the fastest route between two stations, with Dijkstra's algorithm.

The subway as a graph. A node is a station, either on the platform or on a line:
  (station, None)   standing on the platform at that station
  (station, "A")    sitting on an A train at that station

Edges, each weighted in seconds:
  ride     (station, "A") -> (next stop, "A")     how long A trains take between the two stops right now
  board    (station, None) -> (station, "A")       WAIT_SECONDS, the average wait for a train
  get off  (station, "A") -> (station, None)       0
  walk     (station, None) -> (other, None)        the walk between connected stations (transfers.txt)

Because boarding costs a wait, changing trains is never free, so Dijkstra only
changes lines when it saves time. Ride times come from the live trains: for each
pair of consecutive stops on a line, the median time trains take right now.
"""

import heapq
import itertools
import statistics

WAIT_SECONDS = 180          # average wait for a train, added every time you board
WALK_DEFAULT_SECONDS = 180  # a transfer the MTA lists without a walk time


def build_graph(trips, transfers):
    """{node: [(next node, seconds, kind, line), ...]} from the live trains and transfers."""
    ride_times = {}  # (station, next station, line) -> [seconds, ...]
    for trip in trips:
        for (a, t1), (b, t2) in zip(trip["order"], trip["order"][1:]):
            if t2 > t1:
                ride_times.setdefault((a, b, trip["route"]), []).append(t2 - t1)

    graph = {}

    def add(node, next_node, seconds, kind, line):
        graph.setdefault(node, []).append((next_node, seconds, kind, line))

    # A segment only seen one way right now (e.g. no train has left the end of the
    # line yet) gets the other direction too: it takes about as long either way.
    for (a, b, line), times in list(ride_times.items()):
        ride_times.setdefault((b, a, line), times)

    boardings = set()
    for (a, b, line), times in ride_times.items():
        add((a, line), (b, line), statistics.median(times), "ride", line)
        for station in (a, b):
            if (station, line) not in boardings:
                boardings.add((station, line))
                add((station, None), (station, line), WAIT_SECONDS, "board", line)
                add((station, line), (station, None), 0, "get off", line)

    for a, others in transfers.items():
        for b, seconds in others:
            if a != b:
                add((a, None), (b, None), seconds or WALK_DEFAULT_SECONDS, "walk", None)
    return graph


def shortest_path(graph, starts, goals):
    """Dijkstra's algorithm from any start platform to any goal platform.

    A station like 14 St-Union Sq has several platforms (L, 4/5/6, N/Q/R/W), and
    you can walk in at any of them, so every one is a start at time 0 and
    reaching any one of the goal's platforms counts as arriving.

    Always expand the node with the smallest total time so far; the first time we
    take a goal off the queue, no other path can be faster.
    Returns {"seconds", "steps": [(node, next node, kind, line, seconds)], "explored"},
    or None if no goal can be reached right now."""
    targets = {(goal, None) for goal in goals}
    best = {}                # fastest known time to each node
    came_from = {}           # node -> the step that reached it fastest
    tie = itertools.count()  # breaks ties in the queue, so nodes are never compared
    queue = []
    for start in starts:
        best[(start, None)] = 0
        heapq.heappush(queue, (0, next(tie), (start, None)))
    done = set()
    target = None

    while queue:
        seconds, _, node = heapq.heappop(queue)
        if node in done:
            continue  # an older, slower entry for a node we already finished
        done.add(node)
        if node in targets:
            target = node
            break
        for next_node, cost, kind, line in graph.get(node, []):
            new_seconds = seconds + cost
            if new_seconds < best.get(next_node, float("inf")):
                best[next_node] = new_seconds
                came_from[next_node] = (node, kind, line, cost)
                heapq.heappush(queue, (new_seconds, next(tie), next_node))

    if target is None:
        return None

    # Walk back from the goal to a start to get the steps in order.
    steps = []
    node = target
    while node in came_from:
        previous, kind, line, cost = came_from[node]
        steps.append((previous, node, kind, line, cost))
        node = previous
    steps.reverse()
    return {"seconds": best[target], "steps": steps, "explored": len(done)}


def to_legs(steps):
    """Turn the steps into what a rider reads: ride the A from X to Y, walk to Z…
    [{"kind": "ride", "line", "stops": [station ids], "seconds"}, {"kind": "walk", "from", "to", "seconds"}]"""
    legs = []
    for node, next_node, kind, line, cost in steps:
        if kind == "ride":
            last = legs[-1] if legs else None
            if last and last["kind"] == "ride" and last["line"] == line and last["stops"][-1] == node[0]:
                last["stops"].append(next_node[0])
                last["seconds"] += cost
            else:
                legs.append({"kind": "ride", "line": line, "stops": [node[0], next_node[0]], "seconds": cost})
        elif kind == "walk":
            legs.append({"kind": "walk", "from": node[0], "to": next_node[0], "seconds": cost})
    return legs
