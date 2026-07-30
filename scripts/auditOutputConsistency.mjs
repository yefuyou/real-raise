import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import {
  buildEvidenceCsv as buildWorkerEvidenceCsv,
  buildManifest as buildWorkerManifest,
  calculateLivingCost as calculateWorkerLivingCost,
  validateAnalysisRequest,
} from '../worker/core.mjs'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadTypeScriptModule(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  }).outputText
  const loaded = { exports: {} }
  const execute = new Function('exports', 'module', 'require', output)
  execute(loaded.exports, loaded, require)
  return loaded.exports
}

const {
  calculateLivingCost: calculateBrowserLivingCost,
} = loadTypeScriptModule('src/domain/livingCost.ts')
const {
  buildAnalysisManifest: buildBrowserManifest,
  buildEvidenceCsv: buildBrowserEvidenceCsv,
} = loadTypeScriptModule('src/api/analysisArtifacts.ts')

function csvRows(csv) {
  return new Map(
    csv
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [key, rawValue] = line.split(',', 3)
        return [key, rawValue]
      }),
  )
}

const numericFields = [
  ['monthlyRemainderChange', 'monthly_remainder_change'],
  ['annualRemainderChange', 'annual_remainder_change'],
  ['realPurchasingPowerRate', 'real_purchasing_power_rate'],
  ['breakEvenIncome', 'break_even_income'],
]

const fixtureFiles = [
  'comfortable-raise.json',
  'raise-and-fixed-costs.json',
  'take-home-raise-shrinks.json',
]

const results = []
for (const file of fixtureFiles) {
  const replay = JSON.parse(fs.readFileSync(path.join(root, 'public', 'replays', file), 'utf8'))
  const request = replay.request
  const browserCalculation = calculateBrowserLivingCost(request.input)
  const workerCalculation = calculateWorkerLivingCost(request.input)
  const validated = validateAnalysisRequest({ ...request, calculation: { ignored: true } })

  assert.deepEqual(workerCalculation, browserCalculation, `${file}: browser 与 Worker 公式输出不同`)
  assert.deepEqual(request.calculation, browserCalculation, `${file}: Replay 当前请求不是前端公式结果`)
  assert.deepEqual(validated.calculation, browserCalculation, `${file}: Worker 复算没有冻结相同结果`)

  const browserRequest = { ...request, calculation: browserCalculation }
  const browserManifest = JSON.parse(buildBrowserManifest({
    taskId: `audit-${replay.scenarioId}`,
    vendorTaskId: replay.vendorTaskId,
    request: browserRequest,
    sources: [],
    mode: 'replay',
  }))
  const workerManifest = JSON.parse(buildWorkerManifest({
    requestId: `audit-${replay.scenarioId}`,
    vendorTaskId: replay.vendorTaskId,
    request: validated,
    execution: { mode: 'partner-live', attribution: 'partner-user-key' },
  }))
  assert.deepEqual(browserManifest.calculation, browserCalculation, `${file}: 浏览器 Manifest 数字不同`)
  assert.deepEqual(workerManifest.calculation, browserCalculation, `${file}: Worker Manifest 数字不同`)

  const browserEvidence = csvRows(buildBrowserEvidenceCsv(browserRequest, []))
  const workerEvidence = csvRows(buildWorkerEvidenceCsv(validated))
  for (const [field, browserCsvField] of numericFields) {
    assert.equal(
      Number(browserEvidence.get(browserCsvField)),
      browserCalculation[field],
      `${file}: 浏览器 CSV ${browserCsvField} 数字不同`,
    )
    assert.equal(
      Number(workerEvidence.get(`calculation.${field}`)),
      browserCalculation[field],
      `${file}: Worker CSV calculation.${field} 数字不同`,
    )
  }

  results.push({
    scenario: replay.scenarioId,
    currentIncome: request.input.currentIncome,
    nextIncome: request.input.nextIncome,
    monthlyRemainderChange: browserCalculation.monthlyRemainderChange,
    annualRemainderChange: browserCalculation.annualRemainderChange,
    realPurchasingPowerRate: browserCalculation.realPurchasingPowerRate,
    breakEvenIncome: browserCalculation.breakEvenIncome,
  })
}

console.table(results)
console.log(
  `PASS ${results.length} 个固定 Replay 输入在前端公式、Worker 复算、Replay 当前请求、浏览器/Worker CSV 与 Manifest 之间完全一致。`,
)
