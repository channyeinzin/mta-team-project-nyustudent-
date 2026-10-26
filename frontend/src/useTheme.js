// Light / dark mode. Starts with the computer's setting, then remembers the user's choice.

import { useEffect, useState } from "react";

function startingTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Private browsing can block storage — fall back to the computer's setting.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function useTheme() {
  const [theme, setTheme] = useState(startingTheme);

  // Put "dark" on <html> so the dark colors in index.css switch on.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // The choice just won't be remembered next time.
    }
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, toggleTheme };
}
