// Person 4: favorite stations, saved in the browser's local storage.
// Each logged-in user gets their own list; everyone else shares a "guest" list.
// (Later this could move to Firestore so favorites follow you between devices.)

import { useEffect, useState } from "react";

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

export default function useFavorites(user) {
  const key = `favorites:${user ? user.uid : "guest"}`;
  const [favorites, setFavorites] = useState(() => load(key));

  // When someone logs in or out, switch to their list.
  useEffect(() => setFavorites(load(key)), [key]);

  function save(list) {
    setFavorites(list);
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // Private browsing can block storage — favorites just won't be remembered.
    }
  }

  const isFavorite = (station) => favorites.some((f) => f.id === station.id);

  function toggleFavorite(station) {
    if (isFavorite(station)) {
      save(favorites.filter((f) => f.id !== station.id));
    } else {
      save([...favorites, { id: station.id, name: station.name, routes: station.routes }]);
    }
  }

  return { favorites, isFavorite, toggleFavorite };
}
