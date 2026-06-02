# CT翻翻

CT Translate 是一個以 WXT 建置的瀏覽器翻譯擴充套件。它會在網頁中直接插入譯文，讓使用者以雙語對照方式閱讀段落內容。

目前版本重點是「懸停段落 + 熱鍵」的單段翻譯，翻譯請求由 background service worker 送往 LLM provider，content script 只負責 DOM 偵測與譯文渲染。

## 功能

- 懸停網頁段落後按住熱鍵翻譯該段落
- 再次觸發同一段落可移除譯文並還原
- 譯文以串流方式逐步顯示
- 支援 OpenAI、Anthropic Claude、Google Gemini
- 支援目標語言：繁體中文、日文、英文
- API key 儲存在瀏覽器 extension storage

全文翻譯功能仍在開發中，相關規格與變更提案可參考 `openspec/changes/full-page-translation/`。

## 技術棧

- [WXT](https://wxt.dev/)：瀏覽器擴充套件框架
- React：popup UI
- Tailwind CSS v4：樣式
- TypeScript：主要語言
- Vitest：單元測試
- Zod：設定 schema 驗證

## 開始使用

安裝相依套件：

```bash
npm install
```

啟動 Chromium 開發模式：

```bash
npm run dev
```

啟動 Firefox 開發模式：

```bash
npm run dev:firefox
```

建置正式輸出：

```bash
npm run build
```

Firefox 建置：

```bash
npm run build:firefox
```

打包 zip：

```bash
npm run zip
```

## 載入擴充套件

Chromium / Chrome：

1. 開啟 `chrome://extensions`
2. 啟用 Developer mode
3. 選擇 Load unpacked
4. 載入 `.output/chrome-mv3/`

Firefox：

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 選擇 Load Temporary Add-on
3. 選擇 `.output/firefox-mv2/manifest.json`

實際輸出目錄會依 WXT 版本與建置目標略有差異，請以 `.output/` 下產生的資料夾為準。

## 使用方式

1. 安裝並載入擴充套件
2. 開啟 popup
3. 選擇翻譯服務：OpenAI、Claude 或 Gemini
4. 輸入對應 provider 的 API key
5. 選擇模型與目標語言
6. 在網頁上將滑鼠移到段落上方
7. 按住設定的熱鍵，預設為 `Control`

譯文會插入在原段落中。若同一段落已經有譯文，再次觸發會移除譯文。

## Provider 設定

目前支援的 provider 與預設模型：

| Provider | 預設模型 |
| --- | --- |
| OpenAI | `gpt-4o-mini` |
| Claude | `claude-sonnet-4-6` |
| Gemini | `gemini-2.0-flash` |

所有 provider 都需要 API key。popup 寫入的設定會存放於 `browser.storage.local`。

## 專案結構

```text
src/
  entrypoints/
    background/          # 翻譯請求與串流訊息處理
    content/             # 網頁 DOM 偵測、段落翻譯觸發
    popup/               # 擴充套件 popup UI
  config/                # 設定 schema、預設值、常數與 storage
  core/
    dom/                 # DOM 遍歷、過濾與段落標記
    translate/           # 翻譯流程、譯文插入、provider 實作
  utils/                 # content/background 訊息契約
test/                    # 測試 stubs
openspec/                # Spectra 規格與變更提案
```

## 開發指令

型別檢查：

```bash
npm run compile
```

執行測試：

```bash
npm test
```

建置：

```bash
npm run build
```

## 開發備註

- content script 不直接呼叫 LLM SDK，只透過 `chrome.runtime.connect` 與 background 建立串流 port。
- background 每次翻譯前都會讀取最新 config，popup 修改設定後不需要重新載入 extension。
- DOM 會用 `data-ct-*` 屬性標記已走訪節點、段落與 block 節點。
- 譯文 wrapper 會加上 `notranslate`，避免被再次掃描或翻譯。
- 翻譯失敗時只會影響當前段落，不會中斷其他段落的互動。

## 規格流程

本專案使用 Spectra 做 spec-driven development：

- 規格位於 `openspec/specs/`
- 變更提案位於 `openspec/changes/`
- 已封存變更位於 `openspec/changes/archive/`

新增或調整較大功能時，請先建立或更新對應的 Spectra change。
