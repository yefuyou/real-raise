import { resolveTrustedCityContext } from './cityContext.mjs'

export const OFFICIAL_SOURCES = [
  {
    name: '国家统计局：2026 年上半年居民消费价格主要数据',
    year: 2026,
    scope: '全国居民消费价格八大类 1—6 月同比涨跌幅',
    url: 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260709_1964084.html',
  },
  {
    name: '国家统计局：2025 年居民收入和消费支出情况',
    year: 2025,
    scope: '全国及城镇居民收入、消费支出与消费结构',
    url: 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html',
  },
]

export const CALCULATION_VERSION = 'living-cost.v2'

const TOP_LEVEL_KEYS = new Set([
  'input',
  'calculation',
  'calculationVersion',
  'cityContext',
  'locale',
  'includeInsight',
  'inputMode',
  'detailedBreakdown',
  'incomeInputMode',
  'payslipSummary',
  'simulatedError',
  'analysisModel',
])

const INPUT_KEYS = [
  'currentIncome',
  'nextIncome',
  'currentRent',
  'nextRent',
  'otherSpend',
  'otherInflationRate',
]

const DETAILED_KEYS = ['food', 'utilities', 'transport', 'education', 'medical', 'other']
const PAYSLIP_NUMBER_KEYS = [
  'currentDeductionTotal',
  'nextDeductionTotal',
  'deductionChange',
  'currentNet',
  'nextNet',
  'grossIncrease',
  'netIncrease',
  'taxChange',
  'socialAndFundChange',
  'futureAccountChange',
]
const CITY_CONTEXT_KEYS = new Set([
  'cityCode',
  'cityName',
  'period',
  'coverageTier',
  'cityCategoryCount',
  'fallbackCategoryCount',
  'overallCpiRate',
  'overallSource',
  'caveat',
])
const SOURCE_KEYS = new Set(['name', 'year', 'scope', 'url'])

export class InputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InputError'
    this.code = 'INVALID_INPUT'
    this.status = 422
  }
}

export function buildExecutionContext(usingPartnerKey) {
  return usingPartnerKey
    ? { mode: 'partner-live', attribution: 'partner-user-key' }
    : { mode: 'judge-live', attribution: 'judge-project-key' }
}

export function buildCompletedProvenance({ execution, request, vendorTaskId, cached = false }) {
  return {
    mode: execution.mode,
    narrativeSource: 'infinisynapse-live',
    structuredInsightSource: 'real-raise-deterministic',
    calculationAuthority: 'worker-deterministic',
    calculationVersion: request.calculationVersion,
    attribution: execution.attribution,
    vendorTaskId,
    ...(cached ? { cached: true } : {}),
  }
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new InputError(`${label} 包含未允许字段：${key}`)
  }
}

function finiteNumber(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${label} 必须是有限数字`)
  }
  if (value < min || value > max) {
    throw new InputError(`${label} 必须在 ${min} 到 ${max} 之间`)
  }
  return value
}

function boundedString(value, label, maxLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new InputError(`${label} 必须是 1 到 ${maxLength} 个字符的字符串`)
  }
  return value
}

function validateSourceReference(value, label) {
  if (!isRecord(value)) throw new InputError(`${label} 必须是对象或 null`)
  assertAllowedKeys(value, SOURCE_KEYS, label)
  const year = value.year === null ? null : finiteNumber(value.year, `${label}.year`, 1900, 2200)
  return {
    name: boundedString(value.name, `${label}.name`, 200),
    year,
    scope: boundedString(value.scope, `${label}.scope`, 300),
    url: boundedString(value.url, `${label}.url`, 1000),
  }
}

function validateCityContext(value) {
  if (!isRecord(value)) throw new InputError('cityContext 必须是对象')
  assertAllowedKeys(value, CITY_CONTEXT_KEYS, 'cityContext')
  const coverageTier = value.coverageTier
  if (!['A-history', 'B-current', 'C-fallback'].includes(coverageTier)) {
    throw new InputError('cityContext.coverageTier 不在允许列表')
  }
  const overallCpiRate = value.overallCpiRate === null
    ? null
    : finiteNumber(value.overallCpiRate, 'cityContext.overallCpiRate', -1, 10)
  const candidate = {
    cityCode: boundedString(value.cityCode, 'cityContext.cityCode', 20),
    cityName: boundedString(value.cityName, 'cityContext.cityName', 100),
    period: boundedString(value.period, 'cityContext.period', 20),
    coverageTier,
    cityCategoryCount: finiteNumber(value.cityCategoryCount, 'cityContext.cityCategoryCount', 0, 20),
    fallbackCategoryCount: finiteNumber(value.fallbackCategoryCount, 'cityContext.fallbackCategoryCount', 0, 20),
    overallCpiRate,
    overallSource: value.overallSource === null
      ? null
      : validateSourceReference(value.overallSource, 'cityContext.overallSource'),
    caveat: boundedString(value.caveat, 'cityContext.caveat', 500),
  }
  const trusted = resolveTrustedCityContext(candidate.cityCode, candidate.period)
  if (!trusted) throw new InputError('cityContext 城市或期间不在当前可信目录')
  if (JSON.stringify(candidate) !== JSON.stringify(trusted)) {
    throw new InputError('cityContext 与服务端可信城市基准不一致')
  }
  return trusted
}

function validateDetailedBreakdown(value) {
  if (!isRecord(value)) throw new InputError('detailedBreakdown 必须是对象')
  assertAllowedKeys(value, new Set(DETAILED_KEYS), 'detailedBreakdown')

  const result = {}
  for (const key of DETAILED_KEYS) {
    const item = value[key]
    if (!isRecord(item)) throw new InputError(`detailedBreakdown.${key} 缺失`)
    assertAllowedKeys(item, new Set(['currentAmount', 'cpiRate', 'nextAmount']), `detailedBreakdown.${key}`)
    result[key] = {
      currentAmount: finiteNumber(item.currentAmount, `${key}.currentAmount`, 0, 1_000_000),
      cpiRate: finiteNumber(item.cpiRate, `${key}.cpiRate`, -1, 10),
      nextAmount: finiteNumber(item.nextAmount, `${key}.nextAmount`, 0, 1_000_000),
    }
  }
  return result
}

function validatePayslipSummary(value) {
  if (!isRecord(value)) throw new InputError('payslipSummary 必须是对象')
  const allowed = new Set([...PAYSLIP_NUMBER_KEYS, 'raiseKeptRate', 'hasNegativeNet'])
  assertAllowedKeys(value, allowed, 'payslipSummary')

  const result = {}
  for (const key of PAYSLIP_NUMBER_KEYS) {
    result[key] = finiteNumber(value[key], `payslipSummary.${key}`, -1_000_000, 1_000_000)
  }
  const keptRate = value.raiseKeptRate
  result.raiseKeptRate = keptRate === null
    ? null
    : finiteNumber(keptRate, 'payslipSummary.raiseKeptRate', -100, 100)
  if (typeof value.hasNegativeNet !== 'boolean') {
    throw new InputError('payslipSummary.hasNegativeNet 必须是布尔值')
  }
  result.hasNegativeNet = value.hasNegativeNet
  return result
}

export function calculateLivingCost(input, nextOtherSpendOverride) {
  const currentTotalSpend = input.currentRent + input.otherSpend
  const nextOtherSpend = Number.isFinite(nextOtherSpendOverride) && nextOtherSpendOverride >= 0
    ? nextOtherSpendOverride
    : input.otherSpend * (1 + input.otherInflationRate)
  const nextTotalSpend = input.nextRent + nextOtherSpend
  const currentRemainder = input.currentIncome - currentTotalSpend
  const nextRemainder = input.nextIncome - nextTotalSpend
  const raiseIncrease = input.nextIncome - input.currentIncome
  const rentIncrease = input.nextRent - input.currentRent
  const incomeGrowthRate = input.currentIncome > 0 ? input.nextIncome / input.currentIncome - 1 : 0
  const totalSpendGrowthRate = currentTotalSpend > 0 ? nextTotalSpend / currentTotalSpend - 1 : 0
  const monthlyRemainderChange = nextRemainder - currentRemainder
  const realPurchasingPowerRate = input.currentIncome > 0
    ? monthlyRemainderChange / input.currentIncome
    : 0

  return {
    currentTotalSpend,
    nextOtherSpend,
    nextTotalSpend,
    currentRemainder,
    nextRemainder,
    monthlyRemainderChange,
    annualRemainderChange: monthlyRemainderChange * 12,
    incomeGrowthRate,
    totalSpendGrowthRate,
    realPurchasingPowerRate,
    rentIncrease,
    raiseIncrease,
    raiseConsumedByRentRate: raiseIncrease > 0 ? rentIncrease / raiseIncrease : null,
    breakEvenIncome: nextTotalSpend + currentRemainder,
  }
}

export function buildDiagnosticPacket(request) {
  const dailySpendDelta = request.calculation.nextOtherSpend - request.input.otherSpend
  const drivers = [
    { id: 'net-income', label: '到手收入变化', monthlyImpact: request.calculation.raiseIncrease, authority: 'deterministic' },
    { id: 'housing', label: '住房支出变化', monthlyImpact: -request.calculation.rentIncrease, authority: 'deterministic' },
    { id: 'daily-spend', label: '日常支出变化', monthlyImpact: -dailySpendDelta, authority: 'deterministic' },
  ]
  const driverSum = drivers.reduce((sum, driver) => sum + driver.monthlyImpact, 0)
  return {
    schemaVersion: 'real-raise.diagnostic-packet.v1',
    calculationVersion: request.calculationVersion,
    cityContext: request.cityContext,
    reconciliation: {
      driverSum,
      monthlyRemainderChange: request.calculation.monthlyRemainderChange,
      difference: driverSum - request.calculation.monthlyRemainderChange,
    },
    drivers,
    payslipContext: request.incomeInputMode === 'payslip'
      ? request.payslipSummary ?? null
      : null,
    scenarios: [
      { id: 'baseline', label: '当前输入', annualRemainderDeltaVsBaseline: 0 },
      { id: 'rent-stable', label: '下一阶段住房支出保持当前水平', annualRemainderDeltaVsBaseline: request.calculation.rentIncrease * 12 },
      { id: 'daily-spend-stable', label: '下一阶段日常支出保持当前水平', annualRemainderDeltaVsBaseline: dailySpendDelta * 12 },
      { id: 'break-even-income', label: '维持当前月结余所需到手收入', requiredMonthlyIncome: request.calculation.breakEvenIncome },
    ],
    constraints: [
      '不得重新计算或修改任何金额。',
      '驱动项必须按 monthlyImpact 绝对值排序后解释。',
      '城市基准必须保留 coverageTier 与 fallback caveat。',
      '工资条扣缴只作到手收入形成过程说明，不与到手收入驱动重复相加。',
    ],
  }
}

export function validateAnalysisRequest(value) {
  if (!isRecord(value)) throw new InputError('请求体必须是对象')
  assertAllowedKeys(value, TOP_LEVEL_KEYS, '请求')
  if (value.locale !== 'zh-CN') throw new InputError('locale 只允许 zh-CN')
  if (value.includeInsight !== true) throw new InputError('includeInsight 必须为 true')
  if (value.calculationVersion !== CALCULATION_VERSION) {
    throw new InputError(`calculationVersion 只允许 ${CALCULATION_VERSION}`)
  }
  const cityContext = validateCityContext(value.cityContext)
  if (!isRecord(value.input)) throw new InputError('input 必须是对象')
  assertAllowedKeys(value.input, new Set(INPUT_KEYS), 'input')

  const input = {}
  for (const key of INPUT_KEYS) {
    const isRate = key === 'otherInflationRate'
    input[key] = finiteNumber(
      value.input[key],
      `input.${key}`,
      isRate ? -1 : 0,
      isRate ? 10 : 1_000_000,
    )
  }

  const inputMode = value.inputMode ?? 'basic'
  if (inputMode !== 'basic' && inputMode !== 'detailed') {
    throw new InputError('inputMode 只允许 basic 或 detailed')
  }
  const incomeInputMode = value.incomeInputMode ?? 'net'
  if (incomeInputMode !== 'net' && incomeInputMode !== 'payslip') {
    throw new InputError('incomeInputMode 只允许 net 或 payslip')
  }
  const analysisModel = value.analysisModel
  if (
    analysisModel !== undefined
    && analysisModel !== 'deepseek-v4-flash'
    && analysisModel !== 'deepseek-v4-pro'
  ) {
    throw new InputError('analysisModel 不在允许列表')
  }
  if (value.simulatedError !== undefined && value.simulatedError !== false) {
    throw new InputError('线上后端不接受 simulatedError')
  }

  const detailedBreakdown = inputMode === 'detailed'
    ? validateDetailedBreakdown(value.detailedBreakdown)
    : undefined
  const payslipSummary = incomeInputMode === 'payslip'
    ? validatePayslipSummary(value.payslipSummary)
    : undefined

  const effectiveInput = detailedBreakdown
    ? (() => {
      const currentSum = Object.values(detailedBreakdown).reduce((sum, item) => sum + item.currentAmount, 0)
      const nextSum = Object.values(detailedBreakdown).reduce((sum, item) => sum + item.nextAmount, 0)
      return {
        ...input,
        otherSpend: currentSum,
        otherInflationRate: currentSum > 0 ? (nextSum - currentSum) / currentSum : 0,
      }
    })()
    : input
  const detailedNextSpend = detailedBreakdown
    ? Object.values(detailedBreakdown).reduce((sum, item) => sum + item.nextAmount, 0)
    : undefined

  return {
    input: effectiveInput,
    calculation: calculateLivingCost(effectiveInput, detailedNextSpend),
    calculationVersion: CALCULATION_VERSION,
    cityContext,
    locale: 'zh-CN',
    includeInsight: true,
    inputMode,
    ...(detailedBreakdown ? { detailedBreakdown } : {}),
    incomeInputMode,
    ...(payslipSummary ? { payslipSummary } : {}),
    ...(analysisModel ? { analysisModel } : {}),
  }
}

export function buildPrompt(request) {
  const detailed = request.detailedBreakdown
    ? JSON.stringify(request.detailedBreakdown, null, 2)
    : '未开启详细分类模式。'
  const payslip = request.payslipSummary
    ? JSON.stringify(request.payslipSummary, null, 2)
    : '用户直接填写到手收入，未拆解工资条扣缴。'
  const sourceList = request.cityContext.overallSource
    && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource.url)
    ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
    : OFFICIAL_SOURCES
  const sourceIndex = sourceList
    .map((source) => `- ${source.name}｜${source.year}｜${source.scope}｜${source.url}`)
    .join('\n')
  const diagnosticPacket = buildDiagnosticPacket(request)

  return [
    '你是 Real Raise 的解释 Agent。当前请求已授权，直接执行，不要询问确认，不要调用 web_search/web_fetch。',
    '只使用下面给出的服务端确定性计算结果和官方来源索引；不得重算、覆盖、纠正或擅自四舍五入任何金额。',
    '',
    '【不可违反的边界】',
    '1. 用户输入的到手收入、住房和日常支出优先于宏观平均。',
    '2. 城市数据缺失时明确说明已回退全国基准，不要编造城市值。',
    '3. 不提供投资、借贷、辞职等个性化金融决策建议。',
    '4. 养老与公积金属于未来账户积累，不得笼统称为消失。',
    '',
    `【用户输入】\n${JSON.stringify(request.input, null, 2)}`,
    `【城市上下文】\n${JSON.stringify(request.cityContext, null, 2)}`,
    `【确定性计算版本】\n${request.calculationVersion}`,
    `【服务端确定性计算结果（权威）】\n${JSON.stringify(request.calculation, null, 2)}`,
    `【确定性诊断包（只允许排序、比较和解释）】\n${JSON.stringify(diagnosticPacket, null, 2)}`,
    `【工资条拆解】\n${payslip}`,
    `【日常支出详细分类】\n${detailed}`,
    `【官方来源索引】\n${sourceIndex}`,
    '',
    '【输出任务】',
    'A. 先校验 diagnostic-packet.reconciliation.difference 是否为 0；不是 0 时标记证据冲突并停止金额结论。',
    'B. 按 monthlyImpact 绝对值排序，解释前三个驱动因素；工资条扣缴不得与到手收入重复相加。',
    'C. 结合 cityContext 的 coverageTier 与 caveat 做基准说明，全国回退不得冒充城市原值。',
    'D. 比较 packet 中的基准、住房稳定、日常支出稳定和保本收入情景，不得自行生成新金额。',
    'E. 区分用户输入、确定性计算、官方观察值和派生估算。',
    'F. 面向普通中国城市上班族，先结论后证据，简洁、不堆宏观术语。',
    '尽力生成 explanation.md、evidence.csv、analysis-manifest.json；不要为了生成文件联网检索。',
  ].join('\n')
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildEvidenceCsv(request) {
  const rows = [['field', 'value', 'provenance']]
  rows.push(['calculationVersion', request.calculationVersion, 'system-version'])
  rows.push(['cityContext.cityCode', request.cityContext.cityCode, 'user-selection'])
  rows.push(['cityContext.cityName', request.cityContext.cityName, 'user-selection'])
  rows.push(['cityContext.period', request.cityContext.period, 'city-benchmark'])
  rows.push(['cityContext.coverageTier', request.cityContext.coverageTier, 'city-benchmark'])
  rows.push(['cityContext.overallCpiRate', request.cityContext.overallCpiRate, 'city-benchmark'])
  for (const [key, value] of Object.entries(request.input)) {
    rows.push([`input.${key}`, value, 'user-input'])
  }
  for (const [key, value] of Object.entries(request.calculation)) {
    rows.push([`calculation.${key}`, value, 'server-deterministic'])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildManifest({ requestId, vendorTaskId, request, execution }) {
  return JSON.stringify({
    schemaVersion: 'real-raise.analysis.v2',
    requestId,
    vendorTaskId,
    mode: execution.mode,
    attribution: execution.attribution,
    generatedAt: new Date().toISOString(),
    calculationAuthority: 'server-deterministic',
    calculationVersion: request.calculationVersion,
    cityContext: request.cityContext,
    input: request.input,
    calculation: request.calculation,
    sources: request.cityContext.overallSource
      && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource.url)
      ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
      : OFFICIAL_SOURCES,
  }, null, 2)
}
