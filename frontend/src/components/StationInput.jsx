// A text box that suggests stations as you type. Shared by the trip planner
// and the commute comparison, so both pick stations the same way.

import { useEffect, useState } from "react";
import { searchStations } from "../api.js";
import { X } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";

export default function StationInput({ label, station, onChange, routeColors, children }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchStations(query.trim())
        .then((data) => setResults(data.stations))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(s) {
    onChange(s);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span className="w-10 text-sm font-semibold text-gray-500">{label}</span>
        {station ? (
          // A station is picked: show it, with an X to clear it.
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 px-3 py-2">
            <span className="flex-1 truncate">{station.name}</span>
            <span className="flex gap-1">
              {station.routes.map((r) => (
                <RouteBullet key={r} route={r} size="sm" {...routeColors[r]} />
              ))}
            </span>
            <button onClick={() => onChange(null)} className="text-gray-400 hover:text-gray-800" title="Clear">
              <X size={16} />
            </button>
          </div>
        ) : (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Station name"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 outline-none focus:border-gray-800"
          />
        )}
        {children}
      </div>

      {results.length > 0 && (
        <ul className="absolute right-0 left-12 z-10 mt-1 divide-y rounded-xl border bg-white shadow-lg">
          {results.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => choose(s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
              >
                <span>{s.name}</span>
                <span className="flex gap-1">
                  {s.routes.map((r) => (
                    <RouteBullet key={r} route={r} size="sm" {...routeColors[r]} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
