import { describe, expect, it } from "vitest"
import { toEnglishName } from "./lang"

describe("language code mapping to LLM english name", () => {
  it.each([
    ["zh-Hant", "Traditional Chinese"],
    ["ja", "Japanese"],
    ["en", "English"],
  ] as const)("maps %s to LLM name %s", (target, name) => {
    expect(toEnglishName(target)).toBe(name)
  })
})
