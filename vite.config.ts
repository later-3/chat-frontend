import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageMetadata from "./package.json" with { type: "json" };

const chatBackendUrl = process.env.CHAT_BACKEND_URL ?? "http://127.0.0.1:43112";
const appVersion = process.env.VITE_APP_VERSION ?? packageMetadata.version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 30145,
    strictPort: true,
    proxy: {
      "/api": chatBackendUrl,
      "/run": chatBackendUrl,
      "/runs": chatBackendUrl
    }
  },
  build: { outDir: "dist", emptyOutDir: true }
});
