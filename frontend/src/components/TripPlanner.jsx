// Person 4: trip planner — pick a start and a destination (or use 📍 for the
// station nearest you) and see the next trains that get you there.

import { useEffect, useState } from "react";
import { getNearbyStations, planTrip } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";
import StationInput from "./StationInput.jsx";

// "1792875280" (Unix seconds) -> "5:42 PM"
const clock = (seconds) =>
  new Date(seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// One way to get there: one train, or two trains with a transfer.
function TripOption({ option, from, to }) {
  const firstLeg = option.legs[0];
  const lastLeg = option.legs[option.legs.length - 1];

  const leavesIn = Math.max(0, Math.round((option.depart_time * 1000 - Date.now()) / 60000));

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="font-semibold">
          Arrive {clock(option.arrive_time)}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {option.minutes} min · {option.transfers === 0 ? "direct" : "1 transfer"}
          </span>
        </p>
        <p className="text-sm whitespace-nowrap text-gray-600">{leavesIn === 0 ? "Leaves now" : `Leaves in ${leavesIn} min`}</p>
      </div>

      <ol className="space-y-2">
        {/* Boarding at a connected station, e.g. you picked Port Authority but board at Times Sq */}
        {firstLeg.from !== from && <li className="ml-11 text-xs text-gray-500">🚶 Walk to {firstLeg.from}</li>}

        {option.legs.map((leg, i) => (
          <li key={i}>
            {/* Changing trains at a connected station, e.g. 6 Av (L) -> 14 St (1/2/3) */}
            {i > 0 && option.legs[i - 1].to !== leg.from && (
              <p className="mb-2 ml-11 text-xs text-gray-500">🚶 Walk to {leg.from}</p>
            )}
            <div className="flex items-center gap-3">
              <RouteBullet route={leg.route} color={leg.color} textColor={leg.text_color} />
              <div className="min-w-0 text-sm">
                <p className="truncate">
                  {leg.from} → {leg.to}
                </p>
                <p className="text-xs text-gray-500">
                  {clock(leg.depart_time)} – {clock(leg.arrive_time)} · toward {leg.toward}
                </p>
              </div>
            </div>
          </li>
        ))}

        {lastLeg.to !== to && <li className="ml-11 text-xs text-gray-500">🚶 Walk to {to}</li>}
      </ol>
    </div>
  );
}

export default function TripPlanner({ routeColors }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  // Once both stations are picked, find trips — and refresh every 30 seconds.
  useEffect(() => {
    setResult(null);
    if (!from || !to) return;

    function load() {
      planTrip(from.id, to.id)
        .then((data) => {
          setResult(data);
          setMessage("");
        })
        .catch((err) => setMessage(err.message));
    }
    setMessage("Finding trips…");
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [from, to]);

  // 📍: start from the station closest to you.
  function startFromMyLocation() {
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        getNearbyStations(position.coords.latitude, position.coords.longitude)
          .then((data) => {
            setFrom(data.stations[0]);
            setMessage("");
          })
          .catch((err) => setMessage(err.message)),
      () => setMessage("Location not available. Type your start station instead.")
    );
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">🧭 Plan a trip</h2>

      <div className="space-y-2">
        <StationInput label="From" station={from} onChange={setFrom} routeColors={routeColors}>
          <button
            onClick={startFromMyLocation}
            title="Start from the station nearest me"
            className="rounded-xl border border-gray-300 px-3 py-2 hover:bg-gray-100"
          >
            📍
          </button>
        </StationInput>
        <StationInput label="To" station={to} onChange={setTo} routeColors={routeColors}>
          <button
            onClick={swap}
            title="Swap start and destination"
            className="rounded-xl border border-gray-300 px-3 py-2 hover:bg-gray-100"
          >
            ⇅
          </button>
        </StationInput>
      </div>

      {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}

      {result && (
        <div className="mt-4 space-y-2">
          {result.walk && (
            <p className="text-sm text-gray-600">
              These stations are connected — just walk, no train needed. 🚶
            </p>
          )}
          {!result.walk && result.options.length === 0 && (
            <p className="text-sm text-gray-600">
              No trips found with at most one transfer right now. Try a nearby station.
            </p>
          )}
          {result.options.map((option, i) => (
            <TripOption key={i} option={option} from={result.from.name} to={result.to.name} />
          ))}
        </div>
      )}
    </section>
  );
}
