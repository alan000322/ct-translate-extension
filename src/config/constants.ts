import type { ProviderType, TargetLanguage } from "./schema"

// 各 provider 的可選 model 清單（設定頁/popup 下拉用）。
export const MODELS_BY_PROVIDER: Record<ProviderType, readonly string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  "google-gemini": ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
}

// provider 顯示名稱（UI 用）。
export const PROVIDER_LABELS: Record<ProviderType, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  "google-gemini": "Gemini",
}

// 目標語言顯示名稱（UI 用）。
export const TARGET_LANGUAGE_LABELS: Record<TargetLanguage, string> = {
  "zh-Hant": "繁體中文",
  ja: "日本語",
  en: "English",
}
