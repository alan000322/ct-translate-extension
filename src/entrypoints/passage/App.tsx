import { Fragment, useRef, useState } from "react"
import { groupText } from "@/core/text/segment"
import { formatBilingual } from "@/core/text/bilingual"
import { PASSAGE_INPUT_MAX_CHARS } from "@/core/translate/tasks"
import {
  usePassage,
  type AnalysisKind,
  type SegmentRun,
} from "./usePassage"

// 整段翻譯頁：貼上文字 → 分段預覽（可畫記合併）→ 逐段串流翻譯（雙語對照），
// 另有「全文摘要」與「研究重點剖析」結果面板。
// 視覺：中軸 72ch 閱讀欄、段落不包卡片（文流 + 虛線邊界），任務馬卡龍色只作狀態識別。

const TASK_HUES: Record<AnalysisKind, { dot: string, label: string }> = {
  summarize: { dot: "var(--lemon-deep)", label: "全文摘要" },
  analyze: { dot: "var(--rose-deep)", label: "研究重點剖析" },
}

export function App() {
  const p = usePassage()

  return (
    <div className="mx-auto flex min-h-screen max-w-[72ch] flex-col px-6 pb-24">
      <header className="flex items-baseline justify-between pb-5 pt-10">
        <h1 className="text-xl font-semibold tracking-tight">整段翻譯</h1>
        <span className="text-[11px] text-[var(--ink-soft)]">CT翻翻</span>
      </header>

      <Toolbar p={p} />

      <main className="flex flex-col gap-8 pt-8">
        {p.analysis && <AnalysisPanel p={p} />}

        {p.phase === "compose" ? <ComposeView p={p} /> : <RunView p={p} />}
      </main>
    </div>
  )
}

type Passage = ReturnType<typeof usePassage>

function Toolbar({ p }: { p: Passage }) {
  const allDone = p.runs.length > 0 && p.runs.every((r) => r.status === "done")
  const resumable = p.phase === "run" && p.doneCount > 0 && !allDone

  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-[var(--hairline)] bg-[var(--paper)] px-6 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {p.translating
          ? (
              <button type="button" onClick={p.cancelAll} className={btnPrimary}>
                全部取消
              </button>
            )
          : (
              <button
                type="button"
                onClick={p.startTranslation}
                disabled={!p.canAct}
                title={disabledReason(p)}
                className={btnPrimary}
              >
                {allDone ? "重新翻譯" : resumable ? "繼續翻譯" : "翻譯"}
              </button>
            )}

        {(["summarize", "analyze"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => p.startAnalysis(kind)}
            disabled={!p.canAct}
            title={disabledReason(p)}
            className={btnGhost}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: TASK_HUES[kind].dot }}
              aria-hidden
            />
            {TASK_HUES[kind].label}
          </button>
        ))}

        <span
          className={`ct-num ml-auto text-[11px] ${p.overLimit ? "font-semibold text-[var(--alert)]" : "text-[var(--ink-soft)]"}`}
        >
          {p.charCount.toLocaleString()}
          {" / "}
          {PASSAGE_INPUT_MAX_CHARS.toLocaleString()}
          {" 字"}
        </span>
      </div>

      {p.overLimit && (
        <p className="pt-2 text-[12px] text-[var(--alert)]">
          超過 {PASSAGE_INPUT_MAX_CHARS.toLocaleString()} 字上限，請刪減後再送出。
        </p>
      )}
    </div>
  )
}

function disabledReason(p: Passage): string | undefined {
  if (p.busy) return "任務進行中"
  if (!p.hasContent) return "請先貼上文字"
  if (p.overLimit) return "超過字數上限"
  return undefined
}

const btnPrimary
  = "rounded-md bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--paper)] "
    + "transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-35"

const btnGhost
  = "flex items-center gap-2 rounded-md border border-[var(--hairline)] bg-[var(--card)] px-3.5 py-2 "
    + "text-[13px] text-[var(--ink)] transition-colors hover:border-[var(--ink-soft)] "
    + "disabled:cursor-default disabled:opacity-35 disabled:hover:border-[var(--hairline)]"

function ComposeView({ p }: { p: Passage }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <label htmlFor="source" className="sr-only">原文輸入</label>
        <textarea
          id="source"
          value={p.text}
          onChange={(e) => p.setSourceText(e.target.value)}
          placeholder="在此貼上要翻譯的文章……"
          className="min-h-[38vh] w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--card)] p-5 text-[15px] leading-7 outline-none transition-colors focus:border-[var(--ink-soft)]"
        />
        {!p.hasContent && (
          <p className="text-[13px] leading-relaxed text-[var(--ink-soft)]">
            貼上文章後按「翻譯」，譯文會逐段出現在原文下方。段落以空行分隔；
            偵測結果可在下方分段預覽中合併調整。「全文摘要」與「研究重點剖析」則對整篇文章進行分析。
          </p>
        )}
      </section>

      {p.groups.length > 0 && (
        <section className="flex flex-col">
          <div className="flex items-baseline justify-between pb-4">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-soft)]">
              分段預覽 · {p.groups.length} 段
            </span>
            {p.groups.length > 1 && (
              <span className="text-[11px] text-[var(--ink-soft)]">
                點段落之間的「併段」可將相鄰段落視為同一段
              </span>
            )}
          </div>
          <SegmentFlow p={p} showTranslation={false} />
        </section>
      )}
    </>
  )
}

function RunView({ p }: { p: Passage }) {
  return (
    <section className="flex flex-col">
      <div className="flex items-baseline justify-between pb-4">
        <button
          type="button"
          onClick={p.backToCompose}
          disabled={p.busy}
          className="text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40"
        >
          ← 返回編輯
        </button>
        <div className="flex items-baseline gap-3">
          <CopyBilingualButton p={p} />
          <span className="ct-num text-[11px] text-[var(--ink-soft)]">
            已完成 {p.doneCount} / {p.groups.length} 段
          </span>
        </div>
      </div>
      <SegmentFlow p={p} showTranslation />
    </section>
  )
}

/** 雙語複製：一次複製所有已完成段落的「原文＋譯文」對照；成功原地回饋兩秒。 */
function CopyBilingualButton({ p }: { p: Passage }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle")
  const revert = useRef<ReturnType<typeof setTimeout>>()

  async function copy() {
    const text = formatBilingual(
      p.groups.map((g, i) => ({
        source: groupText(p.atoms, g),
        translation: p.runs[i].output,
        done: p.runs[i].status === "done",
      })),
    )
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
    }
    catch {
      setState("error")
    }
    clearTimeout(revert.current)
    revert.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={p.doneCount === 0}
      title={p.doneCount === 0 ? "尚無已完成的段落" : "複製所有已完成段落的中英對照"}
      className={`rounded border border-[var(--hairline)] bg-[var(--card)] px-2 py-0.5 text-[12px] transition-colors hover:border-[var(--ink-soft)] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--hairline)] ${
        state === "error" ? "text-[var(--alert)]" : "text-[var(--ink)]"
      }`}
    >
      {state === "copied" ? "已複製 ✓" : state === "error" ? "複製失敗" : "雙語複製"}
    </button>
  )
}

/** 段落文流：段與段之間是可畫記的合併邊界，而非一排卡片。 */
function SegmentFlow({ p, showTranslation }: { p: Passage, showTranslation: boolean }) {
  return (
    <div className="flex flex-col">
      {p.groups.map((g, i) => (
        <Fragment key={`${g.start}-${g.end}`}>
          {i > 0 && <MergeBoundary onMerge={() => p.merge(i - 1)} disabled={p.busy} />}
          <SegmentBlock
            index={i}
            text={groupText(p.atoms, g)}
            mergedCount={g.end - g.start + 1}
            run={p.runs[i]}
            showTranslation={showTranslation}
            disabled={p.busy}
            onSplit={() => p.split(i)}
            onRetry={() => p.retrySegment(i)}
          />
        </Fragment>
      ))}
    </div>
  )
}

function MergeBoundary({ onMerge, disabled }: { onMerge: () => void, disabled: boolean }) {
  return (
    <div className="flex items-center py-1" aria-hidden={false}>
      <span className="flex-1 border-t border-dashed border-[var(--hairline)]" />
      <button
        type="button"
        onClick={onMerge}
        disabled={disabled}
        className="mx-3 rounded-full border border-[var(--hairline)] bg-[var(--card)] px-3 py-0.5 text-[11px] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-soft)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--hairline)] disabled:hover:text-[var(--ink-soft)]"
      >
        ⊕ 併段
      </button>
      <span className="flex-1 border-t border-dashed border-[var(--hairline)]" />
    </div>
  )
}

function SegmentBlock({
  index,
  text,
  mergedCount,
  run,
  showTranslation,
  disabled,
  onSplit,
  onRetry,
}: {
  index: number
  text: string
  mergedCount: number
  run: SegmentRun
  showTranslation: boolean
  disabled: boolean
  onSplit: () => void
  onRetry: () => void
}) {
  const done = run.status === "done"

  return (
    <article className="flex flex-col gap-2 py-4">
      <div className="flex items-center gap-2">
        <StatusDot status={showTranslation ? run.status : "idle"} />
        <span className="ct-num text-[11px] text-[var(--ink-soft)]">
          ¶ {String(index + 1).padStart(2, "0")}
        </span>
        {mergedCount > 1 && (
          <button
            type="button"
            onClick={onSplit}
            disabled={disabled}
            className="rounded border border-[var(--hairline)] bg-[var(--card)] px-1.5 py-px text-[11px] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-soft)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40"
          >
            已合併 {mergedCount} 段 · 拆回
          </button>
        )}
        {showTranslation && run.status === "pending" && (
          <span className="text-[11px] text-[var(--ink-soft)]">排隊中…</span>
        )}
      </div>

      <p
        className={`whitespace-pre-wrap break-words text-[15px] leading-7 transition-colors ${
          showTranslation && done ? "text-[var(--ink-soft)]" : "text-[var(--ink)]"
        }`}
      >
        {text}
      </p>

      {showTranslation && (run.status === "streaming" || done) && (
        <p className="whitespace-pre-wrap break-words border-t border-[var(--hairline)] pt-2 text-[15px] leading-7 text-[var(--ink)]">
          {run.output}
          {run.status === "streaming" && <span className="ct-caret" aria-hidden />}
        </p>
      )}

      {showTranslation && run.status === "error" && (
        <div className="flex items-baseline gap-3 border-t border-[var(--hairline)] pt-2">
          <p className="text-[13px] text-[var(--alert)]">{run.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded border border-[var(--hairline)] bg-[var(--card)] px-2 py-0.5 text-[12px] text-[var(--ink)] transition-colors hover:border-[var(--ink-soft)]"
          >
            重試
          </button>
        </div>
      )}
    </article>
  )
}

/** 狀態點：色彩＝資訊（streaming／done 用翻譯任務的開心果綠，error 用陶土色）。 */
function StatusDot({ status }: { status: SegmentRun["status"] }) {
  const color = {
    idle: "var(--hairline)",
    pending: "var(--ink-soft)",
    streaming: "var(--pistachio-deep)",
    done: "var(--pistachio)",
    error: "var(--alert)",
  }[status]
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${status === "streaming" ? "ct-pulse" : ""}`}
      style={{
        background: color,
        ...(status === "done" ? { boxShadow: "inset 0 0 0 1px var(--pistachio-deep)" } : {}),
      }}
      aria-hidden
    />
  )
}

function AnalysisPanel({ p }: { p: Passage }) {
  const a = p.analysis!
  const hue = TASK_HUES[a.kind]
  const streaming = a.status === "streaming"

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--card)] p-5">
      <header className="flex items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: hue.dot }} aria-hidden />
        <h2 className="text-[13px] font-semibold">{hue.label}</h2>
        {streaming && <span className="text-[11px] text-[var(--ink-soft)]">分析中…</span>}
        <button
          type="button"
          onClick={streaming ? p.cancelAnalysis : p.dismissAnalysis}
          className="ml-auto rounded border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-[12px] text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-soft)] hover:text-[var(--ink)]"
        >
          {streaming ? "取消" : "關閉"}
        </button>
      </header>

      {a.status === "error"
        ? <p className="text-[13px] text-[var(--alert)]">{a.error}</p>
        : (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-7">
              {a.output}
              {streaming && <span className="ct-caret" style={{ background: hue.dot }} aria-hidden />}
            </div>
          )}
    </section>
  )
}
