// FR-04/FR-05: the same journey timed and priced by subway and on foot,
// so you can see what you trade for the fare.
//
// Every number here comes from the backend. Walking uses the real route when
// openrouteservice is set up, else an estimate the backend labels as one.
// (The backend also estimates taxi fares; the site doesn't show them.)

import { useEffect, useState } from "react";
import { compareCommute, getNearbyStations } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";
import StationInput from "./StationInput.jsx";

const money = (usd) => `$${usd.toFixed(2)}`;

// 12.4 -> "12 min"
const mins = (value) => `${Math.round(value)} min`;

// One mode's card. `fastest` draws the winning border.
function ModeCard({ icon, name, eta, cost, costNote, detail, fastest, unavailable, children }) {
  if (unavailable) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-3">
        <p className="flex items-center gap-2 font-semibold text-gray-500">
          <span aria-hidden="true">{icon}</span>
          {name}
        </p>
        <p className="mt-1 text-xs text-gray-500">{unavailable}</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 ${
        fastest ? "border-green-600 bg-green-50" : "border-gray-200"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <span aria-hidden="true">{icon}</span>
          {name}
        </p>
        {fastest && (
          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
            FASTEST
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <p className="text-2xl font-bold whitespace-nowrap">{eta}</p>
        {cost && <p className="text-sm font-semibold whitespace-nowrap text-gray-700">{cost}</p>}
      </div>

      {costNote && <p className="mt-0.5 text-[11px] text-gray-500">{costNote}</p>}
      {detail && <p className="mt-1 text-xs text-gray-600">{detail}</p>}
      {children}
    </div>
  );
}

// `bare`: leave out the box and title, when another section (App.jsx) already has them.
export default function CommuteCompare({ routeColors, bare = false }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");

  // Compare once both ends are picked, then refresh every 60 seconds.
  useEffect(() => {
    setResult(null);
    if (!from || !to) return;

    let active = true;

    function load() {
      compareCommute(from.id, to.id)
        .then((data) => {
          if (!active) return;
          setResult(data);
          setMessage("");
        })
        .catch((err) => {
          if (!active) return;
          setResult(null);
          setMessage(err.message);
        });
    }

    setMessage("Comparing your options…");
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [from, to]);

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

  // The soonest subway option, if the feed was fresh enough to trust.
  const bestSubway = result?.subway?.available ? result.subway.options[0] : null;
  // The backend also estimates a taxi, but we only show subway and walking.
  const walking = result?.walking;

  // Which available mode gets there first?
  const etas = [
    bestSubway && { mode: "subway", eta: bestSubway.total_eta_min },
    walking?.available && { mode: "walking", eta: walking.total_eta_min },
  ].filter(Boolean);
  const fastest = etas.length > 1 ? etas.reduce((a, b) => (a.eta <= b.eta ? a : b)).mode : null;

  // Alerts the backend matched to the legs of the recommended subway trip.
  const subwayAlerts = bestSubway
    ? bestSubway.legs.flatMap((leg) => leg.alerts || [])
    : [];

  return (
    <section className={bare ? "" : "rounded-2xl bg-white p-4 shadow-sm"}>
      {!bare && <h2 className="mb-1 text-lg font-bold">⚖️ Compare your options</h2>}
      <p className="mb-3 text-xs text-gray-500">
        Subway and walking for the same trip — time against cost.
      </p>

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
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard
              icon="🚇"
              name="Subway"
              fastest={fastest === "subway"}
              unavailable={
                bestSubway
                  ? null
                  : result.subway.reason || "No trip found with at most one transfer right now."
              }
              eta={bestSubway && mins(bestSubway.total_eta_min)}
              cost={bestSubway && money(bestSubway.fare_usd)}
              costNote={bestSubway && bestSubway.fare_source}
              detail={
                bestSubway &&
                `${bestSubway.transfers === 0 ? "Direct" : "1 transfer"} · arrives ${new Date(
                  bestSubway.arrive_time * 1000
                ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              }
            >
              {bestSubway && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {bestSubway.legs.map((leg, i) => (
                    <RouteBullet
                      key={i}
                      route={leg.route}
                      color={leg.color}
                      textColor={leg.text_color}
                      size="sm"
                    />
                  ))}
                </div>
              )}
            </ModeCard>

            <ModeCard
              icon="🚶"
              name="Walking"
              fastest={fastest === "walking"}
              unavailable={
                walking.available ? null : walking.reason || "Walking route unavailable."
              }
              eta={walking.available && mins(walking.total_eta_min)}
              cost={walking.available && "Free"}
              detail={
                walking.available &&
                `${walking.distance_miles} mi${walking.estimate_only ? " · estimated from the straight-line distance" : ""}`
              }
            />
          </div>

          {/* Service alerts the backend tied to this specific subway trip. */}
          {subwayAlerts.length > 0 && (
            <ul className="space-y-2">
              {subwayAlerts.map((alert, i) => (
                <li key={i} className="rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
                  <span className="font-semibold">{alert.type}: </span>
                  {alert.text}
                </li>
              ))}
            </ul>
          )}

          {bestSubway && !result.subway.alerts_available && (
            <p className="text-xs text-gray-500">
              Service alerts could not be checked for this trip.
            </p>
          )}

          <p className="text-[11px] text-gray-400">
            Subway times: {result.subway.source}
            {result.subway.source_age_seconds !== null &&
              ` · feed ${result.subway.source_age_seconds}s old`}
          </p>
        </div>
      )}
    </section>
  );
}
