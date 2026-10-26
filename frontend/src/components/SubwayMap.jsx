// Person 3: the live subway map — lines, stations and trains.
// Uses Leaflet, a free map library. Click a station to see its trains.
// Click a line (or its bullet under the map) to highlight just that line.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Maximize2, Minimize2, X } from "lucide-react";
import { getSubwayRoutes, getSubwayStops, getSubwayTrains } from "../api.js";
import RouteBullet from "./RouteBullet.jsx";

// Lines with a yellow bullet use black text, like the real MTA signs.
const DARK_TEXT_ROUTES = ["N", "Q", "R", "W"];

// The order the MTA lists its lines in.
const LINE_ORDER = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "GS", "FS", "H", "SI"];

// Express runs ("6X", "7X", "FX") belong to their line, so "6X" highlights with the 6.
const lineOf = (route) => route.replace(/X$/, "");

// The gray background map, made dark (inverted) in dark mode.
const TILE_FILTER = {
  light: "grayscale(100%) brightness(1.05) contrast(0.9)",
  dark: "grayscale(100%) invert(100%) brightness(0.85) contrast(0.9)",
};

// Keep the map around the five boroughs so it can't drift to Long Island or New Jersey.
const NYC_BOUNDS = [
  [40.45, -74.3], // southwest corner
  [40.95, -73.65], // northeast corner
];

// Styles for the selected station: a bright teal dot with a white ring that pulses,
// and a teal name label, so it's obvious which station you picked.
const SELECTED_CSS = `
  .selected-station {
    width: 26px; height: 26px; border-radius: 50%;
    background: #0d9488; border: 4px solid #fff;
    animation: station-pulse 1.4s ease-out infinite;
  }
  @keyframes station-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(13, 148, 136, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4); }
    100% { box-shadow: 0 0 0 22px rgba(13, 148, 136, 0), 0 2px 6px rgba(0, 0, 0, 0.4); }
  }
  .leaflet-container .leaflet-tooltip.selected-label {
    background: #0d9488; color: #fff; border: none;
    font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 999px;
    box-shadow: 0 2px 8px rgba(13, 148, 136, 0.5);
  }
  .leaflet-container .leaflet-tooltip-top.selected-label::before { border-top-color: #0d9488; }

  /* My location: a sky-blue dot with a soft pulse, like phone map apps. */
  .my-location {
    width: 18px; height: 18px; border-radius: 50%;
    background: #0ea5e9; border: 3px solid #fff;
    animation: me-pulse 2s ease-out infinite;
  }
  @keyframes me-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.6), 0 1px 4px rgba(0, 0, 0, 0.4); }
    100% { box-shadow: 0 0 0 18px rgba(14, 165, 233, 0), 0 1px 4px rgba(0, 0, 0, 0.4); }
  }
  /* The closest station to you: a sky-blue ring with a label. */
  .closest-station {
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff; border: 4px solid #0ea5e9;
  }
  .leaflet-container .leaflet-tooltip.closest-label {
    background: #0ea5e9; color: #fff; border: none;
    font-weight: 600; font-size: 12px; padding: 3px 9px; border-radius: 999px;
  }
  .leaflet-container .leaflet-tooltip-top.closest-label::before { border-top-color: #0ea5e9; }

  /* A train that just left for its next station: bigger and brighter, glowing in its line color. */
  .train-moved { animation: train-moved 2.6s ease-out; }
  @keyframes train-moved {
    0%   { transform: scale(1.5); filter: brightness(1.5); box-shadow: 0 0 14px 6px var(--glow); }
    70%  { transform: scale(1.15); filter: brightness(1.2); box-shadow: 0 0 10px 3px var(--glow); }
    100% { transform: scale(1); filter: brightness(1); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4); }
  }
  /* A train that just appeared on the map. */
  .train-in { animation: train-in 0.6s ease-out; }
  @keyframes train-in {
    0% { transform: scale(0); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .train-moved, .train-in { animation: none; }
  }
`;

// How long a train takes to glide to its next station on screen.
const GLIDE_MS = 2500;
// Smooth start and stop, like a real train.
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const myLocationIcon = L.divIcon({ className: "", html: `<div class="my-location"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const closestIcon = L.divIcon({ className: "", html: `<div class="closest-station"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

// The marker drawn on top of the selected station.
const selectedIcon = L.divIcon({
  className: "", // removes Leaflet's default white box
  html: `<div class="selected-station"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13], // the center of the dot sits on the station
});

// A train marker. Zoomed in: a colored bullet with the line letter, like real MTA signs.
// Zoomed out: a small plain dot, so Manhattan doesn't turn into a pile of overlapping bullets.
// `faded` trains belong to other lines while one line is highlighted.
// `effect` plays once: "train-in" (a new train fades in) or "train-moved" (it glows while it moves).
function trainIcon(route, color, showLetter, faded, effect = "") {
  const size = showLetter ? 15 : 9;
  const textColor = DARK_TEXT_ROUTES.includes(route) ? "#000" : "#fff";
  return L.divIcon({
    className: "", // removes Leaflet's default white box
    html: `<div class="${effect}" style="
      --glow:${color};
      opacity:${faded ? 0.15 : 1};
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};color:${textColor};
      border:${showLetter ? 1.5 : 1}px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);
      display:flex;align-items:center;justify-content:center;
      font:700 8px/1 Helvetica,Arial,sans-serif;">${showLetter ? lineOf(route) : ""}</div>`,
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

export default function SubwayMap({ selectedStation, onSelectStation, myLocation, theme = "light" }) {
  const mapDiv = useRef(null);         // the <div> the map is drawn into
  const map = useRef(null);            // the Leaflet map object
  const tiles = useRef(null);          // the background map, so dark mode can restyle it
  const stations = useRef({});         // station id -> [lat, lon], for zooming to a station
  const selectedMarker = useRef(null); // the highlight ring on the selected station
  const onSelect = useRef(onSelectStation);
  onSelect.current = onSelectStation;

  // The highlighted line, e.g. "A" (null = show every line normally).
  const [lines, setLines] = useState([]); // [{ route, color, textColor }] for the bullets under the map
  const [selectedLine, setSelectedLine] = useState(null);
  const selectedLineRef = useRef(null); // the same value, readable inside Leaflet's event handlers
  const zoomToLine = useRef(false);     // fit the whole line on screen? (yes when picked from the bullets)
  const layers = useRef({});            // the Leaflet layers the highlight restyles
  const drawTrainsRef = useRef(() => {});
  const [fullScreen, setFullScreen] = useState(false);
  const framed = useRef(null); // what we've zoomed to for "my location": null, "me", or "done"

  // Create the map once, when the component first appears.
  useEffect(() => {
    // preferCanvas makes hundreds of dots fast. maxBounds keeps the view on NYC.
    // tolerance lets you click a thin line without hitting it exactly.
    const m = L.map(mapDiv.current, {
      preferCanvas: true,
      renderer: L.canvas({ tolerance: 8 }),
      maxBounds: NYC_BOUNDS,
      maxBoundsViscosity: 0.8,
      minZoom: 10,
    }).setView([40.73, -73.94], 12);
    map.current = m;

    // Background map from OpenStreetMap, turned gray so the colored subway lines stand out.
    tiles.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    tiles.current.getContainer().style.filter = TILE_FILTER[document.documentElement.classList.contains("dark") ? "dark" : "light"];

    const stationLayer = L.layerGroup();
    const trainLayer = L.layerGroup();
    const highlightLayer = L.layerGroup().addTo(m); // the highlighted line, drawn above the others
    const myLocationLayer = L.layerGroup().addTo(m); // my location, its accuracy circle and the closest station
    layers.current = { stationLayer, highlightLayer, myLocationLayer };

    // Click empty map: stop highlighting.
    m.on("click", () => setSelectedLine(null));

    // Once the user drags, scrolls or pinches the map, never move it for them again
    // (until they press "back to me"), so they can look around freely.
    const userMovedMap = () => framed.current !== null && (framed.current = "done");
    m.on("dragstart", userMovedMap);
    m.getContainer().addEventListener("wheel", userMovedMap, { passive: true });
    m.getContainer().addEventListener("touchstart", userMovedMap, { passive: true });

    // Leaflet needs to know when its box changes size (window resized, full screen on/off).
    const resizeWatcher = new ResizeObserver(() => m.invalidateSize());
    resizeWatcher.observe(mapDiv.current);
    let timer;
    let stopped = false; // the map was closed: stop any train animations
    // Every train on the map: trip id -> { marker, props, target: [lat, lon] }.
    // We keep the same marker for each train, so we can slide it instead of redrawing it.
    const trains = new Map();

    // Resize every station dot to match the zoom level.
    function resizeStations() {
      const r = stationRadius(m.getZoom());
      stationLayer.eachLayer((dot) => dot.setRadius(r));
    }

    // The icon for one train right now: letter or dot (zoom), faded or not (highlighted line).
    function iconFor(t, effect) {
      const highlighted = selectedLineRef.current;
      const faded = highlighted !== null && lineOf(t.route) !== highlighted;
      return trainIcon(t.route, t.color, m.getZoom() >= 13, faded, effect);
    }
    const zIndexFor = (t) => (selectedLineRef.current === lineOf(t.route) ? 500 : 0); // highlighted trains on top

    // Restyle every train (after zooming or highlighting a line), without moving them.
    function drawTrains() {
      for (const { marker, props } of trains.values()) {
        marker.setIcon(iconFor(props));
        marker.setZIndexOffset(zIndexFor(props));
      }
    }
    drawTrainsRef.current = drawTrains;

    // Slide a train smoothly from where it is to its next station.
    function glide(marker, to) {
      const from = marker.getLatLng();
      const start = performance.now();
      function step(now) {
        if (stopped) return;
        const t = Math.min(1, (now - start) / GLIDE_MS);
        const e = easeInOut(t);
        marker.setLatLng([from.lat + (to[0] - from.lat) * e, from.lng + (to[1] - from.lng) * e]);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // New train positions arrived: add new trains, slide the ones that moved to their
    // next station (with a glow), leave the ones that are waiting where they are,
    // and remove trains that finished their trip.
    function updateTrains(data) {
      const seen = new Set();
      data.features.forEach((f, i) => {
        const t = f.properties;
        const id = t.trip_id || `${t.route}-${i}`;
        const [lon, lat] = f.geometry.coordinates;
        const tip = `${t.route} train to ${t.destination}<br>Next stop: ${t.next_stop}`;
        seen.add(id);

        const train = trains.get(id);
        if (!train) {
          const marker = L.marker([lat, lon], { icon: iconFor(t, "train-in"), zIndexOffset: zIndexFor(t) })
            .bindTooltip(tip)
            .addTo(trainLayer);
          trains.set(id, { marker, props: t, target: [lat, lon] });
          return;
        }

        train.props = t;
        train.marker.setTooltipContent(tip);
        if (train.target[0] === lat && train.target[1] === lon) return; // still waiting: stay put

        train.target = [lat, lon];
        train.marker.setIcon(iconFor(t, "train-moved"));
        // A huge jump (e.g. the MTA re-routed it) looks odd as a slide, so just place it.
        const far = train.marker.getLatLng().distanceTo([lat, lon]) > 3000;
        if (reduceMotion || far) train.marker.setLatLng([lat, lon]);
        else glide(train.marker, [lat, lon]);
      });

      for (const [id, { marker }] of trains) {
        if (!seen.has(id)) {
          trainLayer.removeLayer(marker);
          trains.delete(id);
        }
      }
    }

    // When the zoom changes, resize the stations and restyle the trains.
    m.on("zoomend", () => {
      resizeStations();
      drawTrains();
    });

    // Download fresh train positions, then move the trains.
    async function loadTrains() {
      try {
        const data = await getSubwayTrains();
        if (stopped) return;
        updateTrains(data);
      } catch {
        // Keep showing the old trains if one refresh fails.
      }
    }

    async function load() {
      // 1. The lines, in their official colors.
      // Click a line to highlight it.
      const routes = await getSubwayRoutes();
      layers.current.routeLayer = L.geoJSON(routes, {
        style: (f) => ({ color: f.properties.color, weight: 4, opacity: 0.9, lineCap: "round" }),
        onEachFeature: (f, layer) =>
          layer.on("click", () => {
            zoomToLine.current = false; // you clicked it on the map, so it's already in view
            setSelectedLine(lineOf(f.properties.route));
          }),
      }).addTo(m);

      // One bullet per line for the picker under the map (express runs share their line's bullet).
      const byLine = {};
      for (const f of routes.features) {
        const line = lineOf(f.properties.route);
        byLine[line] ??= { route: line, color: f.properties.color, textColor: f.properties.text_color };
      }
      const rank = (line) => (LINE_ORDER.includes(line) ? LINE_ORDER.indexOf(line) : LINE_ORDER.length);
      setLines(Object.values(byLine).sort((a, b) => rank(a.route) - rank(b.route)));

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
          lines: station.routes.map(lineOf), // used to fade stations off the highlighted line
        })
          .bindTooltip(station.borough ? `${station.name} · ${station.borough}` : station.name)
          .on("click", () => onSelect.current(station))
          .addTo(stationLayer);
      }
      stationLayer.addTo(m);

      // Fit the whole subway system on screen, whatever the screen size.
      m.fitBounds(L.latLngBounds(Object.values(stations.current)), { padding: [20, 20] });

      // 3. The trains, on top. Refreshed every 10 seconds.
      trainLayer.addTo(m);
      await loadTrains();
      timer = setInterval(loadTrains, 10000);
    }
    load().catch(() => {});

    // Clean up when the component goes away.
    return () => {
      stopped = true;
      clearInterval(timer);
      resizeWatcher.disconnect();
      m.remove();
    };
  }, []);

  // When a station is picked (from the map, search or favorites):
  // zoom to it and mark it with a pulsing ring and its name.
  useEffect(() => {
    // Remove the ring from the previously selected station.
    if (selectedMarker.current) {
      selectedMarker.current.remove();
      selectedMarker.current = null;
    }

    const position = selectedStation && stations.current[selectedStation.id];
    if (!position) return;

    map.current.flyTo(position, 15);

    const marker = L.marker(position, {
      icon: selectedIcon,
      zIndexOffset: 1000, // draw it above the trains
      interactive: false, // clicks pass through to the station underneath
    });
    if (selectedStation.name) {
      marker.bindTooltip(selectedStation.name, {
        permanent: true, // always show the label, not only on hover
        direction: "top",
        offset: [0, -16],
        className: "selected-label", // the teal label style above
      });
    }
    marker.addTo(map.current);
    selectedMarker.current = marker;
  }, [selectedStation]);

  // Light / dark background map.
  useEffect(() => {
    tiles.current.getContainer().style.filter = TILE_FILTER[theme];
  }, [theme]);

  // Highlight one line: fade every other line, station and train, and redraw the
  // chosen line thicker with a white outline so it stands out.
  useEffect(() => {
    selectedLineRef.current = selectedLine;
    const { routeLayer, stationLayer, highlightLayer } = layers.current;
    if (!routeLayer) return; // the map is still loading

    highlightLayer.clearLayers();
    routeLayer.setStyle({ opacity: selectedLine ? 0.12 : 0.9 });
    stationLayer.eachLayer((dot) => {
      const onLine = !selectedLine || dot.options.lines.includes(selectedLine);
      dot.setStyle({ opacity: onLine ? 1 : 0.15, fillOpacity: onLine ? 1 : 0.15 });
    });
    drawTrainsRef.current();
    if (!selectedLine) return;

    routeLayer.eachLayer((layer) => {
      if (lineOf(layer.feature.properties.route) !== selectedLine) return;
      const shape = layer.getLatLngs();
      const color = layer.feature.properties.color;
      L.polyline(shape, { color: "#fff", weight: 12, opacity: 1, lineCap: "round", interactive: false }).addTo(highlightLayer);
      L.polyline(shape, { color, weight: 6, opacity: 1, lineCap: "round", interactive: false }).addTo(highlightLayer);
    });
    // Keep the line's stations above its new outline.
    stationLayer.eachLayer((dot) => dot.options.lines.includes(selectedLine) && dot.bringToFront());

    if (zoomToLine.current) {
      const bounds = L.featureGroup(highlightLayer.getLayers()).getBounds();
      map.current.flyToBounds(bounds, { padding: [30, 30], duration: 0.8 });
    }
  }, [selectedLine]);

  // Picking a bullet under the map: highlight it and zoom to the whole line.
  // Picking the highlighted one again turns the highlight off.
  function pickLine(line) {
    zoomToLine.current = true;
    setSelectedLine(selectedLine === line ? null : line);
  }

  // My location: draw the dot (with a circle showing how accurate it is), a dashed
  // walking line to the closest station, and that station's name and walking time.
  // Redrawn every time the user moves, so the dot follows them.
  const { position, nearby } = myLocation;
  useEffect(() => {
    const layer = layers.current.myLocationLayer;
    if (!layer) return;
    layer.clearLayers();
    if (!position) {
      framed.current = null; // turned off: zoom to the user again next time it's turned on
      return;
    }

    const here = [position.lat, position.lon];
    L.circle(here, { radius: position.accuracy, color: "#0ea5e9", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(layer);

    const closest = nearby[0];
    if (closest) {
      const there = [closest.lat, closest.lon];
      L.polyline([here, there], { color: "#0ea5e9", weight: 3, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(layer);
      L.marker(there, { icon: closestIcon, zIndexOffset: 800, interactive: false })
        .bindTooltip(`Closest: ${closest.name} · ~${Math.round(closest.distance_miles * 20)} min walk`, {
          permanent: true,
          direction: "top",
          offset: [0, -12],
          className: "closest-label",
        })
        .addTo(layer);
    }
    L.marker(here, { icon: myLocationIcon, zIndexOffset: 900, interactive: false }).addTo(layer);

    // Move the map to the user once, then to fit them and their closest station once.
    // After that (or as soon as the user moves the map) we leave the map alone.
    if (framed.current === null) {
      map.current.flyTo(here, 16);
      framed.current = "me";
    }
    if (framed.current === "me" && closest) {
      showMeAndClosest();
      framed.current = "done";
    }
  }, [position, nearby]);

  // Zoom to fit the user and their closest station.
  function showMeAndClosest() {
    const here = [position.lat, position.lon];
    const closest = nearby[0];
    if (closest) map.current.flyToBounds([here, [closest.lat, closest.lon]], { padding: [80, 80], maxZoom: 17 });
    else map.current.flyTo(here, 16);
  }

  // Full screen: the Escape key closes it.
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e) => e.key === "Escape" && setFullScreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  const highlighted = lines.find((l) => l.route === selectedLine);

  // The map fills whatever box App.jsx gives it, or the whole window in full screen.
  return (
    <section
      className={`flex flex-col overflow-hidden bg-white shadow-sm ${
        fullScreen ? "fixed inset-0 z-40" : "h-full rounded-2xl"
      }`}
    >
      <style>{SELECTED_CSS}</style>
      <div className="relative min-h-0 flex-1">
        {/* z-0 keeps the map below the login popup */}
        <div ref={mapDiv} className="relative z-0 h-full w-full" />

        <button
          onClick={() => setFullScreen(!fullScreen)}
          title={fullScreen ? "Exit full screen (Esc)" : "Full screen map"}
          className="absolute top-3 right-3 z-10 rounded-xl bg-white p-2 shadow-lg ring-1 ring-gray-200 hover:bg-gray-100 hover:shadow-xl"
        >
          {fullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>

        {/* My location. Off: turn it on. On: fly back to me (after looking around).
            The ✕ underneath turns location off. */}
        <button
          onClick={position ? showMeAndClosest : myLocation.status === "finding" ? undefined : myLocation.start}
          title={position ? "Back to my location" : "Show my location and the closest station"}
          className={`absolute top-14 right-3 z-10 rounded-xl p-2 shadow-lg ring-1 ${
            myLocation.status === "on" || myLocation.status === "finding"
              ? "bg-sky-500 text-[#fff] ring-sky-500 hover:bg-sky-600"
              : "bg-white ring-gray-200 hover:bg-gray-100"
          }`}
        >
          <LocateFixed size={18} className={myLocation.status === "finding" ? "animate-pulse" : ""} />
        </button>
        {(myLocation.status === "on" || myLocation.status === "finding") && (
          <button
            onClick={myLocation.stop}
            title="Turn off my location"
            className="absolute top-[6.25rem] right-3 z-10 rounded-xl bg-white p-2 text-gray-600 shadow-lg ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        )}

        {/* "Showing the A line" label on top of the map, with a button to show every line again */}
        {highlighted && (
          <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white py-1 pr-2 pl-1 shadow-lg ring-1 ring-gray-200">
            <RouteBullet route={highlighted.route} color={highlighted.color} textColor={highlighted.textColor} size="sm" />
            <span className="text-sm font-semibold whitespace-nowrap">{highlighted.route} line</span>
            <button
              onClick={() => setSelectedLine(null)}
              title="Show every line"
              className="rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* One bullet per line. Tap one to highlight it on the map. */}
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
        {lines.map((line) => (
          <button
            key={line.route}
            onClick={() => pickLine(line.route)}
            title={`Highlight the ${line.route} line`}
            className={`shrink-0 rounded-full transition ${
              selectedLine === line.route
                ? "scale-110 ring-2 ring-gray-900 ring-offset-2 ring-offset-white"
                : selectedLine
                  ? "opacity-40 hover:opacity-100"
                  : "hover:scale-110"
            }`}
          >
            <RouteBullet route={line.route} color={line.color} textColor={line.textColor} size="md" />
          </button>
        ))}
      </div>
    </section>
  );
}