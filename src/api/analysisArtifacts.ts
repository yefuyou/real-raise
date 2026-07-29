import type { SourceReference, StartAnalysisRequest } from './realRaiseContract'

/**
 * 分析证据产物构造器。
 *
 * 浏览器直连模式下平台不一定回传 workspace 文件，这里在本地按同一套口径
 * 生成最小可追溯的 evidence.csv 与 analysis-manifest.json，保证"可下载凭证"
 * 在演示模式和真实模式下表现一致。
 */

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildEvidenceCsv(
  request: StartAnalysisRequest,
  sources: SourceReference[],
): string {
  const { input, calculation, payslipSummary } = request
  const rows: Array<Array<unknown>> = [
    ['item', 'value', 'source_type', 'source_detail'],
    ['current_income', input.currentIncome, 'user_input', '现在的月到手收入'],
    ['next_income', input.nextIncome, 'user_input', '下一阶段预计月到手收入'],
    ['current_rent', input.currentRent, 'user_input', '现在的月住房支出'],
    ['next_rent', input.nextRent, 'user_input', '下一阶段预计月住房支出'],
    ['other_spend', input.otherSpend, 'user_input', '现在的月日常生活支出'],
    ['other_inflation_rate', input.otherInflationRate, 'derived_estimate', '2026H1 CPI 与 2025 城镇消费结构派生'],
    ['city_code', request.cityContext.cityCode, 'user_input', request.cityContext.cityName],
    ['city_period', request.cityContext.period, 'city_benchmark', request.cityContext.coverageTier],
    ['city_overall_cpi_rate', request.cityContext.overallCpiRate, 'city_benchmark', request.cityContext.caveat],
    ['calculation_version', request.calculationVersion, 'system_version', '本项目确定性计算版本'],
    ['income_growth_rate', calculation.incomeGrowthRate, 'local_calculation', '本项目确定性计算'],
    ['total_spend_growth_rate', calculation.totalSpendGrowthRate, 'local_calculation', '本项目确定性计算'],
    ['real_purchasing_power_rate', calculation.realPurchasingPowerRate, 'local_calculation', '本项目确定性计算'],
    ['monthly_remainder_change', calculation.monthlyRemainderChange, 'local_calculation', '本项目确定性计算'],
    ['annual_remainder_change', calculation.annualRemainderChange, 'local_calculation', '本项目确定性计算'],
    ['break_even_income', calculation.breakEvenIncome, 'local_calculation', '维持当前生活水平所需月到手收入'],
  ]

  if (request.inputMode === 'detailed' && request.detailedBreakdown) {
    for (const [key, item] of Object.entries(request.detailedBreakdown)) {
      rows.push([
        `category_${key}`,
        `${item.currentAmount} -> ${item.nextAmount}`,
        'user_input_with_official_rate',
        `分类涨幅 ${item.cpiRate}`,
      ])
    }
  }

  if (request.incomeInputMode === 'payslip' && payslipSummary) {
    rows.push(['payslip_gross_increase', payslipSummary.grossIncrease, 'local_calculation', '税前工资变化'])
    rows.push(['payslip_net_increase', payslipSummary.netIncrease, 'local_calculation', '到手收入变化'])
    rows.push(['payslip_deduction_change', payslipSummary.deductionChange, 'local_calculation', '扣缴合计变化'])
    rows.push(['payslip_future_account_change', payslipSummary.futureAccountChange, 'local_calculation', '养老+公积金进入未来账户'])
  }

  for (const source of sources) {
    rows.push([source.name, source.year ?? '', 'official_source', `${source.scope}｜${source.url}`])
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export function buildAnalysisManifest(options: {
  taskId: string
  vendorTaskId: string | null
  request: StartAnalysisRequest
  sources: SourceReference[]
  mode: 'mock' | 'replay'
}): string {
  return JSON.stringify(
    {
      schemaVersion: 'real-raise.analysis.v2',
      taskId: options.taskId,
      vendorTaskId: options.vendorTaskId,
      generatedBy: options.mode === 'replay'
          ? 'real-raise-replay-current-calculation-adapter'
          : 'real-raise-local-demo',
      city: options.request.cityContext,
      period: options.request.cityContext.period,
      calculationAuthority: 'local-deterministic',
      calculationVersion: options.request.calculationVersion,
      inputMode: options.request.inputMode ?? 'basic',
      incomeInputMode: options.request.incomeInputMode ?? 'net',
      artifactContract: [
        'explanation.md',
        'driver-ranking.csv',
        'scenario-matrix.csv',
        'scenario-matrix.json',
        'share-summary.md',
        'evidence.csv',
        'analysis-manifest.json',
      ],
      calculation: options.request.calculation,
      sourceRefs: options.sources,
      note: options.mode === 'replay'
        ? '此清单由 Real Raise 按当前请求与 living-cost.v2 确定性生成；历史供应商原件另存为 vendor-original-analysis-manifest.json，不得混称。'
        : '所有金额由本地确定性公式计算，模型只负责解释；若平台未回传 workspace 文件，此清单由本地适配层生成。',
    },
    null,
    2,
  )
}

function buildScenarioRows(request: StartAnalysisRequest) {
  const input = request.input
  const baseline = request.calculation
  const makeRow = (id: string, label: string, nextIncome: number, nextRent: number, nextOtherSpend: number, rationale: string) => {
    const currentRemainder = input.currentIncome - input.currentRent - input.otherSpend
    const nextRemainder = nextIncome - nextRent - nextOtherSpend
    const monthlyDelta = nextRemainder - currentRemainder
    return {
      id,
      label,
      nextIncome,
      nextRent,
      nextOtherSpend,
      monthlyRemainder: nextRemainder,
      annualRemainder: nextRemainder * 12,
      monthlyDeltaVsBaseline: monthlyDelta - baseline.monthlyRemainderChange,
      annualDeltaVsBaseline: (monthlyDelta - baseline.monthlyRemainderChange) * 12,
      breakEvenIncome: nextRent + nextOtherSpend + currentRemainder,
      rationale,
      calculationVersion: request.calculationVersion,
      provenance: 'local-deterministic',
    }
  }
  return [
    makeRow('baseline', '当前输入基准', input.nextIncome, input.nextRent, baseline.nextOtherSpend, '用户当前提交的确定性计算结果。'),
    makeRow('rent-stable', '住房支出稳定', input.nextIncome, input.currentRent, baseline.nextOtherSpend, '下一阶段住房支出保持当前水平。'),
    makeRow('daily-spend-stable', '日常支出稳定', input.nextIncome, input.nextRent, input.otherSpend, '下一阶段日常支出保持当前水平。'),
    makeRow('break-even-income', '达到保本收入', baseline.breakEvenIncome, input.nextRent, baseline.nextOtherSpend, '下一阶段收入达到维持当前月结余所需的保本线。'),
    makeRow('rent-stress-5pct', '住房压力：房租再涨 5%', input.nextIncome, input.nextRent * 1.05, baseline.nextOtherSpend, '在下一阶段房租基础上增加 5%。'),
    makeRow('daily-spend-stress-3pct', '日常支出压力：再高 3%', input.nextIncome, input.nextRent, baseline.nextOtherSpend * 1.03, '在基准日常支出基础上增加 3%。'),
    makeRow('conservative-income', '保守收入：只实现一半涨幅', input.currentIncome + (input.nextIncome - input.currentIncome) * 0.5, input.nextRent, baseline.nextOtherSpend, '只实现用户预期涨幅的一半。'),
  ]
}

function buildDriverRows(request: StartAnalysisRequest) {
  const dailySpendDelta = request.calculation.nextOtherSpend - request.input.otherSpend
  const rows = [
    { id: 'net-income', label: '到手收入变化', monthlyImpact: request.calculation.raiseIncrease, direction: request.calculation.raiseIncrease >= 0 ? 'positive' : 'negative' },
    { id: 'housing', label: '住房支出变化', monthlyImpact: -request.calculation.rentIncrease, direction: request.calculation.rentIncrease <= 0 ? 'positive' : 'negative' },
    { id: 'daily-spend', label: '日常支出变化', monthlyImpact: -dailySpendDelta, direction: dailySpendDelta <= 0 ? 'positive' : 'negative' },
  ]
  const total = rows.reduce((sum, row) => sum + Math.abs(row.monthlyImpact), 0)
  return rows
    .map((row) => ({ ...row, impactRatio: total > 0 ? Math.abs(row.monthlyImpact) / total : 0, source: 'Real Raise living-cost.v2' }))
    .sort((left, right) => Math.abs(right.monthlyImpact) - Math.abs(left.monthlyImpact))
    .map((row, index) => ({ rank: index + 1, ...row }))
}

export function buildDriverRankingCsv(request: StartAnalysisRequest): string {
  const rows: unknown[][] = [['rank', 'driver_id', 'driver', 'monthly_impact', 'impact_ratio', 'direction', 'authority', 'source']]
  for (const row of buildDriverRows(request)) rows.push([row.rank, row.id, row.label, row.monthlyImpact, row.impactRatio, row.direction, 'deterministic', row.source])
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export function buildScenarioMatrixCsv(request: StartAnalysisRequest): string {
  const rows: unknown[][] = [['scenario_id', 'scenario', 'next_income', 'next_rent', 'next_other_spend', 'monthly_remainder', 'annual_remainder', 'monthly_delta_vs_baseline', 'annual_delta_vs_baseline', 'break_even_income', 'calculation_version', 'provenance']]
  for (const row of buildScenarioRows(request)) rows.push([row.id, row.label, row.nextIncome, row.nextRent, row.nextOtherSpend, row.monthlyRemainder, row.annualRemainder, row.monthlyDeltaVsBaseline, row.annualDeltaVsBaseline, row.breakEvenIncome, row.calculationVersion, row.provenance])
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export function buildScenarioMatrixJson(request: StartAnalysisRequest): string {
  return JSON.stringify({ schemaVersion: 'real-raise.scenario-matrix.v1', calculationVersion: request.calculationVersion, generatedBy: 'real-raise-local-deterministic', scenarios: buildScenarioRows(request) }, null, 2)
}

export function buildShareSummaryMarkdown(request: StartAnalysisRequest): string {
  const { calculation } = request
  const money = (value: number) => `${Math.round(value).toLocaleString('zh-CN')} 元`
  const top = buildDriverRows(request)[0]
  const retained = calculation.raiseIncrease === 0 ? null : calculation.monthlyRemainderChange / calculation.raiseIncrease
  return [
    '# Real Raise 分享摘要',
    '',
    `- 核心结论：到手收入${calculation.raiseIncrease >= 0 ? '增加' : '减少'} ${money(Math.abs(calculation.raiseIncrease))}，每月可支配结余${calculation.monthlyRemainderChange >= 0 ? '增加' : '减少'} ${money(Math.abs(calculation.monthlyRemainderChange))}。`,
    retained === null ? '- 涨薪留存率：证据不足（收入变化为 0）。' : `- 涨薪留存率：${(retained * 100).toFixed(1)}%。`,
    `- 最大影响因素：${top.label}（${money(Math.abs(top.monthlyImpact))}/月，方向：${top.direction}）。`,
    `- 城市口径：${request.cityContext.cityName} · ${request.cityContext.period} · ${request.cityContext.coverageTier}。`,
    '',
    '金额由 Real Raise 确定性公式生成；InfiniSynapse 只负责分析与表达。',
  ].join('\n')
}
