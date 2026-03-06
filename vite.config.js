import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /api calls to the local file server during dev
    // (avoids CORS issues when running vite separately from server.mjs)
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3131",
        changeOrigin: false,
      },
    },
  },
});
