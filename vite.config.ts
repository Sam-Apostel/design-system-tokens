import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fully static, client-side only app. base "./" keeps it portable when hosted
// from any sub-path (e.g. GitHub Pages) or opened from a static file server.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
