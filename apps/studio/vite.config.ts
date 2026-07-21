import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envDir: "../..",
  resolve: {
    alias: {
      "@foxchild/music-core": "/Volumes/ExtremePro/AIWorkspace/music-editor/packages/music-core/src/index.ts"
    }
  },
  build: {
    target: "es2022"
  }
});
