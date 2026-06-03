// 任務種類的單一定義來源：訊息契約（messaging）、background 路由與整段翻譯頁共用。
// translate＝翻譯（目標語言跟隨設定）；summarize／analyze＝全文分析（固定繁體中文輸出）。

export const TASK_KINDS = ["translate", "summarize", "analyze"] as const
export type TaskKind = (typeof TASK_KINDS)[number]

/** 未帶 task 欄位時的預設任務（向後相容既有懸停翻譯呼叫端）。 */
export const DEFAULT_TASK: TaskKind = "translate"

/**
 * 整段翻譯頁的輸入字元上限：防呆而非能力邊界，
 * 超出時頁面停用所有動作按鈕並顯示超限提示，不發出請求。
 */
export const PASSAGE_INPUT_MAX_CHARS = 50_000
