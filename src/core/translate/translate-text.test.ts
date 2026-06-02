import { describe, expect, it } from "vitest"
import type { Config } from "@/config/schema"
import { translateText } from "./translate-text"

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
})
