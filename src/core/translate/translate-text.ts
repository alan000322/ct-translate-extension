import type { Config } from "@/config/schema"
import { toEnglishName } from "@/config/lang"
import { PROVIDER_LABELS } from "@/config/constants"
import { openaiTranslate, openaiTranslateStream } from "./providers/openai"
import { anthropicTranslate, anthropicTranslateStream } from "./providers/anthropic"
import { geminiTranslate, geminiTranslateStream } from "./providers/gemini"

/**
 * 統一翻譯入口：依當前 active provider 路由到對應 LLM 實作。
 * 各家官方 SDK（語言英文名）；缺 key 時拋出具名錯誤。
 */
export async function translateText(text: string, config: Config): Promise<string> {
  const pc = config.providersConfig.find((p) => p.id === config.activeProviderId)
  if (!pc) {
    throw new Error("找不到作用中的翻譯服務（active provider）")
  }

  // LLM：各家官方 SDK。缺 key 直接拋出具名錯誤，不靜默失敗。
  if (!pc.apiKey) {
    throw new Error(`${PROVIDER_LABELS[pc.provider]} 需要 API key，請於 popup 設定`)
  }

  const targetName = toEnglishName(config.language.targetCode)
  const opts = {
    apiKey: pc.apiKey,
    model: pc.model,
    baseURL: pc.baseURL,
    temperature: pc.temperature,
  }

  switch (pc.provider) {
    case "openai":
      return openaiTranslate(text, targetName, opts)
    case "anthropic":
      return anthropicTranslate(text, targetName, opts)
    case "google-gemini":
      return geminiTranslate(text, targetName, opts)
    default:
      throw new Error(`未知的翻譯服務：${pc.provider}`)
  }
}

/**
 * 串流翻譯入口：逐步 yield 譯文增量片段，供打字機渲染消費。
 * 路由至各家 LLM 串流 generator，並把 signal 往下傳以支援中止。
 * 缺 key／未知 provider 與非串流版一致，直接拋出具名錯誤。
 */
export async function* translateTextStream(
  text: string,
  config: Config,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const pc = config.providersConfig.find((p) => p.id === config.activeProviderId)
  if (!pc) {
    throw new Error("找不到作用中的翻譯服務（active provider）")
  }

  // LLM：各家串流 generator。缺 key 直接拋出具名錯誤，不靜默失敗。
  if (!pc.apiKey) {
    throw new Error(`${PROVIDER_LABELS[pc.provider]} 需要 API key，請於 popup 設定`)
  }

  const targetName = toEnglishName(config.language.targetCode)
  const opts = {
    apiKey: pc.apiKey,
    model: pc.model,
    baseURL: pc.baseURL,
    temperature: pc.temperature,
  }

  switch (pc.provider) {
    case "openai":
      yield* openaiTranslateStream(text, targetName, opts, signal)
      return
    case "anthropic":
      yield* anthropicTranslateStream(text, targetName, opts, signal)
      return
    case "google-gemini":
      yield* geminiTranslateStream(text, targetName, opts, signal)
      return
    default:
      throw new Error(`未知的翻譯服務：${pc.provider}`)
  }
}
