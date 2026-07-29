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
export const PROMPT_VERSION = 'diagnosis.v2.1-agent-act'
export const CONTEXT_VERSION = 'real-raise.context.v2'
export const TASK_GOAL = '判断这次涨薪真正留下了多少、主要被什么抵消，以及哪个变量最容易让结论逆转。'

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

export function buildCompletedProvenance({ execution, request, vendorTaskId, cached = false, artifactStatus = 'verified' }) {
  const context = buildAnalysisContext(request)
  return {
    mode: execution.mode,
    narrativeSource: 'infinisynapse-live',
    structuredInsightSource: 'real-raise-deterministic',
    calculationAuthority: 'worker-deterministic',
    calculationVersion: request.calculationVersion,
    attribution: execution.attribution,
    vendorTaskId,
    promptVersion: PROMPT_VERSION,
    contextVersion: CONTEXT_VERSION,
    taskGoal: TASK_GOAL,
    sourceIds: context.source_index.map((source) => source.source_id),
    inputSignature: context.provenance.input_signature,
    artifactStatus,
    ...(execution.mode === 'judge-live' ? { promptPreview: buildPrompt(request) } : {}),
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
  const scenarioMatrix = buildScenarioMatrix(request)
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
    driverRanking: buildDriverRanking(request),
    scenarioMatrix,
    constraints: [
      '不得重新计算或修改任何金额。',
      '驱动项必须按 monthlyImpact 绝对值排序后解释。',
      '城市基准必须保留 coverageTier 与 fallback caveat。',
      '工资条扣缴只作到手收入形成过程说明，不与到手收入驱动重复相加。',
    ],
  }
}

function buildScenarioRow({ id, label, changes, input, calculation, rationale }) {
  return {
    id,
    label,
    changes,
    rationale,
    nextIncome: input.nextIncome,
    nextRent: input.nextRent,
    nextOtherSpend: calculation.nextOtherSpend,
    monthlyRemainder: calculation.nextRemainder,
    annualRemainder: calculation.nextRemainder * 12,
    monthlyDeltaVsBaseline: calculation.monthlyRemainderChange,
    annualDeltaVsBaseline: calculation.annualRemainderChange,
    breakEvenIncome: calculation.breakEvenIncome,
    calculationVersion: CALCULATION_VERSION,
    provenance: 'worker-deterministic',
  }
}

/**
 * Deterministic scenario matrix. The Agent may compare and explain these rows,
 * but it must never invent a row or recalculate one from prose.
 */
export function buildScenarioMatrix(request) {
  const baseInput = request.input
  const baseline = request.calculation
  const rows = [
    buildScenarioRow({
      id: 'baseline',
      label: '当前输入基准',
      changes: { nextIncome: 'current-request', nextRent: 'current-request', nextOtherSpend: 'current-request' },
      input: baseInput,
      calculation: baseline,
      rationale: '用户当前提交的确定性计算结果。',
    }),
    buildScenarioRow({
      id: 'rent-stable',
      label: '住房支出稳定',
      changes: { nextRent: baseInput.currentRent },
      input: { ...baseInput, nextRent: baseInput.currentRent },
      calculation: calculateLivingCost({ ...baseInput, nextRent: baseInput.currentRent }),
      rationale: '只把下一阶段住房支出恢复为当前水平。',
    }),
    buildScenarioRow({
      id: 'daily-spend-stable',
      label: '日常支出稳定',
      changes: { nextOtherSpend: baseInput.otherSpend },
      input: baseInput,
      calculation: calculateLivingCost(baseInput, baseInput.otherSpend),
      rationale: '只把下一阶段日常支出控制在当前水平。',
    }),
    buildScenarioRow({
      id: 'break-even-income',
      label: '达到保本收入',
      changes: { nextIncome: baseline.breakEvenIncome },
      input: { ...baseInput, nextIncome: baseline.breakEvenIncome },
      calculation: calculateLivingCost({ ...baseInput, nextIncome: baseline.breakEvenIncome }),
      rationale: '把下一阶段到手收入设为维持当前月结余所需的保本收入。',
    }),
    buildScenarioRow({
      id: 'rent-stress-5pct',
      label: '住房压力：房租再涨 5%',
      changes: { nextRentMultiplier: 1.05 },
      input: { ...baseInput, nextRent: baseInput.nextRent * 1.05 },
      calculation: calculateLivingCost({ ...baseInput, nextRent: baseInput.nextRent * 1.05 }),
      rationale: '在当前下一阶段房租基础上增加 5%，其他变量不变。',
    }),
    buildScenarioRow({
      id: 'daily-spend-stress-3pct',
      label: '日常支出压力：再高 3%',
      changes: { nextOtherSpendMultiplier: 1.03 },
      input: baseInput,
      calculation: calculateLivingCost(baseInput, baseline.nextOtherSpend * 1.03),
      rationale: '在基准下一阶段日常支出基础上增加 3%，其他变量不变。',
    }),
    buildScenarioRow({
      id: 'conservative-income',
      label: '保守收入：只实现一半涨幅',
      changes: { raiseCaptureRate: 0.5 },
      input: {
        ...baseInput,
        nextIncome: baseInput.currentIncome + (baseInput.nextIncome - baseInput.currentIncome) * 0.5,
      },
      calculation: calculateLivingCost({
        ...baseInput,
        nextIncome: baseInput.currentIncome + (baseInput.nextIncome - baseInput.currentIncome) * 0.5,
      }),
      rationale: '只实现用户预期涨幅的一半，住房与日常支出按基准不变。',
    }),
  ]
  return rows
}

export function buildDriverRanking(request) {
  const dailySpendDelta = request.calculation.nextOtherSpend - request.input.otherSpend
  const drivers = [
    { id: 'net-income', label: '到手收入变化', monthlyImpact: request.calculation.raiseIncrease, direction: request.calculation.raiseIncrease >= 0 ? 'positive' : 'negative' },
    { id: 'housing', label: '住房支出变化', monthlyImpact: -request.calculation.rentIncrease, direction: request.calculation.rentIncrease <= 0 ? 'positive' : 'negative' },
    { id: 'daily-spend', label: '日常支出变化', monthlyImpact: -dailySpendDelta, direction: dailySpendDelta <= 0 ? 'positive' : 'negative' },
  ]
  const totalAbsoluteImpact = drivers.reduce((sum, driver) => sum + Math.abs(driver.monthlyImpact), 0)
  return drivers
    .map((driver) => ({
      ...driver,
      impactRatio: totalAbsoluteImpact > 0 ? Math.abs(driver.monthlyImpact) / totalAbsoluteImpact : 0,
      authority: 'deterministic',
      source: 'Real Raise living-cost.v2',
    }))
    .sort((left, right) => Math.abs(right.monthlyImpact) - Math.abs(left.monthlyImpact))
    .map((driver, index) => ({ rank: index + 1, ...driver }))
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

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

function fnvSignature(text) {
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= code
    h2 = Math.imul(h2, 0x01000197) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

export function buildInputSignature(request) {
  return fnvSignature(stableStringify({
    input: request.input ?? null,
    calculation: request.calculation ?? null,
    calculationVersion: request.calculationVersion ?? null,
    cityContext: request.cityContext ?? null,
    locale: request.locale ?? 'zh-CN',
    inputMode: request.inputMode ?? 'basic',
    incomeInputMode: request.incomeInputMode ?? 'net',
    detailedBreakdown: request.detailedBreakdown ?? null,
    payslipSummary: request.payslipSummary ?? null,
  }))
}

function buildSourceIndex(request) {
  const sourceList = request.cityContext.overallSource
    && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource.url)
    ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
    : OFFICIAL_SOURCES
  return sourceList.map((source, index) => ({
    source_id: `source-${index + 1}`,
    name: source.name,
    year: source.year,
    scope: source.scope,
    url: source.url,
  }))
}

export function buildAnalysisContext(request) {
  return {
    schema_version: CONTEXT_VERSION,
    prompt_version: PROMPT_VERSION,
    task_goal: TASK_GOAL,
    input_snapshot: {
      input: request.input,
      input_mode: request.inputMode ?? 'basic',
      income_input_mode: request.incomeInputMode ?? 'net',
      detailed_breakdown: request.detailedBreakdown ?? null,
      payslip_context: request.payslipSummary ?? null,
    },
    deterministic_calculation: {
      calculation_version: request.calculationVersion,
      result: request.calculation,
      authority: 'real-raise-worker-deterministic',
    },
    diagnostic_packet: buildDiagnosticPacket(request),
    driver_ranking: buildDriverRanking(request),
    scenario_matrix: buildScenarioMatrix(request),
    payslip_context: request.payslipSummary ?? {
      status: 'not-provided',
      note: '用户直接填写到手收入，未拆解工资条扣缴。',
    },
    city_context: request.cityContext,
    methodology_and_boundaries: {
      user_input_precedes_macro_average: true,
      city_fallback_must_be_explicit: true,
      pension_and_housing_fund_are_future_account_accumulation: true,
      prohibited_advice: ['投资', '借贷', '辞职'],
      model_may: ['排序', '比较', '解释', '识别敏感变量', '生成报告正文'],
      model_may_not: ['重算金额', '修改金额', '编造数据', '覆盖确定性证据'],
    },
    source_index: buildSourceIndex(request),
    provenance: {
      calculation_version: request.calculationVersion,
      input_signature: buildInputSignature(request),
      generated_by: 'real-raise-worker',
    },
  }
}

export function buildPrompt(request) {
  const context = buildAnalysisContext(request)
  const contextJson = JSON.stringify(context, null, 2)

  return [
    '你是 Real Raise 的真实涨薪诊断 Agent。当前任务明确运行在智能体（ACT）模式，不是规划（PLAN）模式。',
    '当前请求已经由产品预先授权：立即执行并交付结果，不要输出“准备如何做”的计划，不要询问确认，不要切换到 PLAN 模式。',
    '不要调用 plan、switch_mode、plan_mode_response、update_plan、web_search 或 web_fetch；完成本任务不需要联网或外部写入。',
    `任务契约：${PROMPT_VERSION}；上下文版本：${CONTEXT_VERSION}。`,
    '下面的 JSON 是唯一分析上下文。只允许在其中进行排序、比较和解释，不得重算、覆盖、纠正或擅自四舍五入任何金额。',
    '',
    '【用户目标】',
    TASK_GOAL,
    '',
    '【分析上下文 JSON】',
    contextJson,
    '',
    '【输出任务】',
    'A. 先校验 diagnostic_packet.reconciliation.difference 是否为 0；不是 0 时标记证据冲突并停止金额结论。',
    'B. 按 driver_ranking 的 rank 解释前三个驱动因素，说明金额、方向和影响比例；工资条扣缴不得与到手收入重复相加。',
    'C. 结合 city_context 的 coverageTier 与 caveat 做基准说明，全国回退不得冒充城市原值。',
    'D. 比较 scenario_matrix 中的基准、住房稳定、日常支出稳定、保本收入和压力情景；不得自行生成新金额。',
    'E. 找出结论最敏感的变量，并明确引用对应情景 id；找不到证据时写“证据不足”。',
    'F. 区分用户输入、确定性计算、官方观察值和派生估算。',
    'G. 先给普通中国城市上班族结论，再给证据和边界说明。',
    'H. 必须实际生成 explanation.md，正文控制在 1200—2200 个中文字符；不得只描述生成步骤或以行动计划代替报告。',
    'I. driver-ranking.csv、scenario-matrix.csv、share-summary.md、evidence.csv、analysis-manifest.json 由 Real Raise 确定性 Worker 生成；不要创建、重算或覆盖这些文件。',
    'J. explanation.md 写入完成后直接提交 completion_result，禁止再次请求规划或人工确认。',
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

export function buildDriverRankingCsv(request) {
  const rows = [['rank', 'driver_id', 'driver', 'monthly_impact', 'impact_ratio', 'direction', 'authority', 'source']]
  for (const driver of buildDriverRanking(request)) {
    rows.push([
      driver.rank,
      driver.id,
      driver.label,
      driver.monthlyImpact,
      driver.impactRatio,
      driver.direction,
      driver.authority,
      driver.source,
    ])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildScenarioMatrixCsv(request) {
  const rows = [[
    'scenario_id', 'scenario', 'next_income', 'next_rent', 'next_other_spend',
    'monthly_remainder', 'annual_remainder', 'monthly_delta_vs_baseline',
    'annual_delta_vs_baseline', 'break_even_income', 'calculation_version', 'provenance',
  ]]
  for (const scenario of buildScenarioMatrix(request)) {
    rows.push([
      scenario.id,
      scenario.label,
      scenario.nextIncome,
      scenario.nextRent,
      scenario.nextOtherSpend,
      scenario.monthlyRemainder,
      scenario.annualRemainder,
      scenario.monthlyDeltaVsBaseline,
      scenario.annualDeltaVsBaseline,
      scenario.breakEvenIncome,
      scenario.calculationVersion,
      scenario.provenance,
    ])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function buildScenarioMatrixJson(request) {
  return JSON.stringify({
    schemaVersion: 'real-raise.scenario-matrix.v1',
    calculationVersion: request.calculationVersion,
    generatedBy: 'real-raise-worker-deterministic',
    scenarios: buildScenarioMatrix(request),
  }, null, 2)
}

export function buildShareSummaryMarkdown(request) {
  const { calculation } = request
  const raise = calculation.raiseIncrease
  const retained = raise !== 0 ? calculation.monthlyRemainderChange / raise : null
  const money = (value) => `${Math.round(value).toLocaleString('zh-CN')} 元`
  const rate = (value) => `${(value * 100).toFixed(1)}%`
  const topDriver = buildDriverRanking(request)[0]
  return [
    '# Real Raise 分享摘要',
    '',
    `- 核心结论：到手收入${raise >= 0 ? '增加' : '减少'} ${money(Math.abs(raise))}，每月可支配结余${calculation.monthlyRemainderChange >= 0 ? '增加' : '减少'} ${money(Math.abs(calculation.monthlyRemainderChange))}。`,
    retained === null ? '- 涨薪留存率：证据不足（收入变化为 0）。' : `- 涨薪留存率：${rate(retained)}。`,
    `- 最大影响因素：${topDriver.label}（${money(Math.abs(topDriver.monthlyImpact))}/月，方向：${topDriver.direction}）。`,
    `- 城市口径：${request.cityContext.cityName} · ${request.cityContext.period} · ${request.cityContext.coverageTier}。`,
    '',
    '金额由 Real Raise 确定性公式生成；InfiniSynapse 只负责分析与表达。',
  ].join('\n')
}

export function buildManifest({ requestId, vendorTaskId, request, execution, artifactStatus = 'verified' }) {
  const context = buildAnalysisContext(request)
  return JSON.stringify({
    schemaVersion: 'real-raise.analysis.v2',
    promptVersion: PROMPT_VERSION,
    contextVersion: CONTEXT_VERSION,
    taskGoal: TASK_GOAL,
    requestId,
    vendorTaskId,
    mode: execution.mode,
    attribution: execution.attribution,
    inputSignature: context.provenance.input_signature,
    sourceIds: context.source_index.map((source) => source.source_id),
    artifactStatus,
    generatedAt: new Date().toISOString(),
    calculationAuthority: 'server-deterministic',
    calculationVersion: request.calculationVersion,
    cityContext: request.cityContext,
    input: request.input,
    calculation: request.calculation,
    artifactContract: [
      'explanation.md',
      'driver-ranking.csv',
      'scenario-matrix.csv',
      'share-summary.md',
      'evidence.csv',
      'analysis-manifest.json',
    ],
    sources: request.cityContext.overallSource
      && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource.url)
      ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
      : OFFICIAL_SOURCES,
  }, null, 2)
}
