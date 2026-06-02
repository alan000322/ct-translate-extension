// 用 data-* 屬性在 DOM 上做翻譯標記。段落翻譯與全文翻譯共用同一套。
export const WALKED_ATTRIBUTE = "data-ct-walked" // 已走訪（值 = walkId）
export const PARAGRAPH_ATTRIBUTE = "data-ct-paragraph" // 翻譯單位：含 inline 子節點
export const BLOCK_ATTRIBUTE = "data-ct-block" // block 級
export const INLINE_ATTRIBUTE = "data-ct-inline" // inline 級

// 插入譯文用的 wrapper class，以及表示「不翻」的 class。
export const CONTENT_WRAPPER_CLASS = "ct-translated-wrapper"
export const NOTRANSLATE_CLASS = "notranslate"
