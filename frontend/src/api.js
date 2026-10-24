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
