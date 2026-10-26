// "My location": follows where the user is (with their permission) and finds the
// stations closest to them. Turn it on with start(), and off again with stop().
// The search box and the map both use this, so they always show the same thing.

import { useEffect, useRef, useState } from "react";
import { getNearbyStations } from "./api.js";

// Rough distance in meters between two points — plenty accurate inside one city.
function metersBetween(a, b) {
  const dLat = (b.lat - a.lat) * 111320;
  const dLon = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

export default function useMyLocation() {
  const [position, setPosition] = useState(null); // { lat, lon, accuracy (meters) }
  const [nearby, setNearby] = useState([]);       // closest stations, closest first
  const [status, setStatus] = useState("off");    // "off" | "finding" | "on" | "error"
  const watchId = useRef(null);
  const lastLookup = useRef(null);                // where we last looked up nearby stations

  function stop() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    lastLookup.current = null;
    setPosition(null);
    setNearby([]);
    setStatus("off");
  }

  function start() {
    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("finding");
    // watchPosition keeps sending updates, so the dot follows the user as they walk.
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
        setPosition(here);
        setStatus("on");
        // Look up the closest stations the first time, and again after walking ~150 m.
        if (!lastLookup.current || metersBetween(lastLookup.current, here) > 150) {
          lastLookup.current = here;
          getNearbyStations(here.lat, here.lon)
            .then((data) => setNearby(data.stations))
            .catch(() => {}); // keep the last list if one lookup fails
        }
      },
      () => {
        stop();
        setStatus("error");
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  }

  // Stop following the user when the page closes.
  useEffect(() => () => watchId.current !== null && navigator.geolocation.clearWatch(watchId.current), []);

  return { position, nearby, status, start, stop };
}
