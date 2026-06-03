// 呼叫端（content／擴充頁面）↔ background 的串流訊息契約。
// 以長壽命 Port（chrome.runtime.connect）取代一次性 sendMessage/sendResponse，
// 讓 background 能逐步把輸出片段（chunk）推回呼叫端，支援打字機式串流與中途取消。
// 每個請求開一條 translate-stream Port；done/error 後即斷線。
// start 可帶任務種類 task（translate／summarize／analyze），未帶即視為 translate，
// 既有懸停翻譯呼叫端零修改。所有 SDK／API key 仍只在 background 執行。
import { DEFAULT_TASK, type TaskKind } from "@/core/translate/tasks"

const PORT_NAME = "translate-stream" as const

// 呼叫端 → background
export interface StartMessage {
  type: "start"
  id: string
  text: string
  task?: TaskKind
}
export interface CancelMessage {
  type: "cancel"
  id: string
}
export type ContentToBackground = StartMessage | CancelMessage

// background → content
export interface ChunkMessage {
  type: "chunk"
  id: string
  delta: string // 增量片段（非累積）
}
export interface DoneMessage {
  type: "done"
  id: string
}
export interface ErrorMessage {
  type: "error"
  id: string
  message: string
}
export type BackgroundToContent = ChunkMessage | DoneMessage | ErrorMessage

export interface StreamHandlers {
  onChunk: (delta: string) => void
  onDone: () => void
  onError: (message: string) => void
}

/**
 * 呼叫端：以串流方式請求任務（預設翻譯）。
 * 回傳一個 cancel 函式：呼叫即送 cancel 訊息並斷線，background 隨之中止 provider 串流。
 * 取消不會觸發 onError（cancel 後關閉視為正常）。連線在 done/error 後自動斷開。
 */
export function requestTranslateStream(
  text: string,
  handlers: StreamHandlers,
  task: TaskKind = DEFAULT_TASK,
): () => void {
  const id = crypto.randomUUID()
  const port = chrome.runtime.connect({ name: PORT_NAME })
  let settled = false

  port.onMessage.addListener((msg: BackgroundToContent) => {
    // 以 id 配對；已結束或非本請求的（遲到）訊息一律丟棄。
    if (settled || msg.id !== id) return
    switch (msg.type) {
      case "chunk":
        handlers.onChunk(msg.delta)
        break
      case "done":
        settled = true
        handlers.onDone()
        try { port.disconnect() } catch { /* already closed */ }
        break
      case "error":
        settled = true
        handlers.onError(msg.message)
        try { port.disconnect() } catch { /* already closed */ }
        break
    }
  })

  port.onDisconnect.addListener(() => {
    // background 端在未送 done/error 前就斷線（例如 SW 被回收）視為錯誤；
    // 但若是 content 主動取消（settled 已為 true）則不報錯。
    if (!settled) {
      settled = true
      handlers.onError("翻譯服務連線中斷")
    }
  })

  // 預設任務不帶 task 欄位，維持與既有呼叫端 byte-identical 的訊息形狀。
  port.postMessage({
    type: "start",
    id,
    text,
    ...(task !== DEFAULT_TASK ? { task } : {}),
  } satisfies StartMessage)

  return () => {
    if (settled) return
    settled = true
    try { port.postMessage({ type: "cancel", id } satisfies CancelMessage) } catch { /* closed */ }
    try { port.disconnect() } catch { /* closed */ }
  }
}

// background 端的串流產生器：給定文字、任務種類與 abort signal，逐步 yield 輸出增量片段。
export type StreamProducer = (
  text: string,
  task: TaskKind,
  signal: AbortSignal,
) => AsyncIterable<string>

/**
 * background 端：註冊串流翻譯處理。所有 SDK/fetch 都在此 produce 內執行（key 不進頁面）。
 * 每條 Port 對應一個請求：收到 start 後 for await 消費 produce，逐片段 postMessage chunk，
 * 結束送 done、例外送 error。content 斷線或送 cancel 即 abort，中止 provider 串流。
 */
export function registerTranslateStreamHandler(produce: StreamProducer): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return

    const controller = new AbortController()
    let started = false

    const safePost = (msg: BackgroundToContent) => {
      try { port.postMessage(msg) } catch { /* port closed mid-stream */ }
    }

    port.onDisconnect.addListener(() => controller.abort())

    port.onMessage.addListener((msg: ContentToBackground) => {
      if (msg.type === "cancel") {
        controller.abort()
        return
      }
      if (msg.type !== "start" || started) return
      started = true

      const { id, text } = msg
      const task: TaskKind = msg.task ?? DEFAULT_TASK // 未帶或舊呼叫端 → translate
      void (async () => {
        try {
          for await (const delta of produce(text, task, controller.signal)) {
            if (controller.signal.aborted) return
            if (delta) safePost({ type: "chunk", id, delta })
          }
          if (controller.signal.aborted) return
          safePost({ type: "done", id })
        }
        catch (e) {
          if (controller.signal.aborted) return // 取消不視為錯誤
          safePost({ type: "error", id, message: e instanceof Error ? e.message : String(e) })
        }
      })()
    })
  })
}
