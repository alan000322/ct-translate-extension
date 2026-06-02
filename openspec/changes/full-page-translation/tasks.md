## 1. 相依與設定

- [x] 1.1 新增 defuddle 相依（package.json，比照 read-frog 的 ^0.18.1），完成後 `pnpm install` 成功且 `import("defuddle/full")` 可在 content script 動態載入；以 typecheck/build 通過驗證。
- [x] 1.2 在 src/config/schema.ts 的 configSchema.translate 新增 fullPage 物件（enabled 預設 true、可設定快捷鍵、batchSize、charLimit），落實「批次大小與字元上限」的可設定欄位與保守預設；以 schema 預設值單元測試（解析空 config 得到預期預設）驗證，且既有 translate.node/page/mode 行為不變。

## 2. 主內容範圍偵測

- [x] 2.1 在 src/core/dom/main-content.ts 實作「以 Defuddle 界定主內容範圍，再對應回 live DOM 容器」：以 snapshot HTMLDocument 跑 defuddle/full parse 解析出主內容根，對應回 live HTMLElement，失敗時退回 document.body，交付 spec「Main-content scope detection」行為（涵蓋 article、排除 nav/側欄/頁尾）；以單元測試（給定含 nav/sidebar/article/footer 的 DOM，解析根涵蓋 article 排除其餘；Defuddle 失敗退回 body）驗證。

## 3. 批次翻譯機制

- [x] 3.1 在 src/core/translate/batch.ts 實作「以 `%%` 分隔符批次送譯、逐段填回（不逐字串流）」的併合與切分：匯出 BATCH_SEPARATOR、joinBatch(texts) 與 parseBatchResult(raw)，交付 spec「Batch multiple paragraphs into one request」的 round-trip 與分隔符容忍語意；以單元測試覆蓋多換行、前後空白、tab、單段無分隔等變體（比照 read-frog batch-separator-parsing 案例表）驗證。
- [x] 3.2 在 batch.ts 實作「批次大小與字元上限」的分批器：依段落數上限與字元數上限先到者斷批，交付 spec「Batch size limits」行為；以單元測試（超過段數上限會分多批、累加超過字元上限前先斷批）驗證。
- [x] 3.3 在 src/utils/messaging.ts 新增批次翻譯訊息契約（具名 requestTranslateBatch，與既有 requestTranslate 並存，沿用 { error } 失敗形狀），並在 src/entrypoints/background/index.ts 註冊對應 handler，交付「content 送一批文字 → background 回該批譯文」的可觀察行為；以背景 handler 對一組輸入回傳併合譯文的測試或手動訊息往返驗證。

## 4. 整頁翻譯編排

- [x] 4.1 在 src/core/translate/full-page.ts 實作整頁翻譯入口：收集主內容根內 data-ct-paragraph 段落（沿用 walkAndLabelElement / extractTextContent / shouldTranslate）、送批前對每段 createPendingWrapper、各批回傳後以 fillWrapper 逐段填回，交付 spec「Per-paragraph fill-back display」的逐段浮現與雙語對照行為（不逐字串流）；以實際文章頁手動驗證每段先出現 placeholder、隨批次完成逐段填入譯文。
- [x] 4.2 在 full-page.ts 實作「單批失敗與段落數不符的隔離處理」：單批請求失敗對該批各段 failWrapper、其餘批照常；切分段數與送出段數不符時整批視為失敗不錯位填入，交付 spec「Per-batch failure isolation」行為；以單元測試（模擬一批拋錯、模擬段數不符）加實際頁面手動驗證其餘段落仍正常顯示。
- [x] 4.3 在 full-page.ts 實作「整頁 toggle 還原與快照語意」：以模組層級狀態決定本次為翻譯或還原，再次觸發移除主內容根內所有 CONTENT_WRAPPER_CLASS 譯文 wrapper；段落集合只在觸發當下收集一次、不註冊任何 observer，交付 spec「Whole-page toggle undo」與「Snapshot semantics」行為；以手動驗證（再次觸發回到原文；觸發後站方新增內容不被自動翻譯）驗證。

## 5. 觸發來源

- [ ] 5.1 在 src/entrypoints/content/full-page-trigger.ts 實作「全頁觸發：popup 按鈕 + 與懸停區隔的鍵盤快捷鍵」的快捷鍵監聽（修飾鍵和弦、可設定、沿用 isEditable 在輸入框/contenteditable 忽略），並於 src/entrypoints/content/index.tsx 註冊，交付 spec「Two triggers distinct from hover hotkey」的快捷鍵分支（不與懸停熱鍵衝突）；以手動驗證（快捷鍵觸發整頁翻譯、輸入框內不觸發、懸停單段不受影響）驗證。
- [ ] 5.2 在 src/entrypoints/popup/App.tsx 新增「翻譯整頁」按鈕，按下後對當前分頁 content script 發訊息觸發全頁翻譯，補滿 spec「Two triggers distinct from hover hotkey」的 popup 分支；以手動驗證（popup 按鈕觸發當前分頁整頁翻譯）驗證。
