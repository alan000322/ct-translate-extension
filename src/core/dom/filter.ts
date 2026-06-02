import { NOTRANSLATE_CLASS } from "./labels"
import { DONT_WALK_AND_TRANSLATE_TAGS, FORCE_BLOCK_TAGS } from "./rules"

export function isHTMLElement(n: Node): n is HTMLElement {
  return n.nodeType === Node.ELEMENT_NODE
}

export function isTextNode(n: Node): n is Text {
  return n.nodeType === Node.TEXT_NODE
}

// 是否為「不走入也不翻」的節點：非內容 tag、隱藏、aria-hidden、notranslate、僅供螢幕閱讀器。
export function isDontWalkAndTranslate(el: HTMLElement): boolean {
  if (DONT_WALK_AND_TRANSLATE_TAGS.has(el.tagName)) return true
  if (el.classList.contains(NOTRANSLATE_CLASS)) return true
  if (el.getAttribute("aria-hidden") === "true") return true
  if (el.hasAttribute("hidden")) return true
  if (el.classList.contains("sr-only") || el.classList.contains("visually-hidden")) return true

  const style = getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden") return true
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
