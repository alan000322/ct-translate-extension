// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Config } from "@/config/schema"
import type { StreamHandlers } from "@/utils/messaging"
import { BLOCK_ATTRIBUTE, CONTENT_WRAPPER_CLASS, PARAGRAPH_ATTRIBUTE } from "@/core/dom/labels"

const requestTranslateStream = vi.fn<(text: string, handlers: StreamHandlers) => () => void>()
vi.mock("@/utils/messaging", () => ({
  requestTranslateStream: (t: string, h: StreamHandlers) => requestTranslateStream(t, h),
}))

const { translateWalkedElement } = await import("./walker")

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

function makeParagraph(text: string): HTMLElement {
  const p = document.createElement("p")
  p.textContent = text
  p.setAttribute(PARAGRAPH_ATTRIBUTE, "")
  p.setAttribute(BLOCK_ATTRIBUTE, "")
  document.body.appendChild(p)
  return p
}

function wrapperText(el: HTMLElement): string {
  return el.querySelector(`.${CONTENT_WRAPPER_CLASS}`)?.textContent ?? ""
}

beforeEach(() => {
  document.body.innerHTML = ""
  requestTranslateStream.mockReset()
})

describe("bilingual insertion with toggle", () => {
  it("inserts the translation beneath the paragraph, then removes it on re-trigger", async () => {
    requestTranslateStream.mockImplementation((_t, h) => {
      h.onChunk("譯文內容")
      h.onDone()
      return () => {}
    })
    const p = makeParagraph("Hello world")

    await translateWalkedElement(p, config, true)
    expect(p.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).not.toBeNull()
    expect(wrapperText(p)).toContain("譯文內容")

    await translateWalkedElement(p, config, true)
    expect(p.querySelector(`.${CONTENT_WRAPPER_CLASS}`)).toBeNull()
  })
})

describe("typewriter incremental append", () => {
  it("appends chunks in order so the translation grows, then finalizes on done", async () => {
    requestTranslateStream.mockImplementation((_t, h) => {
      h.onChunk("你")
      h.onChunk("好")
      h.onChunk("世界")
      h.onDone()
      return () => {}
    })
    const p = makeParagraph("Hello world")

    await translateWalkedElement(p, config, true)
    // 片段串接，且不殘留 placeholder「…」
    expect(wrapperText(p)).toContain("你好世界")
    expect(wrapperText(p)).not.toContain("…")
  })
})

describe("per-paragraph failure isolation", () => {
  it("shows a failure indication on the failing paragraph while others succeed", async () => {
    requestTranslateStream.mockImplementation((text, h) => {
      if (text.includes("bad")) h.onError("缺 API key")
      else { h.onChunk("正常譯文"); h.onDone() }
      return () => {}
    })
    const good = makeParagraph("a good paragraph here")
    const bad = makeParagraph("a bad paragraph here")

    await translateWalkedElement(good, config, true)
    await translateWalkedElement(bad, config, true)

    expect(wrapperText(good)).toContain("正常譯文")
    expect(wrapperText(bad)).toContain("[翻譯失敗]")
    // 失敗不影響其他段落
    expect(wrapperText(good)).not.toContain("[翻譯失敗]")
  })
})
