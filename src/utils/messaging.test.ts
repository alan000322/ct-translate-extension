import { afterEach, describe, expect, it, vi } from "vitest"
import {
  registerTranslateStreamHandler,
  requestTranslateStream,
  type StartMessage,
} from "./messaging"

// 假 Port：捕捉 postMessage、可手動觸發 onMessage/onConnect，模擬 chrome.runtime 兩端。
function fakePort(name = "translate-stream") {
  const posted: unknown[] = []
  const messageListeners: Array<(msg: unknown) => void> = []
  return {
    posted,
    emit(msg: unknown) {
      messageListeners.forEach((fn) => fn(msg))
    },
    port: {
      name,
      postMessage: (msg: unknown) => posted.push(msg),
      onMessage: { addListener: (fn: (msg: unknown) => void) => messageListeners.push(fn) },
      onDisconnect: { addListener: () => {} },
      disconnect: () => {},
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestTranslateStream：start 訊息的 task 欄位", () => {
  function stubConnect() {
    const fake = fakePort()
    vi.stubGlobal("chrome", { runtime: { connect: () => fake.port } })
    return fake
  }

  it("未帶 task：start 形狀與既有契約 byte-identical（無 task 鍵）", () => {
    const fake = stubConnect()
    requestTranslateStream("hello", { onChunk: () => {}, onDone: () => {}, onError: () => {} })

    expect(fake.posted).toHaveLength(1)
    const start = fake.posted[0] as StartMessage
    expect(start.type).toBe("start")
    expect(start.text).toBe("hello")
    expect("task" in start).toBe(false) // 向後相容：預設任務不帶欄位
  })

  it("帶 task：欄位正確送出", () => {
    const fake = stubConnect()
    requestTranslateStream(
      "paper",
      { onChunk: () => {}, onDone: () => {}, onError: () => {} },
      "summarize",
    )

    const start = fake.posted[0] as StartMessage
    expect(start.task).toBe("summarize")
  })
})

describe("registerTranslateStreamHandler：task 路由至 producer", () => {
  function stubOnConnect() {
    const connectListeners: Array<(port: unknown) => void> = []
    vi.stubGlobal("chrome", {
      runtime: { onConnect: { addListener: (fn: (port: unknown) => void) => connectListeners.push(fn) } },
    })
    return { connect: (port: unknown) => connectListeners.forEach((fn) => fn(port)) }
  }

  it.each([
    [{ type: "start", id: "r1", text: "t" }, "translate"], // 未帶 → 預設 translate
    [{ type: "start", id: "r2", text: "t", task: "analyze" }, "analyze"],
  ] as const)("start %j → produce 收到 task %s", async (start, expectedTask) => {
    const { connect } = stubOnConnect()
    const received: string[] = []
    registerTranslateStreamHandler(async function* (_text, task) {
      received.push(task)
      yield "ok"
    })

    const fake = fakePort()
    connect(fake.port)
    fake.emit(start)

    // done 是最後一則訊息：等到它出現，chunk 與 received 必已就緒。
    await vi.waitFor(() => expect(fake.posted).toContainEqual({ type: "done", id: start.id }))
    expect(received).toEqual([expectedTask])
    expect(fake.posted).toContainEqual({ type: "chunk", id: start.id, delta: "ok" })
  })
})
