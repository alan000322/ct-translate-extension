import { BLOCK_ATTRIBUTE, CONTENT_WRAPPER_CLASS, NOTRANSLATE_CLASS } from "@/core/dom/labels"

const BODY_SELECTOR = "[data-ct-body]"

/** 取得段落底下既有的譯文 wrapper（若有）。 */
export function getExistingWrapper(element: HTMLElement): HTMLElement | null {
  return element.querySelector<HTMLElement>(`:scope > .${CONTENT_WRAPPER_CLASS}`)
}

/**
 * 在段落底部插入「翻譯中」wrapper（含 placeholder）。
 * block 段落前加 br，使譯文換行另起；標記 notranslate 避免被自己或他人重複翻。
 */
export function createPendingWrapper(element: HTMLElement): HTMLElement {
  const wrapper = document.createElement("span")
  wrapper.className = `${CONTENT_WRAPPER_CLASS} ${NOTRANSLATE_CLASS}`

  if (element.hasAttribute(BLOCK_ATTRIBUTE)) {
    wrapper.appendChild(document.createElement("br"))
  }

  const body = document.createElement("span")
  body.setAttribute("data-ct-body", "")
  body.style.opacity = "0.6"
  body.textContent = "…"
  wrapper.appendChild(body)

  element.appendChild(wrapper)
  return wrapper
}

/** 譯文完成：替換 placeholder。 */
export function fillWrapper(wrapper: HTMLElement, translated: string): void {
  const body = wrapper.querySelector<HTMLElement>(BODY_SELECTOR)
  if (!body) return
  body.textContent = translated
  body.style.opacity = "0.85"
}

const STREAMING_FLAG = "data-ct-streaming"

/**
 * 串流增量：把 delta 累加進既有 data-ct-body 節點（打字機效果）。
 * 第一個 chunk 抵達時先清掉 placeholder「…」，之後逐片段 append。
 */
export function appendChunk(wrapper: HTMLElement, delta: string): void {
  const body = wrapper.querySelector<HTMLElement>(BODY_SELECTOR)
  if (!body) return
  if (body.getAttribute(STREAMING_FLAG) !== "1") {
    body.setAttribute(STREAMING_FLAG, "1")
    body.textContent = "" // 清除 placeholder
  }
  body.textContent += delta
}

/** 串流結束：定版（調整 opacity、清除串流標記）。 */
export function finalizeWrapper(wrapper: HTMLElement): void {
  const body = wrapper.querySelector<HTMLElement>(BODY_SELECTOR)
  if (!body) return
  body.removeAttribute(STREAMING_FLAG)
  body.style.opacity = "0.85"
}

/** 翻譯失敗：於該段 wrapper 顯示提示（不影響其他段落）。 */
export function failWrapper(wrapper: HTMLElement, message: string): void {
  const body = wrapper.querySelector<HTMLElement>(BODY_SELECTOR)
  if (!body) return
  body.textContent = `[翻譯失敗] ${message}`
  body.style.opacity = "0.85"
}

/**
 * 過濾太短/純數字碎片，避免翻「OK」「2024」這類無意義片段。
 */
export function shouldTranslate(text: string, minWords: number): boolean {
  if (!text) return false
  if (/^[\d\s.,%$€£¥]+$/.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean).length
  return words >= minWords
}
