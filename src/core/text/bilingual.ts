// 雙語複製的對照文字組裝：依文章順序「原文\n譯文」、段與段之間空行，
// 只收已完成（done）的段落，結尾不留多餘空行。

export interface BilingualPair {
  source: string
  translation: string
  done: boolean
}

/** 組裝雙語對照純文字；無任何 done 段落時回傳空字串。 */
export function formatBilingual(pairs: BilingualPair[]): string {
  return pairs
    .filter((p) => p.done)
    .map((p) => `${p.source}\n${p.translation}`)
    .join("\n\n")
}
