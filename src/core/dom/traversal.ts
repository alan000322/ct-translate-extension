import {
  BLOCK_ATTRIBUTE,
  INLINE_ATTRIBUTE,
  PARAGRAPH_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "./labels"
import { FORCE_BLOCK_TAGS } from "./rules"
import {
  isDontWalkAndTranslate,
  isHTMLElement,
  isShallowBlockElement,
  isShallowInlineElement,
  isTextNode,
} from "./filter"

/**
 * 遞迴走訪並標記元素。
 * 核心觀念：「含 inline 子節點的元素」= 一個段落（翻譯單位）。
 * 段落標記 PARAGRAPH，並依層級標記 BLOCK / INLINE。
 */
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
  }
  else if (isInlineNode) {
    element.setAttribute(INLINE_ATTRIBUTE, "")
  }

  return { forceBlock, isInlineNode }
}

const NON_NEWLINE_WS = /[^\S\n]/

/**
 * 抽出段落純文字：保留 inline 間有意義的空白、BR 轉換行、排除不可翻後代。
 */
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
