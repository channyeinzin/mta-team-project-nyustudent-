// App.jsx — Person 5: puts everyone's parts together into one page.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Activity, CloudSun, Moon, Sparkle, Sun, TrainFront } from "lucide-react";
import { auth } from "./firebase.js";
import { getFastestRoute, getRoutes } from "./api.js";
import useFavorites from "./useFavorites.js";
import useTheme from "./useTheme.js";
import useMyLocation from "./useMyLocation.js";
import useServiceStatus from "./useServiceStatus.js";
import Login from "./components/Login.jsx";
import Favorites from "./components/Favorites.jsx";
import ArrivalCards from "./components/ArrivalCards.jsx";
import StatusDashboard from "./components/StatusDashboard.jsx";
import SubwayMap from "./components/SubwayMap.jsx";
import TripPlanner from "./components/TripPlanner.jsx";
import Collapsible from "./components/Collapsible.jsx";
import FastestRoute from "./components/FastestRoute.jsx";
import WeatherCard from "./components/WeatherCard.jsx";

export default function App() {
  const [user, setUser] = useState(null);           // the logged-in Firebase user
  const [from, setFrom] = useState(null);           // where the trip starts
  const [to, setTo] = useState(null);               // where it goes
  const [routeColors, setRouteColors] = useState({}); // { "L": { color, textColor } }
  const { theme, toggleTheme } = useTheme();
  const myLocation = useMyLocation(); // where the user is + the closest stations (when turned on)
  const { statusFor, alertColors } = useServiceStatus(); // how every line is running
  const { favorites, isFavorite, toggleFavorite, trips, isSavedTrip, toggleTrip } = useFavorites(user);

  // GPS found your closest station: start the trip there, if you haven't picked a start.
  const nearest = myLocation.nearby[0] ?? null;
  useEffect(() => {
    if (nearest) setFrom((current) => current ?? nearest);
  }, [nearest?.id]); // only when the closest station changes

  // A station clicked on the map fills From first, then To.
  function pickFromMap(station) {
    if (!from) setFrom(station);
    else if (station.id !== from.id) setTo(station);
  }

  // The station whose trains we show: where you start (or, before that, where you're going).
  const shown = from ?? to;

  // Once From and To are both set: the fastest route (Dijkstra), shown in the panel
  // and drawn on the map. undefined = no trip yet, null = still finding it.
  const [fastest, setFastest] = useState(undefined);
  useEffect(() => {
    if (!from || !to) {
      setFastest(undefined);
      return;
    }
    let active = true;
    setFastest(null);
    getFastestRoute(from.id, to.id)
      .then((data) => active && setFastest(data))
      .catch(() => active && setFastest(undefined)); // the live trip options still show
    return () => {
      active = false;
    };
  }, [from, to]);

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
          <SubwayMap
            selectedStation={shown}
            onSelectStation={pickFromMap}
            myLocation={myLocation}
            journey={fastest?.found ? fastest.legs : null}
            theme={theme}
          />
        </div>

        {/* The side panel: plan a trip at the top. As soon as From is picked, its trains
            show below; with To too, the trips show. Saved and status stay folded away. */}
        <div className="space-y-4">
          <TripPlanner
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            routeColors={routeColors}
            isSavedTrip={isSavedTrip}
            onToggleTrip={toggleTrip}
            myLocation={myLocation}
            statusFor={statusFor}
            alertColors={alertColors}
          />

          {fastest !== undefined && <FastestRoute route={fastest} />}

          {shown && (
            <ArrivalCards
              key={shown.id} // a new card for each station, so the "picked" glow plays again
              station={shown}
              isFavorite={isFavorite(shown)}
              onToggleFavorite={() => toggleFavorite(shown)}
              statusFor={statusFor}
              alertColors={alertColors}
            />
          )}

          <Collapsible title="Saved" icon={<Sparkle size={18} />}>
            <Favorites
              favorites={favorites}
              selectedStation={from}
              onSelect={setFrom}
              trips={trips}
              onOpenTrip={(trip) => {
                setFrom(trip.from);
                setTo(trip.to);
              }}
              onRemoveTrip={(trip) => toggleTrip(trip.from, trip.to)}
              routeColors={routeColors}
            />
          </Collapsible>

          <Collapsible title="Line status" icon={<Activity size={18} />}>
            <StatusDashboard bare />
          </Collapsible>

          <Collapsible title="Weather" icon={<CloudSun size={18} />}>
            <WeatherCard station={shown} bare />
          </Collapsible>
        </div>
      </main>
    </div>
  );
}
