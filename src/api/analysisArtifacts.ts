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
  mode: 'byok' | 'mock'
}): string {
  return JSON.stringify(
    {
      schemaVersion: 'real-raise.v1',
      taskId: options.taskId,
      vendorTaskId: options.vendorTaskId,
      generatedBy: options.mode === 'byok' ? 'real-raise-browser-adapter' : 'real-raise-local-demo',
      city: '全国',
      period: '2026H1',
      calculationAuthority: 'local',
      inputMode: options.request.inputMode ?? 'basic',
      incomeInputMode: options.request.incomeInputMode ?? 'net',
      calculation: options.request.calculation,
      sourceRefs: options.sources,
      note: '所有金额由本地确定性公式计算，模型只负责解释；若平台未回传 workspace 文件，此清单由本地适配层生成。',
    },
    null,
    2,
  )
}
