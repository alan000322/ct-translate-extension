// 測試用的 wxt/browser stub：提供記憶體版 storage.local 與 runtime 佔位。
const store: Record<string, unknown> = {}

export const browser = {
  storage: {
    local: {
      get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
      set: async (obj: Record<string, unknown>) => {
        Object.assign(store, obj)
      },
      remove: async (key: string) => {
        delete store[key]
      },
    },
  },
  runtime: {
    sendMessage: async () => ({ error: "stub" }),
    onMessage: { addListener: () => {} },
  },
}
