import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "demo"),
  resolve: {
    alias: {
      "ml-mvt-underzoom": path.resolve(__dirname, "src/index.ts"),
    },
  },
  server: {
    port: 5174,
    open: "/",
  },
});
