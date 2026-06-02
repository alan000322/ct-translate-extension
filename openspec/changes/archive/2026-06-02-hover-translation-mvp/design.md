## Context

全新專案（greenfield），無既有程式碼。需求與架構已於 /spectra-discuss 收斂：純自有、無登入、API key 留本機、翻譯流量直連官方端點。技術選型最終定為 WXT + React + Tailwind（放棄「純 JS 無框架」初始想法，因其會卡死官方 SDK 與後續 defuddle 智慧上下文）。本 change 是第一個垂直切片，目標打通主幹並交付懸停段落翻譯。設計脈絡（馬卡龍功能色系、字體、克制原則）已記於 .impeccable.md，本 change 不做完整視覺打磨。實作做法大量參考 guide.md 與 read-frog 開源專案。

## Goals / Non-Goals

**Goals:**

- 建立可建置、可載入 Chrome 的 MV3 擴充鷹架（WXT 三 entrypoint）。
- 翻譯引擎可實際翻出字串：4 個 provider（OpenAI/Claude/Gemini/Google 翻譯）皆在 background 跑通。
- DOM 切段可正確將頁面標記成段落翻譯單位。
- 懸停 + 熱鍵能對游標下段落做雙語對照翻譯，並可 toggle 還原。
- 最小 popup 能設定 provider/model/key/目標語言並持久化。

**Non-Goals:**

- 全文翻譯、翻譯風格管理器/設定頁、defuddle 智慧上下文、馬卡龍視覺打磨、翻譯快取、批次 DOM、僅譯文模式、iframe 完整支援——均留待後續 change。

## Decisions

### 所有翻譯與 AI 呼叫集中於 background service worker

content script 只處理 DOM 並透過訊息把純文字外包給 background；所有官方 SDK 與 fetch 都在 background 執行。理由：(1) background service worker 無 CORS 限制，官方 SDK 不需開 dangerouslyAllowBrowser；(2) API key 不暴露到頁面 context。替代方案：在 content script 直接呼叫並開 dangerouslyAllowBrowser——否決，因 key 會進頁面 context 且受 CORS 限制。

### 以「段落」為翻譯單位的 DOM 走訪與標記

照搬 read-frog 的 walkAndLabelElement 邏輯（去 TS 型別保留演算法）：遞迴走訪，以「含 inline 子節點的元素」判定為段落（PARAGRAPH 標記），並標記 block/inline；過濾規則排除 SCRIPT/STYLE/CODE/PRE/隱藏/notranslate 等。理由：逐字逐節點翻譯會破壞語意與排版，段落是正確的翻譯粒度。標記用 data-ct-* 屬性，段落翻譯與後續全文翻譯共用同一套。

### provider 分派器路由官方 SDK 與免費端點

統一入口 translateText(text, config) 依 active provider 路由：LLM（openai/anthropic/google-gemini）走各家官方 SDK；google-translate 走 translate-pa.googleapis.com 免費端點手刻 fetch（沿用 read-frog 公開 key）。理由：各家 API 形狀不同（OpenAI chat.completions、Claude system 為頂層參數且回傳 content block 陣列、Gemini systemInstruction 放 config），用 dispatcher 隔離差異。替代方案：Vercel AI SDK 統一介面——使用者明確否決。

### 語言代碼採兩套系統並提供對照表

Google 翻譯需 ISO 639-1（en/zh-TW），LLM 需語言英文全名（Traditional Chinese）。提供小型對照表在 config/lang.ts 做轉換；來源語言預設 auto。理由：兩類 provider 對語言參數的期待不同，集中轉換避免散落。

### 懸停 + 熱鍵採兩段式（trigger 狀態機與翻譯執行分離）

node-translation-trigger 只負責偵測使用者意圖（mousemove 節流追蹤座標、按住熱鍵短延遲後觸發、輸入框內忽略），不碰翻譯；node-translation 收到座標後找最近 block 段落並執行翻譯。預設熱鍵 Control，短延遲 ~80ms 防誤觸。理由：關注點分離，互動邏輯與翻譯邏輯可獨立演進與測試。

### 雙語對照插入與 toggle 還原

譯文以一個帶 notranslate class 的 wrapper 插入段落底部（block 段落前加 br），翻譯中先顯示 spinner 佔位，完成後替換；同段落再次觸發則移除 wrapper（toggle）。理由：雙語對照可逆、最不破壞原頁；toggle 讓使用者快速來回對照。

### config 儲存於 chrome.storage.local 並於每次觸發讀取

config schema 以 zod 定義並存於 chrome.storage.local，content/background/popup 共用；段落翻譯每次觸發才讀 config，避免長駐 content script 設定漂移。理由：跨 context 共享、即時反映 popup 變更。

### content 與 background 的訊息契約

定義單一訊息類型 translate：content 送 { text }，background 讀 config、呼叫 translateText、回傳譯文字串或結構化錯誤。理由：最小化跨 context 介面，便於後續擴充其他訊息。

## Implementation Contract

- **可觀察行為**：
  - 使用者在任意網頁將滑鼠停在某段落上、按住 Control（預設）約 80ms，該段落底下出現繁體中文譯文（雙語對照）；再次同樣操作則譯文消失。
  - popup 可選 provider（OpenAI/Claude/Gemini/Google 翻譯）；LLM provider 顯示 model 下拉與 API key 欄位；可設定目標語言（繁中/日/英）。設定重開 popup 後仍保留。
  - 選 Google 翻譯時免填 key 即可翻譯；選 LLM 但未填 key 時，觸發翻譯會在該段落顯示錯誤提示而非靜默失敗。
- **介面/資料形狀**：
  - config 形狀見 specs/settings-popup（language.sourceCode/targetCode、providersConfig[]、activeProviderId、translate.node.hotkey 等），以 zod schema 驗證。
  - 訊息契約：sendMessage("translate", { text: string }) → Promise<string>；失敗時 background 回傳 { error: string } 形狀，content 將其轉為段落內錯誤提示。
  - provider 函式統一簽章 (text, targetLangName/from-to, opts) => Promise<string>。
  - DOM 標記屬性：data-ct-walked、data-ct-paragraph、data-ct-block、data-ct-inline；譯文 wrapper class ct-translated-wrapper。
- **失敗模式**：缺 key／網路錯誤／provider 回傳非預期格式 → background 拋出可序列化錯誤訊息，content 在該段落 wrapper 顯示「[翻譯失敗]」或具體訊息，不影響其他段落、不 crash 頁面。
- **驗收**：擴充能 build 並載入 Chrome（無 manifest 錯誤）；四個 provider 各以一段英文輸入驗證能回傳繁中（LLM 需測試 key）；懸停熱鍵在一般文章頁可翻可 toggle；popup 設定持久化（重開保留）。
- **範圍邊界**：
  - 範圍內：上述四 capability 的行為、background 集中翻譯、雙語插入、最小 popup。
  - 範圍外：全文翻譯、風格管理/設定頁、defuddle 上下文、視覺打磨、快取、僅譯文模式、iframe/Shadow DOM 深度支援。

## Risks / Trade-offs

- [官方 SDK 在 service worker 環境相容性可能有坑（如 fetch/stream 差異）] → 先以非 streaming 的單次 create 呼叫，必要時退回手刻 fetch 打官方 REST 端點。
- [Google 翻譯免費端點為非正式內部端點，量大或商用恐被擋] → MVP 可接受；後續 change 再評估官方 API 備援。
- [getComputedStyle 在大頁面遞迴走訪可能造成效能負擔] → MVP 段落翻譯只標記游標下的子樹，範圍小；全文翻譯（後續 change）再引入延遲翻譯與批次。
- [WXT content script 注入 React 與宿主頁面樣式衝突] → popup/options 用 React；頁內譯文 MVP 以原生 DOM 插入、最小樣式，視覺隔離（Shadow DOM）打磨留後續 change。
- [zod 等依賴增加 bundle 體積] → 可接受；WXT/Vite 已做 tree-shaking。
