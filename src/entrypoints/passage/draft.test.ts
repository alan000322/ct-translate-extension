import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// 以可觀測的記憶體 storage mock 取代共用 stub：需要計數寫入次數與注入寫入失敗。
const h = vi.hoisted(() => {
  const store: Record<string, unknown> = {}
  const set = vi.fn(async (obj: Record<string, unknown>) => {
    Object.assign(store, obj)
  })
  const remove = vi.fn(async (key: string) => {
    delete store[key]
  })
  return { store, set, remove }
})

vi.mock("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: async (key: string) => (key in h.store ? { [key]: h.store[key] } : {}),
        set: h.set,
        remove: h.remove,
      },
    },
  },
}))

import { clearDraft, flushDraft, loadDraft, reconcileGroups, saveDraft } from "./draft"

const KEY = "passageDraft"
const draft = (text: string) => ({ text, groups: [{ start: 0, end: 0 }] })

beforeEach(async () => {
  vi.useFakeTimers()
  await clearDraft() // 取消前一測試殘留的未決寫入
  for (const k of Object.keys(h.store)) delete h.store[k]
  h.set.mockClear()
  h.remove.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("loadDraft / clearDraft（儲存層）", () => {
  it("合法草稿可讀回", async () => {
    h.store[KEY] = { text: "Hello\n\nWorld", groups: [{ start: 0, end: 1 }] }
    expect(await loadDraft()).toEqual({ text: "Hello\n\nWorld", groups: [{ start: 0, end: 1 }] })
  })

  it("無草稿回 null", async () => {
    expect(await loadDraft()).toBeNull()
  })

  it("損壞值回 null 且 key 被移除", async () => {
    h.store[KEY] = { text: 123, groups: "bad" }
    expect(await loadDraft()).toBeNull()
    expect(h.remove).toHaveBeenCalledWith(KEY)
    expect(KEY in h.store).toBe(false)
  })

  it("clearDraft 後讀回 null", async () => {
    h.store[KEY] = draft("A")
    await clearDraft()
    expect(await loadDraft()).toBeNull()
  })

  it("clearDraft 取消未決寫入（清空不寫空草稿）", async () => {
    saveDraft(draft("A"))
    await clearDraft()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(h.set).not.toHaveBeenCalled()
    expect(KEY in h.store).toBe(false)
  })
})

describe("saveDraft / flushDraft（trailing throttle 3 秒寫入引擎）", () => {
  it("spec 範例：t=0/1/2 三次變更 → t=3 恰一次寫入且為最終值 ABC", async () => {
    saveDraft(draft("A"))
    await vi.advanceTimersByTimeAsync(1_000)
    saveDraft(draft("AB"))
    await vi.advanceTimersByTimeAsync(1_000)
    saveDraft(draft("ABC"))
    expect(h.set).not.toHaveBeenCalled() // t=2：窗口未到不寫
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.set).toHaveBeenCalledTimes(1)
    expect(h.store[KEY]).toEqual(draft("ABC"))
  })

  it("flush 立即寫入未決草稿，之後計時器不再重複寫", async () => {
    saveDraft(draft("A"))
    flushDraft()
    expect(h.set).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.set).toHaveBeenCalledTimes(1)
  })

  it("無未決寫入時 flush 為 no-op", () => {
    flushDraft()
    expect(h.set).not.toHaveBeenCalled()
  })

  it("閒置（寫入後無新變更）不再發出寫入", async () => {
    saveDraft(draft("A"))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(h.set).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(h.set).toHaveBeenCalledTimes(1)
  })

  it("寫入失敗靜默吞下，下次 saveDraft 重新排程寫入", async () => {
    h.set.mockRejectedValueOnce(new Error("quota exceeded"))
    saveDraft(draft("A"))
    await vi.advanceTimersByTimeAsync(3_000) // 失敗不拋出
    expect(h.set).toHaveBeenCalledTimes(1)
    expect(KEY in h.store).toBe(false)

    saveDraft(draft("B"))
    await vi.advanceTimersByTimeAsync(3_000)
    expect(h.set).toHaveBeenCalledTimes(2)
    expect(h.store[KEY]).toEqual(draft("B"))
  })
})

describe("reconcileGroups（還原層分組一致性）", () => {
  it("連續且恰好覆蓋的 groups 原樣保留", () => {
    const groups = [{ start: 0, end: 1 }, { start: 2, end: 2 }]
    expect(reconcileGroups(3, groups)).toBe(groups)
  })

  it("spec 範例：3 段 + 對不上的 2 組 → 退為每段一組", () => {
    const stale = [{ start: 0, end: 1 }, { start: 2, end: 3 }]
    expect(reconcileGroups(3, stale)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ])
  })

  it("覆蓋不足（缺尾段）退為每段一組", () => {
    expect(reconcileGroups(3, [{ start: 0, end: 1 }])).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ])
  })

  it("不連續（跳號）退為每段一組", () => {
    expect(reconcileGroups(3, [{ start: 0, end: 0 }, { start: 2, end: 2 }])).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ])
  })
})
