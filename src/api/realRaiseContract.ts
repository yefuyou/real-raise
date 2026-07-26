import type { LivingCostResult, ScenarioInput } from '../domain/livingCost'

/**
 * Official 2026H1 CPI rates per category (from national stats).
 */
export const DEFAULT_CATEGORY_CPI_RATES = {
  food: -0.002,       // 食品烟酒及在外餐饮 -0.2%
  utilities: 0.019,   // 生活用品及服务 +1.9%
  transport: 0.018,   // 交通通信 +1.8%
  education: 0.012,   // 教育文化娱乐 +1.2%
  medical: 0.020,     // 医疗保健 +2.0%
  other: 0.116,       // 其他用品及服务 +11.6%
} as const

export type CategoryKey = keyof typeof DEFAULT_CATEGORY_CPI_RATES

export type CategoryItemBreakdown = {
  currentAmount: number
  cpiRate: number     // 默认使用官方 CPI，用户可手动覆盖
  nextAmount: number  // 默认 currentAmount * (1 + cpiRate)，用户可手动覆盖
}

/**
 * Six everyday spending categories for Detailed Mode.
 */
export type DetailedSpendBreakdown = Record<CategoryKey, CategoryItemBreakdown>

export type RealRaiseDriver = {
  id: 'income' | 'rent' | 'other' | CategoryKey | string
  label: string
  direction: 'positive' | 'negative' | 'neutral'
  monthlyImpact: number | null
  explanation: string
  sourceRefs: string[]
}

export type RealRaiseBenchmark = {
  userIncomeGrowthRate: number
  userCostGrowthRate: number
  urbanIncomeGrowthRate: number | null
  overallCpiRate: number | null
  caveat: string
  sourceRefs: string[]
}

export type RealRaiseScenario = {
  id: string
  title: string
  change: string
  annualRemainderDelta: number | null
  tradeoff: string
}

export type RealRaiseTrend = {
  periods: string[]
  series: Array<{
    id: string
    label: string
    values: Array<number | null>
  }>
}

export type RealRaiseInsight = {
  version: 'v1'
  summary: string
  drivers: RealRaiseDriver[]
  benchmark: RealRaiseBenchmark
  scenarios: RealRaiseScenario[]
  trend?: RealRaiseTrend
  warnings: string[]
  sources: SourceReference[]
}

/**
 * Frontend ↔ Real Raise backend contract.
 *
 * This is deliberately not the InfiniSynapse API contract. The browser must
 * only talk to our own backend and must never receive the vendor API key.
 */
export type AgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AgentTaskEvent =
  | { type: 'started'; taskId: string }
  | { type: 'progress'; taskId: string; stage: string; message: string; percent?: number }
  | { type: 'insight'; taskId: string; text: string }
  | { type: 'artifact'; taskId: string; name: string; kind: 'markdown' | 'pdf' | 'image' | 'data'; url?: string }
  | { type: 'completed'; taskId: string; insight: string; sources: SourceReference[]; structuredInsight?: RealRaiseInsight }
  | { type: 'failed'; taskId: string; code: string; message: string; retryable: boolean }

export type SourceReference = {
  name: string
  year: number | null
  scope: string
  url: string
}

export type StartAnalysisRequest = {
  input: ScenarioInput
  calculation: LivingCostResult
  locale: 'zh-CN'
  includeInsight: boolean
  inputMode?: 'basic' | 'detailed'
  detailedBreakdown?: DetailedSpendBreakdown
  simulatedError?: boolean
}

export type StartAnalysisResponse = {
  taskId: string
  status: AgentTaskStatus
  calculation: LivingCostResult
}

export type GetAnalysisResponse = StartAnalysisResponse & {
  events: AgentTaskEvent[]
  insight?: string
  sources?: SourceReference[]
  structuredInsight?: RealRaiseInsight
}

/** Own backend routes that Hajimi should integrate later. */
export const REAL_RAISE_BACKEND_ROUTES = {
  start: '/api/real-raise/analysis',
  get: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}`,
  events: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}/events`,
  cancel: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}/cancel`,
  continue: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}/continue`,
  artifact: (taskId: string, fileName: string) =>
    `/api/real-raise/analysis/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(fileName)}`,
} as const
