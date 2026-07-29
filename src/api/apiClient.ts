import type {
  AgentTaskEvent,
  SourceReference,
  StartAnalysisRequest,
  StartAnalysisResponse,
  CategoryKey,
} from './realRaiseContract'
import { OFFICIAL_2025_INCOME_BENCHMARKS } from '../data/official2025'
import { OFFICIAL_2026_H1_CPI } from '../data/official2026'
import {
  cancelReplayTask,
  findReplayForRequest,
  getReplayArtifact,
  isReplayTask,
  subscribeReplayTask,
} from './replayClient'
import {
  buildAnalysisManifest,
  buildDriverRankingCsv,
  buildEvidenceCsv,
  buildScenarioMatrixCsv,
  buildScenarioMatrixJson,
  buildShareSummaryMarkdown,
} from './analysisArtifacts'
import {
  ServerAnalysisUnavailable,
  cancelServerTask,
  getServerArtifact,
  isServerAnalysisConfigured,
  isServerTask,
  startServerAnalysis,
  subscribeServerTask,
} from './serverAnalysisClient'

export interface AnalysisClientOptions {
  useMock?: boolean
}

/** 演示模式（无 Key）下也要能下载凭证，这里留存请求用于本地生成产物。 */
const mockRequests = new Map<string, StartAnalysisRequest>()

export const OFFICIAL_SOURCES: SourceReference[] = [
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

function sourcesForRequest(request: StartAnalysisRequest): SourceReference[] {
  const citySource = request.cityContext.overallSource
  return citySource && !OFFICIAL_SOURCES.some((source) => source.url === citySource.url)
    ? [...OFFICIAL_SOURCES, citySource]
    : OFFICIAL_SOURCES
}

/**
 * 三态产品路径：
 * - `server-live`：生产站经 Cloudflare Worker 调用平台，浏览器不接触项目 Key；
 * - `replay`：未登录时，仅当当前输入与某个真实任务存档一致才播放存档；
 * - `mock`：仅供自动化测试显式注入，不是用户入口。
 * 回放绝不冒充实时；BYOK 不再是产品路径。
 */
export type AnalysisMode = 'server-live' | 'replay' | 'mock'

export class RealRaiseApiClient {
  private useMock: boolean

  constructor(options: AnalysisClientOptions = {}) {
    // 未连接 Worker 时只允许真实回放；Mock 仅由测试显式注入。
    this.useMock = options.useMock ?? false
  }

  public setUseMock(useMock: boolean) {
    this.useMock = useMock
  }

  /** 同步可知的模式（replay 需异步匹配存档，由 startAnalysis 决定）。 */
  public getActiveMode(): 'server-live' | 'replay' | 'mock' {
    if (this.useMock) return 'mock'
    if (isServerAnalysisConfigured()) return 'server-live'
    return 'replay'
  }

  public async startAnalysis(
    request: StartAnalysisRequest
  ): Promise<StartAnalysisResponse> {
    if (this.useMock) return this.mockStartAnalysis(request)

    if (isServerAnalysisConfigured()) {
      try {
        const handle = await startServerAnalysis(request)
        return {
          taskId: handle.taskId,
          status: handle.status,
          calculation: request.calculation,
        }
      } catch (error) {
        if (!(error instanceof ServerAnalysisUnavailable) || !error.fallbackAllowed) throw error
        // Worker 关闭、限流或达到每日保险丝时，优先回放真实存档。
        const replayTaskId = await findReplayForRequest(request)
        if (replayTaskId) {
          return { taskId: replayTaskId, status: 'queued', calculation: request.calculation }
        }
        throw new ServerAnalysisUnavailable(
          '当前输入暂无真实任务回放，请选择预设案例或登录后生成个人报告。',
          'REPLAY_NOT_FOUND',
          404,
          false,
        )
      }
    }

    // 未登录：只找真实任务存档（输入一致才播放），找不到就明确提示，
    // 不再偷偷切入 BYOK 或本地 Mock。
    const replayTaskId = await findReplayForRequest(request)
    if (replayTaskId) {
      return { taskId: replayTaskId, status: 'queued', calculation: request.calculation }
    }
    throw new ServerAnalysisUnavailable(
      '当前输入暂无真实任务回放，请选择预设案例或登录后生成个人报告。',
      'REPLAY_NOT_FOUND',
      404,
      false,
    )
  }

  /** 显式播放真实任务存档；即使已登录或已配置 Worker，也绝不发起实时任务。 */
  public async startReplayAnalysis(
    request: StartAnalysisRequest
  ): Promise<StartAnalysisResponse> {
    const replayRequest = { ...request }
    delete replayRequest.analysisModel
    const replayTaskId = await findReplayForRequest(replayRequest)
    if (replayTaskId) {
      return {
        taskId: replayTaskId,
        status: 'queued',
        calculation: replayRequest.calculation,
      }
    }
    throw new ServerAnalysisUnavailable(
      '当前输入暂无真实任务回放，请选择一个预设案例后重试。',
      'REPLAY_NOT_FOUND',
      404,
      false,
    )
  }

  public async cancelAnalysis(taskId: string): Promise<boolean> {
    if (this.useMock || taskId.startsWith('mock-task-')) {
      mockRequests.delete(taskId)
      return true
    }
    if (isServerTask(taskId)) return cancelServerTask(taskId)
    if (isReplayTask(taskId)) return cancelReplayTask(taskId)
    return false
  }

  public subscribeTaskEvents(
    taskId: string,
    request: StartAnalysisRequest,
    onEvent: (event: AgentTaskEvent) => void,
  ): () => void {
    if (this.useMock || taskId.startsWith('mock-task-')) {
      return this.simulateTaskEvents(taskId, request, onEvent)
    }
    if (isServerTask(taskId)) return subscribeServerTask(taskId, onEvent)
    if (isReplayTask(taskId)) return subscribeReplayTask(taskId, onEvent)
    onEvent({
      type: 'failed',
      taskId,
      code: 'TASK_NOT_FOUND',
      message: '任务不存在或当前页面没有可用的实时任务。',
      retryable: true,
    })
    return () => undefined
  }

  /**
   * 取证据文件内容。真实模式读平台回传或本地兜底的产物，回放模式读存档
   * previews，演示模式即时本地生成，三种模式下"下载凭证"按钮行为一致。
   */
  public getArtifactContent(taskId: string, fileName: string): string | null {
    if (isServerTask(taskId)) return getServerArtifact(taskId, fileName)
    if (isReplayTask(taskId)) return getReplayArtifact(taskId, fileName)
    if (taskId.startsWith('mock-task-')) {
      const stored = mockRequests.get(taskId)
      if (!stored) return null
      const sources = sourcesForRequest(stored)
      if (fileName === 'evidence.csv') return buildEvidenceCsv(stored, sources)
      if (fileName === 'analysis-manifest.json') {
        return buildAnalysisManifest({
          taskId,
          vendorTaskId: null,
          request: stored,
          sources,
          mode: 'mock',
        })
      }
      if (fileName === 'driver-ranking.csv') return buildDriverRankingCsv(stored)
      if (fileName === 'scenario-matrix.csv') return buildScenarioMatrixCsv(stored)
      if (fileName === 'scenario-matrix.json') return buildScenarioMatrixJson(stored)
      if (fileName === 'share-summary.md') return buildShareSummaryMarkdown(stored)
      if (fileName === 'explanation.md') return buildMockExplanationMarkdown(taskId, stored)
      return null
    }
    return null
  }

  private async mockStartAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    const taskId = `mock-task-${Date.now()}`
    // 只保留最近几次演示任务，避免长时间停留在页面上时无限增长。
    while (mockRequests.size >= 5) {
      const oldest = mockRequests.keys().next().value
      if (oldest === undefined) break
      mockRequests.delete(oldest)
    }
    mockRequests.set(taskId, request)
    return {
      taskId,
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
    const resultSources = sourcesForRequest(request)
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
      sources: resultSources,
      structuredInsight: buildDeterministicStructuredInsight(request),
      provenance: {
        mode: 'mock',
        narrativeSource: 'local-template',
        structuredInsightSource: 'real-raise-deterministic',
        calculationAuthority: 'local-deterministic',
        calculationVersion: request.calculationVersion,
        attribution: 'none',
        artifactStatus: 'deterministic-only',
      },
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

  const payslip = request.incomeInputMode === 'payslip' ? request.payslipSummary : undefined
  const payslipPrefix = payslip
    ? `税前工资${payslip.grossIncrease >= 0 ? '增加' : '减少'} ${money(Math.abs(payslip.grossIncrease))} 元，个税与社保公积金等扣缴合计${payslip.deductionChange >= 0 ? '增加' : '减少'} ${money(Math.abs(payslip.deductionChange))} 元（其中养老与公积金变化 ${money(payslip.futureAccountChange)} 元计入你的未来账户积累，不属于消失）。`
    : ''

  if (calculation.raiseIncrease <= 0) {
    return `${payslipPrefix}你的到手收入没有增加，固定支出和日常生活成本变化会直接影响每月结余。要保持当前生活水平，下一阶段到手月收入至少需要 ${money(calculation.breakEvenIncome)} 元。`
  }

  const incomeMessage = `${payslipPrefix}到手收入增加 ${money(calculation.raiseIncrease)} 元，`
  const housingMessage = calculation.rentIncrease > 0
    ? `其中住房支出增加 ${money(calculation.rentIncrease)} 元。`
    : calculation.rentIncrease < 0
    ? `其中住房支出减少 ${money(Math.abs(calculation.rentIncrease))} 元。`
    : '住房支出保持不变。'

  return `${incomeMessage}${housingMessage}按 2026 年上半年 CPI 与 2025 年城镇消费结构派生的日常支出基准（${rate(input.otherInflationRate)}）计算，你每月预计${calculation.monthlyRemainderChange >= 0 ? '多' : '少'}剩 ${money(Math.abs(calculation.monthlyRemainderChange))} 元。核心结果以你的输入和本地计算为准。`
}

/** 演示模式的可下载解读正文，口径与真实模式的 explanation.md 保持一致。 */
function buildMockExplanationMarkdown(taskId: string, request: StartAnalysisRequest): string {
  const { input, calculation } = request
  const money = (value: number) => `${Math.round(value).toLocaleString('zh-CN')} 元`
  const rate = (value: number) => `${(value * 100).toFixed(2)}%`

  return [
    '# REAL RAISE 购买力与消费诊断报告',
    '',
    `- 任务 ID：${taskId}`,
    '- 生成方式：本地演示模式（未配置分析平台 API Key）',
    `- 城市上下文：${request.cityContext.cityName}（${request.cityContext.cityCode}）· ${request.cityContext.period} · ${request.cityContext.coverageTier}`,
    `- 确定性公式：${request.calculationVersion}`,
    '- 数据底座：本地确定性算表 + 2026 年上半年官方 CPI',
    '',
    '## 结论',
    '',
    generateMockInsightText(request),
    '',
    '## 关键数字',
    '',
    '| 项目 | 数值 | 口径 |',
    '| --- | --- | --- |',
    `| 到手收入变化 | ${money(calculation.raiseIncrease)} | 用户输入 |`,
    `| 住房支出变化 | ${money(calculation.rentIncrease)} | 用户输入 |`,
    `| 日常支出变化 | ${money(calculation.nextOtherSpend - input.otherSpend)} | CPI 派生估算 |`,
    `| 每月结余变化 | ${money(calculation.monthlyRemainderChange)} | 本地确定性计算 |`,
    `| 每年结余变化 | ${money(calculation.annualRemainderChange)} | 本地确定性计算 |`,
    `| 真实购买力变化 | ${rate(calculation.realPurchasingPowerRate)} | 本地确定性计算 |`,
    `| 维持原生活需月入 | ${money(calculation.breakEvenIncome)} | 本地确定性计算 |`,
    '',
    '## 边界说明',
    '',
    '- 所有金额由本地确定性公式计算，模型只负责解释，不修改数字。',
    '- 演示模式的解读文本由本地模板生成，不代表分析平台的真实输出。',
    '- 本报告不构成投资、借贷或其他个性化金融建议。',
    '',
  ].join('\n')
}

/**
 * Real Raise owns these cards. They are deterministic diagnostics derived
 * from the authoritative request, never an InfiniSynapse model response.
 */
export function buildDeterministicStructuredInsight(request: StartAnalysisRequest) {
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

  // Payslip deduction driver (only in payslip mode)
  if (request.incomeInputMode === 'payslip' && request.payslipSummary) {
    const slip = request.payslipSummary
    drivers.push({
      id: 'deductions',
      label: '个税与社保公积金扣缴',
      direction: slip.deductionChange > 0 ? ('negative' as const) : slip.deductionChange < 0 ? ('positive' as const) : ('neutral' as const),
      monthlyImpact: -slip.deductionChange,
      explanation: `扣缴合计${slip.deductionChange >= 0 ? '增加' : '减少'} ${Math.round(Math.abs(slip.deductionChange))} 元；其中养老与公积金变化 ${Math.round(slip.futureAccountChange)} 元进入未来保障与账户积累`,
      sourceRefs: ['用户工资条输入'],
    })
  }

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
  const overallCpiRate = request.cityContext.overallCpiRate

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
    request.cityContext.caveat,
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
      caveat: `${request.cityContext.cityName} ${request.cityContext.period}｜${request.cityContext.caveat} 个人收入结构、固定支出和消费结构仍以实际输入为准。`,
      sourceRefs: [
        request.cityContext.overallSource?.name
          ?? '国家统计局：2026 年上半年居民消费价格主要数据',
        '国家统计局：2025 年居民收入和消费支出情况',
      ],
    },
    scenarios,
    trend,
    warnings,
    sources: request.cityContext.overallSource
      && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource?.url)
      ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
      : OFFICIAL_SOURCES,
  }
}

export const apiClient = new RealRaiseApiClient()
