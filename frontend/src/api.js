// api.js — every call to the Flask backend lives here.
// The Vite dev server forwards "/api/..." to http://localhost:5001 (see vite.config.js).

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    // The backend always sends { "error": "..." } when something goes wrong.
    throw new Error(data.error || "Something went wrong");
  }
  return data;
}

export const getStatus = () => getJson("/api/status");

export const getRoutes = () => getJson("/api/routes");

export const getArrivals = (stationId) =>
  getJson(`/api/arrivals?station=${encodeURIComponent(stationId)}`);

export const searchStations = (query) =>
  getJson(`/api/stations?q=${encodeURIComponent(query)}`);

export const getNearbyStations = (lat, lon) =>
  getJson(`/api/stations/nearby?lat=${lat}&lon=${lon}`);

export const planTrip = (fromId, toId) =>
  getJson(`/api/trip?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`);

// FR-04/FR-05: subway vs taxi vs walking for the same journey.
export const compareCommute = (fromId, toId) =>
  getJson(
    `/api/commute/compare?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`
  );

// FR-06: current conditions. The backend answers 503 with a usable body
// ({ available: false, reason }) when the weather provider is down, so we read
// the body instead of treating that as a hard failure.
export const getWeather = async (lat, lon) => {
  const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  const data = await response.json();
  if (!response.ok && data.available === undefined) {
    throw new Error(data.error || "Weather unavailable");
  }
  return data;
};

// Map data (GeoJSON)
export const getSubwayRoutes = () => getJson("/api/subway/routes");

export const getSubwayStops = () => getJson("/api/subway/stops");

export const getSubwayTrains = () => getJson("/api/subway/trains");
