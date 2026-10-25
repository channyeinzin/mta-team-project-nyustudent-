// Person 3: the live subway map — lines, stations and trains.
// Uses Leaflet, a free map library. Click a station to see its trains.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getSubwayRoutes, getSubwayStops, getSubwayTrains } from "../api.js";

// Lines with a yellow bullet use black text, like the real MTA signs.
const DARK_TEXT_ROUTES = ["N", "Q", "R", "W"];

// Keep the map around the five boroughs so it can't drift to Long Island or New Jersey.
const NYC_BOUNDS = [
  [40.45, -74.3], // southwest corner
  [40.95, -73.65], // northeast corner
];

// A train marker. Zoomed in: a colored bullet with the line letter, like real MTA signs.
// Zoomed out: a small plain dot, so Manhattan doesn't turn into a pile of overlapping bullets.
function trainIcon(route, color, showLetter) {
  const size = showLetter ? 20 : 10;
  const textColor = DARK_TEXT_ROUTES.includes(route) ? "#000" : "#fff";
  return L.divIcon({
    className: "", // removes Leaflet's default white box
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};color:${textColor};
      border:${showLetter ? 2 : 1.5}px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font:700 11px/1 Helvetica,Arial,sans-serif;">${showLetter ? route : ""}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2], // the center of the circle sits on the train's position
  });
}

// Station dots get bigger as you zoom in, so the zoomed-out map isn't cluttered.
function stationRadius(zoom) {
  if (zoom >= 15) return 6;
  if (zoom >= 13) return 4;
  return 2;
}

export default function SubwayMap({ selectedStation, onSelectStation }) {
  const mapDiv = useRef(null);     // the <div> the map is drawn into
  const map = useRef(null);        // the Leaflet map object
  const stations = useRef({});     // station id -> [lat, lon], for zooming to a station
  const onSelect = useRef(onSelectStation);
  onSelect.current = onSelectStation;

  // Create the map once, when the component first appears.
  useEffect(() => {
    // preferCanvas makes hundreds of dots fast. maxBounds keeps the view on NYC.
    const m = L.map(mapDiv.current, {
      preferCanvas: true,
      maxBounds: NYC_BOUNDS,
      maxBoundsViscosity: 0.8,
      minZoom: 10,
    }).setView([40.73, -73.94], 12);
    map.current = m;

        // Background map from OpenStreetMap, turned gray so the colored subway lines stand out.
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    tiles.getContainer().style.filter = "grayscale(100%) brightness(1.05) contrast(0.9)";

    const stationLayer = L.layerGroup();
    const trainLayer = L.layerGroup();
    let timer;

    // Resize every station dot whenever the zoom level changes.
    function resizeStations() {
      const r = stationRadius(m.getZoom());
      stationLayer.eachLayer((dot) => dot.setRadius(r));
    }
        // When the zoom changes, resize the stations and redraw the trains.
    m.on("zoomend", () => {
      resizeStations();
      drawTrains();
    });

    let lastTrains = null; // the latest train data, kept so we can redraw on zoom

    // Draw the trains we have, as letters or dots depending on the zoom level.
    function drawTrains() {
      if (!lastTrains) return;
      trainLayer.clearLayers(); // remove the old trains before drawing new ones
      const showLetters = m.getZoom() >= 13;
      for (const train of lastTrains.features) {
        const [lon, lat] = train.geometry.coordinates;
        const t = train.properties;
        L.marker([lat, lon], { icon: trainIcon(t.route, t.color, showLetters) })
          .bindTooltip(`${t.route} train to ${t.destination}<br>Next stop: ${t.next_stop}`)
          .addTo(trainLayer);
      }
    }

    // Download fresh train positions, then draw them.
    async function loadTrains() {
      try {
        lastTrains = await getSubwayTrains();
        drawTrains();
      } catch {
        // Keep showing the old trains if one refresh fails.
      }
    }

    async function load() {
      // 1. The lines, in their official colors.
      const routes = await getSubwayRoutes();
      L.geoJSON(routes, {
        style: (f) => ({ color: f.properties.color, weight: 4, opacity: 0.9, lineCap: "round" }),
      }).addTo(m);

      // 2. A white dot for every station (size depends on zoom).
      const stops = await getSubwayStops();
      for (const stop of stops.features) {
        const [lon, lat] = stop.geometry.coordinates;
        const station = { ...stop.properties, lat, lon };
        stations.current[station.id] = [lat, lon];
        L.circleMarker([lat, lon], {
          radius: stationRadius(m.getZoom()),
          color: "#333",
          weight: 1,
          fillColor: "#fff",
          fillOpacity: 1,
        })
          .bindTooltip(station.name)
          .on("click", () => onSelect.current(station))
          .addTo(stationLayer);
      }
      stationLayer.addTo(m);

      // Fit the whole subway system on screen, whatever the screen size.
      m.fitBounds(L.latLngBounds(Object.values(stations.current)), { padding: [20, 20] });

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
      <div ref={mapDiv} className="relative z-0 h-[420px] w-full lg:h-[560px]" />
    </section>
  );
}