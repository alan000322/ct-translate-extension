import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "wxt/browser": fileURLToPath(new URL("./test/stubs/wxt-browser.ts", import.meta.url)),
    },
  },
})
