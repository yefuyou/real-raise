import type {
  AgentTaskEvent,
  SourceReference,
  StartAnalysisRequest,
  StartAnalysisResponse,
  CategoryKey,
} from './realRaiseContract'
import { REAL_RAISE_BACKEND_ROUTES } from './realRaiseContract'
import { OFFICIAL_2025_INCOME_BENCHMARKS } from '../data/official2025'
import { OFFICIAL_2026_H1_CPI } from '../data/official2026'

export interface AnalysisClientOptions {
  useMock?: boolean
}

const OFFICIAL_SOURCES: SourceReference[] = [
  {
    name: '国家统计局：2026 年上半年居民消费价格主要数据',
    year: 2026,
    scope: '全国居民消费价格八大类 1—6 月同比涨跌幅',
    url: OFFICIAL_2026_H1_CPI[0].sourceUrl,
  },
  {
    name: '国家统计局：2025 年居民收入和消费支出情况',
    year: 2025,
    scope: '全国及城镇居民收入、消费支出与消费结构',
    url: OFFICIAL_2025_INCOME_BENCHMARKS[0].sourceUrl,
  },
]

export class RealRaiseApiClient {
  private useMock: boolean

  constructor(options: AnalysisClientOptions = {}) {
    // Default to real backend routes (/api/real-raise/*). Pass useMock: true for Mock mode.
    this.useMock = options.useMock ?? false
  }

  public setUseMock(useMock: boolean) {
    this.useMock = useMock
  }

  public async startAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    if (this.useMock) return this.mockStartAnalysis(request)

    const response = await fetch(REAL_RAISE_BACKEND_ROUTES.start, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`请求本项目服务端失败：HTTP ${response.status}`)
    }

    return (await response.json()) as StartAnalysisResponse
  }

  public async cancelAnalysis(taskId: string): Promise<boolean> {
    if (this.useMock || taskId.startsWith('mock-task-')) return true
    try {
      const response = await fetch(REAL_RAISE_BACKEND_ROUTES.cancel(taskId), { method: 'POST' })
      return response.ok
    } catch {
      return false
    }
  }

  public subscribeTaskEvents(
    taskId: string,
    request: StartAnalysisRequest,
    onEvent: (event: AgentTaskEvent) => void,
  ): () => void {
    if (this.useMock || taskId.startsWith('mock-task-')) {
      return this.simulateTaskEvents(taskId, request, onEvent)
    }

    const eventSource = new EventSource(REAL_RAISE_BACKEND_ROUTES.events(taskId))
    eventSource.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as AgentTaskEvent
        onEvent(event)
        if (event.type === 'completed' || event.type === 'failed') eventSource.close()
      } catch {
        onEvent({
          type: 'failed',
          taskId,
          code: 'INVALID_EVENT',
          message: '服务器返回了无法识别的进度消息。',
          retryable: true,
        })
        eventSource.close()
      }
    }
    eventSource.onerror = () => {
      onEvent({
        type: 'failed',
        taskId,
        code: 'SSE_CONNECTION_ERROR',
        message: '与本项目服务端的实时连接中断，您可以重试。',
        retryable: true,
      })
      eventSource.close()
    }

    return () => eventSource.close()
  }

  private async mockStartAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    return {
      taskId: `mock-task-${Date.now()}`,
      status: 'queued',
      calculation: request.calculation,
    }
  }

  private simulateTaskEvents(
    taskId: string,
    request: StartAnalysisRequest,
    onEvent: (event: AgentTaskEvent) => void,
  ): () => void {
    let cancelled = false
    const timers: number[] = []
    const push = (event: AgentTaskEvent, delayMs: number) => {
      const timer = globalThis.setTimeout(() => {
        if (!cancelled) onEvent(event)
      }, delayMs) as unknown as number
      timers.push(timer)
    }

    if (request.simulatedError) {
      push({ type: 'started', taskId }, 100)
      push({
        type: 'progress',
        taskId,
        stage: '连接分析引擎异常',
        message: '模拟的生成错误，正在测试失败重试流程。',
        percent: 20,
      }, 300)
      push({
        type: 'failed',
        taskId,
        code: 'SIMULATED_ERROR',
        message: '模拟的网络响应异常，请点击“重新尝试”按钮恢复。',
        retryable: true,
      }, 500)
      return () => {
        cancelled = true
        timers.forEach((timer) => globalThis.clearTimeout(timer))
      }
    }

    push({ type: 'started', taskId }, 200)
    push({
      type: 'progress',
      taskId,
      stage: '整理 2025 官方统计基准',
      message: '正在读取已公布的全国 CPI 与消费结构。',
      percent: 30,
    }, 800)
    push({
      type: 'progress',
      taskId,
      stage: '核对个人支出变化',
      message: '个人输入优先，2026 年上半年 CPI 只作为日常支出估算起点。',
      percent: 65,
    }, 1800)
    push({
      type: 'progress',
      taskId,
      stage: '生成生活解读',
      message: '只解释本地计算结果，不修改数字。',
      percent: 90,
    }, 2800)
    push({
      type: 'completed',
      taskId,
      insight: generateMockInsightText(request),
      sources: OFFICIAL_SOURCES,
      structuredInsight: generateMockStructuredInsight(request),
    }, 3600)

    return () => {
      cancelled = true
      timers.forEach((timer) => globalThis.clearTimeout(timer))
    }
  }
}

function generateMockInsightText(request: StartAnalysisRequest): string {
  const { input, calculation } = request
  const money = (value: number) => Math.round(value).toLocaleString('zh-CN')
  const rate = (value: number) => `${(value * 100).toFixed(2)}%`

  if (calculation.raiseIncrease <= 0) {
    return `你的到手收入没有增加，固定支出和日常生活成本变化会直接影响每月结余。要保持当前生活水平，下一阶段到手月收入至少需要 ${money(calculation.breakEvenIncome)} 元。`
  }

  const incomeMessage = `到手收入增加 ${money(calculation.raiseIncrease)} 元，`
  const housingMessage = calculation.rentIncrease > 0
    ? `其中住房支出增加 ${money(calculation.rentIncrease)} 元。`
    : calculation.rentIncrease < 0
    ? `其中住房支出减少 ${money(Math.abs(calculation.rentIncrease))} 元。`
    : '住房支出保持不变。'

  return `${incomeMessage}${housingMessage}按 2026 年上半年 CPI 与 2025 年城镇消费结构派生的日常支出基准（${rate(input.otherInflationRate)}）计算，你每月预计${calculation.monthlyRemainderChange >= 0 ? '多' : '少'}剩 ${money(Math.abs(calculation.monthlyRemainderChange))} 元。核心结果以你的输入和本地计算为准。`
}

export function generateMockStructuredInsight(request: StartAnalysisRequest) {
  const { input, calculation, inputMode, detailedBreakdown } = request
  const { raiseIncrease, rentIncrease, nextOtherSpend, monthlyRemainderChange } = calculation
  const otherDelta = Math.round(nextOtherSpend - input.otherSpend)

  const drivers = []

  // Income driver
  drivers.push({
    id: 'income',
    label: '工资收入变动',
    direction: raiseIncrease >= 0 ? ('positive' as const) : ('negative' as const),
    monthlyImpact: raiseIncrease,
    explanation: raiseIncrease >= 0
      ? `月税后收入预计增加 ${Math.round(raiseIncrease)} 元`
      : `月税后收入预计减少 ${Math.round(Math.abs(raiseIncrease))} 元`,
    sourceRefs: ['用户输入'],
  })

  // Housing-cost driver
  drivers.push({
    id: 'rent',
    label: '住房支出变动',
    direction: rentIncrease > 0 ? ('negative' as const) : rentIncrease < 0 ? ('positive' as const) : ('neutral' as const),
    monthlyImpact: -rentIncrease,
    explanation: rentIncrease > 0
      ? `月住房支出增加 ${Math.round(rentIncrease)} 元`
      : rentIncrease < 0
      ? `月住房支出减少 ${Math.round(Math.abs(rentIncrease))} 元`
      : `月住房支出维持不变`,
    sourceRefs: ['用户输入'],
  })

  // Detailed mode category drivers using individual CategoryItemBreakdown items
  if (inputMode === 'detailed' && detailedBreakdown) {
    const categoriesList: Array<{ id: CategoryKey; label: string }> = [
      { id: 'food', label: '食品与餐饮' },
      { id: 'utilities', label: '水电与生活用品' },
      { id: 'transport', label: '交通与通信' },
      { id: 'education', label: '教育与娱乐' },
      { id: 'medical', label: '医疗保健' },
      { id: 'other', label: '其他生活杂项' },
    ]

    for (const cat of categoriesList) {
      const item = detailedBreakdown[cat.id]
      if (!item) continue
      const impact = Math.round(item.nextAmount - item.currentAmount)
      drivers.push({
        id: cat.id,
        label: cat.label,
        direction: impact > 0 ? ('negative' as const) : impact < 0 ? ('positive' as const) : ('neutral' as const),
        monthlyImpact: -impact,
        explanation: impact > 0
          ? `基于预估涨幅 ${(item.cpiRate * 100).toFixed(1)}%，月开支从 ${item.currentAmount} 元调整为 ${item.nextAmount} 元（增加 ${impact} 元）`
          : impact < 0
          ? `月开支减少 ${Math.abs(impact)} 元`
          : `月开支维持在 ${item.currentAmount} 元不变`,
        sourceRefs: ['国家统计局 2026 年上半年 CPI 分类数据 & 个人调整'],
      })
    }
  } else {
    // Basic mode driver
    drivers.push({
      id: 'other',
      label: '日常生活成本变动',
      direction: otherDelta > 0 ? ('negative' as const) : otherDelta < 0 ? ('positive' as const) : ('neutral' as const),
      monthlyImpact: -otherDelta,
      explanation: otherDelta > 0
        ? `基于 2026H1 CPI 派生估计，日常月开支增加约 ${otherDelta} 元`
        : `日常月开支大致持平`,
      sourceRefs: ['国家统计局 2026 年上半年 CPI 与 2025 年城镇消费结构'],
    })
  }

  // Verified official statistics:
  // 2025 Urban nominal disposable income growth = 4.3%
  // 2026H1 national CPI = 1.0%
  const urbanIncomeGrowthRate = 0.043
  const overallCpiRate = 0.01

  const userIncomeGrowthRate = calculation.incomeGrowthRate
  const userCostGrowthRate = calculation.totalSpendGrowthRate

  const scenarios = [
    {
      id: 'stabilize_fixed_costs',
      title: '场景 1：稳定固定支出',
      change: '若住房等固定支出保持当前水平',
      annualRemainderDelta: Math.max(0, rentIncrease * 12),
      tradeoff: rentIncrease > 0
        ? `固定支出不再增加，每年可多保留 ${Math.round(rentIncrease * 12)} 元结余。`
        : `固定支出没有增加，当前结余不受这一项拖累。`,
    },
    {
      id: 'control_other_spend',
      title: '场景 2：控制日常生活开支',
      change: '将日常生活支出上涨率控制在 0%',
      annualRemainderDelta: Math.max(0, otherDelta * 12),
      tradeoff: `每年可多保留 ${Math.max(0, otherDelta * 12)} 元结余。`,
    },
    {
      id: 'breakeven_goal',
      title: '场景 3：达成保本薪资目标',
      change: `下一阶段到手月收入达到 ${Math.round(calculation.breakEvenIncome)} 元`,
      annualRemainderDelta: monthlyRemainderChange < 0 ? Math.round(Math.abs(monthlyRemainderChange) * 12) : 0,
      tradeoff: '完全抵消固定支出及生活成本上涨，购买力与今年持平。',
    },
  ]

  // Verified historical urban nominal income growth: 2021=8.2%, 2022=3.9%, 2023=5.1%, 2024=4.6%, 2025=4.3%
  // Verified historical national overall CPI: 2021=0.9%, 2022=2.0%, 2023=0.2%, 2024=0.2%, 2025=0.0%
  // For user_income_growth: 2021-2024 are null because no historical personal data is provided by the user.
  const trend = {
    periods: ['2021', '2022', '2023', '2024', '2025'],
    series: [
      {
        id: 'user_income_growth',
        label: '个人预计收入增速',
        values: [null, null, null, null, Number(userIncomeGrowthRate.toFixed(3))],
      },
      {
        id: 'urban_income_growth',
        label: '城镇居民人均可支配收入增速',
        values: [0.082, 0.039, 0.051, 0.046, 0.043],
      },
      {
        id: 'national_cpi',
        label: '全国 CPI 居民消费价格通胀率',
        values: [0.009, 0.020, 0.002, 0.002, 0.000],
      },
    ],
  }

  const warnings = [
    '住房支出只是个人固定支出的一部分，不能用全国居住类指标替代某个家庭的实际支出；结果以用户输入为准。',
    '此解读由确定性数学算法与国家统计局公开数据生成，不代表第三方金融机构投资或借贷建议。',
  ]

  return {
    version: 'v1' as const,
    summary: generateMockInsightText(request),
    drivers,
    benchmark: {
      userIncomeGrowthRate,
      userCostGrowthRate,
      urbanIncomeGrowthRate,
      overallCpiRate,
      caveat: '个人收入结构、固定支出和消费结构与宏观平均存在差异，以实际输入为准。',
      sourceRefs: [
        '国家统计局：2026 年上半年居民消费价格主要数据 (CPI 1—6 月平均 1.0%)',
        '国家统计局：2025 年居民收入和消费支出情况',
      ],
    },
    scenarios,
    trend,
    warnings,
    sources: OFFICIAL_SOURCES,
  }
}

export const apiClient = new RealRaiseApiClient()
