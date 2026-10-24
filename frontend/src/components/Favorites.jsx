// Person 4: the list of saved stations. Click one to see its trains.

import RouteBullet from "./RouteBullet.jsx";

export default function Favorites({ favorites, onSelect, routeColors }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">★ Favorites</h2>

      {favorites.length === 0 ? (
        <p className="text-sm text-gray-500">Pick a station and press "☆ Save" to keep it here.</p>
      ) : (
        <ul className="divide-y">
          {favorites.map((station) => (
            <li key={station.id}>
              <button
                onClick={() => onSelect(station)}
                className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-gray-50"
              >
                <span>{station.name}</span>
                <span className="flex gap-1">
                  {station.routes.map((r) => (
                    <RouteBullet key={r} route={r} size="sm" {...routeColors[r]} />
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
