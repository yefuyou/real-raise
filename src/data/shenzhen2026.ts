import type { SpendingCategory } from './official2025'

export type ShenzhenCpiCategory = SpendingCategory | 'overall'

export type ShenzhenCpiRow = {
  cityCode: '440300'
  cityName: '深圳'
  period: '2026H1'
  category: ShenzhenCpiCategory
  label: string
  yoyRate: number
  sourceName: string
  sourceUrl: string
}

const sourceName = '深圳市统计局：2026 年 6 月国民经济核算资料（国家统计局深圳调查队）'
const sourceUrl = 'https://tjj.sz.gov.cn/attachment/1/1216/1216381/10010079.pdf'

export const SHENZHEN_2026_H1_CPI: ShenzhenCpiRow[] = [
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'overall', label: '居民消费价格总水平', yoyRate: 2.3, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'foodAndTobaccoAlcohol', label: '食品烟酒及在外餐饮', yoyRate: 2.4, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'clothing', label: '衣着', yoyRate: 0.8, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'housing', label: '居住（宏观参照）', yoyRate: 0.6, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'household', label: '生活用品及服务', yoyRate: 1.5, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'transportCommunication', label: '交通通信', yoyRate: 6.8, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'educationCultureEntertainment', label: '教育文化娱乐', yoyRate: 3.6, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'medical', label: '医疗保健', yoyRate: 0.1, sourceName, sourceUrl },
  { cityCode: '440300', cityName: '深圳', period: '2026H1', category: 'other', label: '其他用品及服务', yoyRate: 1.7, sourceName, sourceUrl },
]
