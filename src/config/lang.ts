import type { TargetLanguage } from "./schema"

// LLM 需語言英文全名（例如 "Traditional Chinese"）。集中於此轉換，避免散落各處。

const ENGLISH_NAME: Record<TargetLanguage, string> = {
  "zh-Hant": "Traditional Chinese",
  ja: "Japanese",
  en: "English",
}

/** 目標語言 → LLM 用語言英文名。 */
export function toEnglishName(target: TargetLanguage): string {
  return ENGLISH_NAME[target]
}
