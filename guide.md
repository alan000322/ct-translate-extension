# ct-translate-extension 實作指南

仿照 read-frog 的沉浸式翻譯擴充套件實作經驗。涵蓋三個目標功能：

1. **懸停 + Ctrl（或長按）做段落翻譯**
2. **全文翻譯**
3. **可選 provider（Claude / OpenAI / Google Translate / Gemini）並指定模型**

本文件的程式碼片段與架構，都是從 read-frog 原始碼提煉出來的可行做法，附上對應原始檔路徑供對照。

---

## 0. 技術選型（建議與 read-frog 一致）

| 項目 | 選擇 | 理由 |
|---|---|---|
| 擴充框架 | **WXT**（`wxt.config.ts`） | 檔案式 entrypoints、Vite 建置、MV3、多瀏覽器、auto-import |
| UI | React + Tailwind（用 Shadow DOM 隔離樣式） | 避免污染宿主頁面 |
| LLM 接入 | **各家官方 SDK 直串**（`openai` / `@anthropic-ai/sdk` / `@google/genai`） | 不用 Vercel AI SDK；自己掌握各家原生 API |
| 純翻譯接入 | 手刻 `fetch` | Google 翻譯走免費內部端點（read-frog 做法），不需 SDK |
| 設定儲存 | WXT `storage`（`local:`） | content/background/options 共用 |
| 跨 context 通訊 | `@webext-core/messaging` 風格 message bus | content ↔ background |

> 注意：本指南刻意**不用 Vercel AI SDK**。每家 LLM 用各自官方 SDK，因此第 6 節是「一個 provider 一個 client + 一個翻譯函式」的寫法，再用一個 dispatcher 統一。Google Translate 沿用 read-frog 的免費端點手刻 fetch（官方也是這套）。

核心心智模型：**翻譯永遠從瀏覽器直連 provider，不要自架後端代理。** API key 由使用者自填，存在 `storage`。唯一的「後端橋」是 background worker 的 proxy-fetch，只為了繞過 content script 的 CORS，不是中介伺服器。

### 建議目錄結構

```
src/
  entrypoints/
    background/
      index.ts
      proxy-fetch.ts          # content → background 的 fetch 橋（繞 CORS）
    content/
      index.tsx               # content script 入口
      page-translation.ts     # 全文翻譯管理器（IntersectionObserver + MutationObserver）
      node-translation.ts     # 段落翻譯（懸停+Ctrl / 長按）
      node-translation-trigger.ts  # 互動狀態機（純監聽，不含翻譯邏輯）
    options/                  # 設定頁（選 provider / model / 填 key）
    popup/
  core/
    dom/
      traversal.ts            # walkAndLabelElement / extractTextContent
      filter.ts               # 判斷節點可不可翻
      labels.ts               # data-* 屬性常數
      rules.ts                # FORCE_BLOCK_TAGS 等
    translate/
      execute-translate.ts    # 依 provider 分派
      providers/
        defaults.ts           # 預設模型 + 翻譯 system prompt
        openai.ts             # OpenAI 官方 SDK
        anthropic.ts          # Anthropic 官方 SDK
        gemini.ts             # Google GenAI 官方 SDK
        google.ts             # Google Translate 免費端點（手刻 fetch）
      insert.ts               # 把譯文插回頁面
      modes.ts                # 雙語 / 僅譯文
  config/
    schema.ts                 # zod schema
    storage.ts
    constants.ts
```

---

## 1. 設定 schema（先定義資料模型）

所有功能都圍繞 config 轉，先定好。對照 read-frog `src/types/config/provider/schemas.ts`。

```ts
// src/config/schema.ts
import { z } from "zod"

// 我們只支援這四種
export const PROVIDER_TYPES = ["google-translate", "openai", "anthropic", "google"] as const
export type ProviderType = typeof PROVIDER_TYPES[number]

// 哪些不需要 API key（純翻譯免費端點）
export const NON_API_PROVIDERS = ["google-translate"] as const
export function isNonAPIProvider(p: ProviderType) {
  return (NON_API_PROVIDERS as readonly string[]).includes(p)
}
export function isLLMProvider(p: ProviderType) {
  return p === "openai" || p === "anthropic" || p === "google"
}

export const providerConfigSchema = z.object({
  id: z.string(),                    // 唯一 id，可有多組（例如兩把不同 openai key）
  provider: z.enum(PROVIDER_TYPES),
  apiKey: z.string().optional(),     // 使用者自填，LLM 必填
  baseURL: z.string().optional(),    // 可選：自架/代理端點（openai-compatible 用）
  model: z.string().optional(),      // 指定模型，例如 "gpt-4o" / "claude-sonnet-4-6" / "gemini-2.0-flash"
  temperature: z.number().min(0).optional(),
})
export type ProviderConfig = z.infer<typeof providerConfigSchema>

export const configSchema = z.object({
  language: z.object({
    sourceCode: z.string().default("auto"),  // ISO 639-3 或 "auto"
    targetCode: z.string().default("cmn"),    // 例如繁中
  }),
  providersConfig: z.array(providerConfigSchema),
  // 當前選用的 provider id
  activeProviderId: z.string(),
  translate: z.object({
    mode: z.enum(["bilingual", "translationOnly"]).default("bilingual"),
    node: z.object({
      enabled: z.boolean().default(true),
      // 段落翻譯觸發方式
      hotkey: z.enum(["Control", "Alt", "Shift", "clickAndHold"]).default("Control"),
    }),
    page: z.object({
      // 小段落過濾門檻，避免翻譯「OK」「2024」這類碎片
      minWordsPerNode: z.number().default(1),
    }),
  }),
})
export type Config = z.infer<typeof configSchema>
```

模型清單建議寫成常數讓設定頁下拉選（對照 read-frog `src/utils/constants/models.ts`）：

```ts
// src/config/constants.ts
export const MODELS_BY_PROVIDER = {
  openai:    ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  google:    ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
  // google-translate 無模型概念
} as const
```

---

## 2. DOM 抓取：把網頁切成「翻譯單位」

這是整個擴充的地基，段落翻譯和全文翻譯共用同一套。對照 read-frog `src/core/dom/`（原 `src/utils/host/dom/`）。

### 2.1 屬性標記

用 `data-*` 屬性在 DOM 上做記號（對照 `dom-labels.ts`）：

```ts
// src/core/dom/labels.ts
export const WALKED_ATTRIBUTE = "data-ct-walked"        // 已走訪（值=walkId）
export const PARAGRAPH_ATTRIBUTE = "data-ct-paragraph"  // 翻譯單位：含 inline 子節點 → 要翻
export const BLOCK_ATTRIBUTE = "data-ct-block"          // block 級
export const INLINE_ATTRIBUTE = "data-ct-inline"        // inline 級
export const CONTENT_WRAPPER_CLASS = "ct-translated-wrapper"
export const NOTRANSLATE_CLASS = "notranslate"
```

**核心觀念：翻譯單位是「段落」，不是逐字。** 「擁有 inline 子節點的元素」= 一個 paragraph，整段送翻譯。

### 2.2 哪些不翻（filter）

對照 `src/utils/host/dom/filter.ts` + `dom-rules.ts`。重點規則：

```ts
// src/core/dom/rules.ts
export const FORCE_BLOCK_TAGS = new Set([
  "H1","H2","H3","H4","H5","H6","P","DIV","BLOCKQUOTE",
  "ARTICLE","SECTION","MAIN","NAV","LI","TD","TH","DD","DT","FIGCAPTION",
])
// 完全不走入也不翻
export const DONT_WALK_AND_TRANSLATE_TAGS = new Set([
  "HEAD","SCRIPT","STYLE","NOSCRIPT","IMG","VIDEO","AUDIO","SVG","CANVAS",
  "IFRAME","INPUT","TEXTAREA","SELECT","CODE","PRE","MATH",
])
```

```ts
// src/core/dom/filter.ts（精簡版）
export function isHTMLElement(n: Node): n is HTMLElement { return n.nodeType === Node.ELEMENT_NODE }
export function isTextNode(n: Node): n is Text { return n.nodeType === Node.TEXT_NODE }

export function isDontWalkAndTranslate(el: HTMLElement): boolean {
  if (DONT_WALK_AND_TRANSLATE_TAGS.has(el.tagName)) return true
  if (el.classList.contains(NOTRANSLATE_CLASS)) return true
  if (el.getAttribute("aria-hidden") === "true") return true
  if (el.hasAttribute("hidden")) return true
  const style = getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden") return true
  // 視覺隱藏（給螢幕閱讀器）類別
  if (el.classList.contains("sr-only") || el.classList.contains("visually-hidden")) return true
  return false
}

export function isShallowInlineElement(el: HTMLElement): boolean {
  if (FORCE_BLOCK_TAGS.has(el.tagName)) return false
  return getComputedStyle(el).display.includes("inline")
}
export function isShallowBlockElement(el: HTMLElement): boolean {
  if (FORCE_BLOCK_TAGS.has(el.tagName)) return true
  return !getComputedStyle(el).display.includes("inline")
}
```

### 2.3 walkAndLabelElement — 遞迴標記（直接照搬最有價值）

這是 read-frog 最核心的函式（`src/utils/host/dom/traversal.ts`）。原樣保留邏輯，只換屬性名：

```ts
// src/core/dom/traversal.ts
import {
  WALKED_ATTRIBUTE, PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, INLINE_ATTRIBUTE,
} from "./labels"
import { FORCE_BLOCK_TAGS } from "./rules"
import {
  isDontWalkAndTranslate, isHTMLElement, isShallowBlockElement, isShallowInlineElement, isTextNode,
} from "./filter"

export function walkAndLabelElement(
  element: HTMLElement,
  walkId: string,
): { forceBlock: boolean, isInlineNode: boolean } {
  if (isDontWalkAndTranslate(element)) {
    return { forceBlock: false, isInlineNode: false }
  }

  element.setAttribute(WALKED_ATTRIBUTE, walkId)

  // 支援 Shadow DOM
  if (element.shadowRoot) {
    for (const child of element.shadowRoot.children) {
      if (isHTMLElement(child)) walkAndLabelElement(child, walkId)
    }
  }

  let hasInlineNodeChild = false
  let forceBlock = false

  const validChildren = [...element.childNodes].filter((child) => {
    if (isTextNode(child)) return true
    if (isHTMLElement(child)) return !isDontWalkAndTranslate(child)
    return false
  })

  for (const child of validChildren) {
    if (isTextNode(child)) {
      if (child.textContent?.trim()) hasInlineNodeChild = true
      continue
    }
    if (isHTMLElement(child)) {
      const r = walkAndLabelElement(child, walkId)
      forceBlock = forceBlock || r.forceBlock
      if (r.isInlineNode) hasInlineNodeChild = true
    }
  }

  // 有 inline 子節點 → 這是一個段落（翻譯單位）
  if (hasInlineNodeChild) element.setAttribute(PARAGRAPH_ATTRIBUTE, "")

  forceBlock = forceBlock || FORCE_BLOCK_TAGS.has(element.tagName)

  if (element.textContent?.trim() === "" && !forceBlock) {
    return { forceBlock: false, isInlineNode: false }
  }

  const isInlineNode = isShallowInlineElement(element)
  if (isShallowBlockElement(element) || forceBlock) {
    element.setAttribute(BLOCK_ATTRIBUTE, "")
  } else if (isInlineNode) {
    element.setAttribute(INLINE_ATTRIBUTE, "")
  }

  return { forceBlock, isInlineNode }
}
```

### 2.4 extractTextContent — 抽出段落文字

```ts
// src/core/dom/traversal.ts（續）
const NON_NEWLINE_WS = /[^\S\n]/

export function extractTextContent(node: Node): string {
  if (isTextNode(node)) {
    const text = node.textContent ?? ""
    const trimmed = text.trim()
    if (trimmed === "") return " "
    const lead = text.slice(0, text.length - text.trimStart().length)
    const trail = text.slice(text.trimEnd().length)
    return (NON_NEWLINE_WS.test(lead) ? " " : "") + trimmed + (NON_NEWLINE_WS.test(trail) ? " " : "")
  }
  if (isHTMLElement(node) && node.tagName === "BR") return "\n"
  if (isHTMLElement(node) && isDontWalkAndTranslate(node)) return ""

  return [...node.childNodes].reduce((acc, child) => {
    if (isTextNode(child) || isHTMLElement(child)) return acc + extractTextContent(child)
    return acc
  }, "")
}
```

---

## 3. 功能一：懸停 + Ctrl 段落翻譯

兩段式設計（read-frog 的好做法）：

- **trigger 狀態機**（`node-translation-trigger.ts`）：只負責「偵測使用者意圖」，純監聽滑鼠/鍵盤，不碰翻譯。
- **翻譯執行**（`node-translation.ts`）：收到 trigger 的座標 → 找最近的 block 節點 → 翻譯。

### 3.1 互動狀態機（懸停 + 按住 Ctrl）

關鍵點（對照 `node-translation-trigger.ts`）：
- 全程追蹤滑鼠位置（`mousemove` 節流 + 距離門檻，避免抖動誤觸）。
- 按下熱鍵後等一個短延遲（read-frog 用 hold 機制）才觸發，避免使用者只是切換視窗時誤翻。
- 在輸入框（INPUT/TEXTAREA/contentEditable）內忽略。
- 觸發點：用滑鼠當前座標，或 `document.querySelectorAll(":hover")` 取最深的懸停元素中心點。

```ts
// src/entrypoints/content/node-translation-trigger.ts（精簡核心）
interface Point { x: number, y: number }

const HOTKEY_EVENT_KEYS: Record<string, string> = {
  Control: "Control", Alt: "Alt", Shift: "Shift",
}

export function registerTriggerListeners(opts: {
  getConfig: () => Promise<Config | null>
  onTrigger: (point: Point, config: Config) => void
}): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const mouse: Point = { x: 0, y: 0 }
  let hasMouse = false

  const updateMouse = (p: Point) => { mouse.x = p.x; mouse.y = p.y; hasMouse = true }

  const deepestHovered = (): Element | null => {
    const els = document.querySelectorAll(":hover")
    return els.item(els.length - 1)
  }
  const resolvePoint = (): Point => {
    if (hasMouse) return { ...mouse }
    const el = deepestHovered()
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    return { ...mouse }
  }

  const isEditable = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)

  // 追蹤滑鼠（節流）
  let throttle: ReturnType<typeof setTimeout> | null = null
  document.addEventListener("mousemove", (e) => {
    if (throttle) return
    throttle = setTimeout(() => { throttle = null }, 200)
    updateMouse({ x: e.clientX, y: e.clientY })
  }, { signal })
  document.addEventListener("mouseover", (e) => updateMouse({ x: e.clientX, y: e.clientY }), { signal })

  // 熱鍵：按住 Ctrl 短延遲後，對當前懸停段落翻譯
  let pressed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  document.addEventListener("keydown", (e) => {
    void (async () => {
      if (isEditable(e.target)) return
      const config = await opts.getConfig()
      if (!config?.translate.node.enabled) return
      const hotkey = config.translate.node.hotkey
      if (hotkey === "clickAndHold") return
      if (e.key !== HOTKEY_EVENT_KEYS[hotkey]) return
      if (pressed) return
      pressed = true
      timer = setTimeout(() => {
        if (pressed) opts.onTrigger(resolvePoint(), config)
      }, 80) // 短延遲，避免誤觸；想「按下即翻」可設 0
    })()
  }, { signal })
  document.addEventListener("keyup", (e) => {
    if (e.key === "Control" || e.key === "Alt" || e.key === "Shift") {
      pressed = false
      if (timer) { clearTimeout(timer); timer = null }
    }
  }, { signal })

  return () => ac.abort()
}
```

> 想做「長按滑鼠」(clickAndHold) 觸發：監聽 `mousedown` 啟動 ~500ms 計時器，移動超過容差（read-frog 用 6px）或 `mouseup` 就取消。完整實作見 read-frog `node-translation-trigger.ts`。

### 3.2 從座標找段落並翻譯

對照 `src/utils/host/translate/node-manipulation.ts` 的 `removeOrShowNodeTranslation`：

```ts
// src/entrypoints/content/node-translation.ts
import { walkAndLabelElement } from "@/core/dom/traversal"
import { translateWalkedElement } from "@/core/translate/walker"

// 從點擊座標往上找最近的可翻 block 節點
function findNearestBlockNodeAt(point: Point): HTMLElement | null {
  let el = document.elementFromPoint(point.x, point.y)
  while (el && el instanceof HTMLElement) {
    if (el.hasAttribute("data-ct-block") || el.tagName === "P" || /^H[1-6]$/.test(el.tagName))
      return el
    // 沒標記過也可：往上找第一個 block-level
    if (getComputedStyle(el).display.includes("block") && el.textContent?.trim()) return el
    el = el.parentElement
  }
  return null
}

export async function translateNodeAtPoint(point: Point, config: Config): Promise<boolean> {
  const node = findNearestBlockNodeAt(point)
  if (!node) return false

  const walkId = crypto.randomUUID()
  walkAndLabelElement(node, walkId)            // 只標記這個子樹
  await translateWalkedElement(node, walkId, config, /* toggle */ true)  // toggle: 再觸發一次就移除
  return true
}
```

`toggle: true` 讓同一段落「再按一次 Ctrl 就還原」——對照 read-frog 的 toggle 行為。

### 3.3 註冊（content script）

```ts
// src/entrypoints/content/node-translation.ts（續）
import { registerTriggerListeners } from "./node-translation-trigger"
import { getConfig } from "@/config/storage"

export function registerNodeTranslation(): () => void {
  return registerTriggerListeners({
    getConfig,  // 每次觸發才讀 config，避免長駐 content script 設定漂移
    onTrigger: (point, config) => { void translateNodeAtPoint(point, config) },
  })
}
```

---

## 4. 功能二：全文翻譯

對照 read-frog `src/entrypoints/host.content/translation-control/page-translation.ts` 的 `PageTranslationManager`。

核心策略 — **延遲翻譯**：不一次翻整頁，而是只翻「進入視口」的段落（IntersectionObserver），並用 MutationObserver 處理動態載入內容。

```ts
// src/entrypoints/content/page-translation.ts
import { walkAndLabelElement } from "@/core/dom/traversal"
import { translateWalkedElement } from "@/core/translate/walker"
import { PARAGRAPH_ATTRIBUTE, WALKED_ATTRIBUTE } from "@/core/dom/labels"

export class PageTranslationManager {
  private walkId = ""
  private io: IntersectionObserver | null = null
  private mo: MutationObserver | null = null
  private config: Config

  constructor(config: Config) { this.config = config }

  start() {
    this.walkId = crypto.randomUUID()

    // 進入視口（含上下 600px 預載）才翻
    this.io = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          void translateWalkedElement(entry.target, this.walkId, this.config)
          obs.unobserve(entry.target)  // 翻過就不再觀察
        }
      }
    }, { rootMargin: "600px", threshold: 0.1 })

    this.scan(document.body)         // 初次掃描
    this.observeMutations()          // 監聽後續 DOM 變化
  }

  // 標記 + 蒐集頂層段落 + 掛到 IntersectionObserver
  private scan(container: HTMLElement) {
    walkAndLabelElement(container, this.walkId)
    const paragraphs = this.collectParagraphsDeep(container)
    // 只觀察「頂層」段落（排除被其他段落包住的，避免重複翻）
    const topLevel = paragraphs.filter(p => !paragraphs.some(other => other !== p && other.contains(p)))
    topLevel.forEach(p => this.io!.observe(p))
  }

  // 蒐集含 Shadow DOM 的段落
  private collectParagraphsDeep(container: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = []
    const sel = `[${PARAGRAPH_ATTRIBUTE}][${WALKED_ATTRIBUTE}="${this.walkId}"]`
    out.push(...Array.from(container.querySelectorAll<HTMLElement>(sel)))
    const walk = (root: ParentNode) => {
      root.querySelectorAll("*").forEach((el) => {
        if (el instanceof HTMLElement && el.shadowRoot) {
          out.push(...Array.from(el.shadowRoot.querySelectorAll<HTMLElement>(sel)))
          walk(el.shadowRoot)
        }
      })
    }
    walk(container)
    return out
  }

  // 動態內容：SPA、無限滾動、延遲載入
  private observeMutations() {
    this.mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && !n.hasAttribute(WALKED_ATTRIBUTE)) this.scan(n)
        })
      }
    })
    this.mo.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"],
    })
  }

  stop() {
    this.io?.disconnect(); this.mo?.disconnect()
    this.io = null; this.mo = null
    // 視需求：移除所有已插入的譯文 wrapper
  }
}
```

content script 入口：

```tsx
// src/entrypoints/content/index.tsx
import { defineContentScript } from "wxt/sandbox"
import { getConfig } from "@/config/storage"
import { PageTranslationManager } from "./page-translation"
import { registerNodeTranslation } from "./node-translation"

export default defineContentScript({
  matches: ["*://*/*"],
  async main() {
    const config = await getConfig()
    if (!config) return

    // 功能一：段落翻譯永遠註冊（等待熱鍵）
    const teardownNode = registerNodeTranslation()

    // 功能二：全文翻譯由 popup/快捷鍵觸發
    const pageManager = new PageTranslationManager(config)
    // 監聽訊息：收到「translatePage」才 start()
    // browser.runtime.onMessage ... pageManager.start()
  },
})
```

---

## 5. 把譯文插回頁面

對照 `translation-modes.ts` + `translation-insertion.ts`。兩種模式：

- **雙語對照（bilingual）**：原文後面插一個 `<span>` 放譯文。可逆、最常用。
- **僅譯文（translationOnly）**：把原文 innerHTML 換成譯文，存原文以便切回。

```ts
// src/core/translate/walker.ts
import { extractTextContent } from "@/core/dom/traversal"
import { PARAGRAPH_ATTRIBUTE, BLOCK_ATTRIBUTE, CONTENT_WRAPPER_CLASS } from "@/core/dom/labels"
import { translateText } from "./translate-text"

export async function translateWalkedElement(
  element: HTMLElement, walkId: string, config: Config, toggle = false,
) {
  if (!element.hasAttribute(PARAGRAPH_ATTRIBUTE)) {
    // 不是段落本身 → 往子層找段落
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) await translateWalkedElement(child, walkId, config, toggle)
    }
    return
  }

  // toggle：已翻過就移除
  const existing = element.querySelector(`:scope > .${CONTENT_WRAPPER_CLASS}`)
  if (existing) {
    if (toggle) existing.remove()
    return
  }

  const text = extractTextContent(element).trim()
  if (!shouldTranslate(text, config)) return

  // 先插 spinner，翻完替換
  const wrapper = document.createElement("span")
  wrapper.className = `${CONTENT_WRAPPER_CLASS} notranslate`
  const isBlock = element.hasAttribute(BLOCK_ATTRIBUTE)
  if (isBlock) wrapper.appendChild(document.createElement("br"))
  wrapper.appendChild(document.createTextNode(" …"))
  element.appendChild(wrapper)

  try {
    const translated = await translateText(text, config)
    wrapper.textContent = ""
    if (isBlock) wrapper.appendChild(document.createElement("br"))
    const span = document.createElement("span")
    span.textContent = translated
    span.style.color = "inherit"
    span.style.opacity = "0.85"  // 視覺上區隔譯文
    wrapper.appendChild(span)
  } catch (e) {
    wrapper.textContent = " [翻譯失敗]"
  }
}

// 過濾太短/純數字的碎片
function shouldTranslate(text: string, config: Config): boolean {
  if (!text) return false
  if (/^[\d\s.,%$€£¥]+$/.test(text)) return false  // 純數字
  const words = text.split(/\s+/).filter(Boolean).length
  return words >= config.translate.page.minWordsPerNode
}
```

> 進階：read-frog 用 `requestAnimationFrame` 批次 DOM 操作（`DOMBatcher`）降低 reflow，並用 IndexedDB 對翻譯結果做 SHA256 快取避免重翻。初版可先略過，量大再加。

---

## 6. 功能三：Provider 系統（Claude / OpenAI / Gemini / Google Translate）

**LLM 用各家官方 SDK 直串；Google Translate 走免費端點手刻 fetch。** 每家一個 client、一個翻譯函式，介面長得幾乎一樣（`(text, targetLangName, model, apiKey) => Promise<string>`），最後用 dispatcher 統一。

> ⚠️ 這些官方 SDK 預設假設跑在 server，會擋瀏覽器環境。本指南建議**整個翻譯邏輯放在 background service worker**（見 6.6），那裡沒有 CORS、也不會把 key 洩漏到頁面。若真的要在頁面 context 跑，OpenAI / Anthropic SDK 需開 `dangerouslyAllowBrowser: true`。

### 6.1 安裝依賴

```bash
pnpm add openai @anthropic-ai/sdk @google/genai zod
```

- `openai` — OpenAI 官方 SDK
- `@anthropic-ai/sdk` — Anthropic（Claude）官方 SDK
- `@google/genai` — Google 官方 GenAI SDK（**新版**，取代已棄用的 `@google/generative-ai`）

預設模型常數（沒指定 model 時用）：

```ts
// src/core/translate/providers/defaults.ts
export const DEFAULT_MODEL = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  google: "gemini-2.0-flash",
} as const

export const TRANSLATE_SYSTEM = (targetLangName: string) =>
  `You are a professional translator. Translate the user's text into ${targetLangName}. `
  + `Output ONLY the translation, preserve meaning and tone, do not add explanations.`
```

### 6.2 OpenAI（官方 `openai` SDK）

```ts
// src/core/translate/providers/openai.ts
import OpenAI from "openai"
import { DEFAULT_MODEL, TRANSLATE_SYSTEM } from "./defaults"

export async function openaiTranslate(
  text: string, targetLangName: string,
  opts: { apiKey: string, model?: string, baseURL?: string, temperature?: number },
): Promise<string> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    ...(opts.baseURL && { baseURL: opts.baseURL }),  // 可接 Azure / 自架 compatible 端點
    // 若在頁面 context 跑才需要：dangerouslyAllowBrowser: true
  })

  const res = await client.chat.completions.create({
    model: opts.model || DEFAULT_MODEL.openai,   // ← 指定模型
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: TRANSLATE_SYSTEM(targetLangName) },
      { role: "user", content: text },
    ],
  })
  return res.choices[0]?.message?.content?.trim() ?? ""
}
```

### 6.3 Anthropic / Claude（官方 `@anthropic-ai/sdk`）

```ts
// src/core/translate/providers/anthropic.ts
import Anthropic from "@anthropic-ai/sdk"
import { DEFAULT_MODEL, TRANSLATE_SYSTEM } from "./defaults"

export async function anthropicTranslate(
  text: string, targetLangName: string,
  opts: { apiKey: string, model?: string, temperature?: number },
): Promise<string> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    // 若在頁面 context 跑才需要：dangerouslyAllowBrowser: true
  })

  const res = await client.messages.create({
    model: opts.model || DEFAULT_MODEL.anthropic,   // ← 指定模型
    max_tokens: 4096,
    temperature: opts.temperature ?? 0,
    system: TRANSLATE_SYSTEM(targetLangName),         // Claude 的 system 是頂層參數
    messages: [{ role: "user", content: text }],
  })

  // content 是 block 陣列，取出 text block
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim()
}
```

### 6.4 Gemini（官方 `@google/genai`）

```ts
// src/core/translate/providers/gemini.ts
import { GoogleGenAI } from "@google/genai"
import { DEFAULT_MODEL, TRANSLATE_SYSTEM } from "./defaults"

export async function geminiTranslate(
  text: string, targetLangName: string,
  opts: { apiKey: string, model?: string, temperature?: number },
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })

  const res = await ai.models.generateContent({
    model: opts.model || DEFAULT_MODEL.google,        // ← 指定模型
    contents: text,
    config: {
      systemInstruction: TRANSLATE_SYSTEM(targetLangName),
      temperature: opts.temperature ?? 0,
    },
  })
  return (res.text ?? "").trim()
}
```

### 6.5 Google Translate（免費端點，手刻 fetch）

這就是「Google Translate 要串哪」的答案：**沒有對應的官方付費 SDK 走免費路線**，read-frog 是直接打 Google 網頁版內部用的 `translate-pa.googleapis.com` 端點，帶一把網頁版公開 key。對照 `src/utils/host/translate/api/google.ts`，直接照搬即可：

```ts
// src/core/translate/providers/google.ts
const URL = "https://translate-pa.googleapis.com/v1/translateHtml"
const API_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520"  // Google 內部公開 key
const CLIENT = "wt_lib"

export async function googleTranslate(text: string, from: string, to: string): Promise<string> {
  const resp = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json+protobuf",
      "X-Goog-API-Key": API_KEY,
    },
    body: JSON.stringify([[[text], from, to], CLIENT]),
  })
  if (!resp.ok) throw new Error(`Google Translate failed: ${resp.status}`)
  const result = await resp.json()
  if (!Array.isArray(result?.[0]) || typeof result[0][0] !== "string")
    throw new TypeError("Unexpected Google Translate response")
  return result[0][0]
}
```

> 語言代碼：Google 翻譯要 ISO 639-1（`en`/`zh`），LLM 用語言英文全名（`Chinese`）。read-frog 用 `ISO6393_TO_6391` 與 `LANG_CODE_TO_EN_NAME` 對照表轉換（`@read-frog/definitions`）。自己做一張小對照表即可。

### 6.6 分派器（依 provider 路由）

統一入口，依當前 provider 路由到對應的官方 SDK 函式。對照 `src/utils/host/translate/execute-translate.ts`：

```ts
// src/core/translate/translate-text.ts
import { getProviderConfigById } from "@/config/storage"
import { isNonAPIProvider } from "@/config/schema"
import { googleTranslate } from "./providers/google"
import { openaiTranslate } from "./providers/openai"
import { anthropicTranslate } from "./providers/anthropic"
import { geminiTranslate } from "./providers/gemini"
import { ISO_639_3_TO_1, LANG_NAME } from "@/config/lang"

export async function translateText(text: string, config: Config): Promise<string> {
  const pc = await getProviderConfigById(config.activeProviderId)
  if (!pc) throw new Error("No active provider")

  // 1. Google 翻譯：免費端點，免 key
  if (isNonAPIProvider(pc.provider)) {
    const from = config.language.sourceCode === "auto"
      ? "auto"
      : (ISO_639_3_TO_1[config.language.sourceCode] ?? "auto")
    const to = ISO_639_3_TO_1[config.language.targetCode]
    return googleTranslate(text, from, to)
  }

  // 2. LLM：各家官方 SDK
  const targetName = LANG_NAME[config.language.targetCode]
  if (!pc.apiKey) throw new Error(`${pc.provider} 需要 API key`)

  switch (pc.provider) {
    case "openai":
      return openaiTranslate(text, targetName, {
        apiKey: pc.apiKey, model: pc.model, baseURL: pc.baseURL, temperature: pc.temperature,
      })
    case "anthropic":
      return anthropicTranslate(text, targetName, {
        apiKey: pc.apiKey, model: pc.model, temperature: pc.temperature,
      })
    case "google":  // Gemini
      return geminiTranslate(text, targetName, {
        apiKey: pc.apiKey, model: pc.model, temperature: pc.temperature,
      })
    default:
      throw new Error(`Unknown provider: ${pc.provider}`)
  }
}
```

### 6.7 CORS：把翻譯放在 background

content script 直接呼叫官方 SDK 會被 CORS 擋，且 key 會暴露在頁面 context。**最乾淨的做法是整個翻譯邏輯都放在 background service worker**，content script 只傳文字、收譯文：

```ts
// background：實際執行翻譯
import { onMessage } from "@/utils/messaging"
import { translateText } from "@/core/translate/translate-text"

onMessage("translate", async ({ data }) => {
  const config = await getConfig()
  return translateText(data.text, config)   // ← AI SDK 在 background 跑，無 CORS 問題
})
```

```ts
// content：只負責 DOM，翻譯外包給 background
import { sendMessage } from "@/utils/messaging"
async function translateText(text: string) {
  return sendMessage("translate", { text })
}
```

**這是建議架構**：DOM 處理留 content script，所有官方 SDK 呼叫與網路請求集中在 background。好處：(1) API key 不暴露在頁面 context；(2) background service worker 預設無 CORS 限制，官方 SDK 直接能用，不必開 `dangerouslyAllowBrowser`。記得在 manifest `host_permissions` 列出目標網域（`api.openai.com`、`api.anthropic.com`、`generativelanguage.googleapis.com`、`translate-pa.googleapis.com`），或用 `<all_urls>`。

---

## 7. 設定頁（選 provider + 指定 model + 填 key）

最小可用：

```tsx
// src/entrypoints/options/App.tsx（示意）
function ProviderSettings({ config, save }: { config: Config, save: (c: Config) => void }) {
  const active = config.providersConfig.find(p => p.id === config.activeProviderId)!
  return (
    <div>
      {/* 1. 選 provider */}
      <select value={active.provider} onChange={e => updateProvider(e.target.value)}>
        <option value="google-translate">Google 翻譯（免費，免 key）</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Claude</option>
        <option value="google">Gemini</option>
      </select>

      {/* 2. LLM 才需要 key + model */}
      {active.provider !== "google-translate" && (
        <>
          <input type="password" placeholder="API Key"
                 value={active.apiKey ?? ""} onChange={e => updateKey(e.target.value)} />
          <select value={active.model ?? ""} onChange={e => updateModel(e.target.value)}>
            {MODELS_BY_PROVIDER[active.provider].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </>
      )}

      {/* 3. 目標語言、翻譯模式、段落熱鍵 */}
    </div>
  )
}
```

---

## 8. 實作順序建議

1. **設定 schema + storage**（第 1 節）— 先有資料模型。
2. **provider 系統 + 一個能 work 的翻譯函式**（第 6 節）— 用 console 先驗證能翻字串。
3. **DOM 遍歷 walkAndLabelElement**（第 2 節）— 在 console 觀察標記正確。
4. **段落翻譯 + 懸停熱鍵**（第 3 節）— 第一個看得到的功能。
5. **插入譯文 / 雙語模式**（第 5 節）。
6. **全文翻譯 + IntersectionObserver/MutationObserver**（第 4 節）。
7. **設定頁 UI**（第 7 節）。
8. 進階：翻譯快取、批次 DOM、僅譯文模式切換、Shadow DOM/iframe 完整支援。

---

## 9. read-frog 原始檔對照速查

| 功能 | read-frog 路徑 |
|---|---|
| DOM 遍歷標記 | `src/utils/host/dom/traversal.ts` |
| 節點過濾規則 | `src/utils/host/dom/filter.ts`、`src/utils/constants/dom-rules.ts` |
| data-* 屬性常數 | `src/utils/constants/dom-labels.ts` |
| 全文翻譯管理器 | `src/entrypoints/host.content/translation-control/page-translation.ts` |
| 段落翻譯觸發狀態機 | `src/entrypoints/host.content/translation-control/node-translation-trigger.ts` |
| 段落翻譯入口 | `src/entrypoints/host.content/translation-control/node-translation.ts` |
| 找最近 block + toggle | `src/utils/host/translate/node-manipulation.ts` |
| provider 工廠（read-frog 用 AI SDK，本指南改官方 SDK） | `src/utils/providers/model.ts` |
| LLM 翻譯（read-frog 用 AI SDK，本指南改官方 SDK） | `src/utils/host/translate/api/ai.ts` |
| Google 翻譯端點 | `src/utils/host/translate/api/google.ts` |
| 翻譯分派器 | `src/utils/host/translate/execute-translate.ts` |
| 譯文插入/模式 | `src/utils/host/translate/core/translation-modes.ts`、`.../dom/translation-insertion.ts` |
| background proxy-fetch | `src/entrypoints/background/proxy-fetch.ts` |
| 模型清單常數 | `src/utils/constants/models.ts` |

---

## 10. 重要提醒

- **不要自架翻譯後端**：翻譯流量直連 provider，key 存使用者本機。read-frog 的 `api.readfrog.app` 只做帳號/部落格/匿名遙測，與翻譯完全分離。
- **AI key 放在 background context**，不要洩漏到頁面 content script。官方 SDK 也在 background 跑，省去 `dangerouslyAllowBrowser` 與 CORS 問題。
- **不用 Vercel AI SDK**：三家各用官方 SDK（`openai` / `@anthropic-ai/sdk` / `@google/genai`），介面差異——OpenAI 用 `chat.completions.create`、Claude 的 `system` 是頂層參數且回傳是 content block 陣列、Gemini 用 `models.generateContent` 且 systemInstruction 放 `config` 裡。
- **語言代碼兩套系統**：Google 翻譯用 ISO 639-1，LLM 用語言英文名。
- **段落為翻譯單位**，不要逐字逐節點翻——`hasInlineNodeChild` 是切段落的關鍵判斷。
- **延遲翻譯**：全文翻譯靠 IntersectionObserver 只翻可視區，省 token 也省錢。
- **manifest 權限**：background 要打第三方端點，記得在 `host_permissions` 列出（或用 `<all_urls>`）。
- Google Translate 那把內建 key 是非正式內部端點，量大或商用有被擋風險，正式產品考慮提供 DeepL/官方 API 備援。
