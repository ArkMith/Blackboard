import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/", // Perfect for browser absolute static URL hosting
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 8080,
    watch: {
      usePolling: true, // Optimizes web tab hot reloading metrics
    },
  },
});
