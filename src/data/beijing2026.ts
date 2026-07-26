import type { SpendingCategory } from './official2025'

export type BeijingCpiCategory = SpendingCategory | 'overall'

export type BeijingCpiRow = {
  cityCode: '110000'
  cityName: '北京'
  period: '2026H1'
  category: BeijingCpiCategory
  label: string
  yoyRate: number
  sourceName: string
  sourceUrl: string
}

const sourceName = '国家统计局北京调查总队：2026 年上半年北京 CPI 运行情况'
const sourceUrl = 'https://tjj.beijing.gov.cn/tjsj_31433/sjjd_31444/202607/t20260720_4770961.html'

export const BEIJING_2026_H1_CPI: BeijingCpiRow[] = [
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'overall', label: '居民消费价格总水平', yoyRate: 0.7, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'foodAndTobaccoAlcohol', label: '食品烟酒及在外餐饮', yoyRate: -0.8, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'clothing', label: '衣着', yoyRate: 1.1, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'housing', label: '居住（宏观参照）', yoyRate: -0.4, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'household', label: '生活用品及服务', yoyRate: 2.3, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'transportCommunication', label: '交通通信', yoyRate: 2.1, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'educationCultureEntertainment', label: '教育文化娱乐', yoyRate: 1.4, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'medical', label: '医疗保健', yoyRate: 0.4, sourceName, sourceUrl },
  { cityCode: '110000', cityName: '北京', period: '2026H1', category: 'other', label: '其他用品及服务', yoyRate: 11.3, sourceName, sourceUrl },
]
