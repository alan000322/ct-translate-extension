import type { Config } from "@/config/schema"
import { toEnglishName } from "@/config/lang"
import { PROVIDER_LABELS } from "@/config/constants"
import type { TaskKind } from "./tasks"
import {
  analyzeSystemPrompt,
  summarizeSystemPrompt,
  translateSystemPrompt,
  type LLMTranslateOptions,
} from "./providers/defaults"
import { openaiTranslate, openaiTranslateStream } from "./providers/openai"
import { anthropicTranslate, anthropicTranslateStream } from "./providers/anthropic"
import { geminiTranslate, geminiTranslateStream } from "./providers/gemini"

// 任務路由層：依 task 組裝 system prompt 後路由至 active provider。
// translate 的目標語言跟隨設定；summarize／analyze 固定繁體中文輸出（targetCode 不作用）。
// provider 只收組裝好的 system prompt，不自行組任務 prompt。

/** 解析 active provider 設定並組裝該任務的 system prompt。缺 key／找不到 provider 拋具名錯誤。 */
function resolveTask(task: TaskKind, config: Config) {
  const pc = config.providersConfig.find((p) => p.id === config.activeProviderId)
  if (!pc) {
    throw new Error("找不到作用中的翻譯服務（active provider）")
  }

  // LLM：各家官方 SDK。缺 key 直接拋出具名錯誤，不靜默失敗。
  if (!pc.apiKey) {
    throw new Error(`${PROVIDER_LABELS[pc.provider]} 需要 API key，請於 popup 設定`)
  }

  const opts: LLMTranslateOptions = {
    apiKey: pc.apiKey,
    model: pc.model,
    baseURL: pc.baseURL,
    temperature: pc.temperature,
  }

  return { provider: pc.provider, opts, systemPrompt: taskSystemPrompt(task, config) }
}

/** 各任務的 system prompt 組裝。 */
export function taskSystemPrompt(task: TaskKind, config: Config): string {
  switch (task) {
    case "translate":
      return translateSystemPrompt(toEnglishName(config.language.targetCode))
    case "summarize":
      return summarizeSystemPrompt()
    case "analyze":
      return analyzeSystemPrompt()
  }
}

/** 非串流任務入口：依 task 組 prompt 後路由 provider，回傳完整輸出。 */
export async function runTask(task: TaskKind, text: string, config: Config): Promise<string> {
  const { provider, opts, systemPrompt } = resolveTask(task, config)

  switch (provider) {
    case "openai":
      return openaiTranslate(text, systemPrompt, opts)
    case "anthropic":
      return anthropicTranslate(text, systemPrompt, opts)
    case "google-gemini":
      return geminiTranslate(text, systemPrompt, opts)
    default:
      throw new Error(`未知的翻譯服務：${provider}`)
  }
}

/** 串流任務入口：逐步 yield 輸出增量片段，signal 往下傳以支援中止。 */
export async function* runTaskStream(
  task: TaskKind,
  text: string,
  config: Config,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const { provider, opts, systemPrompt } = resolveTask(task, config)

  switch (provider) {
    case "openai":
      yield* openaiTranslateStream(text, systemPrompt, opts, signal)
      return
    case "anthropic":
      yield* anthropicTranslateStream(text, systemPrompt, opts, signal)
      return
    case "google-gemini":
      yield* geminiTranslateStream(text, systemPrompt, opts, signal)
      return
    default:
      throw new Error(`未知的翻譯服務：${provider}`)
  }
}

/**
 * 統一翻譯入口（translate 任務的薄包裝，簽名維持不變）。
 */
export async function translateText(text: string, config: Config): Promise<string> {
  return runTask("translate", text, config)
}

/**
 * 串流翻譯入口（translate 任務的薄包裝，簽名維持不變）。
 */
export async function* translateTextStream(
  text: string,
  config: Config,
  signal?: AbortSignal,
): AsyncIterable<string> {
  yield* runTaskStream("translate", text, config, signal)
}
