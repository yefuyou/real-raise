import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CURRENT_CALCULATION_VERSION,
  MIGRATION_ID,
  RECORDED_CALCULATION_VERSION,
  REPLAY_SCHEMA_VERSION,
  requestSignature,
  sha256,
} from './replayAudit.mjs'

const replaysDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'replays')
const notice = '此任务录制于旧版“收入增速与总支出增速之比”口径，且录制时没有城市上下文字段；供应商原始报告和三份工作区产物保持原样，仅用于核验历史任务。当前页面采用“月结余变化÷当前收入”和合肥 2026H1 匹配上下文，两者不可直接混用。'
const defaultMatchCityContext = {
  cityCode: '340100',
  cityName: '合肥',
  period: '2026H1',
  coverageTier: 'C-fallback',
  cityCategoryCount: 0,
  fallbackCategoryCount: 9,
  overallCpiRate: 0.01,
  overallSource: {
    name: '国家统计局：2026 年上半年居民消费价格主要数据',
    year: 2026,
    scope: '全国｜全国居民消费价格总水平｜2026H1',
    url: 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260709_1964084.html',
  },
  caveat: '合肥 2026H1 缺少该类别已核验值，已回退全国 2026H1 基准。',
}

function evidenceRate(csv) {
  const line = String(csv).split(/\r?\n/).find((row) => row.startsWith('real_purchasing_power_rate,'))
  if (!line) throw new Error('evidence.csv 缺少 real_purchasing_power_rate')
  return Number(line.split(',')[1])
}

for (const file of fs.readdirSync(replaysDir).sort()) {
  if (!file.endsWith('.json') || file === 'manifest.json') continue
  const fullPath = path.join(replaysDir, file)
  const pack = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  if (pack.schemaVersion === REPLAY_SCHEMA_VERSION) {
    pack.request.calculationVersion = 'living-cost.v2'
    pack.request.cityContext = defaultMatchCityContext
    pack.signature = requestSignature(pack.request)
    pack.provenance.compatibility.recordedCalculationVersion = RECORDED_CALCULATION_VERSION
    pack.provenance.compatibility.currentCalculationVersion = CURRENT_CALCULATION_VERSION
    pack.provenance.compatibility.changedFields = [
      'calculation.realPurchasingPowerRate',
      'calculationVersion',
      'cityContext',
    ]
    pack.provenance.compatibility.recordedContextStatus = 'not-recorded'
    pack.provenance.compatibility.currentContextUsage = 'matching-only'
    pack.provenance.compatibility.userNotice = notice
    fs.writeFileSync(fullPath, `${JSON.stringify(pack, null, 2)}\n`)
    console.log(`${file}: 已刷新 ${REPLAY_SCHEMA_VERSION} 口径声明`)
    continue
  }
  if (pack.schemaVersion !== 'replay.v1') throw new Error(`${file}: 不支持迁移 ${pack.schemaVersion}`)

  const previews = pack.completed?.workspace?.previews ?? {}
  const recordedValue = evidenceRate(previews['evidence.csv'])
  const currentValue = pack.request.calculation.realPurchasingPowerRate
  const recordedRequest = structuredClone(pack.request)
  recordedRequest.calculation.realPurchasingPowerRate = recordedValue
  delete recordedRequest.calculationVersion
  delete recordedRequest.cityContext
  pack.request.calculationVersion = 'living-cost.v2'
  pack.request.cityContext = defaultMatchCityContext
  pack.signature = requestSignature(pack.request)
  pack.schemaVersion = REPLAY_SCHEMA_VERSION
  pack.recordedRequest = recordedRequest
  pack.provenance = {
    vendorArtifacts: {
      origin: 'infinisynapse-task-workspace',
      integrity: 'vendor-original-unaltered',
      vendorTaskId: pack.vendorTaskId,
      recordedAt: pack.recordedAt,
      sha256: {
        'completed.insight': sha256(pack.completed.insight),
        'explanation.md': sha256(previews['explanation.md']),
        'evidence.csv': sha256(previews['evidence.csv']),
        'analysis-manifest.json': sha256(previews['analysis-manifest.json']),
      },
    },
    compatibility: {
      status: 'legacy-calculation',
      migrationId: MIGRATION_ID,
      recordedCalculationVersion: RECORDED_CALCULATION_VERSION,
      currentCalculationVersion: CURRENT_CALCULATION_VERSION,
      changedFields: [
        'calculation.realPurchasingPowerRate',
        'calculationVersion',
        'cityContext',
      ],
      recordedContextStatus: 'not-recorded',
      currentContextUsage: 'matching-only',
      recordedValue,
      currentValue,
      userNotice: notice,
    },
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(pack, null, 2)}\n`)
  console.log(`${file}: 已迁移为 ${REPLAY_SCHEMA_VERSION}`)
}
