## Why

目前擴充的翻譯能力都綁在「正在瀏覽的網頁」上（懸停單段、進行中的全頁翻譯）。但常見情境是讀者手上有一段來源不在網頁的文字——PDF 論文段落、信件、文件複製文——想要逐段對照翻譯與快速理解。需要一個獨立的「整段翻譯」頁面：貼上文字、自動分段、逐段送譯並把譯文排在各段下方，並提供「全文摘要」與「研究重點剖析」兩種一鍵分析，協助研究型讀者快速掌握長文。

## What Changes

- 新增擴充內獨立分頁「整段翻譯」：以 WXT 新 entrypoint 建立完整分頁頁面（非 popup），由 popup 的入口按鈕開啟。
- 貼上文字後按「翻譯」：以空行／斷行偵測段落（純文字切段，不涉及 DOM），逐段送入既有 LLM 翻譯主幹，譯文以串流打字機方式呈現在該段落正下方（雙語對照）。
- 段落畫記合併：偵測結果以可互動的段落卡呈現，使用者可在送譯前把相鄰段落畫記合併為同一段（或拆回），修正錯誤切段。
- 「全文摘要」：一鍵將全文送出，產出繁體中文摘要，串流呈現於結果面板。
- 「研究重點剖析」：以「精通各科文獻的全能博士生」persona，針對全文分析「研究背景與脈絡」「研究方法」「文獻貢獻（獨特方法／獨特見解／發現獨特現象）」三面向，串流呈現於結果面板。
- 為支援摘要與剖析，串流訊息契約的 start 訊息新增任務種類欄位（預設翻譯，向後相容既有懸停翻譯），background 依任務組裝對應 system prompt；provider 層改為接受外部組裝的 system prompt（翻譯為其中一種任務）。
- 頁面 UI 依 impeccable 設計標準實作，延續既有 popup 的視覺語言（馬卡龍色系、Tailwind v4、繁中介面）。

## Non-Goals (optional)

<!-- design.md 會建立，Non-Goals 記於 design.md 的 Goals/Non-Goals；此處留空。 -->

## Capabilities

### New Capabilities

- `passage-translation-page`: 整段翻譯獨立頁面——popup 入口、貼文輸入、純文字段落偵測、段落卡畫記合併／拆分、逐段串流翻譯與雙語對照排版、錯誤與重試的段落級隔離。
- `text-analysis-tasks`: 全文分析任務——「全文摘要」（繁中摘要）與「研究重點剖析」（博士生 persona、三面向分析）的 prompt 契約、任務路由與串流結果呈現。

### Modified Capabilities

- `streaming-message-channel`: start 訊息新增任務種類欄位（translate／summarize／analyze），未帶欄位時預設 translate 以維持既有懸停翻譯行為。
- `translation-providers`: provider 串流介面由「翻譯專用」一般化為「接受呼叫端組裝的 system prompt」，翻譯／摘要／剖析共用同一條 provider 通道；API key 仍僅存在於 background。

## Impact

- Affected specs: 新增 2 個 capability spec（passage-translation-page、text-analysis-tasks）；修改 2 個既有 spec（streaming-message-channel、translation-providers）。
- Affected code:
  - New:
    - src/core/text/segment.ts （純文字段落偵測與合併資料模型）
    - src/core/text/segment.test.ts （切段與合併規則測試）
    - src/core/translate/tasks.ts （任務種類定義與 summarize／analyze system prompt 組裝）
    - src/entrypoints/passage/index.html （整段翻譯分頁 entrypoint）
    - src/entrypoints/passage/main.tsx （React 掛載入口）
    - src/entrypoints/passage/App.tsx （整段翻譯頁主畫面）
    - src/entrypoints/passage/style.css （頁面樣式，延續 popup 設計 token）
  - Modified:
    - src/utils/messaging.ts （start 訊息新增任務種類欄位與型別）
    - src/core/translate/translate-text.ts （依任務組裝 system prompt 後路由 provider）
    - src/core/translate/providers/defaults.ts （新增 summarize／analyze prompt builder；翻譯 prompt 維持）
    - src/core/translate/providers/openai.ts （串流介面改收外部 system prompt）
    - src/core/translate/providers/anthropic.ts （串流介面改收外部 system prompt）
    - src/core/translate/providers/gemini.ts （串流介面改收外部 system prompt）
    - src/entrypoints/background/index.ts （依任務種類路由）
    - src/entrypoints/popup/App.tsx （新增開啟整段翻譯頁的入口按鈕）
  - Removed:
    - (none)
