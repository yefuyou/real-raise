import type { SpendingCategory } from './official2025'

export type ShanghaiCpiCategory = SpendingCategory | 'overall'

export type ShanghaiCpiRow = {
  cityCode: '310000'
  cityName: '上海'
  period: '2026H1' | '202606'
  category: ShanghaiCpiCategory
  label: string
  yoyRate: number
  sourceName: string
  sourceUrl: string
}

const sourceName = '上海市统计局：2026 年 6 月居民消费价格'
const sourceUrl = 'https://tjj.sh.gov.cn/sjxx/20260710/44c96140acff4d889c7dc1cb5f13d4f0.html'

/** 1—6 月平均只公开到综合 CPI，不能向八类拆分。 */
export const SHANGHAI_2026_H1_CPI: ShanghaiCpiRow[] = [
  {
    cityCode: '310000',
    cityName: '上海',
    period: '2026H1',
    category: 'overall',
    label: '居民消费价格总水平',
    yoyRate: 0.8,
    sourceName,
    sourceUrl,
  },
]

/** 2026 年 6 月八类同比；这是月度样本，不得标为 2026H1。 */
export const SHANGHAI_202606_CPI: ShanghaiCpiRow[] = [
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'overall', label: '居民消费价格总指数', yoyRate: 1.0, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'foodAndTobaccoAlcohol', label: '食品烟酒及在外餐饮', yoyRate: -0.6, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'clothing', label: '衣着', yoyRate: 1.4, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'housing', label: '居住（宏观参照）', yoyRate: 0.4, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'household', label: '生活用品及服务', yoyRate: 2.1, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'transportCommunication', label: '交通通信', yoyRate: 3.8, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'educationCultureEntertainment', label: '教育文化娱乐', yoyRate: 3.1, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'medical', label: '医疗保健', yoyRate: -1.2, sourceName, sourceUrl },
  { cityCode: '310000', cityName: '上海', period: '202606', category: 'other', label: '其他用品及服务', yoyRate: 7.7, sourceName, sourceUrl },
]
