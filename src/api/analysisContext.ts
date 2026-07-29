import { resolveCityBenchmarkSet } from '../data/cityBenchmarks'
import type { AnalysisCityContext } from './realRaiseContract'

function yearFromPeriod(period: string): number | null {
  const match = /^(\d{4})/.exec(period)
  return match ? Number(match[1]) : null
}

/**
 * Collapse the visible city benchmark selection into the small, auditable
 * context sent to every analysis mode. The full city dataset remains local;
 * the Agent only receives the selected scope and its honest fallback status.
 */
export function buildAnalysisCityContext(
  cityCode: string,
  period = '2026H1',
): AnalysisCityContext {
  const set = resolveCityBenchmarkSet(cityCode, period)
  const overall = set.records.find((item) => item.category === 'overall')
  const record = overall?.record ?? null
  const fallbackNote = overall?.fallbackReason
    ?? (set.fallbackCategoryCount > 0
      ? `${set.cityName} ${period} 部分分类缺少已核验值，缺项使用全国同期基准。`
      : set.cityCode === 'national'
        ? `全国 ${period} 使用已核验全国同期官方数据。`
        : `${set.cityName} ${period} 使用已核验城市数据。`)

  return {
    cityCode: set.cityCode,
    cityName: set.cityName,
    period: set.period,
    coverageTier: set.coverageTier,
    cityCategoryCount: set.cityCategoryCount,
    fallbackCategoryCount: set.fallbackCategoryCount,
    overallCpiRate: record ? record.yoyRate / 100 : null,
    overallSource: record
      ? {
          name: record.sourceName,
          year: yearFromPeriod(record.period),
          scope: `${record.scope === 'city' ? set.cityName : '全国'}｜${record.label}｜${record.period}`,
          url: record.sourceUrl,
        }
      : null,
    caveat: fallbackNote,
  }
}
