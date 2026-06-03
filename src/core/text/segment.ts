// 整段翻譯頁的純文字段落偵測與無損合併資料模型。
// 偵測結果是不可變的「原子段」（atom）；使用者的畫記合併只改變「群組」（group）——
// 每個 group 是 atom index 的連續區間。合併＝相鄰區間併合、拆回＝區間還原為單 atom，
// atom 本身永不改寫，因此拆回必然與偵測當下 byte-identical。

/**
 * 偵測段落：CRLF 正規化後以「連續兩個以上換行（空行）」切段，trim 並剔除空段。
 * 若切不出多段但文字含單一換行，退而以單一換行切段。
 */
export function detectSegments(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n")

  const byBlankLine = normalized
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (byBlankLine.length > 1) return byBlankLine

  // 空行切不出多段：含單一換行時退為單換行切段，否則整篇視為單段。
  if (normalized.includes("\n")) {
    const byNewline = normalized
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (byNewline.length > 1) return byNewline
  }

  return byBlankLine
}

/** group：atom index 的連續區間（含兩端）。 */
export interface GroupRange {
  start: number
  end: number
}

/** 初始分組：每個 atom 自成一組。 */
export function initialGroups(atomCount: number): GroupRange[] {
  return Array.from({ length: atomCount }, (_, i) => ({ start: i, end: i }))
}

/**
 * 合併相鄰群組：把 groups[index] 與 groups[index + 1] 併為一組。
 * index 越界時原樣回傳（純函式，不改動輸入陣列）。
 */
export function mergeAdjacent(groups: GroupRange[], index: number): GroupRange[] {
  if (index < 0 || index + 1 >= groups.length) return groups
  const merged: GroupRange = { start: groups[index].start, end: groups[index + 1].end }
  return [...groups.slice(0, index), merged, ...groups.slice(index + 2)]
}

/**
 * 拆回群組：把 groups[index] 還原為每個 atom 自成一組。
 * 單 atom 群組或 index 越界時原樣回傳。
 */
export function splitGroup(groups: GroupRange[], index: number): GroupRange[] {
  const g = groups[index]
  if (!g || g.start === g.end) return groups
  const restored: GroupRange[] = []
  for (let i = g.start; i <= g.end; i++) restored.push({ start: i, end: i })
  return [...groups.slice(0, index), ...restored, ...groups.slice(index + 1)]
}

/** 取得群組送譯文字：區間內 atom 以換行接合。 */
export function groupText(atoms: string[], group: GroupRange): string {
  return atoms.slice(group.start, group.end + 1).join("\n")
}
