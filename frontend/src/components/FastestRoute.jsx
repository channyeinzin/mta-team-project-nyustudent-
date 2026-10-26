// The fastest route between From and To, found with Dijkstra's algorithm on a graph
// of the live trains (backend/dijkstra.py). It's also drawn on the map.

import { Footprints, GitBranch } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";

export default function FastestRoute({ route }) {
  if (route === null) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <GitBranch size={18} /> Fastest route
        </h2>
        <p className="mt-2 text-sm text-gray-500">Finding the fastest route…</p>
      </section>
    );
  }

  return (
    <section className="picked rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <GitBranch size={18} /> Fastest route
      </h2>

      {!route.found ? (
        <p className="mt-2 text-sm text-gray-600">
          No subway route right now. A line on the way may be suspended; check Line status below.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600">
            About <b>{route.minutes} min</b> ·{" "}
            {route.transfers === 0 ? "no transfers" : `${route.transfers} transfer${route.transfers > 1 ? "s" : ""}`}
          </p>

          <ol className="mt-3 space-y-2">
            {route.legs.map((leg, i) =>
              leg.kind === "ride" ? (
                <li key={i} className="flex items-center gap-3">
                  <RouteBullet route={leg.line} color={leg.color} textColor={leg.text_color} />
                  <div className="min-w-0 text-sm">
                    <p className="truncate">
                      {leg.from} → {leg.to}
                    </p>
                    <p className="text-xs text-gray-500">
                      {leg.stop_count} stop{leg.stop_count > 1 ? "s" : ""} · {Math.round(leg.minutes)} min
                    </p>
                  </div>
                </li>
              ) : (
                <li key={i} className="ml-11 flex items-center gap-1 text-xs text-gray-500">
                  <Footprints size={12} />
                  {leg.from === leg.to ? `Change platforms at ${leg.to}` : `Walk to ${leg.to}`} · {Math.round(leg.minutes)} min
                </li>
              )
            )}
          </ol>

          {/* What the algorithm did, for the curious (and for the demo). */}
          <p className="mt-3 text-xs text-gray-400">
            Explored {route.explored.toLocaleString()} of {route.graph_size.toLocaleString()} points in the live subway
            graph. Includes a 3-minute average wait each time you board.
          </p>
        </>
      )}
    </section>
  );
}
