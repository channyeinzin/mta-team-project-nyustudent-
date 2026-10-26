// Person 4: favorite stations and saved trips, kept in the browser's local storage.
// Each logged-in user gets their own lists; everyone else shares a "guest" list.
// (Later this could move to Firestore so favorites follow you between devices.)

import { useEffect, useState } from "react";

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

// A list that is remembered in local storage under `key`.
function useStoredList(key) {
  const [list, setList] = useState(() => load(key));

  // When someone logs in or out, switch to their list.
  useEffect(() => setList(load(key)), [key]);

  function save(newList) {
    setList(newList);
    try {
      localStorage.setItem(key, JSON.stringify(newList));
    } catch {
      // Private browsing can block storage — the list just won't be remembered.
    }
  }

  return [list, save];
}

// Only keep what we need to show a station again later.
const short = (station) => ({ id: station.id, name: station.name, routes: station.routes });

export default function useFavorites(user) {
  const owner = user ? user.uid : "guest";
  const [favorites, saveFavorites] = useStoredList(`favorites:${owner}`);
  const [trips, saveTrips] = useStoredList(`trips:${owner}`);

  const isFavorite = (station) => favorites.some((f) => f.id === station.id);

  function toggleFavorite(station) {
    if (isFavorite(station)) {
      saveFavorites(favorites.filter((f) => f.id !== station.id));
    } else {
      saveFavorites([...favorites, short(station)]);
    }
  }

  // A saved trip is a start and a destination. Opening it later shows the live trains.
  const sameTrip = (trip, from, to) => trip.from.id === from.id && trip.to.id === to.id;
  const isSavedTrip = (from, to) => trips.some((t) => sameTrip(t, from, to));

  function toggleTrip(from, to) {
    if (isSavedTrip(from, to)) {
      saveTrips(trips.filter((t) => !sameTrip(t, from, to)));
    } else {
      saveTrips([...trips, { from: short(from), to: short(to) }]);
    }
  }

  return { favorites, isFavorite, toggleFavorite, trips, isSavedTrip, toggleTrip };
}
