// 沒指定 model 時使用的預設值。
export const DEFAULT_MODEL = {
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  "google-gemini": "gemini-2.0-flash",
} as const

// LLM 翻譯共用 system prompt。只輸出譯文，避免附加說明。
export function translateSystemPrompt(targetLangName: string): string {
  return (
    `You are a professional translator. Translate the user's text into ${targetLangName}. `
    + "Output ONLY the translation. Preserve the original meaning, tone, and formatting. "
    + "Do not add explanations, notes, or surrounding quotes."
  )
}

// LLM provider 共用的選項形狀。
export interface LLMTranslateOptions {
  apiKey: string
  model?: string
  baseURL?: string
  temperature?: number
}
