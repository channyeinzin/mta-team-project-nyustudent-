// A line's status in one small row: a colored dot and the status.
// Good Service stays quiet. Anything else gets a "Why?" button that opens the MTA's alerts.
// Used under each train (ArrivalCards) and each ride in a trip (TripPlanner).

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AlertText } from "./StatusDashboard.jsx";

// Green = good, yellow/orange = work or changes, red = trouble.
const STATUS_DOT = {
  "Good Service": "bg-green-500",
  "Planned Work": "bg-yellow-400",
  "Service Change": "bg-orange-500",
  Suspended: "bg-red-500",
  Delays: "bg-red-500",
};

export default function LineStatus({ line, alertColors }) {
  const [showWhy, setShowWhy] = useState(false);
  if (!line) return null;
  const hasProblem = line.status !== "Good Service";

  return (
    <>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[line.status]}`} />
        <span className={hasProblem ? "font-semibold text-gray-800" : "text-gray-500"}>{line.status}</span>
        {hasProblem && (
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="ml-1 flex items-center gap-0.5 rounded-full border border-gray-300 px-2 py-0.5 font-medium text-gray-700 hover:bg-gray-100"
          >
            {showWhy ? "Hide" : "Why?"}
            <ChevronDown size={12} className={`transition ${showWhy ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {showWhy && hasProblem && (
        <div className="picked mt-2 max-h-60 space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-2.5">
          {line.alerts.length === 0 && <p className="text-sm text-gray-600">The MTA hasn't said why yet.</p>}
          {line.alerts.map((alert, i) => (
            <div key={i} className="text-sm">
              <p className="mb-0.5 text-xs font-semibold text-gray-500 uppercase">{alert.type}</p>
              <p className="leading-6">
                <AlertText text={alert.text} colors={alertColors} />
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
