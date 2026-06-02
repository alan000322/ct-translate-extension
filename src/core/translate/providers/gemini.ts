import { GoogleGenAI } from "@google/genai"
import { DEFAULT_MODEL, translateSystemPrompt, type LLMTranslateOptions } from "./defaults"

// Google Gemini 官方 GenAI SDK（新版 @google/genai）。
// systemInstruction 放在 config 內。
export async function geminiTranslate(
  text: string,
  targetLangName: string,
  opts: LLMTranslateOptions,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })

  const res = await ai.models.generateContent({
    model: opts.model || DEFAULT_MODEL["google-gemini"],
    contents: text,
    config: {
      systemInstruction: translateSystemPrompt(targetLangName),
      temperature: opts.temperature ?? 0,
    },
  })

  return (res.text ?? "").trim()
}

// 串流版本：generateContentStream(...)，逐 chunk yield chunk.text。
// @google/genai 0.3.1 的 API 不接受 abortSignal，改在迴圈內檢查 signal 並中止消費。
export async function* geminiTranslateStream(
  text: string,
  targetLangName: string,
  opts: LLMTranslateOptions,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })

  const stream = await ai.models.generateContentStream({
    model: opts.model || DEFAULT_MODEL["google-gemini"],
    contents: text,
    config: {
      systemInstruction: translateSystemPrompt(targetLangName),
      temperature: opts.temperature ?? 0,
    },
  })

  for await (const chunk of stream) {
    if (signal?.aborted) return
    const delta = chunk.text
    if (delta) yield delta
  }
}
