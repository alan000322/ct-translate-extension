## 1. 對照文字組裝

- [x] 1.1 建立 src/core/text/bilingual.ts：純函式將段落對（原文、譯文、完成狀態）組裝為 Bilingual copy of completed translations 的格式契約——依文章順序「原文\n譯文」、段間空行、非 done 段落排除、結尾無多餘空行。驗證：src/core/text/bilingual.test.ts 覆蓋 spec 範例（A done／B error／C done → "A\n甲\n\nC\n丙"）、全部 done、零 done 回空字串，npm test 通過。

## 2. 頁面整合

- [x] 2.1 於 src/entrypoints/passage/App.tsx 的 RunView「已完成 m / n 段」列加入「雙語複製」按鈕：至少一段 done 才啟用，點擊以 navigator.clipboard.writeText 寫入組裝結果（不經 background、不加 manifest 權限），成功原地顯示「已複製 ✓」約兩秒後還原、失敗顯示錯誤提示；對照資料由 src/entrypoints/passage/usePassage.ts 既有 atoms/groups/runs 衍生。驗證：npm run compile 通過；playwright 假串流斷言——複製後剪貼簿內容等於 spec 範例格式、零 done 時按鈕停用、按鈕回饋文字出現後還原。

## 3. 驗收

- [x] 3.1 全套驗收：npm test、npm run compile、npm run build 通過；手動於真實擴充中翻譯數段後按「雙語複製」，貼到編輯器確認中英對照格式正確、未完成段未混入。
