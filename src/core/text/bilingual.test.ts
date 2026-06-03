import { describe, expect, it } from "vitest"
import { formatBilingual } from "./bilingual"

describe("formatBilingual：雙語複製格式契約", () => {
  it("spec 範例：A done／B error／C done → 排除 B、結尾無空行", () => {
    const result = formatBilingual([
      { source: "A", translation: "甲", done: true },
      { source: "B", translation: "", done: false },
      { source: "C", translation: "丙", done: true },
    ])
    expect(result).toBe("A\n甲\n\nC\n丙")
  })

  it("全部 done：依文章順序逐段交錯", () => {
    const result = formatBilingual([
      { source: "First.", translation: "第一。", done: true },
      { source: "Second.", translation: "第二。", done: true },
    ])
    expect(result).toBe("First.\n第一。\n\nSecond.\n第二。")
  })

  it("零 done → 空字串", () => {
    expect(formatBilingual([{ source: "A", translation: "", done: false }])).toBe("")
    expect(formatBilingual([])).toBe("")
  })
})
