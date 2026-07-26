/**
 * 工资条模式领域模型。
 *
 * 原则：只做确定性算术——到手 = 税前 − 各扣缴项之和。
 * 不内置任何城市缴费比例，也不自动计算个税；用户照工资条抄数。
 * 城市规则估算属于下一阶段（见 docs/NEXT_STAGE_PLAN.md §1.B），
 * 届时估算值必须显示“估算”并允许工资条实际扣缴额覆盖。
 */

export type PayslipPeriodInput = {
  /** 税前工资 */
  gross: number
  /** 个人所得税 */
  incomeTax: number
  /** 养老保险（个人缴纳） */
  pension: number
  /** 医疗保险（个人缴纳） */
  medicalIns: number
  /** 失业保险（个人缴纳） */
  unemploymentIns: number
  /** 住房公积金（个人缴纳） */
  housingFund: number
  /** 其他扣缴 */
  otherDeduction: number
}

export type PayslipInput = {
  current: PayslipPeriodInput
  next: PayslipPeriodInput
}

export type PayslipSummary = {
  currentDeductionTotal: number
  nextDeductionTotal: number
  /** 扣缴合计变化（下一阶段 − 现在） */
  deductionChange: number
  currentNet: number
  nextNet: number
  grossIncrease: number
  netIncrease: number
  taxChange: number
  /** 养老 + 医疗 + 失业 + 公积金四项个人缴纳的变化合计 */
  socialAndFundChange: number
  /** 养老 + 公积金变化：进入个人未来账户的部分，不称为“消失”。 */
  futureAccountChange: number
  /** 税前每涨 1 元真正到手多少；税前无增长时为 null。 */
  raiseKeptRate: number | null
  /** 任一期扣缴合计超过税前时为 true，用于输入校验提示。 */
  hasNegativeNet: boolean
}

const clean = (value: number) => (Number.isFinite(value) ? value : 0)

export function deductionTotal(period: PayslipPeriodInput): number {
  return (
    clean(period.incomeTax)
    + clean(period.pension)
    + clean(period.medicalIns)
    + clean(period.unemploymentIns)
    + clean(period.housingFund)
    + clean(period.otherDeduction)
  )
}

export function netIncome(period: PayslipPeriodInput): number {
  return clean(period.gross) - deductionTotal(period)
}

export function computePayslip(input: PayslipInput): PayslipSummary {
  const currentDeductionTotal = deductionTotal(input.current)
  const nextDeductionTotal = deductionTotal(input.next)
  const currentNet = netIncome(input.current)
  const nextNet = netIncome(input.next)
  const grossIncrease = clean(input.next.gross) - clean(input.current.gross)
  const netIncrease = nextNet - currentNet
  const taxChange = clean(input.next.incomeTax) - clean(input.current.incomeTax)
  const socialAndFundChange =
    clean(input.next.pension) - clean(input.current.pension)
    + clean(input.next.medicalIns) - clean(input.current.medicalIns)
    + clean(input.next.unemploymentIns) - clean(input.current.unemploymentIns)
    + clean(input.next.housingFund) - clean(input.current.housingFund)
  const futureAccountChange =
    clean(input.next.pension) - clean(input.current.pension)
    + clean(input.next.housingFund) - clean(input.current.housingFund)

  return {
    currentDeductionTotal,
    nextDeductionTotal,
    deductionChange: nextDeductionTotal - currentDeductionTotal,
    currentNet,
    nextNet,
    grossIncrease,
    netIncrease,
    taxChange,
    socialAndFundChange,
    futureAccountChange,
    raiseKeptRate: grossIncrease > 0 ? netIncrease / grossIncrease : null,
    hasNegativeNet: currentNet < 0 || nextNet < 0,
  }
}

/* ========== 估算引擎（docs/PAYSLIP_UX_SPEC.md §一） ==========
 * 估算只负责预填输入框；computePayslip 始终以输入框金额为唯一事实源。
 */

/** 四险一金个人缴纳比例（缴费基数默认 = 税前；各城市有基数上下限，超限以工资条为准）。 */
export type EstimateRatios = {
  pension: number
  medicalIns: number
  unemploymentIns: number
  housingFund: number
}

export const DEFAULT_ESTIMATE_RATIOS: EstimateRatios = {
  pension: 0.08,
  medicalIns: 0.02,
  unemploymentIns: 0.005,
  housingFund: 0.12,
}

/** 公积金比例可选档位（整数百分比），默认 12%。 */
export const HOUSING_FUND_RATIO_OPTIONS = [0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11, 0.12] as const

/**
 * 月度个税预扣近似（全国统一速算扣除表）。
 * 口径必须随结果展示：按月度预扣近似；实际为累计预扣，年中各月会有差异，以工资条为准。
 */
export function estimateMonthlyTax(gross: number, socialAndFundTotal: number, extraDeduction = 0): number {
  const taxable = Math.max(0, clean(gross) - 5000 - clean(socialAndFundTotal) - clean(extraDeduction))
  if (taxable <= 0) return 0
  const brackets: Array<[number, number, number]> = [
    [3000, 0.03, 0],
    [12000, 0.10, 210],
    [25000, 0.20, 1410],
    [35000, 0.25, 2660],
    [55000, 0.30, 4410],
    [80000, 0.35, 7160],
    [Infinity, 0.45, 15160],
  ]
  const [, rate, quickDeduction] = brackets.find(([ceiling]) => taxable <= ceiling)!
  return Math.round(taxable * rate - quickDeduction)
}

/** 按通用比例估算一期扣缴。专项附加扣除只影响个税，不是工资条上的扣缴行。 */
export function estimateDeductions(
  gross: number,
  ratios: EstimateRatios = DEFAULT_ESTIMATE_RATIOS,
  extraDeduction = 0,
): PayslipPeriodInput {
  const base = clean(gross)
  const pension = Math.round(base * ratios.pension)
  const medicalIns = Math.round(base * ratios.medicalIns)
  const unemploymentIns = Math.round(base * ratios.unemploymentIns)
  const housingFund = Math.round(base * ratios.housingFund)
  // 个税基于取整后的扣缴合计，保证与用户在输入框里看到的数字自洽。
  const incomeTax = estimateMonthlyTax(base, pension + medicalIns + unemploymentIns + housingFund, extraDeduction)
  return { gross: base, incomeTax, pension, medicalIns, unemploymentIns, housingFund, otherDeduction: 0 }
}

/**
 * 从当前期真实扣缴反推个人实际费率（零城市假设，全部用用户自己的数据）。
 * 当前期税前 ≤ 0 时无从反推，返回 null。
 */
export function deriveEffectiveRates(current: PayslipPeriodInput): EstimateRatios | null {
  const base = clean(current.gross)
  if (base <= 0) return null
  return {
    pension: clean(current.pension) / base,
    medicalIns: clean(current.medicalIns) / base,
    unemploymentIns: clean(current.unemploymentIns) / base,
    housingFund: clean(current.housingFund) / base,
  }
}

/**
 * 下一阶段"按当前比例推算"：四险一金按当前实际费率缩放；
 * 个税是累进的，不缩放，用月度公式对下一期重算；其他扣缴沿用当前期金额。
 */
export function estimateNextFromCurrent(
  current: PayslipPeriodInput,
  nextGross: number,
  extraDeduction = 0,
): PayslipPeriodInput | null {
  const rates = deriveEffectiveRates(current)
  if (!rates) return null
  const estimated = estimateDeductions(nextGross, rates, extraDeduction)
  const otherDeduction = clean(current.otherDeduction)
  return {
    ...estimated,
    // estimateDeductions 的个税没算"其他扣缴"，这里沿用后个税不变：
    // 其他扣缴（如企业年金）是否税前扣除因项而异，统一不进个税估算，以工资条为准。
    otherDeduction,
  }
}

/** 示例工资条：由估算引擎按税前 10000 → 11000 生成，与公式自洽（无魔法数字）。 */
function makeExamplePayslip(): PayslipInput {
  const current = estimateDeductions(10000)
  const next = estimateNextFromCurrent(current, 11000)!
  return { current, next }
}

export const EXAMPLE_PAYSLIP: PayslipInput = makeExamplePayslip()

export const EMPTY_PAYSLIP: PayslipInput = {
  current: { gross: 0, incomeTax: 0, pension: 0, medicalIns: 0, unemploymentIns: 0, housingFund: 0, otherDeduction: 0 },
  next: { gross: 0, incomeTax: 0, pension: 0, medicalIns: 0, unemploymentIns: 0, housingFund: 0, otherDeduction: 0 },
}
