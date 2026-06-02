## Why

懸停段落翻譯目前是「按住熱鍵 → 等待 → 譯文整段一次出現」：background 完整 await `translateText()` 後才回一個字串，期間使用者只看到一個 `…` placeholder。對 LLM provider 而言，一段較長的文字可能要等數秒才看到任何結果，體感是「卡住」。各家官方 SDK 其實都支援串流輸出（token 逐步吐出），但目前的訊息層（一次性 `sendMessage`/`sendResponse`）與 provider 層（一次性 `create`/`generateContent`）都是「等全部好了才回」，無法把逐步產生的內容即時帶到頁面。本 change 把單段（懸停）AI 翻譯改成打字機式（逐字）串流，並設為預設開啟，讓使用者按下熱鍵後立刻看到譯文一個字一個字浮現。

## What Changes

- **訊息層改為長連線 Port**：`src/utils/messaging.ts` 從一次性 `chrome.runtime.sendMessage`/`sendResponse` 改為以 `chrome.runtime.connect()` 建立長壽命 Port。background 透過 `port.postMessage` 持續推送 chunk；content script 把增量寫入 DOM 節點。這是一個新的跨層契約（承載串流協定、連線生命週期與取消，而非單純轉發）。
- **provider 層改為產生 chunk**：三家 LLM provider 開啟串流並以逐步 yield chunk 取代回傳完整字串——`src/core/translate/providers/openai.ts` 改 `stream: true`、`src/core/translate/providers/anthropic.ts` 改串流、`src/core/translate/providers/gemini.ts` 改 `generateContentStream`。`src/core/translate/translate-text.ts` 的分派器把串流／chunk 介面往下傳遞。Google 翻譯免費端點維持非串流（單次回字串）。
- **內容/UI 支援增量 append（打字機）**：`src/core/translate/insert.ts` 與 `src/core/translate/walker.ts` 的插入路徑改為可逐步把 chunk append 進譯文節點，保留既有「雙語對照、插在段落下方、再觸發即還原（toggle）」行為；`src/entrypoints/content/node-translation.ts` 串接串流回呼。
- **background entrypoint 改寫**：`src/entrypoints/background/index.ts` 從「完整 await `translateText()` 再回應」改為 Port／串流模型——監聽連線、在 chunk 產生時推送、結束時送 done、出錯時送 error。
- **預設開啟**：串流為單段 AI 翻譯的預設行為（不需使用者額外設定）。
- **串流失敗回退**：若某 provider／SDK 的串流呼叫失敗，回退為非串流的一次性翻譯（fallback），避免功能不可用。

## Non-Goals (optional)

留待 design.md 的 Goals / Non-Goals 記錄。

## Capabilities

### New Capabilities

- `streaming-message-channel`: content ↔ background 的長壽命 Port 串流契約——以 `chrome.runtime.connect()` 取代一次性訊息，定義 chunk／done／error 訊息封套、連線生命週期，以及使用者中途取消（toggle off）時的取消機制。
- `streaming-translation`: provider 層串流輸出與單段懸停打字機渲染——三家 LLM 開啟串流逐步 yield chunk、分派器傳遞串流介面、頁內譯文節點逐字增量 append（保留雙語對照與 toggle）、預設開啟，並在串流失敗時回退為非串流。

### Modified Capabilities

(none — 串流行為以新 capability 承載。既有的 provider 翻譯與懸停段落翻譯能力定義於 hover-translation-mvp change、尚未 archive 至 openspec specs 目錄，其原有非串流行為仍成立，串流為其上的新增層。詳見 design.md。)

## Impact

- Affected specs: 新增 2 個 capability spec（streaming-message-channel、streaming-translation）。
- Affected code:
  - New: (none)
  - Modified:
    - src/utils/messaging.ts
    - src/entrypoints/background/index.ts
    - src/core/translate/translate-text.ts
    - src/core/translate/providers/openai.ts
    - src/core/translate/providers/anthropic.ts
    - src/core/translate/providers/gemini.ts
    - src/core/translate/providers/defaults.ts
    - src/core/translate/walker.ts
    - src/core/translate/insert.ts
    - src/entrypoints/content/node-translation.ts
  - Removed: (none)
- 範圍邊界：本 change 只涵蓋單段（懸停）串流。全文翻譯為獨立 change，且全文翻譯不使用逐字串流。智慧上下文（prompt 上下文感知）不在此 change。
- 不新增第三方依賴：沿用既有 openai、@anthropic-ai/sdk、@google/genai SDK 既有的串流能力。
