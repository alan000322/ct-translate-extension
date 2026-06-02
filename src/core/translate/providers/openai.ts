import OpenAI from "openai"
import { DEFAULT_MODEL, translateSystemPrompt, type LLMTranslateOptions } from "./defaults"

// OpenAI 官方 SDK。於 background service worker 執行（key 不進頁面 context）。
// dangerouslyAllowBrowser 僅為相容 SDK 的環境偵測；實際仍跑在 background。
export async function openaiTranslate(
  text: string,
  targetLangName: string,
  opts: LLMTranslateOptions,
): Promise<string> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    dangerouslyAllowBrowser: true,
  })

  const res = await client.chat.completions.create({
    model: opts.model || DEFAULT_MODEL.openai,
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: translateSystemPrompt(targetLangName) },
      { role: "user", content: text },
    ],
  })

  return res.choices[0]?.message?.content?.trim() ?? ""
}

// 串流版本：chat.completions.create({ stream: true })，逐 chunk yield delta.content。
// signal 透過 SDK request options 傳入以中止連線。
export async function* openaiTranslateStream(
  text: string,
  targetLangName: string,
  opts: LLMTranslateOptions,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
    dangerouslyAllowBrowser: true,
  })

  const stream = await client.chat.completions.create(
    {
      model: opts.model || DEFAULT_MODEL.openai,
      temperature: opts.temperature ?? 0,
      stream: true,
      messages: [
        { role: "system", content: translateSystemPrompt(targetLangName) },
        { role: "user", content: text },
      ],
    },
    { signal },
  )

  for await (const chunk of stream) {
    if (signal?.aborted) return
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield delta
  }
}
