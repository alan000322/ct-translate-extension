import { z } from "zod"
import { browser } from "wxt/browser"
import { initialGroups, type GroupRange } from "@/core/text/segment"

// 整段翻譯頁的草稿暫存：擁有草稿契約（storage key、schema 驗證、throttle 時序、flush）。
// usePassage 只透過 saveDraft / flushDraft / loadDraft / clearDraft 存取，
// 不直接觸碰 browser.storage 細節。獨立 key、不混入 config（config 是低頻設定，
// 草稿是高頻暫態資料）。

const STORAGE_KEY = "passageDraft"

const draftSchema = z.object({
  text: z.string(),
  groups: z.array(
    z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }),
  ),
})

export type Draft = z.infer<typeof draftSchema>

/**
 * 讀取草稿。不存在回 null；schema 驗證失敗視為損壞——靜默清除壞資料後回 null
 * （Corrupt or inconsistent draft degrades silently 的儲存層半部）。
 */
export async function loadDraft(): Promise<Draft | null> {
  const stored = await browser.storage.local.get(STORAGE_KEY)
  const raw = stored[STORAGE_KEY]
  if (raw === undefined) return null

  const parsed = draftSchema.safeParse(raw)
  if (!parsed.success) {
    await browser.storage.local.remove(STORAGE_KEY)
    return null
  }
  return parsed.data
}

/** 清除草稿：取消未決的 throttle 寫入並移除 storage key（清空即清除，不寫空草稿）。 */
export async function clearDraft(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pendingDraft = null
  await browser.storage.local.remove(STORAGE_KEY)
}

/**
 * 還原時的分組一致性檢查：groups 必須連續且恰好覆蓋 [0, atomCount-1]，
 * 否則退為 initialGroups（保留 text、丟棄對不上的畫記——靜默降級）。
 */
export function reconcileGroups(atomCount: number, groups: GroupRange[]): GroupRange[] {
  let next = 0
  for (const g of groups) {
    if (g.start !== next || g.end < g.start) return initialGroups(atomCount)
    next = g.end + 1
  }
  if (next !== atomCount) return initialGroups(atomCount)
  return groups
}

// --- 寫入引擎：trailing throttle 3 秒 ---
// 首次 saveDraft 排程一次延遲寫入；窗口內再變更只更新待寫值、不重排程，
// 由同一次寫入收斂為最終狀態。閒置（無 saveDraft 呼叫）時零寫入。

const THROTTLE_MS = 3_000

let pendingDraft: Draft | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** 排程草稿寫入：保證任何變更最多 3 秒後落盤；同窗口多次呼叫收斂為一次寫入。 */
export function saveDraft(draft: Draft): void {
  pendingDraft = draft
  if (timer !== null) return
  timer = setTimeout(write, THROTTLE_MS)
}

/** 立即觸發未決寫入（pagehide / visibilitychange 用），無未決寫入時為 no-op。 */
export function flushDraft(): void {
  if (timer === null) return
  clearTimeout(timer)
  write()
}

/** 實際寫入。失敗靜默吞下（不阻斷編輯）——下次 saveDraft 自然重新排程。 */
function write(): void {
  timer = null
  const draft = pendingDraft
  pendingDraft = null
  if (draft === null) return
  void browser.storage.local.set({ [STORAGE_KEY]: draft }).catch(() => {})
}
