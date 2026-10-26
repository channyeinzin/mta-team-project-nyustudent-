// FR-06: current conditions where you are travelling, plus the MTA-independent
// cautions the backend derives from them (slippery platforms, reduced visibility).
// The backend never turns weather into a numeric delay, so neither do we.

import { useEffect, useState } from "react";
import { getWeather } from "../api.js";

// Union Sq: a sensible default before you pick a station.
const DEFAULT_PLACE = { name: "Midtown Manhattan", lat: 40.7348, lon: -73.9907 };

// Open-Meteo WMO codes -> an emoji, so the card reads at a glance.
function icon(code) {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if (code >= 85 && code <= 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

const toF = (c) => Math.round((c * 9) / 5 + 32);

// 873 -> "15 min ago"
function ago(seconds) {
  if (seconds === null || seconds === undefined) return "time unknown";
  if (seconds < 90) return "just now";
  return `${Math.round(seconds / 60)} min ago`;
}

export default function WeatherCard({ station }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const place = station ? { name: station.name, lat: station.lat, lon: station.lon } : DEFAULT_PLACE;

  // Refresh when you pick a different station, and every 10 minutes.
  useEffect(() => {
    let active = true;

    function load() {
      getWeather(place.lat, place.lon)
        .then((result) => {
          if (!active) return;
          setData(result);
          setError("");
        })
        .catch((err) => active && setError(err.message));
    }

    load();
    const timer = setInterval(load, 600000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [place.lat, place.lon]);

  if (error) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">🌤️ Conditions</h2>
        <p className="text-sm text-gray-500">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">🌤️ Conditions</h2>
        <p className="text-sm text-gray-500">Checking the weather…</p>
      </section>
    );
  }

  // The provider was unreachable or its data was stale: say so plainly.
  if (!data.available) {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-lg font-bold">🌤️ Conditions</h2>
        <p className="text-sm text-gray-500">{data.reason || "Weather is unavailable right now."}</p>
      </section>
    );
  }

  const w = data.weather;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">🌤️ Conditions</h2>
          <p className="truncate text-xs text-gray-500">near {place.name}</p>
        </div>
        <p className="text-xs whitespace-nowrap text-gray-400">{ago(data.source_age_seconds)}</p>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-5xl leading-none">{icon(w.weather_code)}</span>
        <div className="min-w-0">
          <p className="text-3xl font-bold">
            {toF(w.temperature_c)}°F
            <span className="ml-2 text-base font-normal text-gray-500">
              {Math.round(w.temperature_c)}°C
            </span>
          </p>
          <p className="truncate text-sm text-gray-600">{w.condition}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
        <div>
          <dt className="text-xs text-gray-500">Wind</dt>
          <dd className="text-sm font-semibold">{Math.round(w.wind_speed_kmh)} km/h</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Rain</dt>
          <dd className="text-sm font-semibold">{w.rain_mm} mm</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Snow</dt>
          <dd className="text-sm font-semibold">{w.snowfall_cm} cm</dd>
        </div>
      </dl>

      {data.cautions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.cautions.map((caution) => (
            <li
              key={caution}
              className="flex gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900"
            >
              <span aria-hidden="true">⚠️</span>
              <span>{caution}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-gray-400">Source: {data.source}</p>
    </section>
  );
}
