import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Send every /api/... request to the Flask backend.
    // This way the frontend can just call fetch("/api/status").
    proxy: { "/api": "http://localhost:5001" },
  },
});
