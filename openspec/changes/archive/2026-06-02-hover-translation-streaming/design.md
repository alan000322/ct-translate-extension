## Context

懸停段落翻譯（hover-translation-mvp）已上線：content script 偵測「懸停 + 按住熱鍵」後，呼叫 `requestTranslate(text)`，該函式以一次性 `chrome.runtime.sendMessage` 把純文字送到 background；background 完整 await `translateText()` 後以 `sendResponse({ text })` 回一個字串，content 端再用 `fillWrapper` 一次替換段落下方的 `…` placeholder。三家 LLM provider 目前都是非串流呼叫（OpenAI `chat.completions.create`、Anthropic `messages.create`、Gemini `generateContent`），各自把完整輸出組成字串回傳。

這條路徑的瓶頸在訊息層與 provider 層都是「等全部好了才回」。各家官方 SDK 都支援串流，但目前的契約把串流能力擋在外面。本 change 把單段（懸停）AI 翻譯改成逐字串流（打字機），並設為預設行為。其餘互動（懸停 + 熱鍵觸發、找最近 block 段落、雙語對照插入、toggle 還原、逐段失敗隔離）維持不變。

既有 capability（`translation-providers`、`hover-paragraph-translation` 等）定義於 hover-translation-mvp change，尚未 archive 至 `openspec/specs/`。為避免與尚未 promote 的 base spec 衝突、並與平行進行的 `full-page-translation`（已暫存）保持獨立，本 change 以兩個新 capability 承載串流行為，而非對既有 capability 下 MODIFIED delta。既有的非串流行為仍然成立，串流是疊在其上的新增層。

## Goals / Non-Goals

**Goals:**

- 把 content ↔ background 的單段翻譯訊息層，從一次性 `sendMessage`/`sendResponse` 改為長壽命 `chrome.runtime.connect()` Port，承載 chunk／done／error 串流協定與取消。
- 三家 LLM provider 開啟串流，逐步 yield chunk；分派器 `translateText` 對應暴露串流介面；Google 翻譯免費端點維持非串流（以單一 chunk 形式併入串流介面）。
- 頁內譯文節點支援逐字增量 append（打字機），完整保留雙語對照、插在段落下方、再觸發即還原（toggle）、逐段失敗隔離。
- 串流為單段懸停 AI 翻譯的預設行為，不需使用者額外開關。
- 串流呼叫失敗時回退為非串流的一次性翻譯，保證功能可用。

**Non-Goals:**

- **全文翻譯**：為獨立 change（`full-page-translation`，已暫存）；且全文翻譯明確不使用逐字串流。
- **智慧上下文 / prompt 上下文感知**：以頁面正文注入 prompt 的能力不在此 change。
- **新增 provider 或更換 SDK**：沿用既有 openai、@anthropic-ai/sdk、@google/genai。
- **譯文快取、批次 DOM、僅譯文模式、視覺打磨**：不在此 change。
- **設定 UI 變更**：串流預設開啟、無使用者開關，故 popup 設定不變動。

## Decisions

### 訊息層改為長壽命 Port 連線取代一次性 sendMessage

`src/utils/messaging.ts` 改用 `chrome.runtime.connect({ name: "translate-stream" })` 建立長壽命 Port。content 端以 `requestTranslateStream(text, handlers)` 開連線並送啟動訊息；background 端以 `registerTranslateStreamHandler` 在 `chrome.runtime.onConnect` 註冊，於 chunk 產生時 `port.postMessage` 推送。理由：一次性 `sendMessage`/`sendResponse` 只能回一次，無法承載「逐步多次推送」；Port 是 MV3 中為長壽命雙向通訊設計的原語。替代方案：（a）保留 `sendMessage` 但每個 chunk 發一則獨立訊息——否決，缺乏連線生命週期與取消、且訊息順序與配對需自行重建；（b）用 `chrome.runtime.Port` 以外的 BroadcastChannel——否決，跨 content/background 不適用。既有的一次性 `requestTranslate` 路徑在串流落地後移除或改為 fallback 內部使用。

### Port 串流訊息封套採 start / chunk / done / error（提議預設，apply 時確認）

content → background：`{ type: "start", id, text }`；background → content：`{ type: "chunk", id, delta }`、`{ type: "done", id }`、`{ type: "error", id, message }`。`id` 由 content 以 `crypto.randomUUID()` 產生，用於在同一 Port 上配對請求與回應（允許未來一條 Port 多請求）。`delta` 為自上次以來新增的譯文片段（增量，非累積）。理由：明確的封套讓 content 端能區分「還在串、串完了、出錯了」三態，對應現有 placeholder→替換→失敗提示三種 UI 狀態。此封套形狀為提議預設，最終欄位命名於 apply 時確認（見 Open Questions）。

### provider 以 async generator 逐步 yield chunk

三家 LLM provider 函式新增串流版本，簽章為 `(text, targetLangName, opts, signal?) => AsyncIterable<string>`，逐步 yield 譯文增量片段：

- OpenAI：`chat.completions.create({ ..., stream: true })`，逐 chunk 取 `choices[0].delta.content`。
- Anthropic：`messages.create({ ..., stream: true })`（或 `messages.stream`），取 `content_block_delta` 的 `text`。
- Gemini：`generateContentStream(...)`，逐 chunk 取 `chunk.text`。

理由：async generator 是 JS 表達「逐步產生且可被 `for await` 消費」的自然原語，且可被 `AbortSignal` 中止。替代方案：callback（`onChunk`）——否決，async generator 更易組合與 fallback。既有的非串流 provider 函式保留，作為 fallback 路徑使用。

### 分派器 translateText 暴露串流介面並保留非串流 Google 翻譯

`src/core/translate/translate-text.ts` 新增串流入口（如 `translateTextStream(text, config, signal): AsyncIterable<string>`），依 active provider 路由：LLM 走各家串流 generator；`google-translate` 維持非串流，分派器以「一次 yield 完整字串」的單一 chunk 形式併入同一串流介面，使 background 對 provider 串流與否無感。理由：保持 background 串流迴圈統一，同時不必為免費端點硬做串流（其端點不支援）。既有非串流 `translateText` 保留供 fallback。

### 頁內譯文逐字增量 append 的打字機渲染保留雙語與 toggle

`src/core/translate/insert.ts` 新增增量寫入 API（如 `appendChunk(wrapper, delta)`），把 chunk 累加進既有 `data-ct-body` 節點的文字，取代「一次 `fillWrapper` 全文替換」。`src/core/translate/walker.ts` 與 `src/entrypoints/content/node-translation.ts` 改為消費串流：建立 placeholder wrapper 後，逐 chunk append；done 時定版（調整 opacity）；error 時改用 `failWrapper` 顯示提示。雙語對照（插在段落下方、block 前加 `br`、`notranslate` class）與 toggle 還原、逐段失敗隔離行為完全保留。理由：打字機只改「譯文如何被寫入」，不改插入位置與結構。

### background entrypoint 改寫為 Port 串流模型

`src/entrypoints/background/index.ts` 從 `registerTranslateHandler(async (text) => translateText(...))` 改為註冊 Port 串流處理：收到 `start` 後讀 config、建立 `AbortController`、`for await` 消費 `translateTextStream`，每 chunk `postMessage({ type: "chunk", delta })`，結束送 `done`，例外送 `error`。理由：與 Port／串流契約對齊。每次 `start` 仍即時讀 config，沿用既有「反映 popup 最新設定」原則。

### 串流失敗回退為非串流翻譯

當某 provider 的串流呼叫在建立或進行中拋錯（SDK 不支援、端點拒絕串流、解析失敗等），background 回退為呼叫該 provider 既有的非串流函式，取得完整字串後以單一 `chunk` + `done` 推送，使用者仍看到譯文（只是非逐字）。理由：串流是體感優化，不應因串流故障導致整體不可用。回退觸發點與粒度（在第一個 chunk 前才回退，或串到一半也能回退）於 Open Questions 記錄。

### 中途取消斷開 Port 並中止 provider 串流

使用者在串流進行中對同段再次觸發（toggle off）或離開時，content 端送 `{ type: "cancel", id }` 並／或 `port.disconnect()`；background 在 `onDisconnect` 或收到 cancel 時呼叫 `AbortController.abort()`，中止 provider 串流，停止推送。已 append 的譯文 wrapper 依 toggle 語意移除。理由：避免取消後仍消耗 token 與寫入 DOM。最終取消觸發語意（cancel 訊息 vs 純 disconnect）於 Open Questions 記錄。

### 串流預設開啟

單段懸停 AI 翻譯一律走串流路徑，不新增使用者開關、不改動 config schema 與 popup。理由：需求鎖定為「預設開啟」；非串流僅作為失敗回退的內部路徑，非使用者可見選項。

## Implementation Contract

- **可觀察行為**：
  - 使用者在網頁懸停某段落、按住熱鍵（預設 Control）觸發單段 AI 翻譯（LLM provider）時，段落下方的譯文逐字（打字機）浮現，而非等待數秒後整段一次出現。
  - 既有行為不變：雙語對照插在段落下方、再觸發同段即移除（toggle）、單段失敗只在該段顯示提示、輸入框/contenteditable 內不觸發、Google 翻譯 provider 仍可翻（以非逐字方式整段出現）。
  - 使用者在串流途中 toggle off 同段，串流停止、不再寫入、wrapper 依 toggle 語意移除。
- **介面/資料形狀**：
  - Port 名稱 `translate-stream`；content→background 訊息 `{ type: "start", id, text }` 與 `{ type: "cancel", id }`；background→content 訊息 `{ type: "chunk", id, delta }`、`{ type: "done", id }`、`{ type: "error", id, message }`。`delta` 為增量片段（非累積）。
  - provider 串流函式簽章 `(text, targetLangName, opts, signal?) => AsyncIterable<string>`，逐步 yield 增量譯文片段。
  - 分派器串流入口 `translateTextStream(text, config, signal): AsyncIterable<string>`；`google-translate` 以單一 chunk 形式併入。
  - 插入層增量 API：在既有 `data-ct-body` 節點上累加 `delta` 文字。
- **失敗模式**：
  - 串流呼叫失敗 → background 回退呼叫非串流函式，以單一 `chunk` + `done` 推送完整譯文；使用者看到譯文（非逐字）。
  - 非串流回退亦失敗 / 缺 key / 網路錯誤 → background 送 `{ type: "error", message }`，content 以 `failWrapper` 在該段顯示「[翻譯失敗] …」，不影響其他段落、不 crash 頁面。
  - 取消（toggle off / disconnect）→ `AbortController.abort()` 中止 provider 串流，停止推送，不視為錯誤。
- **驗收**：
  - 以有效 LLM key 懸停翻一段較長英文，觀察譯文逐字出現（非一次跳出）。
  - 串流途中 toggle off，確認停止寫入且 wrapper 移除。
  - 以無效 key 觸發，確認該段顯示失敗提示、他段不受影響。
  - 選 Google 翻譯 provider，確認仍能翻（整段出現）且不報錯。
  - 模擬串流呼叫拋錯，確認回退為非串流仍出現完整譯文。
- **範圍邊界**：
  - 範圍內：`src/utils/messaging.ts` 的 Port 契約、三家 LLM provider 串流、`translate-text.ts` 串流分派、`insert.ts`/`walker.ts`/`node-translation.ts` 的增量渲染、`background/index.ts` 的 Port 串流模型、取消與回退。
  - 範圍外：全文翻譯、全文逐字串流、智慧上下文、新增 provider/SDK、快取、設定 UI 變更。

## Risks / Trade-offs

- [官方 SDK 在 service worker 環境的串流相容性可能有坑（ReadableStream / async iterator 行為差異）] → 以 fallback 至非串流保底；先各家最小串流呼叫驗證可行性。
- [Port 連線生命週期管理不當會洩漏（串完未 disconnect、或 background SW 被回收）] → done/error 後明確 disconnect；background 以 `id`→`AbortController` map 管理並於 onDisconnect 清理。
- [增量 append 高頻寫 DOM 可能造成抖動或效能負擔（每 token 一次 textContent 累加）] → chunk 累加為 append 而非整段重設；必要時於 apply 評估以小批次（如每若干字元或以 rAF）合併寫入。
- [取消後仍有 in-flight chunk 抵達 content] → content 端以 `id` 比對，丟棄已取消請求的後續 chunk。
- [回退路徑與串流路徑雙軌增加維護面] → 非串流 provider 函式保留且僅供 fallback；串流為主路徑，介面集中在分派器。

## Open Questions

- **Port 訊息封套最終形狀**：本設計提議 `start`/`chunk`/`done`/`error`（外加 `cancel`）與 `id` + 增量 `delta`。最終欄位命名、是否需要 `start` 的回 ack、是否一條 Port 支援多請求，於 apply 時確認。
- **取消機制最終語意**：以顯式 `{ type: "cancel", id }` 訊息、或單純 `port.disconnect()` 觸發 background abort，二者擇一或併用，於 apply 時確認。
- **回退觸發粒度**：僅在「第一個 chunk 抵達前」串流建立失敗才回退，或「串到一半中斷」也回退並接續/重來，於 apply 時確認（預設：以第一個 chunk 前失敗即回退，串到一半中斷則以 error 呈現）。
- **增量寫入節流**：是否需要把多個 token 合併後再寫 DOM（每 N 字元或 rAF），或逐 chunk 直接寫，於 apply 時依實測效能決定。
