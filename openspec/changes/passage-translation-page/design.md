## Context

擴充現有三條翻譯路徑基礎：(1) provider 層（src/core/translate/providers/）以各家官方 SDK 在 background 執行，串流介面目前是「翻譯專用」——以 translateSystemPrompt(targetLangName) 寫死 system prompt；(2) 串流訊息契約（src/utils/messaging.ts）以長壽命 Port 將譯文增量推回呼叫端，StartMessage 目前只有 type/id/text；(3) popup（src/entrypoints/popup/）已建立馬卡龍色系與 CSS 變數設計 token（--ink-soft、--hairline 等）。本 change 新增一個獨立分頁頁面，輸入來源是使用者貼上的純文字（非 DOM），因此與進行中的 full-page-translation change（DOM 走訪、defuddle）無程式碼重疊，僅共享 provider 與訊息通道主幹。

## Goals / Non-Goals

**Goals:**

- 獨立「整段翻譯」分頁：貼上文字 → 自動分段 → 逐段串流翻譯 → 譯文置於各段下方的雙語對照。
- 送譯前可互動修正分段：相鄰段落畫記合併、合併後可拆回原始偵測結果（無損）。
- 「全文摘要」與「研究重點剖析」兩種全文分析任務，皆以繁體中文串流輸出。
- 訊息契約與 provider 層一般化為「任務」模型，翻譯／摘要／剖析共用同一條串流通道；既有懸停翻譯行為完全不變（未帶任務欄位即為翻譯）。
- 頁面 UI 達 impeccable 設計標準，延續 popup 的視覺語言。

**Non-Goals:**

- 不處理網頁 DOM（該情境屬 full-page-translation change）；不偵測使用者目前分頁內容、不自動帶入網頁文字。
- 不做檔案上傳（PDF/Word 解析）；輸入僅限貼上的純文字。
- 不做翻譯結果的編輯、匯出、歷史紀錄與收藏。
- 不新增 markdown 渲染相依套件；分析輸出以結構化純文字呈現。
- 不做批次併段送譯（%% 分隔符屬 full-page-translation 的 batch-translation capability）；本頁逐段獨立請求。
- 不新增設定項（沿用既有 provider／目標語言設定）。

## Decisions

### 以 WXT unlisted page 建立整段翻譯分頁，popup 按鈕開啟

新增 src/entrypoints/passage/（index.html + main.tsx + App.tsx + style.css），WXT 會編譯為擴充內的 passage.html。popup 新增入口按鈕，以 chrome.tabs.create 開啟 chrome.runtime.getURL("/passage.html")。替代方案：options page（語意是「設定」，不合）、在 popup 內展開（空間不足以承載長文閱讀版面）。分頁頁面屬擴充原生 context，可直接使用既有 requestTranslateStream 與 chrome.storage，不需 content script 橋接。

### 純文字段落偵測與無損合併資料模型

新增 src/core/text/segment.ts：先把 CRLF 正規化為 LF，以「連續兩個以上換行（空行）」切段；若整篇切不出多段但含單一換行，退而以單一換行切段。每段 trim、空段剔除。資料模型分兩層：偵測產生的原子段（atom，不可再分）與顯示用的群組（group，一個 group 含一個以上連續 atom）。「合併」是把相鄰 group 併為一個 group（送譯文字以 \n 接合）；「拆回」是把 group 還原為各 atom 一組——因 atom 永不變動，拆回必然無損。替代方案：直接改寫段落字串再用正則重切（有損、無法還原使用者操作前狀態），不採。

### 串流訊息契約新增任務種類欄位（向後相容）

src/utils/messaging.ts 的 StartMessage 新增選用欄位 task?: "translate" | "summarize" | "analyze"，未帶或未知值一律視為 "translate"，既有懸停翻譯呼叫端零修改。TaskKind 型別與三種值的常數定義集中於新檔 src/core/translate/tasks.ts。替代方案：另開第二條 Port 名稱給分析任務——多一條通道但訊息形狀重複，不採。

### provider 串流介面一般化為接受外部 system prompt

各 provider（openai/anthropic/gemini）的串流與非串流函式，參數由 targetLangName 改為 systemPrompt：呼叫端組裝好 system prompt 後傳入，provider 只負責「給定 system + user 文字 → 產出（串流）回應」。src/core/translate/translate-text.ts 改為任務路由層：輸出 runTaskStream(task, text, config, signal) 與非串流 runTask(task, text, config)，依 task 從 defaults.ts 的 prompt builder 取得 system prompt（translate 用既有 translateSystemPrompt 帶目標語言；summarize／analyze 用新 builder），再走 provider。既有 translateTextStream／translateText 保留為 translate 任務的薄包裝，呼叫端簽名不變。background（src/entrypoints/background/index.ts）讀取 start 訊息的 task 欄位路由至 runTaskStream，並沿用「串流首 chunk 前失敗 → 回退非串流」的既有行為。替代方案：為摘要／剖析各寫三家 provider 專用函式（九個近重複實作），不採。

### 摘要與剖析的 prompt 契約：繁中輸出、結構化純文字

兩個 prompt builder 置於 src/core/translate/providers/defaults.ts。summarize：要求以繁體中文輸出全文摘要，先一句總起、再 3–5 點重點，無論原文語言為何。analyze：system prompt 設定「精通各科文獻的全能博士生」persona，要求依固定三節輸出——「研究背景與脈絡」「研究方法」「文獻貢獻」（文獻貢獻需明確指出屬於獨特方法、獨特見解、或發現獨特現象，可複選），每節以「【節名】」起首的純文字結構輸出（不要求 markdown），各節 2–6 句。兩任務輸出語言固定繁體中文，不受 config.language.targetCode 影響（targetCode 僅作用於 translate 任務）。UI 以 whitespace-pre-wrap 呈現，不引入 markdown 渲染套件。

### 逐段送譯的並行上限與段落級錯誤隔離

按「翻譯」後，每個 group 各開一條 translate-stream Port，並行上限 3、其餘依序排隊（避免同時開數十條 SDK 串流觸發 rate limit）。每段獨立狀態機：pending → streaming → done | error；單段 error 不影響其他段，該段卡片顯示錯誤訊息與「重試」鈕（僅重送該段）。翻譯進行中所有分段編輯（合併／拆分）停用；提供「全部取消」會呼叫各段的 cancel 函式。全文摘要／剖析為單一請求，與逐段翻譯互斥進行（同時只允許一種任務在跑）。輸入上限 50,000 字元，超出時按鈕停用並顯示提示。

### 頁面視覺延續 popup 設計 token，閱讀版面為中軸單欄

passage/style.css 自帶與 popup 相同的一組 CSS 變數 token（--ink、--ink-soft、--hairline、馬卡龍色），不抽共用檔——兩處 token 量小，抽檔的耦合成本高於複製成本；待第三個頁面出現再抽。版面：頂部工具列（標題、字元計數、「翻譯」「全文摘要」「研究重點剖析」三動作）+ 中軸閱讀欄（max-width 約 72ch）。輸入態是大面積 textarea；按下任一動作後切換為段落卡流（原文段 + 其下譯文區，譯文以打字機串流浮現），分析結果呈現於原文上方的獨立結果面板。實作時依 impeccable craft 流程先定設計方向再落版，繁中介面、明確的空態（未貼文字時的引導文案）與載入態。

## Implementation Contract

**可觀察行為**

- popup 出現「整段翻譯」入口；點擊後在新分頁開啟擴充內 passage.html 頁面。
- 頁面貼上含空行的多段文字後按「翻譯」：每個偵測段落以卡片呈現，譯文在該段卡片內、原文正下方以串流逐字浮現；全部完成後每段皆為雙語對照。
- 送譯前可點擊相鄰段落卡之間的合併控制，把兩段併為一段；對已合併的群組可拆回自動偵測的原始段落，文字內容與偵測當下完全一致。
- 按「全文摘要」：結果面板串流輸出繁體中文摘要（一句總起 + 3–5 點重點）。按「研究重點剖析」：結果面板串流輸出含「【研究背景與脈絡】」「【研究方法】」「【文獻貢獻】」三節的繁中分析。
- 既有懸停翻譯行為不變（迴歸：StartMessage 未帶 task 時走 translate）。

**介面／資料形狀**

- src/core/text/segment.ts：detectSegments(text: string): string[]（原子段陣列）；群組以「各 group 對應的 atom index 連續區間」表示，合併／拆分為純函式操作。
- src/utils/messaging.ts：StartMessage 增加 task?: TaskKind；requestTranslateStream 增加選用 task 參數（預設 "translate"），回傳 cancel 函式的契約不變。
- src/core/translate/tasks.ts：export type TaskKind = "translate" | "summarize" | "analyze" 與對應常數。
- src/core/translate/translate-text.ts：export runTaskStream(task, text, config, signal) 與 runTask(task, text, config)；translateTextStream／translateText 維持原簽名（translate 薄包裝）。
- provider 函式簽名：(text, systemPrompt, opts[, signal])，回傳形狀不變。

**失敗模式**

- 缺 API key／provider 錯誤：沿用既有具名錯誤訊息，逐段翻譯時呈現在該段卡片內；分析任務呈現在結果面板。
- 串流首 chunk 前失敗：background 回退非串流、單 chunk 補上（沿用既有 fallback）。
- 取消：不顯示錯誤，段落卡回到送譯前狀態。
- 輸入超過 50,000 字元：三個動作按鈕停用並顯示超限提示，不發出請求。
- 貼上純空白文字按動作：不發請求，顯示空態提示。

**驗收標準**

- vitest：segment.test.ts 覆蓋空行切段、單換行 fallback、CRLF 正規化、空段剔除、合併與拆回無損（npm test 通過）。
- vitest：messaging 既有測試不變更仍通過；新增 task 欄位預設值測試。
- npm run compile 無型別錯誤；npm run build 產出含 passage.html。
- 手動驗證：載入擴充 → popup 開啟整段翻譯頁 → 貼多段英文文章 → 翻譯逐段浮現；合併兩段後重新翻譯為單一請求；摘要與剖析各跑一次確認繁中輸出與三節結構；回到任一網頁確認懸停翻譯如常。

**範圍邊界**

- In scope：上述新頁面、segment 模組、訊息契約 task 欄位、provider system prompt 一般化、popup 入口按鈕。
- Out of scope：網頁 DOM 翻譯與 defuddle（full-page-translation change）、檔案上傳、結果匯出／歷史、markdown 渲染套件、新設定項、%% 批次併段。

## Risks / Trade-offs

- [provider 簽名變更觸及進行中的 full-page-translation change] → 該 change 走 translateText 既有簽名（保留不變的薄包裝），不受影響；若其後續任務直接呼叫 provider 函式，apply 時以 compile 錯誤即時暴露，修正點單一。
- [逐段請求數量大（長文數十段）導致 rate limit 或費用顧慮] → 並行上限 3 + 依序排隊；段落級重試避免整批重跑。v1 不做併段批次，留待與 batch-translation 收斂。
- [LLM 不遵守「【節名】」結構或混入簡體] → prompt 明示固定節名與「一律使用繁體中文」；呈現層不解析結構（pre-wrap 原樣輸出），結構偏差只影響觀感不致功能損壞。
- [50,000 字元上限對超長論文不足] → 上限為防呆而非能力邊界，常數集中於 tasks.ts，後續可依模型 context 調整或分塊摘要（out of scope）。
- [兩處設計 token 複製造成日後不同步] → token 數量小且頁面各自獨立；於 style.css 註記來源為 popup token，第三個頁面出現時再抽共用。
