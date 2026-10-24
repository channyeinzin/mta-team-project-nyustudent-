// App.jsx — Person 5: puts everyone's parts together into one page.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { getRoutes } from "./api.js";
import useFavorites from "./useFavorites.js";
import Login from "./components/Login.jsx";
import StationSearch from "./components/StationSearch.jsx";
import Favorites from "./components/Favorites.jsx";
import ArrivalCards from "./components/ArrivalCards.jsx";
import StatusDashboard from "./components/StatusDashboard.jsx";
import SubwayMap from "./components/SubwayMap.jsx";

export default function App() {
  const [user, setUser] = useState(null);           // the logged-in Firebase user
  const [station, setStation] = useState(null);     // the station you picked
  const [routeColors, setRouteColors] = useState({}); // { "L": { color, textColor } }
  const { favorites, isFavorite, toggleFavorite } = useFavorites(user);

  // Keep track of who is logged in.
  useEffect(() => (auth ? onAuthStateChanged(auth, setUser) : undefined), []);

  // Load every line's colors once, for the little bullets.
  useEffect(() => {
    getRoutes()
      .then((data) =>
        setRouteColors(
          Object.fromEntries(data.routes.map((r) => [r.id, { color: r.color, textColor: r.text_color }]))
        )
      )
      .catch(() => {}); // bullets fall back to grey
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">🚇 NYC Subway Tracker</h1>
          <Login user={user} />
        </div>
      </header>

      {/* Phone: one column. Big screen: map on top, then search + arrivals on the left, status on the right. */}
      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[3fr_2fr]">
        <div className="lg:col-span-2">
          <SubwayMap selectedStation={station} onSelectStation={setStation} />
        </div>

        <div className="space-y-4">
          <StationSearch onSelect={setStation} routeColors={routeColors} />

          {station ? (
            <ArrivalCards
              station={station}
              isFavorite={isFavorite(station)}
              onToggleFavorite={() => toggleFavorite(station)}
            />
          ) : (
            <section className="rounded-2xl bg-white p-6 text-center text-gray-500 shadow-sm">
              Search for a station, or click one on the map, to see the next trains.
            </section>
          )}

          <Favorites favorites={favorites} onSelect={setStation} routeColors={routeColors} />
        </div>

        <StatusDashboard />
      </main>
    </div>
  );
}
