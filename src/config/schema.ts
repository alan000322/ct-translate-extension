import { z } from "zod"

// 我們只支援這三種 LLM provider（皆需 API key）。
// google-gemini = Google 的 LLM。
export const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "google-gemini",
] as const
export type ProviderType = (typeof PROVIDER_TYPES)[number]

// 目標語言只支援這三種（來源語言預設 auto）。
export const TARGET_LANGUAGES = ["zh-Hant", "ja", "en"] as const
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number]

// 段落翻譯觸發熱鍵。
export const HOTKEYS = ["Control", "Alt", "Shift"] as const
export type Hotkey = (typeof HOTKEYS)[number]

export const providerConfigSchema = z.object({
  id: z.string(),
  provider: z.enum(PROVIDER_TYPES),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).optional(),
})
export type ProviderConfig = z.infer<typeof providerConfigSchema>

export const configSchema = z.object({
  language: z.object({
    sourceCode: z.string().default("auto"),
    targetCode: z.enum(TARGET_LANGUAGES).default("zh-Hant"),
  }),
  providersConfig: z.array(providerConfigSchema),
  activeProviderId: z.string(),
  translate: z.object({
    mode: z.enum(["bilingual", "translationOnly"]).default("bilingual"),
    node: z.object({
      enabled: z.boolean().default(true),
      hotkey: z.enum(HOTKEYS).default("Control"),
    }),
    page: z.object({
      minWordsPerNode: z.number().default(1),
    }),
  }),
})
export type Config = z.infer<typeof configSchema>
