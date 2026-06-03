import { useEffect, useState, type ReactNode } from "react"
import type { Config, ProviderConfig, ProviderType, TargetLanguage } from "@/config/schema"
import { PROVIDER_TYPES, TARGET_LANGUAGES } from "@/config/schema"
import {
  MODELS_BY_PROVIDER,
  PROVIDER_LABELS,
  TARGET_LANGUAGE_LABELS,
} from "@/config/constants"
import { getConfig, setConfig } from "@/config/storage"
import { PROVIDER_MACARON } from "./theme"

export function App() {
  const [config, setLocalConfig] = useState<Config | null>(null)

  useEffect(() => {
    void getConfig().then(setLocalConfig)
  }, [])

  if (!config) {
    return <div className="p-5 text-sm text-[var(--ink-soft)]">載入中…</div>
  }

  const active = config.providersConfig.find((p) => p.id === config.activeProviderId)

  // 持久化 + 樂觀更新本地狀態。
  function commit(next: Config) {
    setLocalConfig(next)
    void setConfig(next)
  }

  function selectProvider(id: string) {
    commit({ ...config!, activeProviderId: id })
  }

  function patchActive(patch: Partial<ProviderConfig>) {
    if (!active) return
    commit({
      ...config!,
      providersConfig: config!.providersConfig.map((p) =>
        p.id === active.id ? { ...p, ...patch } : p,
      ),
    })
  }

  function selectTarget(target: TargetLanguage) {
    commit({ ...config!, language: { ...config!.language, targetCode: target } })
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section
        label="翻譯服務"
        trailing={(
          // 整段翻譯：開獨立分頁，貼上文字逐段翻譯與全文分析。
          <button
            type="button"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("/passage.html") })}
            title="整段翻譯：開新分頁貼上文字逐段翻譯"
            aria-label="整段翻譯：開新分頁貼上文字逐段翻譯"
            className="rounded border border-[var(--hairline)] bg-white px-1.5 text-[11px] leading-5 text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            整段 ↗
          </button>
        )}
      >
        <div className="grid grid-cols-3 gap-1.5">
          {PROVIDER_TYPES.map((type) => (
            <ProviderChip
              key={type}
              type={type}
              active={active?.provider === type}
              onSelect={() => selectProvider(type)}
            />
          ))}
        </div>
      </Section>

      {active && (
        <Section label="模型與金鑰">
          <input
            type="password"
            value={active.apiKey ?? ""}
            placeholder="API key"
            onChange={(e) => patchActive({ apiKey: e.target.value })}
            className="w-full rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ink-soft)]"
          />
          <select
            value={active.model ?? ""}
            onChange={(e) => patchActive({ model: e.target.value })}
            className="w-full rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ink-soft)]"
          >
            {MODELS_BY_PROVIDER[active.provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Section>
      )}

      <Section label="目標語言">
        <div className="flex gap-1.5">
          {TARGET_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => selectTarget(lang)}
              className="flex-1 rounded-md border px-2 py-1.5 text-sm transition-colors"
              style={
                config.language.targetCode === lang
                  ? { borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 600 }
                  : { borderColor: "var(--hairline)", color: "var(--ink-soft)" }
              }
            >
              {TARGET_LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      </Section>

      <p className="text-[11px] leading-relaxed text-[var(--ink-soft)]">
        在網頁上懸停段落並按住
        {" "}
        <kbd className="rounded border border-[var(--hairline)] bg-white px-1">
          {config.translate.node.hotkey}
        </kbd>
        {" "}
        即可翻譯該段落，再按一次還原。
      </p>
    </div>
  )
}

function Section({
  label,
  trailing,
  children,
}: {
  label: string
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-soft)]">
          {label}
        </span>
        {trailing}
      </div>
      {children}
    </section>
  )
}

function ProviderChip({
  type,
  active,
  onSelect,
}: {
  type: ProviderType
  active: boolean
  onSelect: () => void
}) {
  const macaron = PROVIDER_MACARON[type]
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center justify-center gap-1.5 rounded-md border px-1.5 py-1.5 text-[12px] transition-colors"
      style={{
        background: active ? macaron.pastel : "transparent",
        borderColor: active ? macaron.deep : "var(--hairline)",
        color: "var(--ink)",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: macaron.deep }}
        aria-hidden
      />
      {PROVIDER_LABELS[type]}
    </button>
  )
}
