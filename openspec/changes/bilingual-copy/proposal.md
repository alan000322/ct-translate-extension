## Why

整段翻譯頁翻譯完成後，譯文只能留在頁面上閱讀；研究型使用者經常需要把中英對照內容帶去筆記、文件或郵件。需要「雙語複製」：一鍵把所有已完成段落的原文＋譯文複製到剪貼簿。（於 /spectra-discuss 鎖定：整篇一鍵複製、逐段交錯純文字、只含已完成段落、頁面端剪貼簿 API、按鈕原地回饋。）

## What Changes

- 整段翻譯頁 run view 新增「雙語複製」按鈕（與「已完成 m / n 段」同列），至少一段翻譯完成時可用。
- 複製格式：依文章順序，每段「原文換行譯文」、段與段之間以空行分隔的純文字；未完成／錯誤段落跳過不混入。
- 以頁面端 navigator.clipboard.writeText 寫入剪貼簿（使用者點擊手勢內），不經 background、不新增 manifest 權限。
- 複製成功後按鈕原地短暫顯示「已複製 ✓」約兩秒後還原；失敗時顯示錯誤提示。
- 對照文字的組裝抽為純函式並附單元測試。

## Non-Goals (optional)

- 不做逐段複製鈕、不做「只複製譯文」或「先全文原文再全文譯文」等其他格式選項。
- 不做 Markdown／HTML 富文字剪貼簿格式（僅純文字）。
- 不做匯出檔案（txt/docx）與分享功能。
- 不涵蓋懸停翻譯與全頁翻譯（網頁 DOM）情境的複製。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `passage-translation-page`: 新增「雙語複製」需求——已完成段落的中英對照一鍵複製、格式契約、按鈕啟用條件與回饋行為。（本 capability 的基底 spec 位於進行中的 passage-translation-page change，尚未歸檔；本 change 以 ADDED Requirements 疊加，歸檔時合併。）

## Impact

- Affected specs: passage-translation-page（新增 1 個 requirement）。
- Affected code:
  - New:
    - src/core/text/bilingual.ts （對照文字組裝純函式）
    - src/core/text/bilingual.test.ts （格式與跳過規則測試）
  - Modified:
    - src/entrypoints/passage/App.tsx （RunView 新增「雙語複製」按鈕與回饋狀態）
    - src/entrypoints/passage/usePassage.ts （彙整已完成段落的對照資料）
  - Removed:
    - (none)
