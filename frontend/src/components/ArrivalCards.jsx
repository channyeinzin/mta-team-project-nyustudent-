// Person 3: train arrival cards for the station you picked.
// Refreshes every 30 seconds so the minutes count down.

import { useEffect, useState } from "react";
import { getArrivals } from "../api.js";
import { Sparkle } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";
import LineStatus from "./LineStatus.jsx";

// The backend says "Northbound"/"Southbound"; riders say "Uptown"/"Downtown".
const directionLabel = { Northbound: "Uptown", Southbound: "Downtown" };

// One train: its line, where it's going, when it arrives, and how its line is running.
function ArrivalCard({ train, line, alertColors }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-3">
        <RouteBullet route={train.route} color={train.color} textColor={train.text_color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{train.destination}</p>
          <LineStatus line={line} alertColors={alertColors} />
        </div>
        <p className="text-xl font-bold whitespace-nowrap">
          {train.minutes_away === 0 ? "Now" : `${train.minutes_away} min`}
        </p>
      </div>
    </div>
  );
}

export default function ArrivalCards({ station, isFavorite, onToggleFavorite, statusFor, alertColors }) {
  const [arrivals, setArrivals] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setArrivals(null);
    function load() {
      getArrivals(station.id)
        .then((data) => {
          setArrivals(data.arrivals);
          setError(null);
        })
        .catch((err) => setError(err.message));
    }
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [station.id]);

  // One list per direction.
  const directions = ["Northbound", "Southbound"];

  return (
    // A quick teal glow ("picked") when you choose a station, so you notice it changed.
    <section className="picked rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Trains at</p>
          <h2 className="text-xl font-bold">{station.name}</h2>
          {station.borough && <p className="text-sm text-gray-500">{station.borough}</p>}
        </div>
        <button
          onClick={onToggleFavorite}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100"
        >
          <Sparkle size={14} className={isFavorite ? "fill-current" : ""} />
          {isFavorite ? "Saved" : "Save"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && arrivals === null && <p className="text-sm text-gray-500">Loading trains…</p>}
      {arrivals?.length === 0 && <p className="text-sm text-gray-500">No trains coming right now.</p>}

      {arrivals?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">{/* one column in the narrow side panel */}
          {directions.map((direction) => (
            <div key={direction} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500">{directionLabel[direction]}</h3>
              {arrivals
                .filter((t) => t.direction === direction)
                .slice(0, 3)
                .map((train, i) => (
                  <ArrivalCard
                    key={`${train.route}-${train.destination}-${i}`} // stays the same when times update, so "Why?" stays open
                    train={train}
                    line={statusFor(train.route)}
                    alertColors={alertColors}
                  />
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
