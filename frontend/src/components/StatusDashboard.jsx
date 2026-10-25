// Person 3: the service status dashboard — every line and how it's running.
// Click a line to see its alerts in a popup.

import { useEffect, useState } from "react";
import { getStatus } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";

// Tailwind classes for each status.
const STATUS_STYLES = {
  "Good Service": "bg-green-100 text-green-800",
  "Planned Work": "bg-yellow-100 text-yellow-800",
  "Service Change": "bg-orange-100 text-orange-800",
  Suspended: "bg-red-100 text-red-800",
  Delays: "bg-red-100 text-red-800",
};

// MTA alert text writes lines like "[N][R] trains are delayed".
// This swaps each [N] for a little colored bullet.
function AlertText({ text, colors }) {
  const parts = text.split(/\[(\w+)\]/); // "[N] trains" -> ["", "N", " trains"]
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <RouteBullet key={i} route={part} size="sm" {...colors[part]} />
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function StatusDashboard() {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [openRoute, setOpenRoute] = useState(null); // the line whose alerts are showing

  // Load the status now, then refresh every minute.
  useEffect(() => {
    function load() {
      getStatus()
        .then((data) => {
          setLines(data.lines);
          setError(null);
        })
        .catch((err) => setError(err.message));
    }
    load();
    const timer = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(timer);
  }, []);

  // Press Esc to close the popup.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpenRoute(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // { "N": { color, textColor }, ... } for the bullets inside alert text
  const colors = Object.fromEntries(
    lines.map((l) => [l.route, { color: l.color, textColor: l.text_color }])
  );
  const open = lines.find((l) => l.route === openRoute);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Service Status</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && lines.length === 0 && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
        {lines
          .filter((l) => !l.route.endsWith("X")) // hide 6X/7X/FX, they share the 6/7/F status
          .map((line) => (
            <button
              key={line.route}
              onClick={() => setOpenRoute(openRoute === line.route ? null : line.route)}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition hover:border-gray-400 ${
                openRoute === line.route ? "border-gray-800" : "border-gray-200"
              }`}
            >
              <RouteBullet route={line.route} color={line.color} textColor={line.text_color} />
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[line.status]}`}>
                {line.status}
              </span>
            </button>
          ))}
      </div>

      {/* Details for the line you clicked, in a popup so they're always on screen */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpenRoute(null)} // clicking the dark background closes it
        >
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()} // clicking inside the popup doesn't close it
          >
            <div className="mb-3 flex items-center gap-3">
              <RouteBullet route={open.route} color={open.color} textColor={open.text_color} />
              <h3 className="flex-1 font-semibold">{open.name}</h3>
              <button
                onClick={() => setOpenRoute(null)}
                className="text-2xl leading-none text-gray-400 hover:text-gray-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <span
              className={`mb-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[open.status]}`}
            >
              {open.status}
            </span>

            <div className="space-y-3">
              {open.alerts.length === 0 && (
                <p className="text-sm text-gray-600">Trains are running normally.</p>
              )}
              {open.alerts.map((alert, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase text-gray-500">{alert.type}</p>
                  <p className="leading-6">
                    <AlertText text={alert.text} colors={colors} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}