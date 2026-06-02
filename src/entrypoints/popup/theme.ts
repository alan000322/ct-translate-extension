import type { ProviderType } from "@/config/schema"

// 馬卡龍功能色系：每個 provider 配一個固定馬卡龍色當識別。
// pastel = chip/背景用的粉嫩色；deep = active/focus 用的同色相深色 companion。
export interface Macaron {
  pastel: string
  deep: string
}

export const PROVIDER_MACARON: Record<ProviderType, Macaron> = {
  openai: { pastel: "oklch(0.91 0.06 300)", deep: "oklch(0.58 0.13 300)" }, // 薰衣草紫
  anthropic: { pastel: "oklch(0.92 0.06 50)", deep: "oklch(0.63 0.13 46)" }, // 蜜桃
  "google-gemini": { pastel: "oklch(0.91 0.06 264)", deep: "oklch(0.57 0.13 264)" }, // 藍莓
}
