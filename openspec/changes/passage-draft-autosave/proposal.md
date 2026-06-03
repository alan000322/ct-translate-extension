## Why

整段翻譯頁（passage）的原文輸入與段落合併畫記只存在於 React 記憶體狀態，瀏覽器或分頁一旦 crash、誤關分頁或擴充重載，使用者貼入的長文（上限 50,000 字元）與手動合併的分組即全部遺失，必須重貼重排。需要自動暫存機制讓這些輸入在意外中斷後可還原。

## What Changes

- 新增草稿暫存能力：整段翻譯頁的原文 `text` 與分組畫記 `groups` 自動持久化到 `browser.storage.local` 的獨立 key（不混入既有 `config`）。
- 寫入時機：內容變更後以 3 秒 throttle 落盤（保證任何輸入最多 3 秒後寫入；閒置時零寫入），並於 `visibilitychange`（hidden）與 `pagehide` 時立即 flush，蓋掉最後一個 throttle 窗口。
- 還原時機：開啟整段翻譯頁時若存在有效草稿，靜默還原原文與分組（不彈確認框）；草稿資料損壞或 schema 不符時視為無草稿，回到空白輸入態。
- 清除時機：使用者將原文清為空白時，草稿一併清除。
- 新增 `src/entrypoints/passage/draft.ts` 模組擁有草稿契約（儲存 key、schema 驗證、throttle 時序、flush），`usePassage` 僅透過 `saveDraft` / `loadDraft` / `clearDraft` 介面存取。

## Capabilities

### New Capabilities

- `passage-draft-persistence`: 整段翻譯頁草稿（原文與分組畫記）的自動暫存、還原與清除行為，含寫入時序與資料損壞回退。

### Modified Capabilities

(無 — 整段翻譯頁的規格仍在進行中變更的 delta 內、尚未歸檔至 openspec/specs/，本變更以新 capability 表達，不修改既有已歸檔規格。)

## Impact

- Affected specs: 新增 `passage-draft-persistence`
- Affected code:
  - New: src/entrypoints/passage/draft.ts、src/entrypoints/passage/draft.test.ts
  - Modified: src/entrypoints/passage/usePassage.ts（接草稿儲存/還原/清除）、src/entrypoints/passage/App.tsx（如需還原時機掛載點）
  - Removed: 無
