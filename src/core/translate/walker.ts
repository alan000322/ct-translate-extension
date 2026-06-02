import type { Config } from "@/config/schema"
import { PARAGRAPH_ATTRIBUTE } from "@/core/dom/labels"
import { extractTextContent } from "@/core/dom/traversal"
import { requestTranslateStream } from "@/utils/messaging"
import {
  appendChunk,
  createPendingWrapper,
  failWrapper,
  finalizeWrapper,
  getExistingWrapper,
  shouldTranslate,
} from "./insert"

// 串流進行中的 wrapper → 取消函式。toggle off 同段時據此中止 background 串流。
// 取消函式同時會結束該段對應的 pending promise（見 translateWalkedElement）。
const streamControls = new WeakMap<HTMLElement, () => void>()

function teardownStream(wrapper: HTMLElement): void {
  const teardown = streamControls.get(wrapper)
  if (teardown) {
    streamControls.delete(wrapper)
    teardown()
  }
}

/**
 * 翻譯一個已標記的元素。
 * - 非段落本身 → 往子層找段落遞迴翻。
 * - 段落已翻過（或正在串流）→ toggle 為真則取消串流並移除（還原）。
 * - 否則插入 placeholder、開串流逐字 append；done 定版、error 於該段顯示提示，
 *   不影響其他段落（逐段失敗隔離）。
 */
export async function translateWalkedElement(
  element: HTMLElement,
  config: Config,
  toggle = false,
): Promise<void> {
  if (!element.hasAttribute(PARAGRAPH_ATTRIBUTE)) {
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) {
        await translateWalkedElement(child, config, toggle)
      }
    }
    return
  }

  const existing = getExistingWrapper(element)
  if (existing) {
    if (toggle) {
      teardownStream(existing) // 串流途中取消（若已結束則無作用）
      existing.remove()
    }
    return
  }

  const text = extractTextContent(element).trim()
  if (!shouldTranslate(text, config.translate.page.minWordsPerNode)) return

  const wrapper = createPendingWrapper(element)
  await new Promise<void>((resolve) => {
    let done = false
    const settle = () => {
      if (done) return
      done = true
      streamControls.delete(wrapper)
      resolve()
    }

    const cancel = requestTranslateStream(text, {
      onChunk: (delta) => appendChunk(wrapper, delta),
      onDone: () => { finalizeWrapper(wrapper); settle() },
      onError: (message) => { failWrapper(wrapper, message); settle() },
    })

    // toggle off 時：取消 background 串流並結束 pending promise。
    streamControls.set(wrapper, () => { cancel(); settle() })
  })
}
