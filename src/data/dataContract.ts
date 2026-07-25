/**
 * “涨薪还剩多少？”的数据源元数据契约。
 *
 * 本文件定义结构，并登记已经由项目负责人核验过的官方来源。
 */
import {
  OFFICIAL_2025_CPI,
  OFFICIAL_2025_INCOME_BENCHMARKS,
  OFFICIAL_2025_URBAN_SPENDING,
} from './official2025'
import {
  HISTORICAL_CPI,
  HISTORICAL_INCOME_BENCHMARKS,
  HISTORICAL_SPENDING,
} from './officialHistorical'

export interface DataSourceMetadata {
  sourceName: string;
  sourceUrl: string;
  year: number | null;
  scope: string;
  unit: string;
  field: string;
  category: string;
  value: string | number | null;
}

/** 已核验的 2021–2025 官方数据字段登记。 */
export const verifiedDataSources: DataSourceMetadata[] = [
  ...OFFICIAL_2025_CPI.map((row) => ({
    sourceName: '国家统计局：2025 年居民消费价格主要数据',
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '%',
    field: 'annualYoYPercent',
    category: row.label,
    value: row.annualYoYPercent,
  })),
  ...OFFICIAL_2025_URBAN_SPENDING.map((row) => ({
    sourceName: '国家统计局：2025 年居民收入和消费支出情况',
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '元/人/年',
    field: 'annualAmount',
    category: row.label,
    value: row.annualAmount,
  })),
  ...OFFICIAL_2025_INCOME_BENCHMARKS.map((row) => ({
    sourceName: '国家统计局：2025 年居民收入和消费支出情况',
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '元/人/年',
    field: 'disposableIncome',
    category: '居民人均可支配收入',
    value: row.disposableIncome,
  })),
  ...HISTORICAL_CPI.map((row) => ({
    sourceName: `国家统计局：${row.year} 年居民消费价格主要数据`,
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '%',
    field: 'annualYoYPercent',
    category: row.label,
    value: row.annualYoYPercent,
  })),
  ...HISTORICAL_SPENDING.map((row) => ({
    sourceName: `国家统计局：${row.year} 年居民收入和消费支出情况`,
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '元/人/年',
    field: 'annualAmount',
    category: `${row.scope === 'national' ? '全国' : '城镇'}${row.label}支出`,
    value: row.annualAmount,
  })),
  ...HISTORICAL_INCOME_BENCHMARKS.map((row) => ({
    sourceName: `国家统计局：${row.year} 年居民收入和消费支出情况`,
    sourceUrl: row.sourceUrl,
    year: row.year,
    scope: row.scope,
    unit: '元/人/年',
    field: 'disposableIncome',
    category: `${row.scope === 'urban' ? '城镇' : row.scope === 'rural' ? '农村' : '全国'}居民人均可支配收入`,
    value: row.disposableIncome,
  })),
]

/** 后续需要额外核验的来源，当前保持为空。 */
export const pendingDataSources: DataSourceMetadata[] = [];
