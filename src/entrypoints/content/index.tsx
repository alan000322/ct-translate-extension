import { registerNodeTranslation } from "./node-translation"

// Content script 入口：只處理 DOM，翻譯外包給 background。
// 段落翻譯永遠註冊，等待使用者懸停 + 熱鍵觸發。
export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    registerNodeTranslation()
  },
})
