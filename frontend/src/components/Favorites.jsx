// Person 4: the list of saved stations and saved trips.
// Click a station to see its trains, or a trip to plan it again with live trains.

import { X } from "lucide-react";
import RouteBullet from "./RouteBullet.jsx";

function Bullets({ routes, routeColors }) {
  return (
    <span className="flex gap-1">
      {routes.map((r) => (
        <RouteBullet key={r} route={r} size="sm" {...routeColors[r]} />
      ))}
    </span>
  );
}

export default function Favorites({ favorites, selectedStation, onSelect, trips, onOpenTrip, onRemoveTrip, routeColors }) {
  return (
    // Shown inside the "Saved" row in App.jsx, which gives it its title and box.
    <div>
      <h3 className="text-sm font-semibold text-gray-500">Stations</h3>
      {favorites.length === 0 ? (
        <p className="text-sm text-gray-500">Pick a station and press "Save" to keep it here.</p>
      ) : (
        <ul className="divide-y">
          {favorites.map((station) => (
            <li key={station.id}>
              <button
                onClick={() => onSelect(station)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left ${
                  station.id === selectedStation?.id // the station you're looking at now, in teal
                    ? "bg-teal-50 font-semibold text-teal-700"
                    : "hover:bg-gray-50"
                }`}
              >
                <span>
                  {station.name}
                  {station.borough && <span className="ml-2 text-xs text-gray-500">{station.borough}</span>}
                </span>
                <Bullets routes={station.routes} routeColors={routeColors} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-sm font-semibold text-gray-500">Trips</h3>
      {trips.length === 0 ? (
        <p className="text-sm text-gray-500">Plan a trip and press "Save trip" to keep it here.</p>
      ) : (
        <ul className="divide-y">
          {trips.map((trip) => (
            <li key={`${trip.from.id}-${trip.to.id}`} className="flex items-center gap-2">
              <button
                onClick={() => onOpenTrip(trip)}
                className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="truncate">{trip.from.name}</span>
                <span className="text-gray-400">→</span>
                <span className="truncate">{trip.to.name}</span>
              </button>
              <button
                onClick={() => onRemoveTrip(trip)}
                className="text-gray-400 hover:text-gray-800"
                title="Remove this trip"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
