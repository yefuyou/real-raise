/**
 * 合肥 2024 年城市 CPI 分类样本。
 *
 * 这是“上年=100”的官方指数，不是 2026H1 预测值；需要同比百分比时使用
 * `value - 100`。住房项只用于城市价格背景，不覆盖用户实际住房支出。
 */
export type HefeiCpiCategory =
  | 'overall'
  | 'food'
  | 'clothing'
  | 'housing'
  | 'household'
  | 'transportCommunication'
  | 'educationCultureEntertainment'
  | 'medical'
  | 'other'

export type HefeiCpiRow = {
  cityCode: '340100'
  cityName: '合肥'
  period: '2024'
  category: HefeiCpiCategory
  label: string
  indexBase: 'yoy=100'
  value: number
  yoyRate: number
  coverage: 'city-category'
  coverageTier: 'A-history'
  sourceName: string
  sourceUrl: string
}

export const HEFEI_2024_CPI_SOURCE = {
  sourceName: '广州统计年鉴 2025：2024 年全国 36 个大中城市居民消费价格指数',
  sourceUrl:
    'https://tjj.gz.gov.cn/datav/admin/home/www_nj/2025/pdfs/7-8%20%20%E5%85%A8%E5%9B%BD36%E5%A4%A7%E4%B8%AD%E5%9F%8E%E5%B8%82%E5%B1%85%E6%B0%91%E6%B6%88%E8%B4%B9%E4%BB%B7%E6%A0%BC%E6%8C%87%E6%95%B0%28%E4%B8%8A%E5%B9%B4%3D100%EF%BC%8C2024%E5%B9%B4%29.pdf',
} as const

const rows: Array<{ category: HefeiCpiCategory; label: string; value: number }> = [
  { category: 'overall', label: '居民消费价格总指数', value: 100.4 },
  { category: 'food', label: '食品烟酒', value: 100.6 },
  { category: 'clothing', label: '衣着', value: 101.8 },
  { category: 'housing', label: '居住（宏观参照）', value: 100.3 },
  { category: 'household', label: '生活用品及服务', value: 99.9 },
  { category: 'transportCommunication', label: '交通通信', value: 97.9 },
  { category: 'educationCultureEntertainment', label: '教育文化娱乐', value: 101.0 },
  { category: 'medical', label: '医疗保健', value: 101.4 },
  { category: 'other', label: '其他用品及服务', value: 103.9 },
]

export const HEFEI_2024_CPI: HefeiCpiRow[] = rows.map((row) => ({
  ...row,
  cityCode: '340100',
  cityName: '合肥',
  period: '2024',
  indexBase: 'yoy=100',
  yoyRate: Number((row.value - 100).toFixed(1)),
  coverage: 'city-category',
  coverageTier: 'A-history',
  ...HEFEI_2024_CPI_SOURCE,
}))
