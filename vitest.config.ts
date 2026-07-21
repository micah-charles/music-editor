import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@foxchild/music-core": fileURLToPath(new URL("./packages/music-core/src/index.ts", import.meta.url))
    }
  }
});
