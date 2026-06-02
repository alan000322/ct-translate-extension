import { browser } from "wxt/browser"
import { configSchema, type Config, type ProviderConfig } from "./schema"

const STORAGE_KEY = "config"

// 預設設定：三個 LLM provider 各一組，預設啟用 OpenAI（需使用者填 API key）。
export const DEFAULT_CONFIG: Config = {
  language: { sourceCode: "auto", targetCode: "zh-Hant" },
  providersConfig: [
    { id: "openai", provider: "openai", model: "gpt-4o-mini", temperature: 0 },
    { id: "anthropic", provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0 },
    { id: "google-gemini", provider: "google-gemini", model: "gemini-2.0-flash", temperature: 0 },
  ],
  activeProviderId: "openai",
  translate: {
    mode: "bilingual",
    node: { enabled: true, hotkey: "Control" },
    page: { minWordsPerNode: 1 },
  },
}

/**
 * 讀取 config（content / background / popup 共用）。
 * 解析失敗或不存在時回退到 DEFAULT_CONFIG，確保永遠拿到合法 config。
 */
export async function getConfig(): Promise<Config> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const raw = stored[STORAGE_KEY]
  if (raw === undefined) return DEFAULT_CONFIG

  const parsed = configSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_CONFIG
}

/** 寫入 config（先以 schema 驗證）。 */
export async function setConfig(config: Config): Promise<void> {
  const validated = configSchema.parse(config)
  await browser.storage.local.set({ [STORAGE_KEY]: validated })
}

/** 取得目前作用中的 provider 設定。 */
export async function getActiveProviderConfig(): Promise<ProviderConfig | undefined> {
  const config = await getConfig()
  return config.providersConfig.find((p) => p.id === config.activeProviderId)
}
