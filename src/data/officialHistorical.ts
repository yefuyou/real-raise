/**
 * 2021–2025 年国家统计局官方历史公开数据集（精准校正版）。
 * 来源与数值按规范规范对齐：
 * 1. 来源 URL 统一采用已核验的 canonical 页面地址。
 * 2. 补齐并校正 2021–2025 年全国、城镇、农村收支总量及增长率。
 * 3. 校正 CPI 年度同比数据。
 * 4. 2021–2023 城镇八类支出采用官方表 2 精确值；2024 城镇八类因未核验官方 Excel 予以删除。
 */

import type { SpendingCategory } from './official2025'

export interface HistoricalIncomeRecord {
  year: number
  scope: 'national' | 'urban' | 'rural'
  disposableIncome: number
  disposableIncomeNominalGrowthPercent: number | null
  disposableIncomeRealGrowthPercent: number | null
  disposableIncomeMedian: number | null
  consumptionExpenditure: number
  consumptionExpenditureNominalGrowthPercent: number | null
  sourceUrl: string
}

export interface HistoricalCpiRecord {
  year: number
  category: SpendingCategory | 'overall'
  label: string
  annualYoYPercent: number
  scope: 'national'
  sourceUrl: string
}

export interface HistoricalSpendingRecord {
  year: number
  category: SpendingCategory
  label: string
  annualAmount: number
  scope: 'national' | 'urban'
  sourceUrl: string
}

const URL_2021_INCOME = 'https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901342.html'
const URL_2021_CPI = 'https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901328.html'

const URL_2022_INCOME = 'https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901715.html'
const URL_2022_CPI = 'https://www.stats.gov.cn/sj/zxfb/202302/t20230203_1901703.html'

const URL_2023_INCOME = 'https://www.stats.gov.cn/sj/zxfb/202401/t20240116_1946622.html'
const URL_2023_CPI = 'https://www.stats.gov.cn/sj/zxfb/202401/t20240112_1946465.html'

const URL_2024_INCOME = 'https://www.stats.gov.cn/sj/zxfb/202501/t20250117_1958325.html'
const URL_2024_CPI = 'https://www.stats.gov.cn/sj/zxfb/202501/t20250109_1958170.html'

const URL_2025_INCOME = 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html'
const URL_2025_CPI = 'https://www.stats.gov.cn/sj/zxfb/202601/t20260109_1962273.html'

/** 2021–2025 年全国、城镇、农村居民收支与中位数记录（单位：元/人/年） */
export const HISTORICAL_INCOME_BENCHMARKS: HistoricalIncomeRecord[] = [
  // 2021
  {
    year: 2021,
    scope: 'national',
    disposableIncome: 35128,
    disposableIncomeNominalGrowthPercent: 9.1,
    disposableIncomeRealGrowthPercent: 8.1,
    disposableIncomeMedian: 29975,
    consumptionExpenditure: 24100,
    consumptionExpenditureNominalGrowthPercent: 13.6,
    sourceUrl: URL_2021_INCOME,
  },
  {
    year: 2021,
    scope: 'urban',
    disposableIncome: 47412,
    disposableIncomeNominalGrowthPercent: 8.2,
    disposableIncomeRealGrowthPercent: 7.1,
    disposableIncomeMedian: 43504,
    consumptionExpenditure: 30307,
    consumptionExpenditureNominalGrowthPercent: 12.2,
    sourceUrl: URL_2021_INCOME,
  },
  {
    year: 2021,
    scope: 'rural',
    disposableIncome: 18931,
    disposableIncomeNominalGrowthPercent: 10.5,
    disposableIncomeRealGrowthPercent: 9.7,
    disposableIncomeMedian: 16902,
    consumptionExpenditure: 15916,
    consumptionExpenditureNominalGrowthPercent: 16.1,
    sourceUrl: URL_2021_INCOME,
  },
  // 2022
  {
    year: 2022,
    scope: 'national',
    disposableIncome: 36883,
    disposableIncomeNominalGrowthPercent: 5.0,
    disposableIncomeRealGrowthPercent: 2.9,
    disposableIncomeMedian: 31370,
    consumptionExpenditure: 24538,
    consumptionExpenditureNominalGrowthPercent: 1.8,
    sourceUrl: URL_2022_INCOME,
  },
  {
    year: 2022,
    scope: 'urban',
    disposableIncome: 49283,
    disposableIncomeNominalGrowthPercent: 3.9,
    disposableIncomeRealGrowthPercent: 1.9,
    disposableIncomeMedian: 45123,
    consumptionExpenditure: 30391, // 校正为 30391
    consumptionExpenditureNominalGrowthPercent: 0.3,
    sourceUrl: URL_2022_INCOME,
  },
  {
    year: 2022,
    scope: 'rural',
    disposableIncome: 20133,
    disposableIncomeNominalGrowthPercent: 6.3,
    disposableIncomeRealGrowthPercent: 4.2,
    disposableIncomeMedian: 17734,
    consumptionExpenditure: 16632,
    consumptionExpenditureNominalGrowthPercent: 4.5,
    sourceUrl: URL_2022_INCOME,
  },
  // 2023
  {
    year: 2023,
    scope: 'national',
    disposableIncome: 39218,
    disposableIncomeNominalGrowthPercent: 6.3,
    disposableIncomeRealGrowthPercent: 6.1,
    disposableIncomeMedian: 33036,
    consumptionExpenditure: 26796,
    consumptionExpenditureNominalGrowthPercent: 9.2,
    sourceUrl: URL_2023_INCOME,
  },
  {
    year: 2023,
    scope: 'urban',
    disposableIncome: 51821,
    disposableIncomeNominalGrowthPercent: 5.1,
    disposableIncomeRealGrowthPercent: 4.8,
    disposableIncomeMedian: 47122,
    consumptionExpenditure: 32994, // 校正为 32994
    consumptionExpenditureNominalGrowthPercent: 8.6,
    sourceUrl: URL_2023_INCOME,
  },
  {
    year: 2023,
    scope: 'rural',
    disposableIncome: 21691,
    disposableIncomeNominalGrowthPercent: 7.7,
    disposableIncomeRealGrowthPercent: 7.6,
    disposableIncomeMedian: 18748,
    consumptionExpenditure: 18175,
    consumptionExpenditureNominalGrowthPercent: 9.3,
    sourceUrl: URL_2023_INCOME,
  },
  // 2024
  {
    year: 2024,
    scope: 'national',
    disposableIncome: 41314,
    disposableIncomeNominalGrowthPercent: 5.3,
    disposableIncomeRealGrowthPercent: 5.1,
    disposableIncomeMedian: 34707,
    consumptionExpenditure: 28227,
    consumptionExpenditureNominalGrowthPercent: 5.3,
    sourceUrl: URL_2024_INCOME,
  },
  {
    year: 2024,
    scope: 'urban',
    disposableIncome: 54188,
    disposableIncomeNominalGrowthPercent: 4.6,
    disposableIncomeRealGrowthPercent: 4.4,
    disposableIncomeMedian: 49302,
    consumptionExpenditure: 34557, // 校正为 34557
    consumptionExpenditureNominalGrowthPercent: 5.2,
    sourceUrl: URL_2024_INCOME,
  },
  {
    year: 2024,
    scope: 'rural',
    disposableIncome: 23119,
    disposableIncomeNominalGrowthPercent: 6.6,
    disposableIncomeRealGrowthPercent: 6.3,
    disposableIncomeMedian: 19605,
    consumptionExpenditure: 19280,
    consumptionExpenditureNominalGrowthPercent: 6.1,
    sourceUrl: URL_2024_INCOME,
  },
  // 2025
  {
    year: 2025,
    scope: 'national',
    disposableIncome: 43377,
    disposableIncomeNominalGrowthPercent: 5.0,
    disposableIncomeRealGrowthPercent: 5.0,
    disposableIncomeMedian: 36231,
    consumptionExpenditure: 29476,
    consumptionExpenditureNominalGrowthPercent: 4.4,
    sourceUrl: URL_2025_INCOME,
  },
  {
    year: 2025,
    scope: 'urban',
    disposableIncome: 56502,
    disposableIncomeNominalGrowthPercent: 4.3,
    disposableIncomeRealGrowthPercent: 4.2,
    disposableIncomeMedian: 51115,
    consumptionExpenditure: 35869,
    consumptionExpenditureNominalGrowthPercent: 3.8,
    sourceUrl: URL_2025_INCOME,
  },
  {
    year: 2025,
    scope: 'rural',
    disposableIncome: 24456,
    disposableIncomeNominalGrowthPercent: 5.8,
    disposableIncomeRealGrowthPercent: 6.0, // 校正实际增速为 6.0%
    disposableIncomeMedian: null,
    consumptionExpenditure: 20259,
    consumptionExpenditureNominalGrowthPercent: 5.1,
    sourceUrl: URL_2025_INCOME,
  },
]

/** 2021–2025 年全国八类及总体 CPI 年度同比数据 (%) */
export const HISTORICAL_CPI: HistoricalCpiRecord[] = [
  // 2021
  { year: 2021, category: 'overall', label: 'CPI 居民消费价格总水平', annualYoYPercent: 0.9, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: -0.3, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'clothing', label: '衣着', annualYoYPercent: 0.3, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'housing', label: '居住', annualYoYPercent: 0.8, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'household', label: '生活用品及服务', annualYoYPercent: 0.4, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'transportCommunication', label: '交通通信', annualYoYPercent: 4.1, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 1.9, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'medical', label: '医疗保健', annualYoYPercent: 0.4, scope: 'national', sourceUrl: URL_2021_CPI },
  { year: 2021, category: 'other', label: '其他用品及服务', annualYoYPercent: -1.3, scope: 'national', sourceUrl: URL_2021_CPI },

  // 2022
  { year: 2022, category: 'overall', label: 'CPI 居民消费价格总水平', annualYoYPercent: 2.0, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: 2.4, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'clothing', label: '衣着', annualYoYPercent: 0.5, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'housing', label: '居住', annualYoYPercent: 0.7, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'household', label: '生活用品及服务', annualYoYPercent: 1.2, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'transportCommunication', label: '交通通信', annualYoYPercent: 5.2, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 1.8, scope: 'national', sourceUrl: URL_2022_CPI }, // 校正为 1.8
  { year: 2022, category: 'medical', label: '医疗保健', annualYoYPercent: 0.6, scope: 'national', sourceUrl: URL_2022_CPI },
  { year: 2022, category: 'other', label: '其他用品及服务', annualYoYPercent: 1.6, scope: 'national', sourceUrl: URL_2022_CPI },

  // 2023
  { year: 2023, category: 'overall', label: 'CPI 居民消费价格总水平', annualYoYPercent: 0.2, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: 0.3, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'clothing', label: '衣着', annualYoYPercent: 1.0, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'housing', label: '居住', annualYoYPercent: 0.0, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'household', label: '生活用品及服务', annualYoYPercent: 0.1, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'transportCommunication', label: '交通通信', annualYoYPercent: -2.3, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 2.0, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'medical', label: '医疗保健', annualYoYPercent: 1.1, scope: 'national', sourceUrl: URL_2023_CPI },
  { year: 2023, category: 'other', label: '其他用品及服务', annualYoYPercent: 3.2, scope: 'national', sourceUrl: URL_2023_CPI },

  // 2024
  { year: 2024, category: 'overall', label: 'CPI 居民消费价格总水平', annualYoYPercent: 0.2, scope: 'national', sourceUrl: URL_2024_CPI },
  { year: 2024, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: -0.1, scope: 'national', sourceUrl: URL_2024_CPI }, // 校正为 -0.1
  { year: 2024, category: 'clothing', label: '衣着', annualYoYPercent: 1.4, scope: 'national', sourceUrl: URL_2024_CPI },
  { year: 2024, category: 'housing', label: '居住', annualYoYPercent: 0.1, scope: 'national', sourceUrl: URL_2024_CPI },
  { year: 2024, category: 'household', label: '生活用品及服务', annualYoYPercent: 0.5, scope: 'national', sourceUrl: URL_2024_CPI }, // 校正为 0.5
  { year: 2024, category: 'transportCommunication', label: '交通通信', annualYoYPercent: -1.9, scope: 'national', sourceUrl: URL_2024_CPI }, // 校正为 -1.9
  { year: 2024, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 1.5, scope: 'national', sourceUrl: URL_2024_CPI },
  { year: 2024, category: 'medical', label: '医疗保健', annualYoYPercent: 1.3, scope: 'national', sourceUrl: URL_2024_CPI },
  { year: 2024, category: 'other', label: '其他用品及服务', annualYoYPercent: 3.8, scope: 'national', sourceUrl: URL_2024_CPI },

  // 2025
  { year: 2025, category: 'overall', label: 'CPI 居民消费价格总水平', annualYoYPercent: 0.0, scope: 'national', sourceUrl: URL_2025_CPI }, // 校正为 0.0
  { year: 2025, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualYoYPercent: -0.7, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'clothing', label: '衣着', annualYoYPercent: 1.5, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'housing', label: '居住', annualYoYPercent: 0.1, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'household', label: '生活用品及服务', annualYoYPercent: 0.9, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'transportCommunication', label: '交通通信', annualYoYPercent: -2.6, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualYoYPercent: 0.8, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'medical', label: '医疗保健', annualYoYPercent: 0.8, scope: 'national', sourceUrl: URL_2025_CPI },
  { year: 2025, category: 'other', label: '其他用品及服务', annualYoYPercent: 9.3, scope: 'national', sourceUrl: URL_2025_CPI },
]

/** 2021–2025 年全国居民及城镇居民八大类人均消费支出金额（单位：元/人/年） */
export const HISTORICAL_SPENDING: HistoricalSpendingRecord[] = [
  // --- 全国口径 (National Scope) ---
  // 2021
  { year: 2021, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 7178, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'clothing', label: '衣着', annualAmount: 1419, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'housing', label: '居住', annualAmount: 5641, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'household', label: '生活用品及服务', annualAmount: 1423, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'transportCommunication', label: '交通通信', annualAmount: 3156, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 2599, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'medical', label: '医疗保健', annualAmount: 2115, scope: 'national', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'other', label: '其他用品及服务', annualAmount: 569, scope: 'national', sourceUrl: URL_2021_INCOME },

  // 2022
  { year: 2022, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 7481, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'clothing', label: '衣着', annualAmount: 1365, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'housing', label: '居住', annualAmount: 5882, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'household', label: '生活用品及服务', annualAmount: 1432, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'transportCommunication', label: '交通通信', annualAmount: 3195, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 2469, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'medical', label: '医疗保健', annualAmount: 2120, scope: 'national', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'other', label: '其他用品及服务', annualAmount: 595, scope: 'national', sourceUrl: URL_2022_INCOME },

  // 2023
  { year: 2023, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 7983, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'clothing', label: '衣着', annualAmount: 1479, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'housing', label: '居住', annualAmount: 6095, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'household', label: '生活用品及服务', annualAmount: 1526, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'transportCommunication', label: '交通通信', annualAmount: 3652, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 2904, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'medical', label: '医疗保健', annualAmount: 2460, scope: 'national', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'other', label: '其他用品及服务', annualAmount: 697, scope: 'national', sourceUrl: URL_2023_INCOME },

  // 2024
  { year: 2024, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 8411, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'clothing', label: '衣着', annualAmount: 1521, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'housing', label: '居住', annualAmount: 6263, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'household', label: '生活用品及服务', annualAmount: 1547, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'transportCommunication', label: '交通通信', annualAmount: 3976, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 3189, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'medical', label: '医疗保健', annualAmount: 2547, scope: 'national', sourceUrl: URL_2024_INCOME },
  { year: 2024, category: 'other', label: '其他用品及服务', annualAmount: 773, scope: 'national', sourceUrl: URL_2024_INCOME },

  // 2025
  { year: 2025, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 8631, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'clothing', label: '衣着', annualAmount: 1554, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'housing', label: '居住', annualAmount: 6397, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'household', label: '生活用品及服务', annualAmount: 1667, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'transportCommunication', label: '交通通信', annualAmount: 4306, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 3489, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'medical', label: '医疗保健', annualAmount: 2573, scope: 'national', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'other', label: '其他用品及服务', annualAmount: 859, scope: 'national', sourceUrl: URL_2025_INCOME },

  // --- 城镇口径 (Urban Scope) ---
  // 2021 官方表 2 精确值
  { year: 2021, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 8678, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'clothing', label: '衣着', annualAmount: 1843, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'housing', label: '居住', annualAmount: 7405, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'household', label: '生活用品及服务', annualAmount: 1820, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'transportCommunication', label: '交通通信', annualAmount: 3932, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 3322, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'medical', label: '医疗保健', annualAmount: 2521, scope: 'urban', sourceUrl: URL_2021_INCOME },
  { year: 2021, category: 'other', label: '其他用品及服务', annualAmount: 786, scope: 'urban', sourceUrl: URL_2021_INCOME },

  // 2022 官方表 2 精确值
  { year: 2022, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 8958, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'clothing', label: '衣着', annualAmount: 1735, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'housing', label: '居住', annualAmount: 7644, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'household', label: '生活用品及服务', annualAmount: 1800, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'transportCommunication', label: '交通通信', annualAmount: 3909, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 3050, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'medical', label: '医疗保健', annualAmount: 2481, scope: 'urban', sourceUrl: URL_2022_INCOME },
  { year: 2022, category: 'other', label: '其他用品及服务', annualAmount: 814, scope: 'urban', sourceUrl: URL_2022_INCOME },

  // 2023 官方表 2 精确值
  { year: 2023, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 9495, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'clothing', label: '衣着', annualAmount: 1880, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'housing', label: '居住', annualAmount: 7822, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'household', label: '生活用品及服务', annualAmount: 1910, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'transportCommunication', label: '交通通信', annualAmount: 4495, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 3589, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'medical', label: '医疗保健', annualAmount: 2850, scope: 'urban', sourceUrl: URL_2023_INCOME },
  { year: 2023, category: 'other', label: '其他用品及服务', annualAmount: 953, scope: 'urban', sourceUrl: URL_2023_INCOME },

  // 注：2024 城镇八类因无法从官方 Excel/表 2 核验，已按规则删除，严禁以推导值标注为官方值。

  // 2025 官方发布值
  { year: 2025, category: 'foodAndTobaccoAlcohol', label: '食品烟酒', annualAmount: 10155, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'clothing', label: '衣着', annualAmount: 1941, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'housing', label: '居住', annualAmount: 8095, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'household', label: '生活用品及服务', annualAmount: 2033, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'transportCommunication', label: '交通通信', annualAmount: 5251, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'educationCultureEntertainment', label: '教育文化娱乐', annualAmount: 4298, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'medical', label: '医疗保健', annualAmount: 2932, scope: 'urban', sourceUrl: URL_2025_INCOME },
  { year: 2025, category: 'other', label: '其他用品及服务', annualAmount: 1164, scope: 'urban', sourceUrl: URL_2025_INCOME },
]
