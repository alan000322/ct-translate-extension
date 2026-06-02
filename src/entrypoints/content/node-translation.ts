import type { Config } from "@/config/schema"
import { BLOCK_ATTRIBUTE } from "@/core/dom/labels"
import { walkAndLabelElement } from "@/core/dom/traversal"
import { translateWalkedElement } from "@/core/translate/walker"
import { getConfig } from "@/config/storage"
import { registerTriggerListeners, type Point } from "./node-translation-trigger"

/**
 * 從一個起始元素往上找最近的 block 段落。
 * 抽離出來以便測試（不依賴版面/elementFromPoint）。
 */
export function findNearestBlockFrom(start: Element | null): HTMLElement | null {
  let el: Element | null = start
  while (el && el instanceof HTMLElement) {
    if (el.hasAttribute(BLOCK_ATTRIBUTE) || el.tagName === "P" || /^H[1-6]$/.test(el.tagName)) {
      return el
    }
    if (getComputedStyle(el).display.includes("block") && el.textContent?.trim()) {
      return el
    }
    el = el.parentElement
  }
  return null
}

/** 從座標解析最近的 block 段落。 */
export function findNearestBlockNodeAt(point: Point): HTMLElement | null {
  return findNearestBlockFrom(document.elementFromPoint(point.x, point.y))
}

/** 對座標下的段落做翻譯（toggle：再觸發一次即還原）。 */
export async function translateNodeAtPoint(point: Point, config: Config): Promise<boolean> {
  const node = findNearestBlockNodeAt(point)
  if (!node) return false

  const walkId = crypto.randomUUID()
  walkAndLabelElement(node, walkId)
  await translateWalkedElement(node, config, /* toggle */ true)
  return true
}

/** 註冊段落翻譯（永遠掛載，等待熱鍵）。回傳 teardown。 */
export function registerNodeTranslation(): () => void {
  return registerTriggerListeners({
    getConfig,
    onTrigger: (point, config) => {
      void translateNodeAtPoint(point, config)
    },
  })
}
