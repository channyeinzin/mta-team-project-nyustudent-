// Person 3: train arrival cards for the station you picked.
// Refreshes every 30 seconds so the minutes count down.

import { useEffect, useState } from "react";
import { getArrivals } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";

function ArrivalCard({ train }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
      <RouteBullet route={train.route} color={train.color} textColor={train.text_color} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{train.destination}</p>
        <p className="text-xs text-gray-500">{train.direction}</p>
      </div>
      <p className="text-xl font-bold whitespace-nowrap">
        {train.minutes_away === 0 ? "Now" : `${train.minutes_away} min`}
      </p>
    </div>
  );
}

export default function ArrivalCards({ station, isFavorite, onToggleFavorite }) {
  const [arrivals, setArrivals] = useState(null);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    setArrivals(null);
    function load() {
      getArrivals(station.id)
        .then((data) => {
          setArrivals(data.arrivals);
          setUpdatedAt(new Date(data.updated_at * 1000));
          setError(null);
        })
        .catch((err) => setError(err.message));
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [station.id]);

  // Two columns: one per direction.
  const directions = ["Northbound", "Southbound"];

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{station.name}</h2>
          {updatedAt && <p className="text-xs text-gray-500">Updated {updatedAt.toLocaleTimeString()}</p>}
        </div>
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            {isFavorite ? "★ Saved" : "☆ Save"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && arrivals === null && <p className="text-sm text-gray-500">Loading trains…</p>}
      {arrivals?.length === 0 && <p className="text-sm text-gray-500">No trains coming right now.</p>}

      {arrivals?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {directions.map((direction) => (
            <div key={direction} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-600">{direction}</h3>
              {arrivals
                .filter((t) => t.direction === direction)
                .slice(0, 5)
                .map((train, i) => (
                  <ArrivalCard key={i} train={train} />
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
