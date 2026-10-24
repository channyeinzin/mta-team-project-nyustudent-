// Person 3: the live subway map — lines, stations and trains.
// Uses Leaflet, a free map library. Click a station to see its trains.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSubwayRoutes, getSubwayStops, getSubwayTrains } from "../api.js";

export default function SubwayMap({ selectedStation, onSelectStation }) {
  const mapDiv = useRef(null);     // the <div> the map is drawn into
  const map = useRef(null);        // the Leaflet map object
  const stations = useRef({});     // station id -> [lat, lon], for zooming to a station
  const onSelect = useRef(onSelectStation);
  onSelect.current = onSelectStation;

  // Create the map once, when the component first appears.
  useEffect(() => {
    // Center between Manhattan, Brooklyn and Queens. preferCanvas makes hundreds of dots fast.
    const m = L.map(mapDiv.current, { preferCanvas: true }).setView([40.72, -73.93], 12);
    map.current = m;

    // Background map pictures ("tiles") from OpenStreetMap (free, no API key).
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);

    const trainLayer = L.layerGroup();
    let timer;

    async function loadTrains() {
      try {
        const data = await getSubwayTrains();
        trainLayer.clearLayers(); // remove the old dots before drawing new ones
        for (const train of data.features) {
          const [lon, lat] = train.geometry.coordinates;
          const t = train.properties;
          L.circleMarker([lat, lon], { radius: 6, color: "#fff", weight: 2, fillColor: t.color, fillOpacity: 1 })
            .bindTooltip(`${t.route} train to ${t.destination}<br>Next stop: ${t.next_stop}`)
            .addTo(trainLayer);
        }
      } catch {
        // Keep showing the old trains if one refresh fails.
      }
    }

    async function load() {
      // 1. The lines, in their official colors.
      const routes = await getSubwayRoutes();
      L.geoJSON(routes, {
        style: (f) => ({ color: f.properties.color, weight: 3, opacity: 0.8 }),
      }).addTo(m);

      // 2. A small white dot for every station.
      const stops = await getSubwayStops();
      for (const stop of stops.features) {
        const [lon, lat] = stop.geometry.coordinates;
        const station = { ...stop.properties, lat, lon };
        stations.current[station.id] = [lat, lon];
        L.circleMarker([lat, lon], { radius: 4, color: "#333", weight: 1, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(station.name)
          .on("click", () => onSelect.current(station))
          .addTo(m);
      }

      // 3. The trains, on top. Refreshed every 30 seconds.
      trainLayer.addTo(m);
      await loadTrains();
      timer = setInterval(loadTrains, 30000);
    }
    load().catch(() => {});

    // Clean up when the component goes away.
    return () => {
      clearInterval(timer);
      m.remove();
    };
  }, []);

  // When a station is picked (from the map, search or favorites), zoom to it.
  useEffect(() => {
    const position = selectedStation && stations.current[selectedStation.id];
    if (position) map.current.flyTo(position, 15);
  }, [selectedStation]);

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* z-0 keeps the map below the login popup */}
      <div ref={mapDiv} className="relative z-0 h-80 w-full lg:h-[420px]" />
    </section>
  );
}
