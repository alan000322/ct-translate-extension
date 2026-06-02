// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Config } from "@/config/schema"
import { registerTriggerListeners } from "./node-translation-trigger"

const config: Config = {
  language: { sourceCode: "auto", targetCode: "zh-Hant" },
  providersConfig: [{ id: "openai", provider: "openai", model: "gpt-4o-mini", apiKey: "test-key" }],
  activeProviderId: "openai",
  translate: {
    mode: "bilingual",
    node: { enabled: true, hotkey: "Control" },
    page: { minWordsPerNode: 1 },
  },
}

let teardown: () => void

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = `<input id="field" />`
})

afterEach(() => {
  teardown?.()
  vi.useRealTimers()
})

describe("hover plus hotkey trigger", () => {
  it("triggers after holding the hotkey past the delay", async () => {
    const onTrigger = vi.fn()
    teardown = registerTriggerListeners({ getConfig: async () => config, onTrigger })

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }))
    await vi.advanceTimersByTimeAsync(100)

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it("does not trigger when tapped and released faster than the delay", async () => {
    const onTrigger = vi.fn()
    teardown = registerTriggerListeners({ getConfig: async () => config, onTrigger })

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }))
    await Promise.resolve() // 讓 async getConfig 完成、排定計時器
    await Promise.resolve()
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }))
    await vi.advanceTimersByTimeAsync(100)

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it("ignores the hotkey inside an editable field", async () => {
    const onTrigger = vi.fn()
    teardown = registerTriggerListeners({ getConfig: async () => config, onTrigger })

    const field = document.getElementById("field")!
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)

    expect(onTrigger).not.toHaveBeenCalled()
  })
})
