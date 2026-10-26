// Person 3 (search bar) + Person 4 (station search features):
// type a station name, or press the locate button to find the stations closest to you.
// "My location" lives in App.jsx (useMyLocation) so the map shows the same thing.

import { useEffect, useState } from "react";
import { searchStations } from "../api.js";
import { LocateFixed, Navigation, X } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";

export default function StationSearch({ onSelect, myLocation, routeColors }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");

  // Search as you type. We wait 250 ms after the last key so we don't
  // send a request for every single letter.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchStations(query.trim())
        .then((data) => {
          setResults(data.stations);
          setMessage(data.stations.length === 0 ? "No stations found." : "");
        })
        .catch((err) => setMessage(err.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(station) {
    onSelect(station);
    setResults([]);
    setQuery("");
    setMessage("");
  }

  // One station row: name, walking distance (for nearby stations) and its lines.
  const stationRow = (station) => (
    <li key={station.id}>
      <button
        onClick={() => choose(station)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-teal-50 active:bg-teal-100"
      >
        <span>
          {station.name}
          {station.distance_miles !== undefined && (
            <span className="ml-2 text-xs text-gray-500">
              {station.distance_miles} mi · ~{Math.round(station.distance_miles * 20)} min walk
            </span>
          )}
        </span>
        <span className="flex gap-1">
          {station.routes.map((r) => (
            <RouteBullet key={r} route={r} size="sm" {...routeColors[r]} />
          ))}
        </span>
      </button>
    </li>
  );

  const locationOn = myLocation.status !== "off" && myLocation.status !== "error";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a station, e.g. Union Sq"
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 outline-none focus:border-gray-800"
        />
        {/* Location on/off. Filled in when it's on. */}
        <button
          onClick={locationOn ? myLocation.stop : myLocation.start}
          title={locationOn ? "Turn off my location" : "Show my location and the stations near me"}
          className={`rounded-xl border px-3 ${
            locationOn ? "border-sky-500 bg-sky-500 text-[#fff]" : "border-gray-300 hover:bg-gray-100"
          }`}
        >
          <LocateFixed size={18} />
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-gray-500">{message}</p>}

      {results.length > 0 && <ul className="mt-2 divide-y">{results.map(stationRow)}</ul>}

      {/* Near you: shown while location is on (and you're not typing a search). */}
      {results.length === 0 && myLocation.status === "finding" && (
        <p className="mt-3 text-sm text-gray-500">Finding your location…</p>
      )}
      {results.length === 0 && myLocation.status === "error" && (
        <p className="mt-3 text-sm text-gray-500">Location not available. Try typing a station name.</p>
      )}
      {results.length === 0 && myLocation.status === "on" && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-sky-600">
              <Navigation size={14} /> Near you
            </h3>
            <button
              onClick={myLocation.stop}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <X size={12} /> Turn off location
            </button>
          </div>
          {myLocation.nearby.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Looking for stations near you…</p>
          ) : (
            <ul className="mt-1 divide-y">{myLocation.nearby.map(stationRow)}</ul>
          )}
        </div>
      )}
    </section>
  );
}
