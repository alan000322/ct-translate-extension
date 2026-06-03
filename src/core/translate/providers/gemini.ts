import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from "@google/genai"
import { DEFAULT_MODEL, type LLMTranslateOptions } from "./defaults"

// gemini-3.5-flash 預設 MEDIUM 思考，翻譯用不到，壓到 MINIMAL 省延遲與費用。
// gemini-3.1-flash-lite 不設定（維持模型預設）。
function thinkingConfigFor(model: string): ThinkingConfig | undefined {
  if (model.startsWith("gemini-3.5-flash")) {
    return { thinkingLevel: ThinkingLevel.MINIMAL }
  }
  return undefined
}

// Google Gemini 官方 GenAI SDK（新版 @google/genai）。
// systemInstruction 放在 config 內。
export async function geminiTranslate(
  text: string,
  systemPrompt: string,
  opts: LLMTranslateOptions,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  const model = opts.model || DEFAULT_MODEL["google-gemini"]

  const res = await ai.models.generateContent({
    model,
    contents: text,
    config: {
      systemInstruction: systemPrompt,
      temperature: opts.temperature ?? 0,
      thinkingConfig: thinkingConfigFor(model),
    },
  })

  return (res.text ?? "").trim()
}

// 串流版本：generateContentStream(...)，逐 chunk yield chunk.text。
export async function* geminiTranslateStream(
  text: string,
  systemPrompt: string,
  opts: LLMTranslateOptions,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey })
  const model = opts.model || DEFAULT_MODEL["google-gemini"]

  const stream = await ai.models.generateContentStream({
    model,
    contents: text,
    config: {
      systemInstruction: systemPrompt,
      temperature: opts.temperature ?? 0,
      thinkingConfig: thinkingConfigFor(model),
      abortSignal: signal,
    },
  })

  for await (const chunk of stream) {
    if (signal?.aborted) return
    const delta = chunk.text
    if (delta) yield delta
  }
}
