const CURRENT_PERIOD = '2026H1'

const CITY_NAMES = new Map([
  ['national', '全国'],
  ['110000', '北京'],
  ['310000', '上海'],
  ['440100', '广州'],
  ['440300', '深圳'],
  ['120000', '天津'],
  ['500000', '重庆'],
  ['510100', '成都'],
  ['330100', '杭州'],
  ['320100', '南京'],
  ['420100', '武汉'],
  ['610100', '西安'],
  ['320500', '苏州'],
  ['330200', '宁波'],
  ['370200', '青岛'],
  ['370100', '济南'],
  ['410100', '郑州'],
  ['430100', '长沙'],
  ['340100', '合肥'],
  ['350100', '福州'],
  ['350200', '厦门'],
  ['530100', '昆明'],
  ['520100', '贵阳'],
  ['450100', '南宁'],
  ['460100', '海口'],
  ['130100', '石家庄'],
  ['140100', '太原'],
  ['210100', '沈阳'],
  ['210200', '大连'],
  ['220100', '长春'],
  ['230100', '哈尔滨'],
])

const NATIONAL_SOURCE = {
  name: '国家统计局：2026 年上半年居民消费价格主要数据',
  year: 2026,
  scope: '全国｜全国居民消费价格总水平｜2026H1',
  url: 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260709_1964084.html',
}

const CURRENT_CITY_OVERALL = new Map([
  ['110000', {
    overallCpiRate: 0.007,
    source: {
      name: '国家统计局北京调查总队：2026 年上半年北京 CPI 运行情况',
      year: 2026,
      scope: '北京｜居民消费价格总水平｜2026H1',
      url: 'https://tjj.beijing.gov.cn/tjsj_31433/sjjd_31444/202607/t20260720_4770961.html',
    },
    cityCategoryCount: 9,
    fallbackCategoryCount: 0,
  }],
  ['310000', {
    overallCpiRate: 0.008,
    source: {
      name: '上海市统计局：2026 年 6 月居民消费价格',
      year: 2026,
      scope: '上海｜居民消费价格总水平｜2026H1',
      url: 'https://tjj.sh.gov.cn/sjxx/20260710/44c96140acff4d889c7dc1cb5f13d4f0.html',
    },
    cityCategoryCount: 1,
    fallbackCategoryCount: 8,
  }],
  ['440300', {
    overallCpiRate: 0.023,
    source: {
      name: '深圳市统计局：2026 年 6 月国民经济核算资料（国家统计局深圳调查队）',
      year: 2026,
      scope: '深圳｜居民消费价格总水平｜2026H1',
      url: 'https://tjj.sz.gov.cn/attachment/1/1216/1216381/10010079.pdf',
    },
    cityCategoryCount: 9,
    fallbackCategoryCount: 0,
  }],
])

/**
 * The browser expresses a city selection; the Worker owns the benchmark
 * metadata. Keeping this resolver server-side prevents forged CPI values,
 * source URLs, or prompt text from entering live evidence.
 */
export function resolveTrustedCityContext(cityCode, period) {
  if (period !== CURRENT_PERIOD) return null
  const cityName = CITY_NAMES.get(cityCode)
  if (!cityName) return null

  if (cityCode === 'national') {
    return {
      cityCode,
      cityName,
      period,
      coverageTier: 'B-current',
      cityCategoryCount: 9,
      fallbackCategoryCount: 0,
      overallCpiRate: 0.01,
      overallSource: NATIONAL_SOURCE,
      caveat: '全国 2026H1 使用已核验全国同期官方数据。',
    }
  }

  const current = CURRENT_CITY_OVERALL.get(cityCode)
  if (current) {
    return {
      cityCode,
      cityName,
      period,
      coverageTier: 'B-current',
      cityCategoryCount: current.cityCategoryCount,
      fallbackCategoryCount: current.fallbackCategoryCount,
      overallCpiRate: current.overallCpiRate,
      overallSource: current.source,
      caveat: current.fallbackCategoryCount > 0
        ? `${cityName} ${period} 部分分类缺少已核验值，缺项使用全国同期基准。`
        : `${cityName} ${period} 使用已核验城市数据。`,
    }
  }

  return {
    cityCode,
    cityName,
    period,
    coverageTier: 'C-fallback',
    cityCategoryCount: 0,
    fallbackCategoryCount: 9,
    overallCpiRate: 0.01,
    overallSource: NATIONAL_SOURCE,
    caveat: `${cityName} ${period} 缺少该类别已核验值，已回退全国 2026H1 基准。`,
  }
}
