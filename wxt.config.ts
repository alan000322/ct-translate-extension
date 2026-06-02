import { defineConfig } from "wxt"
import tailwindcss from "@tailwindcss/vite"

// WXT 設定：srcDir 指向 src/，啟用 React 模組，Tailwind v4 走 Vite plugin。
// host_permissions 列出 background 直連的第三方翻譯端點（避開 CORS）。
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    // cast：WXT 內建的 vite 與 @tailwindcss/vite 解析到不同 vite 副本，
    // 造成 Plugin 型別不相容（僅型別層問題，建置正常）。
    plugins: [tailwindcss() as unknown as never],
  }),
  manifest: {
    name: "CT翻翻",
    description: "懸停段落翻譯與全文翻譯，譯文直接渲染於網頁中。",
    permissions: ["storage", "activeTab"],
    host_permissions: [
      "https://api.openai.com/*",
      "https://api.anthropic.com/*",
      "https://generativelanguage.googleapis.com/*",
    ],
  },
})
