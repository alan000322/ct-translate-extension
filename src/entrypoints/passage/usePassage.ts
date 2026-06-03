import { useCallback, useEffect, useRef, useState } from "react"
import {
  detectSegments,
  groupText,
  initialGroups,
  mergeAdjacent,
  splitGroup,
  type GroupRange,
} from "@/core/text/segment"
import { requestTranslateStream } from "@/utils/messaging"
import { PASSAGE_INPUT_MAX_CHARS } from "@/core/translate/tasks"
import { clearDraft, flushDraft, loadDraft, reconcileGroups, saveDraft } from "./draft"

// 整段翻譯頁的狀態編排：
// - 段落翻譯：每個 group 一條 translate-stream，並行上限 3、其餘依序排隊；
//   單段狀態獨立（pending → streaming → done | error），錯誤只影響該段。
// - 全文分析（summarize／analyze）：單一請求，與逐段翻譯互斥。
// - 所有串流都在使用者事件中開啟（不進 effect），避免 StrictMode 雙呼叫重複開流。

const MAX_CONCURRENT = 3

export type SegmentStatus = "idle" | "pending" | "streaming" | "done" | "error"

export interface SegmentRun {
  status: SegmentStatus
  output: string
  error?: string
}

export type AnalysisKind = "summarize" | "analyze"

export interface AnalysisRun {
  kind: AnalysisKind
  status: "streaming" | "done" | "error"
  output: string
  error?: string
}

const IDLE: SegmentRun = { status: "idle", output: "" }

export function usePassage() {
  const [text, setText] = useState("")
  const [atoms, setAtoms] = useState<string[]>([])
  const [groups, setGroups] = useState<GroupRange[]>([])
  const [runs, setRuns] = useState<SegmentRun[]>([])
  const [phase, setPhase] = useState<"compose" | "run">("compose")
  const [analysis, setAnalysis] = useState<AnalysisRun | null>(null)

  // 串流期間 atoms/groups 不會變（busy 時停用編輯與合併），ref 只是讓晚到的
  // queue 消化拿到當下 render 的最新值。
  const latest = useRef({ text, atoms, groups })
  latest.current = { text, atoms, groups }

  // 開頁靜默還原草稿：重算 atoms、校驗 groups（對不上退為 initialGroups），
  // 翻譯結果不還原。ref 守門避免 StrictMode 雙掛載重複套用；loadDraft 在飛行中
  // 使用者已開始輸入時不覆蓋。還原不觸發 saveDraft（內容與儲存值相同）。
  const restoreAttempted = useRef(false)
  useEffect(() => {
    if (restoreAttempted.current) return
    restoreAttempted.current = true
    void loadDraft().then((draft) => {
      if (!draft || latest.current.text.length > 0) return
      const nextAtoms = detectSegments(draft.text)
      setText(draft.text)
      setAtoms(nextAtoms)
      setGroups(reconcileGroups(nextAtoms.length, draft.groups))
      setRuns(nextAtoms.map(() => IDLE))
    })
  }, [])

  // 切走或關頁時立即 flush 未決寫入，蓋掉最後一個 throttle 窗口
  // （正常關頁／切換分頁不遺失最後 3 秒內的變更）。
  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") flushDraft()
    }
    document.addEventListener("visibilitychange", flushIfHidden)
    window.addEventListener("pagehide", flushDraft)
    return () => {
      document.removeEventListener("visibilitychange", flushIfHidden)
      window.removeEventListener("pagehide", flushDraft)
    }
  }, [])

  const cancels = useRef(new Map<number, () => void>())
  const queue = useRef<number[]>([])
  const active = useRef(0)
  const analysisCancel = useRef<(() => void) | null>(null)

  const translating = runs.some((r) => r.status === "pending" || r.status === "streaming")
  const analyzing = analysis?.status === "streaming"
  const busy = translating || analyzing

  const charCount = text.length
  const overLimit = charCount > PASSAGE_INPUT_MAX_CHARS
  const hasContent = text.trim().length > 0
  const canAct = hasContent && !overLimit && !busy

  /**
   * 編輯原文：重算 atoms／重置分組與翻譯結果；舊分析結果隨之失效。
   * 草稿同步：有內容排程暫存；清為空白（無非空白內容）則清除草稿、不寫空草稿。
   */
  const setSourceText = useCallback((next: string) => {
    setText(next)
    const nextAtoms = detectSegments(next)
    const nextGroups = initialGroups(nextAtoms.length)
    setAtoms(nextAtoms)
    setGroups(nextGroups)
    setRuns(nextAtoms.map(() => IDLE))
    setAnalysis(null)
    if (next.trim().length > 0) saveDraft({ text: next, groups: nextGroups })
    else void clearDraft()
  }, [])

  /** 消化排隊中的段落：並行上限內逐一開流。 */
  const pump = useCallback(() => {
    while (active.current < MAX_CONCURRENT && queue.current.length > 0) {
      const i = queue.current.shift()!
      active.current++
      const { atoms: a, groups: g } = latest.current
      const settle = () => {
        cancels.current.delete(i)
        active.current--
        pump()
      }
      const cancel = requestTranslateStream(groupText(a, g[i]), {
        onChunk: (delta) =>
          setRuns((prev) =>
            prev.map((r, j) => (j === i ? { status: "streaming", output: r.output + delta } : r)),
          ),
        onDone: () => {
          settle()
          setRuns((prev) => prev.map((r, j) => (j === i ? { ...r, status: "done" } : r)))
        },
        onError: (message) => {
          settle()
          setRuns((prev) =>
            prev.map((r, j) => (j === i ? { status: "error", output: "", error: message } : r)),
          )
        },
      })
      cancels.current.set(i, cancel)
    }
  }, [])

  /** 翻譯：送出所有尚未完成的段落（done 保留不重送）；全部完成時則整批重譯。 */
  const startTranslation = useCallback(() => {
    if (!canAct) return
    const pending = runs.flatMap((r, i) => (r.status === "done" ? [] : [i]))
    const indices = pending.length > 0 ? pending : runs.map((_, i) => i)
    if (indices.length === 0) return
    setPhase("run")
    setRuns((prev) =>
      prev.map((r, i) => (indices.includes(i) ? { status: "pending", output: "" } : r)),
    )
    queue.current.push(...indices)
    pump()
  }, [canAct, runs, pump])

  /** 重試單一段落（僅該段重送）。 */
  const retrySegment = useCallback(
    (i: number) => {
      setRuns((prev) => prev.map((r, j) => (j === i ? { status: "pending", output: "" } : r)))
      queue.current.push(i)
      pump()
    },
    [pump],
  )

  /** 全部取消：清空排隊、中止進行中串流；未完成段落回到送譯前狀態，不報錯。 */
  const cancelAll = useCallback(() => {
    queue.current = []
    cancels.current.forEach((cancel) => cancel())
    cancels.current.clear()
    active.current = 0
    setRuns((prev) => prev.map((r) => (r.status === "done" ? r : IDLE)))
  }, [])

  /** 畫記合併：相鄰兩組併為一組，受影響位置的結果重置。busy 時停用。 */
  const merge = useCallback(
    (i: number) => {
      if (busy) return
      const next = mergeAdjacent(groups, i)
      if (next === groups) return
      setGroups(next)
      setRuns((prev) => [...prev.slice(0, i), IDLE, ...prev.slice(i + 2)])
      saveDraft({ text, groups: next })
    },
    [busy, groups, text],
  )

  /** 拆回：群組還原為偵測當下的原子段，各自重置結果。busy 時停用。 */
  const split = useCallback(
    (i: number) => {
      if (busy) return
      const g = groups[i]
      const next = splitGroup(groups, i)
      if (next === groups) return
      setGroups(next)
      const restored = Array.from({ length: g.end - g.start + 1 }, () => IDLE)
      setRuns((prev) => [...prev.slice(0, i), ...restored, ...prev.slice(i + 1)])
      saveDraft({ text, groups: next })
    },
    [busy, groups, text],
  )

  /** 全文分析：summarize／analyze 各為單一請求，串流進結果面板。 */
  const startAnalysis = useCallback(
    (kind: AnalysisKind) => {
      if (!canAct) return
      setAnalysis({ kind, status: "streaming", output: "" })
      analysisCancel.current = requestTranslateStream(
        text,
        {
          onChunk: (delta) =>
            setAnalysis((prev) => (prev ? { ...prev, output: prev.output + delta } : prev)),
          onDone: () => {
            analysisCancel.current = null
            setAnalysis((prev) => (prev ? { ...prev, status: "done" } : prev))
          },
          onError: (message) => {
            analysisCancel.current = null
            setAnalysis((prev) => (prev ? { ...prev, status: "error", error: message } : prev))
          },
        },
        kind,
      )
    },
    [canAct, text],
  )

  /** 取消分析：面板回到任務前狀態（清除），不報錯。 */
  const cancelAnalysis = useCallback(() => {
    analysisCancel.current?.()
    analysisCancel.current = null
    setAnalysis(null)
  }, [])

  /** 關閉已完成／錯誤的分析面板。 */
  const dismissAnalysis = useCallback(() => setAnalysis(null), [])

  /** 返回編輯：保留文字與既有結果（編輯文字才會重置）。busy 時不可用。 */
  const backToCompose = useCallback(() => {
    if (busy) return
    setPhase("compose")
  }, [busy])

  const doneCount = runs.filter((r) => r.status === "done").length

  return {
    // 狀態
    text,
    atoms,
    groups,
    runs,
    phase,
    analysis,
    // 衍生
    charCount,
    overLimit,
    hasContent,
    canAct,
    busy,
    translating,
    analyzing,
    doneCount,
    // 操作
    setSourceText,
    startTranslation,
    retrySegment,
    cancelAll,
    merge,
    split,
    startAnalysis,
    cancelAnalysis,
    dismissAnalysis,
    backToCompose,
  }
}
