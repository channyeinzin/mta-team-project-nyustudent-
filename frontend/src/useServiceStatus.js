// How every line is running (Good Service, Delays…), refreshed every minute.
// Loaded once in App.jsx and shared by the station card and the trip planner.

import { useEffect, useState } from "react";
import { getStatus } from "./api.js";

export default function useServiceStatus() {
  const [lines, setLines] = useState({}); // route -> { status, alerts, name, color, text_color }

  useEffect(() => {
    function load() {
      getStatus()
        .then((data) => setLines(Object.fromEntries(data.lines.map((l) => [l.route, l]))))
        .catch(() => {}); // no status if the feed is down; everything else still works
    }
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  // "6X" (6 express) uses the 6's status.
  const statusFor = (route) => lines[route] ?? lines[route.replace(/X$/, "")];

  // Line colors for the bullets inside alert text.
  const alertColors = Object.fromEntries(
    Object.values(lines).map((l) => [l.route, { color: l.color, textColor: l.text_color }])
  );

  return { statusFor, alertColors };
}
