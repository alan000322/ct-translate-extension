import Anthropic from "@anthropic-ai/sdk"
import { DEFAULT_MODEL, type LLMTranslateOptions } from "./defaults"

// Anthropic（Claude）官方 SDK。system 為頂層參數，回傳是 content block 陣列。
// anthropic-dangerous-direct-browser-access 讓非 server 來源（擴充）得以直連 API。
export async function anthropicTranslate(
  text: string,
  systemPrompt: string,
  opts: LLMTranslateOptions,
): Promise<string> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
  })

  const res = await client.messages.create({
    model: opts.model || DEFAULT_MODEL.anthropic,
    max_tokens: 4096,
    temperature: opts.temperature ?? 0,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  })

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
}

// 串流版本：messages.create({ stream: true })，取 content_block_delta 的 text_delta。
// signal 透過 SDK request options 傳入以中止連線。
export async function* anthropicTranslateStream(
  text: string,
  systemPrompt: string,
  opts: LLMTranslateOptions,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
  })

  const stream = await client.messages.create(
    {
      model: opts.model || DEFAULT_MODEL.anthropic,
      max_tokens: 4096,
      temperature: opts.temperature ?? 0,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    },
    { signal },
  )

  for await (const event of stream) {
    if (signal?.aborted) return
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      if (event.delta.text) yield event.delta.text
    }
  }
}
