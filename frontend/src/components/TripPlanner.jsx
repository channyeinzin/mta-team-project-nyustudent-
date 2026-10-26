// Person 4: trip planner — pick a start and a destination (or use the locate button for the
// station nearest you) and see the next trains that get you there.

import { useEffect, useRef, useState } from "react";
import { compareCommute, planTrip } from "../api.js";
import { ArrowUpDown, Footprints, LocateFixed, Sparkle, X } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";
import LineStatus from "./LineStatus.jsx";
import StationInput from "./StationInput.jsx";

// "1792875280" (Unix seconds) -> "5:42 PM"
const clock = (seconds) =>
  new Date(seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// One way to get there: one train, or two trains with a transfer.
function TripOption({ option, from, to, statusFor, alertColors }) {
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
        {firstLeg.from !== from && <li className="ml-11 flex items-center gap-1 text-xs text-gray-500"><Footprints size={12} /> Walk to {firstLeg.from}</li>}

        {option.legs.map((leg, i) => (
          <li key={i}>
            {/* Changing trains at a connected station, e.g. 6 Av (L) -> 14 St (1/2/3) */}
            {i > 0 && option.legs[i - 1].to !== leg.from && (
              <p className="mb-2 ml-11 flex items-center gap-1 text-xs text-gray-500"><Footprints size={12} /> Walk to {leg.from}</p>
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
                <LineStatus line={statusFor(leg.route)} alertColors={alertColors} />
              </div>
            </div>
          </li>
        ))}

        {lastLeg.to !== to && <li className="ml-11 flex items-center gap-1 text-xs text-gray-500"><Footprints size={12} /> Walk to {to}</li>}
      </ol>
    </div>
  );
}

export default function TripPlanner({ routeColors, isSavedTrip, onToggleTrip, tripToOpen, myLocation, onClose, statusFor, alertColors }) {
  const nearest = myLocation.nearby[0] ?? null; // the station closest to you (when location is on)
  const [from, setFrom] = useState(() => tripToOpen?.from ?? nearest);
  const [to, setTo] = useState(() => tripToOpen?.to ?? null);
  const [result, setResult] = useState(null);
  const [walking, setWalking] = useState(null); // { distance_miles, total_eta_min, estimate_only }
  const [message, setMessage] = useState("");
  const box = useRef(null);

  // Opened (or re-opened from "Directions" or a saved trip): fill in the stations,
  // starting from the station closest to you if no start was given, then scroll
  // here and put the cursor in the first empty box so you can just type.
  useEffect(() => {
    if (tripToOpen) {
      setFrom(tripToOpen.from ?? nearest);
      setTo(tripToOpen.to ?? null);
    }
    box.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setTimeout(() => box.current?.querySelector("input")?.focus(), 300);
  }, [tripToOpen]); // only when a new trip is opened

  // Location just found your closest station: use it as the start, if you haven't picked one.
  useEffect(() => {
    if (nearest) setFrom((current) => current ?? nearest);
  }, [nearest?.id]); // only when the closest station changes

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

  // The same trip on foot (distance and time), once per pair of stations.
  useEffect(() => {
    setWalking(null);
    if (!from || !to) return;
    let active = true;
    compareCommute(from.id, to.id)
      .then((data) => active && data.walking?.available && setWalking(data.walking))
      .catch(() => {}); // no walking line if it fails; the trains still show
    return () => {
      active = false;
    };
  }, [from, to]);

  // Locate button: start from the station closest to you (turns location on if needed).
  function startFromMyLocation() {
    if (nearest) setFrom(nearest);
    else myLocation.start(); // the effect above fills it in once the closest station is found
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <section ref={box} className="picked rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">Plan a trip</h2>
        <button onClick={onClose} title="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900">
          <X size={18} />
        </button>
      </div>

      <div className="space-y-2">
        <StationInput label="From" station={from} onChange={setFrom} routeColors={routeColors}>
          <button
            onClick={startFromMyLocation}
            title="Start from the station nearest me"
            className="rounded-xl border border-gray-300 px-3 py-2 hover:bg-gray-100"
          >
            <LocateFixed size={18} />
          </button>
        </StationInput>
        <StationInput label="To" station={to} onChange={setTo} routeColors={routeColors}>
          <button
            onClick={swap}
            title="Swap start and destination"
            className="rounded-xl border border-gray-300 px-3 py-2 hover:bg-gray-100"
          >
            <ArrowUpDown size={18} />
          </button>
        </StationInput>
      </div>

      {/* Save this start + destination to use again later, e.g. tomorrow's commute. */}
      {from && to && onToggleTrip && (
        <button
          onClick={() => onToggleTrip(from, to)}
          className="mt-3 flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
        >
          {isSavedTrip(from, to) ? (
            <>
              <Sparkle size={14} className="fill-current" /> Saved trip
            </>
          ) : (
            <>
              <Sparkle size={14} /> Save trip
            </>
          )}
        </button>
      )}

      {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}

      {result && (
        <div className="mt-4 space-y-2">
          {result.walk && (
            <p className="flex items-center gap-1.5 text-sm text-gray-600">
              <Footprints size={14} /> These stations are connected — just walk, no train needed.
            </p>
          )}
          {!result.walk && result.options.length === 0 && (
            <p className="text-sm text-gray-600">
              No trips found with at most one transfer right now. Try a nearby station.
            </p>
          )}
          {result.options.map((option, i) => (
            <TripOption
              key={i}
              option={option}
              from={result.from.name}
              to={result.to.name}
              statusFor={statusFor}
              alertColors={alertColors}
            />
          ))}
        </div>
      )}

      {/* Or skip the train: how far it is on foot. */}
      {walking && !result?.walk && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Footprints size={14} className="shrink-0" />
          Or walk: {walking.distance_miles} mi · about {Math.round(walking.total_eta_min)} min
          {walking.estimate_only && <span className="text-xs text-gray-400">(estimate)</span>}
        </p>
      )}
    </section>
  );
}
