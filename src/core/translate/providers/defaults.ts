// 沒指定 model 時使用的預設值。
export const DEFAULT_MODEL = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  "google-gemini": "gemini-3.5-flash",
} as const

// LLM 翻譯共用 system prompt。只輸出譯文，避免附加說明。
export function translateSystemPrompt(targetLangName: string): string {
  return (
    `You are a professional translator. Translate the user's text into ${targetLangName}. `
    + "Output ONLY the translation. Preserve the original meaning, tone, and formatting. "
    + "Do not add explanations, notes, or surrounding quotes."
  )
}

// 全文摘要 system prompt。固定繁體中文輸出（不受翻譯目標語言影響）：
// 一句總起 + 3–5 點重點，純文字。
export function summarizeSystemPrompt(): string {
  return (
    "你是一位精準的內容摘要者。針對使用者提供的全文，一律以繁體中文輸出摘要，"
    + "無論原文是什麼語言。格式：先以一句話總起全文主旨，接著條列 3 至 5 點重點"
    + "（每點以「- 」起首、一到兩句）。只輸出摘要本身，純文字、不使用 markdown 標題，"
    + "不加任何前言、說明或結語。"
  )
}

// 研究重點剖析 system prompt。博士生 persona、固定三節結構化純文字、繁體中文。
export function analyzeSystemPrompt(): string {
  return (
    "你是一位精通各學科文獻的全能博士生，擅長快速剖析任何領域的研究文章。"
    + "針對使用者提供的文章，一律以繁體中文輸出分析，依序產出以下三節，"
    + "每節以該節名稱獨立成行起首（格式如【研究背景與脈絡】），每節 2 至 6 句：\n"
    + "【研究背景與脈絡】說明這項研究回應什麼問題、所處的領域脈絡與前人工作。\n"
    + "【研究方法】說明研究採用的方法、資料與設計，並評述其適切性。\n"
    + "【文獻貢獻】明確指出貢獻屬於「獨特方法」「獨特見解」或「發現獨特現象」"
    + "（可複選），並說明理由。\n"
    + "只輸出這三節，純文字、不使用 markdown 語法，不加任何前言或結語。"
  )
}

// LLM provider 共用的選項形狀。
export interface LLMTranslateOptions {
  apiKey: string
  model?: string
  baseURL?: string
  temperature?: number
}
