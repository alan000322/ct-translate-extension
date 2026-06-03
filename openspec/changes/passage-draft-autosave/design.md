## Context

整段翻譯頁（src/entrypoints/passage/）的全部狀態由 usePassage hook 管理：原文 text、偵測段落 atoms、合併畫記 groups、各段翻譯結果 runs、分析結果 analysis，皆為 React 記憶體狀態。text 是唯一真實來源 — setSourceText 會以 detectSegments(text) 重算 atoms 並重置 groups/runs/analysis。專案既有持久化模式為 src/config/storage.ts：以 zod schema 驗證的單一 config key 存於 browser.storage.local。

瀏覽器 crash、誤關分頁、擴充重載都會讓使用者貼入的長文（上限 50,000 字元）與手動合併分組全數遺失。本設計來自 /spectra-discuss 收斂結論：假設全數成立（只存 text+groups、throttle 3 秒、storage.local 獨立 key、靜默還原、單草稿 last-write-wins）。

## Goals / Non-Goals

**Goals:**

- 整段翻譯頁的原文與分組畫記在意外中斷（crash、關分頁、擴充重載）後可還原。
- 任何輸入變更最多 3 秒後落盤；閒置時零寫入。
- 草稿存取封裝於單一模組，usePassage 不直接觸碰 storage 細節。

**Non-Goals:**

- 不儲存翻譯結果 runs 與分析結果 analysis（衍生物，crash 後重按翻譯即可重得；串流中間態的有效性判定複雜度不值得）。
- 不做多草稿管理或分頁間衝突解決 — 單一草稿 key、last-write-wins。
- 不提供草稿歷史、版本或手動「召回草稿」UI。
- 不動 popup、content script、background 的任何行為。

## Decisions

### 草稿資料模型：只存 text 與 groups，schema 驗證後還原

儲存形狀為 `{ text: string, groups: GroupRange[] }`，以 zod schema（沿用 src/config/schema.ts 的 zod 慣例）定義並於讀取時 safeParse。atoms 不存 — 由 detectSegments(text) 重建；還原時驗證 groups 與重建後 atoms 長度的一致性（最後一組 end 必須等於 atoms.length - 1、區間連續），不一致則丟棄 groups 退為 initialGroups。理由：text 是唯一真實來源，存衍生物只會引入不一致風險；groups 是使用者手動畫記、重算不回來，必須存。

替代方案：連 runs 一起存 — 被否決，串流中間態與「半份譯文算不算完成」的判定讓格式與還原邏輯膨脹一個量級，違背 YAGNI。

### 儲存位置：browser.storage.local 獨立 key "passageDraft"

與既有 config key 並列、不混入。理由：草稿是高頻寫入暫態資料，混入 config 會讓每次 autosave 重寫整份設定並與設定寫入互踩；storage.session 在瀏覽器 crash 後不保留，違背功能初衷；localStorage 不符 WXT 既有慣例。50,000 字元上限遠低於 storage.local 配額。

### 寫入時序：變更後 trailing throttle 3 秒 + pagehide/visibilitychange 立即 flush

text 或 groups 變更時排程一次延遲 3 秒的寫入（期間再變更不重排程、由同一次寫入收斂），保證「任何輸入最多 3 秒後落盤」且閒置時零寫入。頁面 visibilitychange 轉 hidden 與 pagehide 時同步呼叫 flush 立即寫入，蓋掉最後一個 throttle 窗口（使用者切走或關頁的最後幾秒輸入不遺失）。

替代方案：固定 setInterval 每 3 秒寫入 — 被否決，text 沒變時重寫同樣內容是無謂 I/O，且仍需 flush 處理關頁窗口，複雜度沒省到。

### 還原與清除：開頁靜默還原、清空即清除草稿

頁面掛載時讀取草稿，存在且通過 schema 驗證即靜默還原（不彈確認框）— 等同呼叫 setSourceText(text) 後套用 groups。資料損壞或驗證失敗視為無草稿並清除壞資料，回到空白輸入態。使用者將原文清為空白（hasContent 為 false）時清除草稿而非寫入空草稿。

### 接縫：src/entrypoints/passage/draft.ts 擁有草稿契約

模組介面為 saveDraft(draft)（含 throttle 排程）、flushDraft()、loadDraft(): Draft | null、clearDraft()。介面深度檢查：恰好一層 adapter 包在 browser.storage.local 上；藏住 throttle 時序、schema 驗證、key 命名與 flush 時機，非純轉發；刪除測試 — 刪掉它則 crash 還原能力消失且 usePassage 須內嵌 storage 細節，模組成立。usePassage 只在狀態變更處呼叫 saveDraft/clearDraft、掛載處呼叫 loadDraft。

## Implementation Contract

**可觀察行為：**

- 在整段翻譯頁輸入或編輯原文、合併或拆分段落後，等待 3 秒內任意時點發生的 crash／強制關閉，重新開啟整段翻譯頁時原文與分組畫記完整還原（最後 3 秒內的變更允許遺失；但若使用者切換分頁或正常關頁，flush 保證連最後變更也已落盤）。
- 還原後頁面處於 compose 輸入態，字元計數、段落卡與合併控制與手動貼入同樣文字並做同樣合併後的狀態一致；翻譯結果不還原。
- 原文清為空白後重開頁面，回到空白輸入態（無殘留草稿）。
- 草稿資料損壞（手動竄改 storage 值）時開頁不報錯、回到空白輸入態。

**介面／資料形狀：**

- storage key：browser.storage.local 的 "passageDraft"，值為 `{ text: string, groups: { start: number, end: number }[] }`，zod schema 驗證。
- draft.ts 匯出：`saveDraft(draft: Draft): void`（throttle 排程）、`flushDraft(): void`（同步觸發未決寫入）、`loadDraft(): Promise<Draft | null>`、`clearDraft(): Promise<void>`。

**失敗模式：**

- loadDraft 遇 schema 驗證失敗回傳 null 並清除壞資料 — 刻意靜默，不向使用者報錯。
- groups 與 detectSegments(text) 重建的 atoms 數不一致時，保留 text、groups 退為 initialGroups — 靜默降級。
- storage 寫入失敗（配額等）不阻斷輸入操作 — 靜默，下次變更重試。

**驗收標準：**

- 單元測試（draft.test.ts，fake timers + mock browser.storage.local）：變更後 3 秒內恰寫入一次、連續變更收斂為一次寫入、flush 立即寫入、損壞資料 loadDraft 回 null、groups 不一致降級為 initialGroups。
- npm test 全綠、npm run compile、npm run build 通過。
- 手動驗收：貼文＋合併 → 等 3 秒 → 強制關閉分頁 → 重開 passage 頁 → 原文與合併還原；清空原文 → 重開 → 空白態。

**範圍邊界：**

- In scope：src/entrypoints/passage/ 下的 draft.ts、usePassage.ts、App.tsx（還原掛載點）。
- Out of scope：popup／content／background 行為、config schema、翻譯結果持久化、多草稿。

## Risks / Trade-offs

- [最後 3 秒輸入在 crash 時遺失] → 接受的設計取捨；pagehide/visibilitychange flush 已涵蓋正常關頁與切換情境，純 crash 的窗口上限即 throttle 週期。
- [多個 passage 分頁同時編輯互相覆寫] → 接受 last-write-wins；單草稿模型簡單且符合主要使用情境，記錄於 Non-Goals。
- [還原時 detectSegments 行為若未來變更，舊草稿 groups 可能對不上] → 還原路徑已含長度一致性檢查，不一致即降級為 initialGroups，text 永不遺失。
- [StrictMode 雙重掛載觸發兩次 loadDraft] → loadDraft 為冪等唯讀操作，雙呼叫無害；還原寫回 state 的入口需防重複套用（以 ref 守門），任務中明確標註。
