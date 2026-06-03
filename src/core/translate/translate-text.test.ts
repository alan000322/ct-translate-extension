import { describe, expect, it } from "vitest"
import type { Config } from "@/config/schema"
import { runTask, taskSystemPrompt, translateText } from "./translate-text"

function baseConfig(overrides: Partial<Config>): Config {
  return {
    language: { sourceCode: "auto", targetCode: "zh-Hant" },
    providersConfig: [
      { id: "openai", provider: "openai", model: "gpt-4o-mini" },
      { id: "anthropic", provider: "anthropic", model: "claude-sonnet-4-6" },
    ],
    activeProviderId: "openai",
    translate: {
      mode: "bilingual",
      node: { enabled: true, hotkey: "Control" },
      page: { minWordsPerNode: 1 },
    },
    ...overrides,
  }
}

describe("provider dispatch by active provider / missing API key is surfaced, not silent", () => {
  it("throws a named error when an LLM provider has no API key", async () => {
    const config = baseConfig({ activeProviderId: "openai" })
    await expect(translateText("Hello", config)).rejects.toThrow(/API key/)
  })

  it("throws when the active provider id does not exist", async () => {
    const config = baseConfig({ activeProviderId: "nonexistent" })
    await expect(translateText("Hello", config)).rejects.toThrow(/active provider/)
  })

  it("analysis task without key surfaces the same named error", async () => {
    const config = baseConfig({ activeProviderId: "anthropic" })
    await expect(runTask("analyze", "Some paper", config)).rejects.toThrow(/API key/)
    await expect(runTask("summarize", "Some paper", config)).rejects.toThrow(/API key/)
  })
})

describe("task-based prompt assembly and routing", () => {
  const config = baseConfig({})

  it("translate：帶設定的目標語言英文名", () => {
    expect(taskSystemPrompt("translate", config)).toContain("Traditional Chinese")
  })

  it("summarize：固定繁中、一句總起 + 3–5 點重點，不受 targetCode 影響", () => {
    const en = baseConfig({ language: { sourceCode: "auto", targetCode: "en" } })
    const prompt = taskSystemPrompt("summarize", en)
    expect(prompt).toContain("繁體中文")
    expect(prompt).toContain("3 至 5 點")
    expect(prompt).not.toContain("English")
  })

  it("analyze：博士生 persona 與固定三節", () => {
    const prompt = taskSystemPrompt("analyze", config)
    expect(prompt).toContain("博士生")
    for (const section of ["【研究背景與脈絡】", "【研究方法】", "【文獻貢獻】"]) {
      expect(prompt).toContain(section)
    }
    expect(prompt).toContain("獨特方法")
  })
})
