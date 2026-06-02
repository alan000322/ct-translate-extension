## Why

目前擴充只支援「懸停單一段落 + 按住熱鍵」的翻譯（src/entrypoints/content/node-translation.ts），讀者要看完整篇外電必須逐段懸停，閱讀長文時非常費力。需要一個「一鍵翻譯整頁主內容」的模式：自動辨識文章正文（跳過導覽列、側欄、頁尾、廣告），把整篇主內容一次翻成目標語言、逐段浮現，讓讀長文的使用者可以一次看完。本 change 在既有段落切段與翻譯主幹上疊加「全區塊整頁翻譯」，需求已於 /spectra-discuss 鎖定。

## What Changes

- 新增「全區塊整頁翻譯」模式：一鍵翻譯整頁「主內容」。透過 defuddle 套件（defuddle/full，與參考專案 read-frog 用法相同，^0.18.1）辨識文章正文容器，跳過 nav/側欄/頁尾/廣告，決定「要翻哪些區塊」。defuddle 僅用於界定主內容範圍，**不**作為 prompt 上下文（智慧上下文不在範圍內）。
- 沿用既有段落走訪器（src/core/dom/traversal.ts 的 walkAndLabelElement 標記段落單位）取得主內容範圍內的段落節點，但改以 `%%` 分隔符把多個段落**批次**併入單一翻譯請求（read-frog 模式）；批次回傳後依分隔符切回各段落，逐段填回對應節點（「逐段浮現」）。
- 全頁模式**不**使用逐字串流：每個批次完成後整批填回，避免實作 on-the-fly 的 `%%` 串流解析器（逐字串流由另一個平行 change 只針對懸停單段處理）。
- 兩種觸發方式：popup（src/entrypoints/popup/App.tsx）內的按鈕，以及一組鍵盤快捷鍵。全頁快捷鍵必須與既有懸停熱鍵（按住 Control/Alt/Shift 達 80ms）明確區隔；快捷鍵可設定，預設值待確認。
- 顯示沿用既有雙語對照模式（譯文插在原文下方），並支援「再按／再點一次還原整頁」，對應既有懸停 toggle 行為。
- 快照語意：以觸發當下的頁面內容為準翻譯；**不**透過 MutationObserver 監看動態新增內容（v1 不處理）。

## Non-Goals (optional)

<!-- design.md 會建立，Non-Goals 記於 design.md 的 Goals/Non-Goals；此處留空。 -->

## Capabilities

### New Capabilities

- `full-page-translation`: 全區塊整頁翻譯的編排——以 Defuddle 界定主內容範圍、收集範圍內段落、觸發（popup 按鈕 + 鍵盤快捷鍵）、批次送譯後逐段填回、雙語對照顯示、整頁 toggle 還原、快照語意（不監看動態內容）。
- `batch-translation`: 批次翻譯機制——以 `%%` 分隔符把多段併入單一請求、批次大小與字元上限規則、回傳後切回各段、段落數不符與單批失敗的隔離處理。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 2 個 capability spec（full-page-translation、batch-translation）。
- Affected code:
  - New:
    - src/core/dom/main-content.ts （Defuddle 辨識主內容並對應回 live DOM 容器）
    - src/core/translate/batch.ts （BATCH_SEPARATOR、批次併合與 parseBatchResult 切分）
    - src/core/translate/full-page.ts （收集範圍內段落、分批、送譯、逐段填回、整頁 toggle）
    - src/entrypoints/content/full-page-trigger.ts （與懸停區隔的鍵盤快捷鍵監聽）
  - Modified:
    - package.json （新增 defuddle 相依）
    - src/config/schema.ts （新增 translate.fullPage 設定：enabled、快捷鍵、批次大小）
    - src/utils/messaging.ts （新增批次翻譯訊息契約）
    - src/entrypoints/background/index.ts （註冊批次翻譯 handler）
    - src/entrypoints/popup/App.tsx （新增整頁翻譯按鈕與快捷鍵說明）
    - src/entrypoints/content/index.tsx （註冊全頁翻譯觸發）
  - Removed:
    - (none)
