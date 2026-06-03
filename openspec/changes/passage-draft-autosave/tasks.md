## 1. 草稿模組

- [x] 1.1 依 design「草稿資料模型：只存 text 與 groups，schema 驗證後還原」與「儲存位置：browser.storage.local 獨立 key "passageDraft"」建立 src/entrypoints/passage/draft.ts：以 zod 定義 Draft schema（`{ text: string, groups: { start: number, end: number }[] }`），匯出 loadDraft(): Promise<Draft | null> 與 clearDraft()。loadDraft 實現 Corrupt or inconsistent draft degrades silently 的儲存層半部 — schema 驗證失敗回傳 null 並清除壞資料。驗證：draft.test.ts 以 mock browser.storage.local 斷言合法草稿讀回、損壞值回 null 且 key 被移除、clearDraft 後讀回 null；npm test 通過。
- [x] 1.2 依 design「寫入時序：變更後 trailing throttle 3 秒 + pagehide/visibilitychange 立即 flush」在 draft.ts 實作 Throttled autosave of passage draft 的寫入引擎：saveDraft(draft) 排程 trailing throttle 3 秒寫入（窗口內多次呼叫收斂為一次、寫入最新值；內容未變不發寫入），flushDraft() 立即觸發未決寫入；並實現 Storage write failures do not block editing — 寫入失敗靜默吞下、下次 saveDraft 重新排程。驗證：draft.test.ts 以 fake timers 斷言 spec 範例「t=0/1/2 三次變更 → t=3 恰一次寫入且為最終值」、flush 立即寫入、閒置無寫入、寫入 reject 不拋出且後續可再排程；npm test 通過。

## 2. 頁面接線

- [x] 2.1 依 design「接縫：src/entrypoints/passage/draft.ts 擁有草稿契約」與「還原與清除：開頁靜默還原、清空即清除草稿」改造 src/entrypoints/passage/usePassage.ts：text 或 groups 變更時呼叫 saveDraft，實現 Draft cleared when source is emptied — 原文清為空白（無非空白內容）時改呼叫 clearDraft 而非寫空草稿；merge/split 後的 groups 變更同樣觸發 saveDraft。驗證：npm run compile 通過；手動斷言輸入文字 3 秒後 storage 出現 passageDraft、清空文字後 key 消失。
- [x] 2.2 在 usePassage.ts／App.tsx 實作 Silent draft restore on page open：頁面掛載時 loadDraft，有效草稿靜默還原 text 與 groups（重算 atoms 後驗證 groups 連續且恰好覆蓋 atoms，不一致時退為 initialGroups — Corrupt or inconsistent draft degrades silently 的還原層半部）、無草稿則維持空白輸入態；以 ref 守門避免 StrictMode 雙掛載重複套用（design Risks 所列）。驗證：新增 usePassage 還原路徑單元測試或於 draft.test.ts 覆蓋 groups 不一致降級案例（spec 範例：3 段 + 2 組 → 退為 3 組）；手動重開頁面斷言還原後字元計數與段落卡與手動貼入一致、翻譯結果不還原。
- [x] 2.3 實作 Immediate flush on page hide：頁面註冊 visibilitychange（轉 hidden）與 pagehide 監聽呼叫 flushDraft，卸載時移除監聽。驗證：手動輸入文字後 3 秒內立即切換分頁或關閉分頁，重開頁面斷言最後輸入已還原；npm run compile 通過。

## 3. 驗收與迴歸

- [x] 3.1 全套自動驗收：npm test（draft 新測試與既有 segment/messaging/translate-text 測試全綠）、npm run compile、npm run build 皆通過。
- [x] 3.2 端到端手動驗收：貼多段長文＋合併兩段 → 等 3 秒 → 以工作管理員強制結束分頁程序 → 重開 passage 頁斷言原文與合併畫記完整還原且處於 compose 態；接著清空原文 → 重開 → 空白態；手動竄改 storage 的 passageDraft 為非法 JSON 形狀 → 重開 → 空白態且無錯誤提示。驗證：清單逐項勾核無一失敗。
