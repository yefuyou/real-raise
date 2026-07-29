import type { LivingCostResult, ScenarioInput } from '../domain/livingCost'
import type { PayslipSummary } from '../domain/salarySlip'

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

export const CALCULATION_VERSION = 'living-cost.v2' as const

export type AnalysisCityContext = {
  cityCode: string
  cityName: string
  period: string
  coverageTier: 'A-history' | 'B-current' | 'C-fallback'
  cityCategoryCount: number
  fallbackCategoryCount: number
  /** Decimal rate: 0.01 means 1%. */
  overallCpiRate: number | null
  overallSource: SourceReference | null
  caveat: string
}

export type AnalysisExecutionProvenance = {
  mode: 'partner-live' | 'judge-live' | 'replay' | 'mock'
  narrativeSource: 'infinisynapse-live' | 'infinisynapse-replay' | 'local-template'
  structuredInsightSource: 'real-raise-deterministic'
  calculationAuthority: 'worker-deterministic' | 'local-deterministic'
  calculationVersion: typeof CALCULATION_VERSION
  attribution: 'partner-user-key' | 'judge-project-key' | 'none'
  vendorTaskId?: string
  cached?: boolean
  promptVersion?: string
  contextVersion?: string
  taskGoal?: string
  sourceIds?: string[]
  inputSignature?: string
  artifactStatus?: 'verified' | 'stream-fallback' | 'deterministic-only' | 'failed-retryable'
  /** 仅 Judge 模式可见的脱敏 Prompt 快照；Partner/回放不下发原文。 */
  promptPreview?: string
}

export type ReplayCompatibility = {
  status: 'legacy-calculation'
  recordedCalculationVersion: string
  currentCalculationVersion: string
  recordedContextStatus: 'not-recorded'
  currentContextUsage: 'matching-only'
  recordedValue: number
  currentValue: number
  userNotice: string
}

export type ReplayMeta = {
  scenarioId: string
  vendorTaskId: string
  recordedAt: string
  artifactIntegrity: 'vendor-original-unaltered'
  compatibility?: ReplayCompatibility
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
  | {
      type: 'completed'
      taskId: string
      insight: string
      sources: SourceReference[]
      structuredInsight?: RealRaiseInsight
      /** Every result must state who produced the narrative and the numbers. */
      provenance: AnalysisExecutionProvenance
      /** 存在即表示本次结果来自真实任务存档回放，UI 必须显式标注。 */
      replayMeta?: ReplayMeta
      /** Server Live 的小型文本产物只保存在当前浏览器会话。 */
      artifacts?: Record<string, string>
    }
  | { type: 'failed'; taskId: string; code: string; message: string; retryable: boolean }

export type SourceReference = {
  name: string
  year: number | null
  scope: string
  url: string
}

export type AnalysisModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

export type StartAnalysisRequest = {
  input: ScenarioInput
  calculation: LivingCostResult
  calculationVersion: typeof CALCULATION_VERSION
  cityContext: AnalysisCityContext
  locale: 'zh-CN'
  includeInsight: boolean
  inputMode?: 'basic' | 'detailed'
  detailedBreakdown?: DetailedSpendBreakdown
  /** 收入输入方式：直接填到手（net）或工资条拆解（payslip）。 */
  incomeInputMode?: 'net' | 'payslip'
  /** 工资条模式的本地确定性摘要；仅 payslip 模式下随请求提交。 */
  payslipSummary?: PayslipSummary
  simulatedError?: boolean
  /** @deprecated 历史兼容字段；当前产品 UI 不暴露模型选择，也不会发送。 */
  analysisModel?: AnalysisModel
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
  provenance?: AnalysisExecutionProvenance
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
