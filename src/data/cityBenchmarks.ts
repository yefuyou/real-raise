import type { SpendingCategory } from './official2025'
import { OFFICIAL_2026_H1_CPI } from './official2026'
import { HEFEI_2024_CPI, type HefeiCpiCategory } from './hefei2024'
import { SHANGHAI_2026_H1_CPI, SHANGHAI_202606_CPI } from './shanghai2026'
import { BEIJING_2026_H1_CPI } from './beijing2026'
import { SHENZHEN_2026_H1_CPI } from './shenzhen2026'

/**
 * 城市基准的覆盖层级：
 * - A-history：城市有完整的历史分类样本，但不代表当前期；
 * - B-current：城市当前期有部分或完整的官方分类数据；
 * - C-fallback：当前期缺少城市分类数据，使用全国当前期基准。
 */
export type CityCoverageTier = 'A-history' | 'B-current' | 'C-fallback'

export type CityBenchmarkCategory = SpendingCategory | 'overall'

export type CityBenchmarkRecord = {
  cityCode: string
  cityName: string
  period: string
  category: CityBenchmarkCategory
  label: string
  indexBase: 'yoy=100'
  value: number
  yoyRate: number
  scope: 'city' | 'national'
  coverage: 'city-category' | 'city-overall' | 'national-fallback'
  coverageTier: CityCoverageTier
  sourceName: string
  sourceUrl: string
}

export type CityBenchmarkResolution = {
  requestedCityCode: string
  requestedCityName: string
  period: string
  category: CityBenchmarkCategory
  record: CityBenchmarkRecord | null
  usedFallback: boolean
  fallbackReason: string | null
}

export type CityBenchmarkSet = {
  cityCode: string
  cityName: string
  period: string
  records: CityBenchmarkResolution[]
  cityCategoryCount: number
  fallbackCategoryCount: number
  coverageTier: CityCoverageTier
  historicalRecords: CityBenchmarkRecord[]
}

export type CityDirectoryEntry = {
  cityCode: string
  cityName: string
  region: '华北' | '华东' | '华南' | '华中' | '西南' | '西北' | '东北'
  currentStatus: '待核验' | '部分覆盖' | '已覆盖'
  note: string
}

/**
 * 首批全国城市目录。目录不是数据集：没有核验过的城市不会被填入
 * CPI 数字，只会在解析时回退到全国基准。
 */
export const CITY_DIRECTORY: CityDirectoryEntry[] = [
  { cityCode: '110000', cityName: '北京', region: '华北', currentStatus: '已覆盖', note: '2026H1 综合 CPI 与八类已核验' },
  { cityCode: '310000', cityName: '上海', region: '华东', currentStatus: '部分覆盖', note: '2026H1 有综合 CPI；八类为 202606 月度样本' },
  { cityCode: '440100', cityName: '广州', region: '华南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '440300', cityName: '深圳', region: '华南', currentStatus: '已覆盖', note: '2026H1 综合 CPI 与八类已核验' },
  { cityCode: '120000', cityName: '天津', region: '华北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '500000', cityName: '重庆', region: '西南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '510100', cityName: '成都', region: '西南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '330100', cityName: '杭州', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '320100', cityName: '南京', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '420100', cityName: '武汉', region: '华中', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '610100', cityName: '西安', region: '西北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '320500', cityName: '苏州', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '330200', cityName: '宁波', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '370200', cityName: '青岛', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '370100', cityName: '济南', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '410100', cityName: '郑州', region: '华中', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '430100', cityName: '长沙', region: '华中', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '340100', cityName: '合肥', region: '华东', currentStatus: '部分覆盖', note: '已有 2024 年完整分类样本，2026H1 待核验' },
  { cityCode: '350100', cityName: '福州', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '350200', cityName: '厦门', region: '华东', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '530100', cityName: '昆明', region: '西南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '520100', cityName: '贵阳', region: '西南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '450100', cityName: '南宁', region: '华南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '460100', cityName: '海口', region: '华南', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '130100', cityName: '石家庄', region: '华北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '140100', cityName: '太原', region: '华北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '210100', cityName: '沈阳', region: '东北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '210200', cityName: '大连', region: '东北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '220100', cityName: '长春', region: '东北', currentStatus: '待核验', note: '等待城市分类原表核验' },
  { cityCode: '230100', cityName: '哈尔滨', region: '东北', currentStatus: '待核验', note: '等待城市分类原表核验' },
]

const CITY_NAME_BY_CODE = new Map(CITY_DIRECTORY.map((city) => [city.cityCode, city.cityName]))

const CATEGORY_LABELS: Record<CityBenchmarkCategory, string> = {
  overall: '居民消费价格总指数',
  foodAndTobaccoAlcohol: '食品烟酒及在外餐饮',
  clothing: '衣着',
  housing: '居住（宏观参照）',
  household: '生活用品及服务',
  transportCommunication: '交通通信',
  educationCultureEntertainment: '教育文化娱乐',
  medical: '医疗保健',
  other: '其他用品及服务',
}

const HEFEI_CATEGORY_MAP: Record<Exclude<HefeiCpiCategory, 'overall'>, SpendingCategory> = {
  food: 'foodAndTobaccoAlcohol',
  clothing: 'clothing',
  housing: 'housing',
  household: 'household',
  transportCommunication: 'transportCommunication',
  educationCultureEntertainment: 'educationCultureEntertainment',
  medical: 'medical',
  other: 'other',
}

const nationalSourceName = '国家统计局：2026 年上半年居民消费价格主要数据'

/** 当前全国基准，供城市缺项回退；不冒充城市原值。 */
export const NATIONAL_2026_H1_BENCHMARKS: CityBenchmarkRecord[] = [
  {
    cityCode: 'national',
    cityName: '全国',
    period: '2026H1',
    category: 'overall',
    label: '全国居民消费价格总水平',
    indexBase: 'yoy=100',
    value: 101,
    yoyRate: 1,
    scope: 'national',
    coverage: 'national-fallback',
    coverageTier: 'B-current',
    sourceName: nationalSourceName,
    sourceUrl: OFFICIAL_2026_H1_CPI[0].sourceUrl,
  },
  ...OFFICIAL_2026_H1_CPI.map((row): CityBenchmarkRecord => ({
    cityCode: 'national',
    cityName: '全国',
    period: row.period,
    category: row.category,
    label: row.label,
    indexBase: 'yoy=100',
    value: Number((100 + row.halfYearYoYPercent).toFixed(1)),
    yoyRate: row.halfYearYoYPercent,
    scope: 'national',
    coverage: 'national-fallback',
    coverageTier: 'B-current',
    sourceName: nationalSourceName,
    sourceUrl: row.sourceUrl,
  })),
]

/** 已核验的城市原值。后续城市扩展只应追加正式来源，不应在此处手填估算值。 */
export const CITY_BENCHMARK_RECORDS: CityBenchmarkRecord[] = [
  ...HEFEI_2024_CPI.map((row): CityBenchmarkRecord => ({
    cityCode: row.cityCode,
    cityName: row.cityName,
    period: row.period,
    category: row.category === 'overall' ? 'overall' : HEFEI_CATEGORY_MAP[row.category],
    label: row.label,
    indexBase: row.indexBase,
    value: row.value,
    yoyRate: row.yoyRate,
    scope: 'city' as const,
    coverage: row.category === 'overall' ? 'city-overall' as const : 'city-category' as const,
    coverageTier: row.coverageTier,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
  })),
  ...[...SHANGHAI_2026_H1_CPI, ...SHANGHAI_202606_CPI].map((row) => ({
    cityCode: row.cityCode,
    cityName: row.cityName,
    period: row.period,
    category: row.category,
    label: row.label,
    indexBase: 'yoy=100' as const,
    value: Number((100 + row.yoyRate).toFixed(1)),
    yoyRate: row.yoyRate,
    scope: 'city' as const,
    coverage: row.category === 'overall' ? 'city-overall' as const : 'city-category' as const,
    coverageTier: 'B-current' as const,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
  })),
  ...[...BEIJING_2026_H1_CPI, ...SHENZHEN_2026_H1_CPI].map((row): CityBenchmarkRecord => ({
    cityCode: row.cityCode,
    cityName: row.cityName,
    period: row.period,
    category: row.category,
    label: row.label,
    indexBase: 'yoy=100',
    value: Number((100 + row.yoyRate).toFixed(1)),
    yoyRate: row.yoyRate,
    scope: 'city',
    coverage: row.category === 'overall' ? 'city-overall' : 'city-category',
    coverageTier: 'B-current',
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
  })),
]

const TARGET_CATEGORIES: CityBenchmarkCategory[] = [
  'overall',
  'foodAndTobaccoAlcohol',
  'clothing',
  'housing',
  'household',
  'transportCommunication',
  'educationCultureEntertainment',
  'medical',
  'other',
]

function getCityName(cityCode: string): string {
  if (cityCode === 'national') return '全国'
  return CITY_NAME_BY_CODE.get(cityCode) ?? '未登记城市'
}

function getNationalRecord(period: string, category: CityBenchmarkCategory): CityBenchmarkRecord | null {
  return NATIONAL_2026_H1_BENCHMARKS.find((row) => row.period === period && row.category === category) ?? null
}

function toFallbackRecord(record: CityBenchmarkRecord, cityCode: string, cityName: string): CityBenchmarkRecord {
  return {
    ...record,
    cityCode,
    cityName,
    scope: 'national',
    coverage: 'national-fallback',
    coverageTier: 'C-fallback',
  }
}

/**
 * 按城市、期间和类别解析一条基准。精确城市值优先；缺失时才回退全国当前期。
 * 调用方可以据 `usedFallback` 直接展示诚实的覆盖提示。
 */
export function resolveCityBenchmark(
  cityCode: string,
  category: CityBenchmarkCategory,
  period = '2026H1',
): CityBenchmarkResolution {
  const cityName = getCityName(cityCode)
  const cityRecord = CITY_BENCHMARK_RECORDS.find(
    (row) => row.cityCode === cityCode && row.period === period && row.category === category,
  )

  if (cityRecord) {
    return {
      requestedCityCode: cityCode,
      requestedCityName: cityName,
      period,
      category,
      record: cityRecord,
      usedFallback: false,
      fallbackReason: null,
    }
  }

  // The national selector is the source baseline itself, not a city missing
  // data. Preserve the national record and do not label it as a fallback.
  if (cityCode === 'national') {
    const nationalRecord = getNationalRecord(period, category)
    return {
      requestedCityCode: cityCode,
      requestedCityName: cityName,
      period,
      category,
      record: nationalRecord,
      usedFallback: false,
      fallbackReason: nationalRecord ? null : '当前期间没有可用的全国官方基准。',
    }
  }

  // Historical requests must not silently become current-period data. Only the
  // current product period is allowed to use the national fallback.
  const nationalRecord = period === '2026H1' ? getNationalRecord(period, category) : null
  if (!nationalRecord) {
    return {
      requestedCityCode: cityCode,
      requestedCityName: cityName,
      period,
      category,
      record: null,
      usedFallback: false,
      fallbackReason: '当前期间没有可用的城市或全国官方基准。',
    }
  }

  return {
    requestedCityCode: cityCode,
    requestedCityName: cityName,
    period,
    category,
    record: toFallbackRecord(nationalRecord, cityCode, cityName),
    usedFallback: true,
    fallbackReason: `${cityName} ${period} 缺少该类别已核验值，已回退全国 2026H1 基准。`,
  }
}

export function resolveCityBenchmarkSet(cityCode: string, period = '2026H1'): CityBenchmarkSet {
  const cityName = getCityName(cityCode)
  const records = TARGET_CATEGORIES.map((category) => resolveCityBenchmark(cityCode, category, period))
  const cityCategoryCount = records.filter((item) => item.record && !item.usedFallback).length
  const fallbackCategoryCount = records.filter((item) => item.usedFallback).length
  const historicalRecords = CITY_BENCHMARK_RECORDS.filter((row) => row.cityCode === cityCode)
  const coverageTier: CityCoverageTier = cityCategoryCount === TARGET_CATEGORIES.length
    ? period === '2026H1' ? 'B-current' : 'A-history'
    : cityCategoryCount > 0
    ? 'B-current'
    : 'C-fallback'

  return {
    cityCode,
    cityName,
    period,
    records,
    cityCategoryCount,
    fallbackCategoryCount,
    coverageTier,
    historicalRecords,
  }
}

export const CITY_BENCHMARK_NOTES = {
  currentPeriod: '2026H1',
  hefeiHistoricalPeriod: '2024',
  fallbackRule: '城市当前期缺少已核验类别时，回退全国 2026H1；不使用安徽省数据替代合肥，也不把历史城市值标成当前期。',
  housingRule: '城市居住类 CPI 只作价格背景；用户实际住房、交通和固定支出优先。',
  directoryRule: '城市目录不等于城市数据集；待核验城市只能显示全国回退状态。',
} as const

export const CITY_BENCHMARK_CATEGORY_LABELS = CATEGORY_LABELS
