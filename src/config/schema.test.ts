import { describe, expect, it } from "vitest"
import { configSchema } from "./schema"

const wellFormed = {
  language: { sourceCode: "auto", targetCode: "zh-Hant" },
  providersConfig: [{ id: "openai", provider: "openai", model: "gpt-4o-mini" }],
  activeProviderId: "openai",
  translate: {
    mode: "bilingual",
    node: { enabled: true, hotkey: "Control" },
    page: { minWordsPerNode: 1 },
  },
}

describe("config schema and persistent storage", () => {
  it("accepts a well-formed config", () => {
    expect(configSchema.safeParse(wellFormed).success).toBe(true)
  })

  it("rejects an unknown target language", () => {
    const bad = { ...wellFormed, language: { sourceCode: "auto", targetCode: "de" } }
    expect(configSchema.safeParse(bad).success).toBe(false)
  })

  it("rejects an unknown provider type", () => {
    const bad = { ...wellFormed, providersConfig: [{ id: "x", provider: "google-translate" }] }
    expect(configSchema.safeParse(bad).success).toBe(false)
  })
})
