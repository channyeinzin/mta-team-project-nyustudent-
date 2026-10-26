// App.jsx — Person 5: puts everyone's parts together into one page.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Activity, CloudSun, LocateFixed, Moon, Route, Sparkle, Sun, TrainFront } from "lucide-react";
import { auth } from "./firebase.js";
import { getRoutes } from "./api.js";
import useFavorites from "./useFavorites.js";
import useTheme from "./useTheme.js";
import useMyLocation from "./useMyLocation.js";
import useServiceStatus from "./useServiceStatus.js";
import Login from "./components/Login.jsx";
import StationSearch from "./components/StationSearch.jsx";
import Favorites from "./components/Favorites.jsx";
import ArrivalCards from "./components/ArrivalCards.jsx";
import StatusDashboard from "./components/StatusDashboard.jsx";
import SubwayMap from "./components/SubwayMap.jsx";
import TripPlanner from "./components/TripPlanner.jsx";
import Collapsible from "./components/Collapsible.jsx";
import WeatherCard from "./components/WeatherCard.jsx";

export default function App() {
  const [user, setUser] = useState(null);           // the logged-in Firebase user
  const [station, setStation] = useState(null);     // the station you picked
  const [routeColors, setRouteColors] = useState({}); // { "L": { color, textColor } }
  const { theme, toggleTheme } = useTheme();
  const myLocation = useMyLocation(); // where the user is + the closest stations (when turned on)
  const { statusFor, alertColors } = useServiceStatus(); // how every line is running
  const [tripOpen, setTripOpen] = useState(false);     // is the trip planner showing?
  const [tripToOpen, setTripToOpen] = useState(null);  // stations to fill in when it opens
  const { favorites, isFavorite, toggleFavorite, trips, isSavedTrip, toggleTrip } = useFavorites(user);

  // Open the trip planner, optionally with stations filled in.
  // (A new object each time, so opening the same trip twice still works.)
  function openTrip(trip = {}) {
    setTripToOpen({ ...trip });
    setTripOpen(true);
  }

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
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <TrainFront size={24} /> NYC Subway Tracker
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Login user={user} />
          </div>
        </div>
      </header>

      {/* Phone: a tall map, then everything else below it.
          Big screen: a big map on the left that stays in place, and a panel on the right that scrolls. */}
      <main className="mx-auto grid max-w-screen-2xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="h-[70vh] min-h-[420px] lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">
          <SubwayMap selectedStation={station} onSelectStation={setStation} myLocation={myLocation} theme={theme} />
        </div>

        {/* The side panel shows only what you need right now:
            nothing picked -> two big buttons; a station picked -> its trains;
            planning -> the trip. Saved stuff and line status stay folded away at the bottom. */}
        <div className="space-y-4">
          <StationSearch onSelect={setStation} myLocation={myLocation} routeColors={routeColors} />

          {station && (
            <ArrivalCards
              key={station.id} // a new card for each station, so the "picked" glow plays again
              station={station}
              isFavorite={isFavorite(station)}
              onToggleFavorite={() => toggleFavorite(station)}
              onDirections={() => openTrip({ to: station })}
              onClose={() => setStation(null)}
              statusFor={statusFor}
              alertColors={alertColors}
            />
          )}

          {/* Just opened the site: the two main things you can do. */}
          {!station && !tripOpen && (myLocation.status === "off" || myLocation.status === "error") && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={myLocation.start}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 font-semibold shadow-sm hover:shadow-md"
              >
                <LocateFixed size={26} /> Near me
              </button>
              <button
                onClick={() => openTrip()}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white p-5 font-semibold shadow-sm hover:shadow-md"
              >
                <Route size={26} /> Plan a trip
              </button>
            </div>
          )}

          {tripOpen && (
            <TripPlanner
              routeColors={routeColors}
              isSavedTrip={isSavedTrip}
              onToggleTrip={toggleTrip}
              tripToOpen={tripToOpen}
              myLocation={myLocation}
              onClose={() => setTripOpen(false)}
              statusFor={statusFor}
              alertColors={alertColors}
            />
          )}

          <Collapsible title="Saved" icon={<Sparkle size={18} />}>
            <Favorites
              favorites={favorites}
              selectedStation={station}
              onSelect={setStation}
              trips={trips}
              onOpenTrip={openTrip}
              onRemoveTrip={(trip) => toggleTrip(trip.from, trip.to)}
              routeColors={routeColors}
            />
          </Collapsible>

          <Collapsible title="Line status" icon={<Activity size={18} />}>
            <StatusDashboard bare />
          </Collapsible>

          <Collapsible title="Weather" icon={<CloudSun size={18} />}>
            <WeatherCard station={station} bare />
          </Collapsible>
        </div>
      </main>
    </div>
  );
}
