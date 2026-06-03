## Context

擴充目前只有「懸停單段 + 按住熱鍵」翻譯（src/entrypoints/content/node-translation.ts → translateNodeAtPoint → walkAndLabelElement → translateWalkedElement → 每段一次 requestTranslate）。既有資產可直接沿用：

- DOM 切段：src/core/dom/traversal.ts 的 walkAndLabelElement 以「含 inline 子節點的元素」為段落單位，標記 data-ct-paragraph；extractTextContent 抽段落純文字。
- 逐段翻譯與插入：src/core/translate/walker.ts 的 translateWalkedElement 遞迴找段落、src/core/translate/insert.ts 的 createPendingWrapper / fillWrapper / failWrapper 已做到「每段獨立 placeholder + 完成填回 + 失敗隔離」。
- 訊息層：src/utils/messaging.ts 目前是單文字契約 { type:"translate", text } → { text } | { error }，所有 SDK/fetch 在 background。
- 設定：src/config/schema.ts 的 translate.node.{enabled,hotkey}、translate.mode（bilingual / translationOnly）、translate.page.minWordsPerNode。

參考專案 read-frog 的本機 checkout 提供兩個模式：(1) defuddle/full 在 snapshot HTMLDocument 上 parse（src/utils/host/translate/webpage-context.ts）；(2) `%%` 批次分隔符（src/utils/constants/prompt.ts 的 BATCH_SEPARATOR = "%%" 與 BATCH_SEPARATOR_LINE_PATTERN，parseBatchResult 切分，有 src/utils/request/__tests__/batch-separator-parsing.test.ts 覆蓋各種空白變體）。

本 change 在這條主幹上疊加「全區塊整頁翻譯」。需求已於 /spectra-discuss 鎖定，不再重新討論。

## Goals / Non-Goals

**Goals:**

- 一鍵翻譯整頁「主內容」：以 Defuddle 界定文章正文容器，跳過 nav/側欄/頁尾/廣告。
- 沿用既有段落走訪器取得範圍內段落，但以 `%%` 批次併入單一請求，回傳後逐段填回（逐段浮現）。
- 兩種觸發：popup 按鈕 + 一組與懸停明確區隔、可設定的鍵盤快捷鍵。
- 雙語對照顯示（沿用既有 insert wrapper），支援整頁 toggle 還原。
- 快照語意：以觸發當下頁面為準。

**Non-Goals:**

- 智慧上下文 / AI 摘要 / 把 Defuddle 輸出當 prompt 上下文——Defuddle 只用來界定「翻哪些區塊」。
- 全頁逐字串流——全頁一律以批次為單位填回；逐字串流由另一平行 change 只處理懸停單段。
- 動態內容監看（MutationObserver / IntersectionObserver 延遲翻譯）——v1 不處理。
- 翻譯結果快取、僅譯文模式的新切換、iframe 完整支援——沿用既有行為，不在本 change 擴充。

## Decisions

### 以 Defuddle 界定主內容範圍，再對應回 live DOM 容器

以 read-frog 同款方式建立 snapshot HTMLDocument（document.implementation.createHTMLDocument，複製 documentElement.outerHTML），`new Defuddle(snapshotDoc, { url, useAsync:false }).parse()` 辨識文章正文。Defuddle 在 clone 上運作，但翻譯必須作用在 live DOM；因此需要把「主內容」對應回 live 節點：

- 主路徑：取 Defuddle 辨識出的主內容根節點特徵（id / class / tagName 與在文件中的位置），於 live document 解析出對應的 live 根元素，後續 walkAndLabelElement 只在此 live 根內走訪。
- 退路：若無法取得穩定特徵，改以「含最大比例正文文字的 live block 元素」為主內容根（與 src/entrypoints/content/node-translation.ts 既有的 block 判定邏輯一致），最差退回 document.body。

替代方案：直接翻譯 Defuddle 產出的 markdown/HTML 字串——否決，因為那不是 live DOM，無法做雙語就地插入與 toggle 還原。Defuddle 確切回傳的 root 對應 API 需於 apply 階段對照實際 defuddle/full 型別驗證（見 Open Questions）。

### 以 `%%` 分隔符批次送譯、逐段填回（不逐字串流）

收集主內容根內所有 data-ct-paragraph 段落（沿用 walkAndLabelElement 標記、extractTextContent 抽文字、insert.ts 的 shouldTranslate 過濾碎片），依序分批。每批以「換行 + `%%` + 換行」併成單一字串送一次翻譯請求；回傳後用 parseBatchResult 切回，逐段呼叫既有 fillWrapper 填入對應段落的 placeholder。送批前先對每個段落建立 createPendingWrapper（顯示「…」），讓使用者看到逐段浮現。

新增 src/core/translate/batch.ts，定義 BATCH_SEPARATOR、joinBatch(texts)、parseBatchResult(raw)（採 read-frog 容忍空白/多換行的正規式語意，並附對應單元測試）。

替代方案：每段各送一次請求——否決，長文會產生大量請求、慢且耗額度。on-the-fly `%%` 串流解析——否決，明確不在範圍（複雜度高，留給懸停單段的串流 change）。

### 批次大小與字元上限

每批以「段落數上限」與「字元數上限」兩者先到者為界，避免單批過大超出模型輸出或被截斷。預設值待確認（見 Open Questions），本 change 先以可設定參數（translate.fullPage.batchSize 等）落地，並給一組保守預設（建議：每批最多 10 段或 ~3000 字元，先到者斷批）。

### 單批失敗與段落數不符的隔離處理

以「批」為失敗隔離單位：

- 單批請求失敗（拋錯）→ 對該批所有段落呼叫既有 failWrapper 顯示失敗提示，其餘批次照常進行（沿用既有逐段失敗隔離精神，提升到逐批）。
- 回傳段落數與送出段落數不符（切分後數量對不上）→ 視整批為失敗（同上 failWrapper），不做可能錯位的勉強對應。

替代方案：數量不符時盡力對齊——否決，錯位會把譯文填到錯段，比明確失敗更糟。確切策略待 apply 時依實測微調（見 Open Questions）。

### 全頁觸發：popup 按鈕 + 與懸停區隔的鍵盤快捷鍵

提供兩個觸發來源：

- popup：在 src/entrypoints/popup/App.tsx 新增「翻譯整頁」按鈕，按下後對當前分頁的 content script 發訊息觸發全頁翻譯。
- 鍵盤快捷鍵：新增 src/entrypoints/content/full-page-trigger.ts，監聽一組與懸停熱鍵明確區隔的組合鍵。懸停是「按住單一修飾鍵 Control/Alt/Shift 達 80ms」，故全頁採「修飾鍵 + 字母」的和弦（建議預設 Alt+Shift+T，最終值待確認），並沿用既有 isEditable 在輸入框/contenteditable 內忽略。快捷鍵可由 translate.fullPage 設定。

替代方案：複用懸停熱鍵——否決，會與單段翻譯衝突、語意混淆。

### 整頁 toggle 還原與快照語意

再次觸發（按鈕或快捷鍵）= 還原整頁：移除主內容根內所有既有譯文 wrapper（沿用 insert.ts 的 getExistingWrapper / CONTENT_WRAPPER_CLASS 判定，對每段移除），回到原文。以模組層級旗標記錄「整頁已翻譯」狀態以決定本次是翻譯或還原。快照語意：收集段落只在觸發當下執行一次，不註冊任何 observer 監看後續 DOM 變動。

## Implementation Contract

**Behavior（使用者可觀察）：**

- 在文章頁按 popup「翻譯整頁」按鈕或按下全頁快捷鍵 → 主內容區段落逐一出現「…」placeholder，隨各批回傳逐段填入譯文（雙語對照，譯文在原文下方）；nav/側欄/頁尾不被翻譯。
- 再次按按鈕／快捷鍵 → 主內容內所有譯文移除，回到原文。
- 在輸入框 / contenteditable 內按快捷鍵 → 不觸發。
- 單一批次失敗 → 該批段落顯示「[翻譯失敗] …」，其餘段落正常顯示譯文。

**Interface / data shape：**

- 新增批次翻譯訊息契約（src/utils/messaging.ts）：content → background 送一組待譯文字陣列（或已併好的批次字串）；background 回譯文。沿用既有 { error } 失敗形狀。函式具名（如 requestTranslateBatch），與既有 requestTranslate 並存。
- src/core/translate/batch.ts 匯出 BATCH_SEPARATOR、joinBatch(texts: string[]): string、parseBatchResult(raw: string): string[]。
- src/config/schema.ts 的 configSchema.translate 新增 fullPage 物件：{ enabled: boolean(default true), hotkey/shortcut（可設定，預設待確認）, batchSize: number, charLimit: number }，並給預設值；既有 translate.node / page / mode 不變。
- src/core/translate/full-page.ts 匯出整頁翻譯與還原的入口（如 translateFullPage(config) / toggle 行為），由 content 觸發層呼叫。
- src/core/dom/main-content.ts 匯出「解析 live 主內容根元素」的函式（回傳 HTMLElement | null，null 時退回 document.body）。

**Failure modes：**

- Defuddle 解析失敗 → logger.warn 並退回 document.body（沿用 read-frog 的 try/catch 退路精神），全頁翻譯仍可進行（只是範圍較寬）。
- 單批請求失敗或段落數不符 → 該批各段 failWrapper，不中斷其他批。
- 缺 API key 等 → 沿用既有 background 錯誤經 { error } 回傳，於各段顯示失敗提示。

**Acceptance criteria：**

- batch.ts 有單元測試覆蓋 joinBatch / parseBatchResult（含多換行、前後空白、單段無分隔等變體，比照 read-frog batch-separator-parsing.test.ts 案例）。
- main-content.ts 有測試：給定含 nav/側欄/article 的 DOM，解析出的根元素涵蓋 article、排除 nav/側欄。
- 手動驗證：在一篇實際文章頁，popup 按鈕與快捷鍵皆能觸發整頁翻譯、逐段浮現、再次觸發還原；輸入框內快捷鍵不觸發；快捷鍵與懸停熱鍵不衝突。

**Scope boundaries：**

- In scope：主內容界定、批次送譯與逐段填回、兩種觸發、雙語顯示、整頁 toggle、相關設定欄位與 popup 按鈕。
- Out of scope：智慧上下文、全頁逐字串流、動態內容監看、翻譯快取、僅譯文模式新切換、iframe 完整支援。

## Risks / Trade-offs

- [Defuddle 在 clone 上運作，回 live DOM 的對應可能不穩] → 提供退路（最大正文 block → document.body），並於 apply 階段對照實際 defuddle/full API 驗證 root 取得方式。
- [批次過大導致模型輸出截斷或段落數不符] → 以段落數 + 字元數雙上限斷批，數量不符時整批標記失敗而非錯位填入。
- [批次併合破壞段落內語意（如表格、程式碼）] → 沿用既有 shouldTranslate / 不可翻過濾排除碎片與不可翻節點；以 `%%` 僅作標準段落分隔。
- [快捷鍵與網站既有快捷鍵或懸停熱鍵衝突] → 採修飾鍵和弦、可設定、輸入框內忽略；預設值於 Open Questions 待使用者確認。
- [長文單頁大量請求仍可能偏慢] → 批次大幅降低請求數；逐段浮現提供進度感知。

## Open Questions

- 全頁鍵盤快捷鍵的實際組合鍵（可設定，預設值待確認）——須與懸停熱鍵（按住 Control/Alt/Shift）不衝突；建議預設 Alt+Shift+T，待使用者確認。
- 批次大小預設值（每批段落數 / 每請求字元上限）——建議每批最多 10 段或 ~3000 字元，待依實測與目標模型輸出上限確認。
- 單批失敗 / 段落數不符的最終策略細節——本設計定「整批失敗顯示提示、不錯位」，是否需要對失敗批自動重試（例如改小批次重送一次）待確認。
- defuddle/full 的 parse() 是否直接回傳可對應 live DOM 的主內容根特徵——須於 apply 階段對照實際型別；若無，採退路的最大正文 block 啟發式。
