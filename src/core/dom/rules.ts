// 這些 tag 一律視為 block 級（即使 computed display 不是 block）。
export const FORCE_BLOCK_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6", "P", "DIV", "BLOCKQUOTE",
  "ARTICLE", "SECTION", "MAIN", "NAV", "LI", "TD", "TH", "DD", "DT", "FIGCAPTION",
])

// 這些 tag 完全不走入也不翻（非內容或會破壞的元素）。
export const DONT_WALK_AND_TRANSLATE_TAGS = new Set([
  "HEAD", "SCRIPT", "STYLE", "NOSCRIPT", "IMG", "VIDEO", "AUDIO", "SVG", "CANVAS",
  "IFRAME", "INPUT", "TEXTAREA", "SELECT", "CODE", "PRE", "MATH",
])
