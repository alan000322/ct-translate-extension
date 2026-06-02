## Why

目前沒有一個自己掌控、可信任的網頁翻譯工具：沈浸式翻譯與 read-frog 都把翻譯流量或帳號綁在第三方服務上。本專案要做一個純自有、無登入、把 API key 留在本機、翻譯流量直連官方端點的瀏覽器擴充，給讀外電、需要把外文即時翻成繁體中文的使用者。第一個 change 先打通整條技術主幹並交付第一個看得到的功能——懸停段落翻譯。

## What Changes

- 建立 WXT + React + Tailwind 的 MV3 擴充鷹架（background service worker、content script、popup 三個 entrypoint）。
- 建立翻譯 provider 系統：支援 OpenAI、Anthropic（Claude）、Google Gemini 三家 LLM（各家官方 SDK 直串）與 Google 翻譯免費端點（手刻 fetch）。所有 provider 呼叫與網路請求集中在 background service worker，避開 CORS、API key 不進頁面 context。
- 建立 DOM 切段基礎：遞迴走訪並標記節點，以「含 inline 子節點的元素」為翻譯單位（段落），並套用過濾規則排除 script/style/code/隱藏等不可翻節點。
- 交付懸停段落翻譯：滑鼠懸停 + 按住熱鍵（預設 Control）觸發，找到游標下最近的 block 段落，送 background 翻譯，將譯文以雙語對照方式插回該段落底下；再次觸發可移除（toggle）。
- 建立最小 popup 與設定儲存：可選 active provider、選該 provider 的 model、填 API key、設定目標語言（預設繁體中文，可選日文/英文），來源語言預設自動偵測。設定存於 chrome.storage.local，跨 context 共用。
- 不使用 Vercel AI SDK；不自架翻譯後端；不做任何登入/帳號系統。

## Non-Goals (optional)

- **全文翻譯**（IntersectionObserver/MutationObserver 延遲翻譯整頁）：留待後續 change。
- **翻譯風格管理器與獨立設定頁**（具名 prompt 範本 + token 佔位符 + popup 下拉選風格）：留待後續 change。
- **智慧上下文**（用 defuddle 抽頁面正文注入 prompt）：留待後續 change。
- **完整設計打磨**（馬卡龍功能色系、字體系統、Shadow DOM 樣式隔離的精緻化）：本 change 只求 popup 可用、頁內譯文克制可讀；視覺打磨另開 change（設計脈絡已記於 .impeccable.md）。
- **翻譯結果快取、批次 DOM、僅譯文模式切換、iframe 完整支援**：暫不處理。

## Capabilities

### New Capabilities

- `translation-providers`: provider 設定模型與分派器——依當前 provider 路由到 OpenAI/Anthropic/Gemini 官方 SDK 或 Google 翻譯免費端點，於 background 執行翻譯並回傳譯文。
- `dom-segmentation`: 將網頁 DOM 遞迴走訪並標記成翻譯單位（段落），套用可翻/不可翻過濾規則，並提供段落純文字抽取。
- `hover-paragraph-translation`: 懸停 + 熱鍵觸發互動狀態機、從座標找最近 block 段落、雙語對照插入譯文與 toggle 還原。
- `settings-popup`: popup 設定 UI 與 config 儲存——選 provider、選 model、填 key、設定目標語言，存於 chrome.storage.local。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 4 個 capability spec（translation-providers、dom-segmentation、hover-paragraph-translation、settings-popup）。
- Affected code:
  - New:
    - wxt.config.ts
    - package.json
    - tsconfig.json
    - src/config/schema.ts
    - src/config/storage.ts
    - src/config/constants.ts
    - src/config/lang.ts
    - src/core/dom/labels.ts
    - src/core/dom/rules.ts
    - src/core/dom/filter.ts
    - src/core/dom/traversal.ts
    - src/core/translate/translate-text.ts
    - src/core/translate/walker.ts
    - src/core/translate/insert.ts
    - src/core/translate/providers/defaults.ts
    - src/core/translate/providers/openai.ts
    - src/core/translate/providers/anthropic.ts
    - src/core/translate/providers/gemini.ts
    - src/core/translate/providers/google.ts
    - src/utils/messaging.ts
    - src/entrypoints/background/index.ts
    - src/entrypoints/content/index.tsx
    - src/entrypoints/content/node-translation.ts
    - src/entrypoints/content/node-translation-trigger.ts
    - src/entrypoints/popup/index.html
    - src/entrypoints/popup/App.tsx
    - src/entrypoints/popup/main.tsx
  - Modified: (none)
  - Removed: (none)
- Dependencies: 新增 npm 依賴 wxt、react、react-dom、tailwindcss、zod、openai、@anthropic-ai/sdk、@google/genai。
- 第三方端點（manifest host_permissions）：api.openai.com、api.anthropic.com、generativelanguage.googleapis.com、translate-pa.googleapis.com。
