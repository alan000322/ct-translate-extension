import { getConfig } from "@/config/storage"
import { runTask, runTaskStream } from "@/core/translate/translate-text"
import { registerTranslateStreamHandler } from "@/utils/messaging"

// Background service worker：所有翻譯與 AI 呼叫集中於此。
// 以 Port 串流模型逐片段回傳輸出；start 訊息的 task 決定任務（未帶即 translate，
// 既有懸停翻譯行為不變）。每次請求才讀 config，確保反映 popup 的最新設定。
export default defineBackground(() => {
  registerTranslateStreamHandler(async function* (text, task, signal) {
    const config = await getConfig()

    let produced = false
    try {
      for await (const delta of runTaskStream(task, text, config, signal)) {
        produced = true
        yield delta
      }
    }
    catch (e) {
      // 取消、或已產生過 chunk 後才中斷 → 交回 handler（取消會被忽略、其餘呈現 error）。
      if (signal.aborted || produced) throw e
      // 串流在產生任何 chunk 前就失敗 → 回退為非串流，整段輸出以單一 chunk 補上。
      // 回退本身再失敗則往上拋，由 handler 送出 error。
      yield await runTask(task, text, config)
    }
  })
})
