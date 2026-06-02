import type { Config } from "@/config/schema"

export interface Point {
  x: number
  y: number
}

const HOTKEY_EVENT_KEYS: Record<string, string> = {
  Control: "Control",
  Alt: "Alt",
  Shift: "Shift",
}

const HOLD_DELAY_MS = 80 // 短延遲防誤觸

function isEditable(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement
    && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  )
}

/**
 * 互動狀態機：只偵測使用者意圖（不碰翻譯）。
 * - 追蹤滑鼠座標（mousemove 節流）。
 * - 按住熱鍵超過短延遲才觸發；輸入框/contenteditable 內忽略；node 翻譯停用時忽略。
 * 回傳 teardown 函式。
 */
export function registerTriggerListeners(opts: {
  getConfig: () => Promise<Config>
  onTrigger: (point: Point, config: Config) => void
}): () => void {
  const ac = new AbortController()
  const { signal } = ac
  const mouse: Point = { x: 0, y: 0 }
  let hasMouse = false

  const updateMouse = (p: Point) => {
    mouse.x = p.x
    mouse.y = p.y
    hasMouse = true
  }

  const deepestHovered = (): Element | null => {
    const els = document.querySelectorAll(":hover")
    return els.item(els.length - 1)
  }

  const resolvePoint = (): Point => {
    if (hasMouse) return { ...mouse }
    const el = deepestHovered()
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
    }
    return { ...mouse }
  }

  let throttle: ReturnType<typeof setTimeout> | null = null
  document.addEventListener(
    "mousemove",
    (e) => {
      if (throttle) return
      throttle = setTimeout(() => {
        throttle = null
      }, 200)
      updateMouse({ x: e.clientX, y: e.clientY })
    },
    { signal },
  )
  document.addEventListener(
    "mouseover",
    (e) => updateMouse({ x: e.clientX, y: e.clientY }),
    { signal },
  )

  let pressed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    "keydown",
    (e) => {
      void (async () => {
        if (isEditable(e.target)) return
        const config = await opts.getConfig()
        if (!config.translate.node.enabled) return
        const hotkey = config.translate.node.hotkey
        if (e.key !== HOTKEY_EVENT_KEYS[hotkey]) return
        if (pressed) return
        pressed = true
        timer = setTimeout(() => {
          if (pressed) opts.onTrigger(resolvePoint(), config)
        }, HOLD_DELAY_MS)
      })()
    },
    { signal },
  )

  document.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Control" || e.key === "Alt" || e.key === "Shift") {
        pressed = false
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
      }
    },
    { signal },
  )

  return () => ac.abort()
}
