import type { SpendingCategory } from './official2025'
import { OFFICIAL_2025_URBAN_SPENDING } from './official2025'

/**
 * 2026 年上半年国家统计局已经公布的 CPI 同比数据。
 *
 * 这里记录的是“观察到的基准”，不是对下半年或 2027 年的官方预测。
 * 下一阶段的个人支出变化仍允许用户手动调整。
 */
export type Official2026H1CpiRow = {
  category: SpendingCategory
  label: string
  halfYearYoYPercent: number
  scope: 'national'
  period: '2026H1'
  sourceUrl: string
}

const cpiSource = 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260709_1964084.html'

export const OFFICIAL_2026_H1_CPI: Official2026H1CpiRow[] = [
  { category: 'foodAndTobaccoAlcohol', label: '食品烟酒及在外餐饮', halfYearYoYPercent: -0.2, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'clothing', label: '衣着', halfYearYoYPercent: 1.6, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'housing', label: '居住（宏观基准）', halfYearYoYPercent: -0.2, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'household', label: '生活用品及服务', halfYearYoYPercent: 1.9, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'transportCommunication', label: '交通通信', halfYearYoYPercent: 1.8, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'educationCultureEntertainment', label: '教育文化娱乐', halfYearYoYPercent: 1.2, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'medical', label: '医疗保健', halfYearYoYPercent: 2.0, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
  { category: 'other', label: '其他用品及服务', halfYearYoYPercent: 11.6, scope: 'national', period: '2026H1', sourceUrl: cpiSource },
]

/**
 * 用 2025 年城镇居民八类消费金额作为权重，派生一个日常支出基准。
 * 居住类被排除，因为住房支出在产品中单独输入；这不是个人预测。
 */
export function derive2026H1EverydayInflationRate(): number {
  const cpiByCategory = new Map(OFFICIAL_2026_H1_CPI.map((row) => [row.category, row.halfYearYoYPercent]))
  const everydayRows = OFFICIAL_2025_URBAN_SPENDING.filter((row) => row.category !== 'housing')
  const totalWeight = everydayRows.reduce((sum, row) => sum + row.annualAmount, 0)
  const weightedPercent = everydayRows.reduce((sum, row) => {
    return sum + row.annualAmount * (cpiByCategory.get(row.category) ?? 0)
  }, 0) / totalWeight

  return weightedPercent / 100
}

export const OFFICIAL_2026_H1_DERIVED_EVERYDAY_INFLATION_RATE = derive2026H1EverydayInflationRate()

export const OFFICIAL_2026_DATA_NOTES = {
  sourcePeriod: '2026H1',
  sourceScope: '全国居民消费价格八大类 1—6 月同比涨跌幅',
  observedBaselineMeaning: '已公布的 2026 年上半年观察值；用于下一阶段情景的起始基准，不代表全年或下一年度官方预测。',
  housingRule: '住房支出由用户单独输入；官方居住类 CPI 只作为宏观背景，不替代个人住房支出。',
} as const
