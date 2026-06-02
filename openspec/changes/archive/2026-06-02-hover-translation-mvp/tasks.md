## 1. 專案鷹架與依賴

- [x] 1.1 以 WXT + React + Tailwind 建立 MV3 擴充鷹架（background / content / popup 三 entrypoint）；交付：`wxt build` 成功且能在 chrome://extensions 載入無 manifest 錯誤。驗證：執行 build 無錯、手動載入 dist 後三 entrypoint 各自存在。
- [x] 1.2 新增 npm 依賴（wxt、react、react-dom、tailwindcss、zod、openai、@anthropic-ai/sdk、@google/genai）並於 manifest 設定 host_permissions（api.openai.com、api.anthropic.com、generativelanguage.googleapis.com、translate-pa.googleapis.com）。交付：build 後 manifest 含上述四端點權限。驗證：檢視產出 manifest 的 host_permissions 欄位。

## 2. 設定模型與儲存

- [x] 2.1 實作 Config schema and persistent storage：以 zod 定義 config（language source/target、providersConfig[]、activeProviderId、translate.node.hotkey）並讀寫 chrome.storage.local，對應設計「config 儲存於 chrome.storage.local 並於每次觸發讀取」。交付：popup 改值重開後保留、翻譯觸發時讀到最新值。驗證：手動於 popup 改值重開 popup 確認保留。
- [x] 2.2 實作語言代碼對照表，對應設計「語言代碼採兩套系統並提供對照表」並滿足 Language code mapping for two provider classes：提供 ISO 639-1 與語言英文名雙向對照，支援目標繁中/日/英、來源 auto。交付：給定 targetCode 可得 zh-TW 與 "Traditional Chinese" 兩種形式。驗證：對照表單元測試覆蓋 zh-TW / ja / en 映射。

## 3. 翻譯 provider 系統（background）

- [x] 3.1 實作四個 provider 翻譯函式（openai / anthropic / gemini / google-translate）滿足 Provider function signature consistency：統一 (text, 目標語言描述, opts) => Promise<string>，僅回傳譯文。交付：每家以一段英文輸入回傳繁中。驗證：各 provider 以測試 key 手動翻譯一段並檢查輸出為純譯文。
- [x] 3.2 實作分派器 translateText(text, config) 滿足 Provider dispatch by active provider 與 Missing API key is surfaced, not silent，對應設計「provider 分派器路由官方 SDK 與免費端點」：依 active provider 路由，缺 key 時拋可序列化錯誤。交付：google-translate 免 key 可翻；LLM 無 key 得具名錯誤。驗證：兩種情境各手動觸發一次確認結果。
- [x] 3.3 在 background service worker 註冊 translate 訊息處理，滿足 Background-only translation execution，對應設計「所有翻譯與 AI 呼叫集中於 background service worker」與「content 與 background 的訊息契約」：content 送 { text } 回傳譯文字串、錯誤回 { error }。交付：所有 SDK/fetch 僅於 background 執行、頁面 context 無 API key。驗證：DevTools 檢查頁面 context 無 key，且 content 能收到譯文。

## 4. DOM 切段

- [x] 4.1 實作 walkAndLabelElement 滿足 Recursive walk and label into paragraph units，對應設計「以「段落」為翻譯單位的 DOM 走訪與標記」：以含 inline 子節點者為段落，標記 data-ct-walked/paragraph/block/inline。交付：段落單位被正確標記。驗證：在測試頁面 console 查詢 data-ct-paragraph 數量與位置符合預期。
- [x] 4.2 實作 Filter non-translatable nodes：排除 SCRIPT/STYLE/CODE/PRE/IMG/IFRAME/隱藏/aria-hidden/notranslate 等節點不走訪不翻譯。交付：被排除節點不帶 data-ct-* 標記。驗證：測試頁面含 script/code/隱藏元素，確認皆未被標記。
- [x] 4.3 實作 extractTextContent 滿足 Extract paragraph text content：保留 inline 間空白、BR 轉換行、排除不可翻後代。交付：含 inline 與 BR 的段落抽出正確文字。驗證：對固定 HTML 片段做單元測試比對輸出字串。

## 5. 懸停段落翻譯

- [x] 5.1 實作 trigger 狀態機滿足 Hover plus hotkey trigger，對應設計「懸停 + 熱鍵採兩段式（trigger 狀態機與翻譯執行分離）」：節流追蹤座標、按住熱鍵（預設 Control）短延遲後觸發、輸入框/contenteditable 內忽略。交付：按住熱鍵於段落上觸發、快速 tap 不觸發。驗證：手動於文章頁、輸入框、快速 tap 三情境各測一次。
- [x] 5.2 實作 Find nearest block paragraph from a point：由座標往上找最近 block 段落作為翻譯目標。交付：點在 inline 子元素也能解析到外層段落。驗證：手動懸停 inline 文字觸發，確認翻譯的是整個段落。
- [x] 5.3 實作 Bilingual insertion with toggle，對應設計「雙語對照插入與 toggle 還原」：翻譯中顯示 placeholder、完成替換、同段再觸發移除 wrapper。交付：段落底部出現譯文、再觸發消失。驗證：手動翻一段→出現譯文→再觸發→還原。
- [x] 5.4 實作 Per-paragraph failure isolation：單段翻譯失敗時於該段 wrapper 顯示失敗提示，不影響其他段落與頁面。交付：失敗段顯示提示、他段保持完好。驗證：以無效 key 觸發某段，確認該段顯示失敗而既有譯文不受影響。

## 6. Popup 設定 UI

- [x] 6.1 實作 popup 的 Provider and model selection：可選 OpenAI/Claude/Gemini/Google 翻譯；LLM 顯示 API key 欄位與 model 下拉、Google 翻譯隱藏 key 與 model。交付：切換 provider 時欄位顯隱正確。驗證：手動切換四個 provider 觀察 UI 顯隱。
- [x] 6.2 實作 popup 的 Target language selection with auto source：目標語言可選繁中（預設）/日/英，來源預設 auto。交付：改目標語言後翻譯輸出對應語言且持久化。驗證：將目標改日文後翻一段確認輸出日文、重開 popup 確認保留。
