import { describe, expect, it } from "vitest"
import {
  detectSegments,
  groupText,
  initialGroups,
  mergeAdjacent,
  splitGroup,
} from "./segment"

describe("detectSegments：spec 範例表", () => {
  it.each([
    ["A\n\nB\n\n\nC", ["A", "B", "C"]], // 連續 2+ 換行切段
    ["A\nB\nC", ["A", "B", "C"]], // 無空行 → 單換行 fallback
    ["A\r\n\r\nB", ["A", "B"]], // CRLF 先正規化再切
    ["A\n\n   \n\nB", ["A", "B"]], // 純空白段剔除
    ["single paragraph", ["single paragraph"]], // 完全無換行
  ] as const)("%j → %j", (input, expected) => {
    expect(detectSegments(input)).toEqual(expected)
  })

  it("有空行時不啟動單換行 fallback（段內單換行保留）", () => {
    expect(detectSegments("A\n\nB\nC")).toEqual(["A", "B\nC"])
  })

  it("空字串與純空白 → 無段落", () => {
    expect(detectSegments("")).toEqual([])
    expect(detectSegments("  \n \n\n ")).toEqual([])
  })
})

describe("group 合併／拆分：無損還原", () => {
  const atoms = detectSegments("First.\n\nSecond.\n\nThird.")

  it("合併相鄰群組：送譯文字以換行接合", () => {
    const merged = mergeAdjacent(initialGroups(atoms.length), 0)
    expect(merged).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
    ])
    expect(groupText(atoms, merged[0])).toBe("First.\nSecond.")
  })

  it("拆回後與原始偵測 byte-identical", () => {
    let groups = initialGroups(atoms.length)
    groups = mergeAdjacent(groups, 0) // [0-1][2]
    groups = mergeAdjacent(groups, 0) // [0-2]
    groups = splitGroup(groups, 0)
    expect(groups).toEqual(initialGroups(atoms.length))
    expect(groups.map((g) => groupText(atoms, g))).toEqual(atoms)
  })

  it("純函式：不改動輸入、越界原樣回傳", () => {
    const groups = initialGroups(2)
    const snapshot = structuredClone(groups)
    mergeAdjacent(groups, 0)
    splitGroup(groups, 0)
    expect(groups).toEqual(snapshot)
    expect(mergeAdjacent(groups, 1)).toBe(groups) // 右端無相鄰群組
    expect(mergeAdjacent(groups, -1)).toBe(groups)
    expect(splitGroup(groups, 0)).toBe(groups) // 單 atom 群組不可拆
    expect(splitGroup(groups, 9)).toBe(groups)
  })
})
