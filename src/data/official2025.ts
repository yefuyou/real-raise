/**
 * 2025 年官方公开数据的第一版本地基准。
 *
 * 数值来自国家统计局公开页面，金额单位为“元/人/年”，价格变化单位为“%”。
 * 这里不把官方“居住”类 CPI 当作个人住房支出预测；用户输入的固定支出始终优先。
 */

export type SpendingCategory =
  | 'foodAndTobaccoAlcohol'
  | 'clothing'
  | 'housing'
  | 'household'
  | 'transportCommunication'
  | 'educationCultureEntertainment'
  | 'medical'
  | 'other'

export type OfficialCpiRow = {
  category: SpendingCategory
  label: string
  annualYoYPercent: number
  scope: 'national'
  year: 2025
  sourceUrl: string
}

export type UrbanSpendingRow = {
  category: SpendingCategory
  label: string
  annualAmount: number
  annualGrowthPercent: number
  scope: 'urban'
  year: 2025
  sourceUrl: string
}

export type IncomeBenchmark = {
  scope: 'national' | 'urban'
  year: 2025
  disposableIncome: number
  disposableIncomeNominalGrowthPercent: number
  disposableIncomeRealGrowthPercent: number
  disposableIncomeMedian: number
  disposableIncomeMedianGrowthPercent: number
  consumptionExpenditure: number
  consumptionExpenditureNominalGrowthPercent: number
  consumptionExpenditureRealGrowthPercent: number
  sourceUrl: string
}

const incomeAndSpendingSource = 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html'
const cpiSource = 'https://www.stats.gov.cn/sj/zxfb/202601/t20260109_1962273.html'

export const OFFICIAL_2025_CPI: OfficialCpiRow[] = [
  { category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: -0.7, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'clothing', label: '衣着', annualYoYPercent: 1.5, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'housing', label: '居住（宏观基准）', annualYoYPercent: 0.1, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'household', label: '生活用品及服务', annualYoYPercent: 0.9, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'transportCommunication', label: '交通通信', annualYoYPercent: -2.6, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 0.8, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'medical', label: '医疗保健', annualYoYPercent: 0.8, scope: 'national', year: 2025, sourceUrl: cpiSource },
  { category: 'other', label: '其他用品及服务', annualYoYPercent: 9.3, scope: 'national', year: 2025, sourceUrl: cpiSource },
]

export const OFFICIAL_2025_URBAN_SPENDING: UrbanSpendingRow[] = [
  { category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 10155, annualGrowthPercent: 2.0, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'clothing', label: '衣着', annualAmount: 1941, annualGrowthPercent: 1.5, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'housing', label: '居住', annualAmount: 8095, annualGrowthPercent: 1.1, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'household', label: '生活用品及服务', annualAmount: 2033, annualGrowthPercent: 6.8, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'transportCommunication', label: '交通通信', annualAmount: 5251, annualGrowthPercent: 7.7, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 4298, annualGrowthPercent: 9.4, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'medical', label: '医疗保健', annualAmount: 2932, annualGrowthPercent: 0.2, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
  { category: 'other', label: '其他用品及服务', annualAmount: 1164, annualGrowthPercent: 11.1, scope: 'urban', year: 2025, sourceUrl: incomeAndSpendingSource },
]

export const OFFICIAL_2025_INCOME_BENCHMARKS: IncomeBenchmark[] = [
  {
    scope: 'national',
    year: 2025,
    disposableIncome: 43377,
    disposableIncomeNominalGrowthPercent: 5.0,
    disposableIncomeRealGrowthPercent: 5.0,
    disposableIncomeMedian: 36231,
    disposableIncomeMedianGrowthPercent: 4.4,
    consumptionExpenditure: 29476,
    consumptionExpenditureNominalGrowthPercent: 4.4,
    consumptionExpenditureRealGrowthPercent: 4.4,
    sourceUrl: incomeAndSpendingSource,
  },
  {
    scope: 'urban',
    year: 2025,
    disposableIncome: 56502,
    disposableIncomeNominalGrowthPercent: 4.3,
    disposableIncomeRealGrowthPercent: 4.2,
    disposableIncomeMedian: 51115,
    disposableIncomeMedianGrowthPercent: 3.7,
    consumptionExpenditure: 35869,
    consumptionExpenditureNominalGrowthPercent: 3.8,
    consumptionExpenditureRealGrowthPercent: 3.7,
    sourceUrl: incomeAndSpendingSource,
  },
]

/**
 * Derived benchmark for the current single “other spending” input.
 * It applies national CPI category changes to the 2025 urban spending mix,
 * excluding housing because the app receives the user's fixed housing cost separately.
 */
export function deriveNonRentInflationRate(): number {
  const cpiByCategory = new Map(OFFICIAL_2025_CPI.map((row) => [row.category, row.annualYoYPercent]))
  const nonRentRows = OFFICIAL_2025_URBAN_SPENDING.filter((row) => row.category !== 'housing')
  const totalWeight = nonRentRows.reduce((sum, row) => sum + row.annualAmount, 0)
  const weightedPercent = nonRentRows.reduce((sum, row) => {
    return sum + row.annualAmount * (cpiByCategory.get(row.category) ?? 0)
  }, 0) / totalWeight

  return weightedPercent / 100
}

export const OFFICIAL_2025_DERIVED_NON_RENT_INFLATION_RATE = deriveNonRentInflationRate()

export const OFFICIAL_2025_DATA_NOTES = {
  sourceYear: 2025,
  sourceScope: '全国 CPI + 城镇居民消费结构',
  derivedRateMeaning: '将全国 CPI 八大类年度涨跌幅按 2025 年城镇居民消费金额加权，并排除居住类；不是用户个人实际生活成本涨幅。',
  rentRule: '用户输入的固定住房支出优先；官方居住类 CPI 只作宏观参考。',
} as const
