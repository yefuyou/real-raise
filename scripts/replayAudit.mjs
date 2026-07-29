import { createHash } from 'node:crypto'

export const REPLAY_SCHEMA_VERSION = 'replay.v2'
export const REPLAY_MANIFEST_VERSION = 'replay-manifest.v2'
export const RECORDED_CALCULATION_VERSION = 'income-growth/cost-growth-ratio.v1'
export const CURRENT_CALCULATION_VERSION = 'remainder-change/current-income.v2'
export const MIGRATION_ID = '2026-07-replay-calculation-provenance'

const CORE_ARTIFACTS = ['explanation.md', 'evidence.csv', 'analysis-manifest.json']
const RATE_PATH = 'calculation.realPurchasingPowerRate'
const ALLOWED_MIGRATED_FIELDS = [RATE_PATH, 'calculationVersion', 'cityContext']
const EPSILON = 1e-12

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function requestSignature(request) {
  const material = stableStringify({
    input: request.input ?? null,
    calculation: request.calculation ?? null,
    calculationVersion: request.calculationVersion ?? null,
    cityContext: request.cityContext ?? null,
    locale: request.locale ?? 'zh-CN',
    inputMode: request.inputMode ?? 'basic',
    incomeInputMode: request.incomeInputMode ?? 'net',
    detailedBreakdown: request.detailedBreakdown ?? null,
    payslipSummary: request.payslipSummary ?? null,
    ...(request.analysisModel ? { analysisModel: request.analysisModel } : {}),
  })
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4
  for (let i = 0; i < material.length; i += 1) {
    const code = material.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= code
    h2 = Math.imul(h2, 0x01000197) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function nearlyEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON
}

function parseEvidenceRate(csv) {
  const line = String(csv).split(/\r?\n/).find((row) => row.startsWith('real_purchasing_power_rate,'))
  if (!line) throw new Error('evidence.csv 缺少 real_purchasing_power_rate')
  const value = Number(line.split(',')[1])
  if (!Number.isFinite(value)) throw new Error('evidence.csv 的 real_purchasing_power_rate 不是有限数值')
  return value
}

function collectManifestRates(value, output = []) {
  if (!value || typeof value !== 'object') return output
  for (const [key, child] of Object.entries(value)) {
    if (key === 'real_purchasing_power_rate' || key === 'realPurchasingPowerRate') {
      const candidate = typeof child === 'object' && child !== null && 'value' in child ? child.value : child
      if (typeof candidate === 'number') output.push(candidate)
    }
    collectManifestRates(child, output)
  }
  return output
}

function flattenDifferences(left, right, prefix = '', output = []) {
  if (stableStringify(left) === stableStringify(right)) return output
  if (
    left === null || right === null ||
    typeof left !== 'object' || typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    output.push(prefix)
    return output
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    flattenDifferences(left[key], right[key], prefix ? `${prefix}.${key}` : key, output)
  }
  return output
}

function requireField(condition, message, errors) {
  if (!condition) errors.push(message)
}

export function auditReplayPack(pack, fileName = pack?.scenarioId ?? '<unknown>') {
  const errors = []
  requireField(pack?.schemaVersion === REPLAY_SCHEMA_VERSION, `${fileName}: schemaVersion 必须为 ${REPLAY_SCHEMA_VERSION}`, errors)
  requireField(typeof pack?.scenarioId === 'string' && pack.scenarioId.length > 0, `${fileName}: 缺少 scenarioId`, errors)
  requireField(typeof pack?.vendorTaskId === 'string' && pack.vendorTaskId.length > 0, `${fileName}: 缺少 vendorTaskId`, errors)
  requireField(typeof pack?.signature === 'string', `${fileName}: 缺少当前请求签名`, errors)
  requireField(pack?.request && pack?.recordedRequest, `${fileName}: 必须同时保留 request 与 recordedRequest`, errors)
  if (errors.length) return errors

  requireField(requestSignature(pack.request) === pack.signature, `${fileName}: request 无法重算得到 signature`, errors)
  requireField(pack.provenance?.vendorArtifacts?.origin === 'infinisynapse-task-workspace', `${fileName}: 未标明供应商产物来源`, errors)
  requireField(pack.provenance?.vendorArtifacts?.integrity === 'vendor-original-unaltered', `${fileName}: 供应商产物不得冒充未改写原件`, errors)
  requireField(pack.provenance?.vendorArtifacts?.vendorTaskId === pack.vendorTaskId, `${fileName}: provenance 任务 ID 不一致`, errors)
  requireField(pack.provenance?.compatibility?.status === 'legacy-calculation', `${fileName}: 必须标记为旧计算口径回放`, errors)
  requireField(pack.provenance?.compatibility?.migrationId === MIGRATION_ID, `${fileName}: migrationId 不受支持`, errors)
  requireField(pack.provenance?.compatibility?.recordedCalculationVersion === RECORDED_CALCULATION_VERSION, `${fileName}: 录制计算版本不明确`, errors)
  requireField(pack.provenance?.compatibility?.currentCalculationVersion === CURRENT_CALCULATION_VERSION, `${fileName}: 当前计算版本不明确`, errors)
  requireField(
    stableStringify(pack.provenance?.compatibility?.changedFields) === stableStringify(ALLOWED_MIGRATED_FIELDS),
    `${fileName}: 只允许声明迁移 ${ALLOWED_MIGRATED_FIELDS.join(', ')}`,
    errors,
  )
  requireField(typeof pack.provenance?.compatibility?.userNotice === 'string' && pack.provenance.compatibility.userNotice.length >= 30, `${fileName}: 缺少面向用户的口径说明`, errors)
  requireField(pack.provenance?.compatibility?.recordedContextStatus === 'not-recorded', `${fileName}: 必须明确历史任务没有城市上下文`, errors)
  requireField(pack.provenance?.compatibility?.currentContextUsage === 'matching-only', `${fileName}: 当前城市上下文只能用于受控匹配`, errors)
  requireField(pack.recordedRequest.cityContext === undefined, `${fileName}: recordedRequest 不得伪造城市上下文`, errors)
  requireField(pack.recordedRequest.calculationVersion === undefined, `${fileName}: recordedRequest 不得补写不存在的计算版本`, errors)
  requireField(pack.request.calculationVersion === 'living-cost.v2', `${fileName}: request 缺少当前计算版本`, errors)
  requireField(pack.request.cityContext?.cityCode === '340100' && pack.request.cityContext?.period === '2026H1', `${fileName}: 兼容回放仅允许匹配默认合肥 2026H1`, errors)

  const changedFields = flattenDifferences(pack.request, pack.recordedRequest).sort()
  requireField(
    stableStringify(changedFields) === stableStringify([...ALLOWED_MIGRATED_FIELDS].sort()),
    `${fileName}: request 与 recordedRequest 存在未声明差异：${changedFields.join(', ') || '无差异'}`,
    errors,
  )

  const currentRate = pack.request.calculation?.realPurchasingPowerRate
  const recordedRate = pack.recordedRequest.calculation?.realPurchasingPowerRate
  const monthlyChange = pack.request.calculation?.monthlyRemainderChange
  const currentIncome = pack.request.input?.currentIncome
  requireField(nearlyEqual(currentRate, monthlyChange / currentIncome), `${fileName}: 当前 rate 不符合“结余变化÷当前收入”`, errors)
  const incomeGrowthRate = pack.recordedRequest.calculation?.incomeGrowthRate
  const totalSpendGrowthRate = pack.recordedRequest.calculation?.totalSpendGrowthRate
  const legacyRate = 1 + totalSpendGrowthRate > 0
    ? (1 + incomeGrowthRate) / (1 + totalSpendGrowthRate) - 1
    : 0
  requireField(nearlyEqual(recordedRate, legacyRate), `${fileName}: 录制 rate 不符合“收入增速与总支出增速之比”的旧口径`, errors)
  requireField(nearlyEqual(pack.provenance.compatibility.currentValue, currentRate), `${fileName}: provenance.currentValue 不一致`, errors)
  requireField(nearlyEqual(pack.provenance.compatibility.recordedValue, recordedRate), `${fileName}: provenance.recordedValue 不一致`, errors)

  const previews = pack.completed?.workspace?.previews ?? {}
  for (const name of CORE_ARTIFACTS) {
    requireField(typeof previews[name] === 'string' && previews[name].length > 0, `${fileName}: 缺少 ${name}`, errors)
    const expectedHash = pack.provenance?.vendorArtifacts?.sha256?.[name]
    requireField(typeof expectedHash === 'string' && expectedHash === sha256(String(previews[name] ?? '')), `${fileName}: ${name} 与供应商原件哈希不一致`, errors)
  }
  requireField(pack.completed?.insight === previews['explanation.md'], `${fileName}: completed.insight 必须保持供应商 explanation.md 原文`, errors)
  requireField(pack.provenance?.vendorArtifacts?.sha256?.['completed.insight'] === sha256(String(pack.completed?.insight ?? '')), `${fileName}: completed.insight 原件哈希不一致`, errors)

  try {
    requireField(nearlyEqual(parseEvidenceRate(previews['evidence.csv']), recordedRate), `${fileName}: evidence.csv 未使用录制口径数值`, errors)
  } catch (error) {
    errors.push(`${fileName}: ${error.message}`)
  }
  try {
    const manifest = JSON.parse(previews['analysis-manifest.json'])
    const manifestRates = collectManifestRates(manifest)
    requireField(manifestRates.length > 0, `${fileName}: analysis-manifest.json 缺少购买力变化率`, errors)
    requireField(manifestRates.every((rate) => nearlyEqual(rate, recordedRate)), `${fileName}: analysis-manifest.json 与录制口径不一致`, errors)
  } catch (error) {
    errors.push(`${fileName}: analysis-manifest.json 无法解析：${error.message}`)
  }

  return errors
}

export function buildManifestEntry(pack, file) {
  const compatibility = pack.provenance.compatibility
  return {
    scenarioId: pack.scenarioId,
    file,
    replaySchemaVersion: pack.schemaVersion,
    signature: pack.signature,
    vendorTaskId: pack.vendorTaskId,
    recordedAt: pack.recordedAt,
    provenanceStatus: pack.provenance.vendorArtifacts.integrity,
    compatibility: {
      status: compatibility.status,
      recordedCalculationVersion: compatibility.recordedCalculationVersion,
      currentCalculationVersion: compatibility.currentCalculationVersion,
      recordedContextStatus: compatibility.recordedContextStatus,
      currentContextUsage: compatibility.currentContextUsage,
      recordedValue: compatibility.recordedValue,
      currentValue: compatibility.currentValue,
      userNotice: compatibility.userNotice,
    },
  }
}
