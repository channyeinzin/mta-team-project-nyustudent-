// Person 3 (search bar) + Person 4 (station search features):
// type a station name, or press 📍 to find the stations closest to you.

import { useEffect, useState } from "react";
import { getNearbyStations, searchStations } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";

export default function StationSearch({ onSelect, routeColors }) {
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

  function findNearMe() {
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        getNearbyStations(position.coords.latitude, position.coords.longitude)
          .then((data) => {
            setResults(data.stations);
            setMessage("Closest stations to you:");
          })
          .catch((err) => setMessage(err.message));
      },
      () => setMessage("Location not available. Try typing a station name.")
    );
  }

  function choose(station) {
    onSelect(station);
    setResults([]);
    setQuery("");
    setMessage("");
  }

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
        <button
          onClick={findNearMe}
          title="Stations near me"
          className="rounded-xl border border-gray-300 px-3 hover:bg-gray-100"
        >
          📍
        </button>
      </div>

      {message && <p className="mt-2 text-sm text-gray-500">{message}</p>}

      {results.length > 0 && (
        <ul className="mt-2 divide-y">
          {results.map((station) => (
            <li key={station.id}>
              <button
                onClick={() => choose(station)}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-gray-50"
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
          ))}
        </ul>
      )}
    </section>
  );
}
