## 1. 核心模組：分段與任務定義

- [x] 1.1 建立 src/core/text/segment.ts，依 design「純文字段落偵測與無損合併資料模型」實作 Paragraph detection from pasted text：detectSegments(text) 先正規化 CRLF、以連續兩個以上換行切段、trim 後剔除空段，切不出多段且含單換行時退為單換行切段；同檔提供 group 合併／拆分純函式（atom 連續區間模型），滿足 Lossless merge and split of adjacent segments 的無損還原契約。驗證：src/core/text/segment.test.ts 覆蓋 spec 範例表五個案例與合併後拆回 byte-identical，npm test 通過。
- [x] 1.2 建立 src/core/translate/tasks.ts：匯出 TaskKind 型別（"translate" | "summarize" | "analyze"）、任務常數與輸入上限常數 50,000 字元，供訊息契約、background 路由與頁面 Input guards 共用。驗證：npm run compile 無型別錯誤，後續任務以此單一來源引用無重複字面值。

## 2. 訊息契約與 provider 任務化

- [x] 2.1 擴充 src/utils/messaging.ts 的 Streaming message envelope：StartMessage 新增選用欄位 task?: TaskKind，requestTranslateStream 增加選用 task 參數（預設 "translate"），未帶欄位行為與既有完全一致（design「串流訊息契約新增任務種類欄位（向後相容）」）。驗證：新增單元測試斷言未帶 task 時 start 訊息形狀向後相容、帶 task 時欄位正確送出；既有 messaging 相關測試不修改即通過。
- [x] 2.2 依 design「provider 串流介面一般化為接受外部 system prompt」改造 Provider function signature consistency：openai.ts、anthropic.ts、gemini.ts 的串流與非串流函式參數由 targetLangName 改為 systemPrompt，provider 不再自行組裝任務 prompt。驗證：npm run compile 無型別錯誤；翻譯既有行為由 2.3 的薄包裝測試保證。
- [x] 2.3 於 src/core/translate/providers/defaults.ts 新增 summarize 與 analyze 的 prompt builder（design「摘要與剖析的 prompt 契約：繁中輸出、結構化純文字」：摘要一句總起 + 3–5 點重點、剖析博士生 persona 與【研究背景與脈絡】【研究方法】【文獻貢獻】三節、皆固定繁體中文），並於 src/core/translate/translate-text.ts 實作 Task-based prompt assembly and routing：runTaskStream／runTask 依 task 組 prompt 後路由 provider，translateText／translateTextStream 維持原簽名為 translate 薄包裝。驗證：translate-text.test.ts 既有測試不修改即通過，新增測試斷言三種 task 取得正確 system prompt 與缺 key 具名錯誤。
- [x] 2.4 更新 src/entrypoints/background/index.ts：讀取 start 訊息 task 欄位路由至 runTaskStream，沿用「串流首 chunk 前失敗 → 回退非串流 runTask」行為；未帶 task 的既有懸停翻譯行為不變。驗證：npm run compile 通過；手動迴歸——載入擴充後於任一網頁懸停翻譯如常運作。

## 3. 整段翻譯頁面

- [x] 3.1 依 design「以 WXT unlisted page 建立整段翻譯分頁，popup 按鈕開啟」實作 Popup entry opens the passage translation page：新增 src/entrypoints/passage/（index.html、main.tsx、App.tsx、style.css）骨架，src/entrypoints/popup/App.tsx 加入「整段翻譯」入口按鈕以 chrome.tabs.create 開啟 chrome.runtime.getURL("/passage.html")。驗證：npm run build 產物含 passage.html；手動點擊 popup 按鈕於新分頁開啟頁面。
- [x] 3.2 以 impeccable craft 流程實作頁面輸入態 UI（design「頁面視覺延續 popup 設計 token，閱讀版面為中軸單欄」）：style.css 帶入與 popup 同組 CSS token（檔頭註記來源）、頂部工具列（標題＋字元計數＋三動作按鈕）、約 72ch 中軸閱讀欄、大面積 textarea、空態引導文案；實作 Input guards——空白輸入不發請求並顯示空態提示、超過 50,000 字元時三按鈕停用並顯示超限提示與即時字數。驗證：手動斷言空白輸入、49,999／50,001 字元兩側的按鈕啟用狀態與提示文案。
- [x] 3.3 實作段落卡與畫記互動：按「翻譯」前先呈現偵測段落卡，相鄰卡間提供合併控制、合併群組提供拆回控制（Lossless merge and split of adjacent segments 的 UI 層），任務進行中合併／拆分控制停用。驗證：手動斷言合併兩段後送譯為單一請求、拆回後文字與偵測結果一致、翻譯中控制呈停用態。
- [x] 3.4 實作 Per-segment streaming translation with bilingual layout 編排（design「逐段送譯的並行上限與段落級錯誤隔離」）：每 group 一條 translate-stream 請求、並行上限 3、其餘依文章順序排隊，譯文以打字機串流呈現於該段原文正下方。驗證：手動貼入 6 段以上文章，斷言同時最多 3 段在串流、完成後每卡為雙語對照。
- [x] 3.5 實作 Segment-level error isolation and retry：單段失敗僅該卡顯示錯誤與「重試」（只重送該段），「全部取消」取消所有進行中與排隊請求、取消不顯示錯誤且卡片回到送譯前狀態。驗證：手動以無效 API key 觸發單段錯誤後換回有效 key 重試成功；串流中按全部取消斷言無錯誤提示。
- [x] 3.6 實作 Full-text summary task 與 Research analysis task 的前端：「全文摘要」「研究重點剖析」以對應 task 送出全文，結果面板於原文上方以 pre-wrap 串流呈現（Analysis results rendered as preformatted text），失敗時面板顯示錯誤、取消時回到任務前狀態；實作 Task exclusivity——任一任務進行中其餘動作按鈕停用。驗證：手動各跑一次斷言繁中輸出、剖析含【研究背景與脈絡】【研究方法】【文獻貢獻】三節、任務互斥停用狀態正確。

## 4. 驗收與迴歸

- [x] 4.1 全套自動驗收：npm test（segment、messaging、translate-text 新舊測試全綠）、npm run compile、npm run build（產物含 passage.html）皆通過。
- [x] 4.2 依 design Implementation Contract 的手動驗收清單走完端到端：popup 開頁 → 貼多段英文 → 逐段翻譯浮現 → 合併重翻為單請求 → 摘要與剖析繁中輸出 → 回任意網頁懸停翻譯不受影響。驗證：清單逐項勾核無一失敗。
