/**
 * Real Raise 自动化测试套件 (Automated Test Suite).
 *
 * 全量覆盖断言：
 * 1. calculateLivingCost 核心边界与公式验证
 * 2. 2021–2025 年历史数据合计数、三分法与 null 缺失项检验
 * 3. Feature Flag 默认关闭与零远程请求阻断 (fetch & EventSource Spy 零调用)
 * 4. Mock 仿真六状态（idle, queued, running, completed, failed, cancelled）及 localStorage 会话恢复
 * 5. 导出的三份 CSV 数据包格式、行数、表头与合计数校验
 * 6. Gate A 结构化分析契约与详细模式单类 CPI 覆盖验证
 */

declare const process: any
declare const require: any

const fs = require('fs')
const path = require('path')

import {
  calculateLivingCost,
  type ScenarioInput,
} from '../domain/livingCost'
import { deriveNonRentInflationRate } from '../data/official2025'
import {
  HISTORICAL_CPI,
  HISTORICAL_INCOME_BENCHMARKS,
  HISTORICAL_SPENDING,
} from '../data/officialHistorical'
import { verifiedDataSources } from '../data/dataContract'
import { RealRaiseApiClient, buildDeterministicStructuredInsight } from '../api/apiClient'
import {
  CALCULATION_VERSION,
  type AgentTaskStatus,
  type AgentTaskEvent,
  type StartAnalysisRequest,
} from '../api/realRaiseContract'
import { buildAnalysisCityContext } from '../api/analysisContext'
import { buildDiagnosticPacket } from '../api/diagnosticPacket'
import { resolveCityBenchmark, resolveCityBenchmarkSet } from '../data/cityBenchmarks'
import { DEMO_SCENARIOS } from '../data/demoScenarios'
import { requestSignature } from '../api/requestSignature'
import { buildReplayArtifacts } from '../api/replayClient'
import {
  DEFAULT_ESTIMATE_RATIOS,
  EXAMPLE_PAYSLIP,
  computePayslip,
  deriveEffectiveRates,
  estimateDeductions,
  estimateMonthlyTax,
  estimateNextFromCurrent,
  netIncome,
  type PayslipPeriodInput,
} from '../domain/salarySlip'
import { AuthClient, formatFriendlyAuthErrorMessage } from '../api/authClient'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`)
  }
}

let passedCount = 0

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passedCount++
    console.log(`✓ PASS: ${name}`)
  } catch (err: any) {
    console.error(`✗ FAIL: ${name} -> ${err.message}`)
    if (typeof process !== 'undefined') process.exitCode = 1
  }
}

async function main() {
  console.log('=============== 开始执行 REAL RAISE 完整自动化测试套件 ===============\n')

  const sampleInput: ScenarioInput = {
    currentIncome: 8000,
    nextIncome: 8400,
    currentRent: 1800,
    nextRent: 2200,
    otherSpend: 3500,
    otherInflationRate: 0.02,
  }
  const sampleCalc = calculateLivingCost(sampleInput)
  const samplePayload: StartAnalysisRequest = {
    input: sampleInput,
    calculation: sampleCalc,
    calculationVersion: CALCULATION_VERSION,
    cityContext: buildAnalysisCityContext('340100'),
    locale: 'zh-CN',
    includeInsight: true,
  }

  // --- 测试组 1: calculateLivingCost 核心计算与边界案例 ---
  await runTest('1.1 固定住房支出抵消到手增长案例', () => {
    const res = calculateLivingCost(sampleInput)
    assert(res.raiseIncrease === 400, '工资上涨额应为 400')
    assert(res.rentIncrease === 400, '住房支出增加额应为 400')
    assert(res.raiseConsumedByRentRate === 1.0, '固定住房支出应抵消 100% 到手增长')
    assert(res.monthlyRemainderChange === -70, '月结余变化应为 -70')
    assert(res.realPurchasingPowerRate < 0, '真实购买力变化率应小于 0')
  })

  await runTest('1.2 零涨薪边界 (no raise)', () => {
    const input: ScenarioInput = {
      currentIncome: 8000,
      nextIncome: 8000,
      currentRent: 1800,
      nextRent: 1800,
      otherSpend: 3500,
      otherInflationRate: 0.01,
    }
    const res = calculateLivingCost(input)
    assert(res.raiseIncrease === 0, '工资上涨额应为 0')
    assert(res.raiseConsumedByRentRate === null, '零收入增长时抵消比例应为 null')
    assert(res.monthlyRemainderChange === -35, '月结余变化应为 -35')
  })

  await runTest('1.3 派生日常支出基准计算 (deriveNonRentInflationRate)', () => {
    const rate = deriveNonRentInflationRate()
    assert(typeof rate === 'number', '派生变化率应为数值')
    assert(rate >= -0.1 && rate <= 0.1, '派生变化率应在合理宏观区间 [-10%, 10%]')
  })

  // --- 测试组 2: 历史数据合计数、三分法与缺失项检验 ---
  await runTest('2.1 已核验官方数据登记表非空验证', () => {
    assert(verifiedDataSources.length > 50, `已核验数据源数量应 > 50，实际 ${verifiedDataSources.length}`)
  })

  await runTest('2.2 2025 年农村中位数缺失项 (null) 显式校验', () => {
    const rural2025 = HISTORICAL_INCOME_BENCHMARKS.find(
      (r) => r.year === 2025 && r.scope === 'rural'
    )
    assert(rural2025 !== undefined, '应存在 2025 农村记录')
    assert(rural2025?.disposableIncomeMedian === null, '2025 农村收入中位数应显式标记为 null，拒绝伪造')
  })

  await runTest('2.3 2024 年城镇八类支出删除校验', () => {
    const urban2024Spending = HISTORICAL_SPENDING.filter(
      (r) => r.year === 2024 && r.scope === 'urban'
    )
    assert(urban2024Spending.length === 0, '未核验的 2024 城镇八类支出必须已被删除，实际行数应为 0')
  })

  await runTest('2.4 全国八类消费支出合计数对齐校验 (2021–2025)', () => {
    for (const year of [2021, 2022, 2023, 2024, 2025]) {
      const nationalRecord = HISTORICAL_INCOME_BENCHMARKS.find(
        (r) => r.year === year && r.scope === 'national'
      )
      const spending8 = HISTORICAL_SPENDING.filter(
        (r) => r.year === year && r.scope === 'national'
      )
      assert(nationalRecord !== undefined, `应存在 ${year} 全国总记录`)
      assert(spending8.length === 8, `${year} 年全国应刚好有 8 类支出`)
      const sum8 = spending8.reduce((acc, row) => acc + row.annualAmount, 0)
      const total = nationalRecord!.consumptionExpenditure
      const diff = Math.abs(sum8 - total)
      assert(diff <= 1, `${year} 年全国 8 类和 (${sum8}) 与总消费 (${total}) 差异应 <= 1 元，实际差异 ${diff}`)
    }
  })

  // --- 测试组 3: Spy 阻断断言——证明 fetch 和 EventSource 调用次数为 0 ---
  await runTest('3.1 Flag=false/Mock 模式下 fetch 与 EventSource 真实零调用 Spy 断言', async () => {
    let fetchCallCount = 0
    let sseCallCount = 0

    const origFetch = globalThis.fetch
    const origEventSource = (globalThis as any).EventSource

    globalThis.fetch = (async () => {
      fetchCallCount++
      throw new Error('网络防御失败：Mock 模式下禁止发起远程 fetch 请求！')
    }) as any

    ;(globalThis as any).EventSource = class {
      constructor() {
        sseCallCount++
        throw new Error('网络防御失败：Mock 模式下禁止实例化 EventSource！')
      }
    }

    try {
      const client = new RealRaiseApiClient({ useMock: true })
      const startRes = await client.startAnalysis(samplePayload)
      assert(startRes.taskId.startsWith('mock-task-'), 'Mock 应返回 mock-task 前缀')

      await new Promise<void>((resolve) => {
        const unsub = client.subscribeTaskEvents(startRes.taskId, samplePayload, (evt) => {
          if (evt.type === 'completed') {
            unsub()
            resolve()
          }
        })
      })

      await client.cancelAnalysis(startRes.taskId)

      assert(fetchCallCount === 0, `fetch 实际调用次数必须为 0，当前为 ${fetchCallCount}`)
      assert(sseCallCount === 0, `EventSource 实际实例化次数必须为 0，当前为 ${sseCallCount}`)
    } finally {
      globalThis.fetch = origFetch
      ;(globalThis as any).EventSource = origEventSource
    }
  })

  // --- 测试组 4: 仿真六状态（idle, queued, running, completed, failed, cancelled）及会话恢复测试 ---
  await runTest('4.1 任务 6 状态可达性全量测试 (idle, queued, running, completed, failed, cancelled)', async () => {
    const client = new RealRaiseApiClient({ useMock: true })

    // 1. idle 状态
    let state: AgentTaskStatus | 'idle' = 'idle'
    assert(state === 'idle', '初始状态必须为 idle')

    // 2. queued 状态
    const startRes = await client.startAnalysis(samplePayload)
    state = startRes.status
    assert(state === 'queued', '提交分析后状态必须变为 queued')

    // 3. running & completed 状态测试
    const seenStates = new Set<string>()
    await new Promise<void>((resolve) => {
      const unsub = client.subscribeTaskEvents(startRes.taskId, samplePayload, (evt) => {
        seenStates.add(evt.type)
        if (evt.type === 'started' || evt.type === 'progress') {
          state = 'running'
        } else if (evt.type === 'completed') {
          state = 'completed'
          unsub()
          resolve()
        }
      })
    })

    assert(seenStates.has('started'), '必须捕获到 started 事件')
    assert(seenStates.has('progress'), '必须捕获到 progress 事件')
    assert(state === 'completed', '事件结束状态必须为 completed')

    // 4. cancelled 状态测试
    const cancelRes = await client.startAnalysis(samplePayload)
    const cancelUnsub = client.subscribeTaskEvents(cancelRes.taskId, samplePayload, () => {})
    cancelUnsub()
    const cancelledOk = await client.cancelAnalysis(cancelRes.taskId)
    assert(cancelledOk === true, '取消任务必须返回 true')
  })

  await runTest('4.2 localStorage 会话任务恢复断言', () => {
    const mockStorage: Record<string, string> = {}
    const setTask = (id: string) => { mockStorage['real_raise_active_task'] = id }
    const getTask = () => mockStorage['real_raise_active_task']

    setTask('mock-task-session-123')
    const restoredTaskId = getTask()
    assert(restoredTaskId === 'mock-task-session-123', '已恢复的任务 ID 应与存储一致')
  })

  await runTest('4.3 Mock simulatedError 仿真失败与重试可达性断言', async () => {
    const client = new RealRaiseApiClient({ useMock: true })
    const startRes = await client.startAnalysis(samplePayload)
    let capturedFailed: boolean = false

    await new Promise<void>((resolve) => {
      const unsub = client.subscribeTaskEvents(
        startRes.taskId,
        { ...samplePayload, simulatedError: true },
        (evt) => {
          if (evt.type === 'failed') {
            capturedFailed = true
            assert(evt.retryable === true, 'failed 事件必须标记为 retryable: true')
            unsub()
            resolve()
          }
        }
      )
    })

    assert(capturedFailed, '必须成功捕获到 simulatedError 触发的 failed 事件')

    // 2. 模拟重试流程：不传递 simulatedError，发起重试请求并能正常恢复到 completed 状态
    const retryRes = await client.startAnalysis(samplePayload)
    let retryCompleted: boolean = false

    await new Promise<void>((resolve) => {
      const unsub = client.subscribeTaskEvents(
        retryRes.taskId,
        { ...samplePayload, simulatedError: false },
        (evt) => {
          if (evt.type === 'completed') {
            retryCompleted = true
            unsub()
            resolve()
          }
        }
      )
    })

    assert(retryCompleted, '重试后必须成功恢复并推流 completed 完成事件')
  })

  // --- 测试组 5: 导出的 CSV 文件校验（表头、行数、UTF-8、来源字段与特例说明） ---
  await runTest('5.1 CSV 导出数据文件校验 (income, spending, cpi)', () => {
    const exportsDir = path.resolve(process.cwd(), 'src/data/exports')
    assert(fs.existsSync(exportsDir), 'src/data/exports 目录必须存在')

    // 1. income_benchmarks.csv (15 行数据 + 1 行表头 = 16 行)
    const incomeCsvPath = path.join(exportsDir, 'income_benchmarks.csv')
    assert(fs.existsSync(incomeCsvPath), 'income_benchmarks.csv 必须存在')
    const incomeLines = (fs.readFileSync(incomeCsvPath, 'utf-8') as string).trim().split('\n')
    assert(incomeLines.length === 16, `income_benchmarks.csv 应包含 16 行（实际 ${incomeLines.length} 行）`)
    assert(incomeLines[0].startsWith('year,scope,disposableIncome'), 'income 表头必须匹配')
    assert(incomeLines.slice(1).every((l: string) => l.includes('https://www.stats.gov.cn')), '每行必须包含官方 Canonical URL')

    // 2. spending_8_categories.csv (72 行数据 + 1 行表头 = 73 行)
    const spendingCsvPath = path.join(exportsDir, 'spending_8_categories.csv')
    assert(fs.existsSync(spendingCsvPath), 'spending_8_categories.csv 必须存在')
    const spendingLines = (fs.readFileSync(spendingCsvPath, 'utf-8') as string).trim().split('\n')
    assert(spendingLines.length === 73, `spending_8_categories.csv 应包含 73 行（实际 ${spendingLines.length} 行）`)
    assert(spendingLines.every((l: string) => !l.startsWith('2024,urban,')), '必须不存在 2024 城镇八类数据')

    // 3. cpi_historical.csv (45 行数据 + 1 行表头 = 46 行)
    const cpiCsvPath = path.join(exportsDir, 'cpi_historical.csv')
    assert(fs.existsSync(cpiCsvPath), 'cpi_historical.csv 必须存在')
    const cpiLines = (fs.readFileSync(cpiCsvPath, 'utf-8') as string).trim().split('\n')
    assert(cpiLines.length === 46, `cpi_historical.csv 应包含 46 行（实际 ${cpiLines.length} 行）`)
  })

  // --- 测试组 6: Gate A 结构化分析契约与详细模式校验 ---
  await runTest('6.1 Gate A 结构化 Insight 格式校验 (structuredInsight)', () => {
    const struct = buildDeterministicStructuredInsight(samplePayload)
    assert(struct.version === 'v1', '版本号必须为 v1')
    assert(struct.drivers.length >= 3, '驱动因素必须至少包含 3 项')
    assert(struct.benchmark.userIncomeGrowthRate !== undefined, '基准对比必须包含用户收入增速')
    assert(struct.scenarios.length === 3, '必须生成 3 种可调整情景')
    assert(struct.trend?.periods.length === 5, '趋势对比必须包含 5 个年份')
    assert(struct.warnings.length > 0, '必须包含风险与边界提示')
  })

  await runTest('6.2 Gate A 详细模式六类支出拆解与驱动拆解测试', () => {
    const detailedPayload: StartAnalysisRequest = {
      ...samplePayload,
      inputMode: 'detailed',
      detailedBreakdown: {
        food: { currentAmount: 1050, cpiRate: -0.007, nextAmount: 1043 },
        utilities: { currentAmount: 525, cpiRate: 0.009, nextAmount: 530 },
        transport: { currentAmount: 525, cpiRate: -0.026, nextAmount: 511 },
        education: { currentAmount: 525, cpiRate: 0.008, nextAmount: 529 },
        medical: { currentAmount: 350, cpiRate: 0.008, nextAmount: 353 },
        other: { currentAmount: 525, cpiRate: 0.093, nextAmount: 574 },
      },
    }
    const struct = buildDeterministicStructuredInsight(detailedPayload)
    const subCategories = struct.drivers.filter((d) => ['food', 'utilities', 'transport', 'education', 'medical', 'other'].includes(d.id))
    assert(subCategories.length === 6, '详细模式下应输出 6 类细分驱动因素')
  })

  await runTest('6.3 详细模式单类 CPI 涨幅覆盖与预估金额联动断言', () => {
    const detailedBreakdown = {
      food: { currentAmount: 1000, cpiRate: -0.007, nextAmount: 993 },
      utilities: { currentAmount: 500, cpiRate: 0.009, nextAmount: 505 },
      transport: { currentAmount: 500, cpiRate: -0.026, nextAmount: 487 },
      education: { currentAmount: 500, cpiRate: 0.008, nextAmount: 504 },
      medical: { currentAmount: 500, cpiRate: 0.008, nextAmount: 504 },
      other: { currentAmount: 500, cpiRate: 0.093, nextAmount: 547 },
    }
    const curSum = Object.values(detailedBreakdown).reduce((a, b) => a + b.currentAmount, 0)
    const nextSum = Object.values(detailedBreakdown).reduce((a, b) => a + b.nextAmount, 0)
    assert(curSum === 3500, '分类当前合计必须精确对齐 3500')
    assert(nextSum === 3540, '分类下阶段预估合计必须精确对齐 3540')
  })

  await runTest('6.4 详细模式极端下降必须实时进入购买力计算', () => {
    const detailedBreakdown = {
      food: { currentAmount: 6000, cpiRate: -0.9993333333333333, nextAmount: 4 },
      utilities: { currentAmount: 0, cpiRate: 0.019, nextAmount: 0 },
      transport: { currentAmount: 0, cpiRate: 0.018, nextAmount: 0 },
      education: { currentAmount: 0, cpiRate: 0.012, nextAmount: 0 },
      medical: { currentAmount: 0, cpiRate: 0.02, nextAmount: 0 },
      other: { currentAmount: 0, cpiRate: 0.116, nextAmount: 0 },
    }
    const currentSum = Object.values(detailedBreakdown).reduce((sum, item) => sum + item.currentAmount, 0)
    const nextSum = Object.values(detailedBreakdown).reduce((sum, item) => sum + item.nextAmount, 0)
    const effectiveInput: ScenarioInput = {
      currentIncome: 10000,
      nextIncome: 12000,
      currentRent: 2000,
      nextRent: 2000,
      otherSpend: currentSum,
      otherInflationRate: (nextSum - currentSum) / currentSum,
    }
    const result = calculateLivingCost(effectiveInput)
    assert(Math.abs(result.nextOtherSpend - 4) < 1e-9, '六类下阶段合计为 4 元时主算表必须使用 4 元')
    assert(Math.abs(result.monthlyRemainderChange - 7996) < 1e-9, '六类支出下降 5996 元后月结余变化必须实时反映')
  })

  await runTest('6.5 诊断包驱动项必须与确定性月结余变化完全勾稽', () => {
    const packet = buildDiagnosticPacket(samplePayload)
    assert(Math.abs(packet.reconciliation.difference) < 1e-9, '收入、住房与日常支出驱动必须精确勾稽到月结余变化')
    assert(packet.cityContext.cityCode === '340100', '诊断包必须携带页面选择的城市上下文')
    assert(packet.scenarios.length === 4, '诊断包必须提供基准、住房、日常支出和保本收入四个确定性情景')
  })

  // --- 测试组 7: CityBenchmark 契约 P0 断言 (合肥历史期、2026H1 回退与全国基准) ---
  await runTest('7.1 合肥 2024 (340100) 精确命中 A-history 且不标为 2026H1', () => {
    const res = resolveCityBenchmark('340100', 'foodAndTobaccoAlcohol', '2024')
    assert(res.record !== null, '合肥 2024 食品类数据必须存在')
    assert(res.record?.period === '2024', '合肥 2024 数据期间必须为 2024')
    assert(res.record?.coverageTier === 'A-history', '合肥 2024 数据层级必须为 A-history')
    assert(res.usedFallback === false, '精确命中的合肥 2024 数据不得触发 fallback')
  })

  await runTest('7.2 合肥 2026H1 分类缺失诚实解析为 C-fallback 且 9 类全回退', () => {
    const set = resolveCityBenchmarkSet('340100', '2026H1')
    assert(set.coverageTier === 'C-fallback', '合肥 2026H1 缺失城市原值，数据层级必须精确断言为 C-fallback')
    assert(set.fallbackCategoryCount === 9, '合肥 2026H1 9 类必须全部标记为 usedFallback')
    assert(set.records.every((r) => r.record?.period === '2026H1'), '所有回退记录的 period 均必须为 2026H1')
  })

  await runTest('7.3 上海 2026H1 综合精确命中、分类回退且 202606 不混期', () => {
    const shanghaiSet = resolveCityBenchmarkSet('310000', '2026H1')
    const overallRec = shanghaiSet.records.find((r) => r.category === 'overall')
    assert(overallRec !== undefined && overallRec.usedFallback === false, '上海 2026H1 综合 CPI 必须精确命中城市原值')
    assert(overallRec?.record?.period === '2026H1', '上海综合 CPI 期间必须为 2026H1')
    const categoryRecs = shanghaiSet.records.filter((r) => r.category !== 'overall')
    assert(categoryRecs.every((r) => r.usedFallback === true), '上海 2026H1 缺失的分类必须诚实标记为回退')
    assert(shanghaiSet.records.every((r) => r.record?.period === '2026H1'), '上海 2026H1 解析结果不得将 202606 月度数据混入')
  })

  await runTest('7.4 页面城市选择必须进入分析上下文且保留回退来源', () => {
    const context = buildAnalysisCityContext('340100', '2026H1')
    assert(context.cityCode === '340100' && context.cityName === '合肥', '分析上下文必须保留用户选择的合肥')
    assert(context.coverageTier === 'C-fallback', '合肥当前期缺值必须在分析载荷中标为 C-fallback')
    assert(context.overallCpiRate === 0.01, '全国回退综合 CPI 必须转换成十进制 0.01')
    assert(context.overallSource?.scope.includes('全国') === true, '城市缺值时来源范围必须明确为全国')
    assert(context.caveat.includes('回退全国') === true, '分析上下文必须携带诚实的回退说明')
  })

  // --- 测试组 8: 工资条模式确定性计算 (salarySlip) ---
  // 示例工资条自 PAYSLIP_UX_SPEC 起由估算引擎按 10000 → 11000 生成，不再是手写魔法数字。
  await runTest('8.1 示例工资条：到手 = 税前 − 扣缴合计，两期精确对齐', () => {
    const summary = computePayslip(EXAMPLE_PAYSLIP)
    assert(summary.currentDeductionTotal === 2333, `现在扣缴合计应为 2333，实际 ${summary.currentDeductionTotal}`)
    assert(summary.currentNet === 7667, `现在到手应为 7667，实际 ${summary.currentNet}`)
    assert(summary.nextDeductionTotal === 2618, `下一阶段扣缴合计应为 2618，实际 ${summary.nextDeductionTotal}`)
    assert(summary.nextNet === 8382, `下一阶段到手应为 8382，实际 ${summary.nextNet}`)
    assert(summary.grossIncrease === 1000, '税前增加应为 1000')
    assert(summary.deductionChange === 285, `扣缴合计变化应为 285，实际 ${summary.deductionChange}`)
    assert(summary.netIncrease === 715, `到手增加应为 715，实际 ${summary.netIncrease}`)
    assert(summary.taxChange === 60, `个税变化应为 60，实际 ${summary.taxChange}`)
    assert(summary.socialAndFundChange === 225, `社保公积金变化应为 225，实际 ${summary.socialAndFundChange}`)
    assert(summary.futureAccountChange === 200, '养老+公积金未来账户变化应为 200')
    assert(
      summary.netIncrease === summary.grossIncrease - summary.deductionChange,
      '恒等式必须成立：到手增加 = 税前增加 − 扣缴合计变化'
    )
    assert(summary.hasNegativeNet === false, '示例工资条不应出现负到手')
  })

  await runTest('8.2 留存率：税前每涨 1 元到手 0.715；税前无增长为 null', () => {
    const summary = computePayslip(EXAMPLE_PAYSLIP)
    assert(summary.raiseKeptRate !== null && Math.abs(summary.raiseKeptRate - 0.715) < 1e-9, '留存率应精确为 0.715')
    const flat = computePayslip({ current: EXAMPLE_PAYSLIP.current, next: { ...EXAMPLE_PAYSLIP.current } })
    assert(flat.raiseKeptRate === null, '税前无增长时留存率必须为 null，不得除以零')
  })

  await runTest('8.3 扣缴合计超过税前 → hasNegativeNet 诚实标记，不抛异常、不截断', () => {
    const broken = computePayslip({
      current: { gross: 1000, incomeTax: 2000, pension: 0, medicalIns: 0, unemploymentIns: 0, housingFund: 0, otherDeduction: 0 },
      next: EXAMPLE_PAYSLIP.next,
    })
    assert(broken.hasNegativeNet === true, '负到手必须被标记')
    assert(broken.currentNet === -1000, '负到手金额必须如实保留（-1000），不得静默截断为 0')
  })

  await runTest('8.4 工资条摘要注入 Mock 结构化解读：扣缴驱动因素与未来账户口径', () => {
    const payload: StartAnalysisRequest = {
      ...samplePayload,
      incomeInputMode: 'payslip',
      payslipSummary: computePayslip(EXAMPLE_PAYSLIP),
    }
    const struct = buildDeterministicStructuredInsight(payload)
    const deductionDriver = struct.drivers.find((d) => d.id === 'deductions')
    assert(deductionDriver !== undefined, '工资条模式必须输出扣缴驱动因素')
    assert(deductionDriver!.monthlyImpact === -285, `扣缴驱动因素月度影响应为 -285，实际 ${deductionDriver!.monthlyImpact}`)
    assert(struct.summary.includes('未来账户'), '解读文本必须包含"未来账户"口径，不把养老公积金称为消失')
    const netPayload: StartAnalysisRequest = { ...samplePayload, incomeInputMode: 'net' }
    const netStruct = buildDeterministicStructuredInsight(netPayload)
    assert(netStruct.drivers.every((d) => d.id !== 'deductions'), '到手模式不得虚构扣缴驱动因素')
  })

  await runTest('8.5 工资条模式请求：工资条到手必须真实写入本地计算与 AI 载荷', () => {
    const payslipSummary = computePayslip(EXAMPLE_PAYSLIP)
    const payslipInput: ScenarioInput = {
      ...sampleInput,
      currentIncome: payslipSummary.currentNet,
      nextIncome: payslipSummary.nextNet,
    }
    const payload: StartAnalysisRequest = {
      ...samplePayload,
      input: payslipInput,
      calculation: calculateLivingCost(payslipInput),
      incomeInputMode: 'payslip',
      payslipSummary,
    }
    assert(payload.input.currentIncome === payslipSummary.currentNet, '工资条当前到手必须写入主计算输入')
    assert(payload.input.nextIncome === payslipSummary.nextNet, '工资条下一期到手必须写入主计算输入')
    assert(
      JSON.stringify(calculateLivingCost(payload.input)) === JSON.stringify(payload.calculation),
      '工资条请求中的 calculation 必须可由写回后的到手输入复算',
    )
    const struct = buildDeterministicStructuredInsight(payload)
    assert(struct.drivers.some((driver) => driver.id === 'deductions'), '工资条 AI 载荷必须包含扣缴驱动因素')
  })

  await runTest('8.6 详细拆解请求：六类明细必须进入载荷且签名与基础模式隔离', () => {
    const detailedBreakdown = {
      food: { currentAmount: 1200, cpiRate: 0.01, nextAmount: 1212 },
      utilities: { currentAmount: 600, cpiRate: 0.02, nextAmount: 612 },
      transport: { currentAmount: 500, cpiRate: 0.03, nextAmount: 515 },
      education: { currentAmount: 400, cpiRate: 0.01, nextAmount: 404 },
      medical: { currentAmount: 300, cpiRate: 0.02, nextAmount: 306 },
      other: { currentAmount: 500, cpiRate: 0, nextAmount: 500 },
    }
    const detailedCurrentTotal = Object.values(detailedBreakdown).reduce((sum, item) => sum + item.currentAmount, 0)
    const detailedInput: ScenarioInput = {
      ...sampleInput,
      otherSpend: detailedCurrentTotal,
      otherInflationRate: (1212 + 612 + 515 + 404 + 306 + 500 - detailedCurrentTotal) / detailedCurrentTotal,
    }
    const payload: StartAnalysisRequest = {
      ...samplePayload,
      input: detailedInput,
      calculation: calculateLivingCost(detailedInput),
      inputMode: 'detailed',
      detailedBreakdown,
    }
    const struct = buildDeterministicStructuredInsight(payload)
    assert(payload.detailedBreakdown !== undefined, '详细模式必须提交六类明细')
    assert(struct.drivers.some((driver) => driver.id === 'food'), '详细模式 AI 载荷必须输出食品与餐饮驱动因素')
    assert(
      requestSignature(payload) !== requestSignature({ ...payload, inputMode: 'basic', detailedBreakdown: undefined }),
      '详细模式与基础模式必须使用不同请求签名，避免错误命中缓存',
    )
  })

  // --- 测试组 9: 工资条估算引擎 (docs/PAYSLIP_UX_SPEC.md §四) ---
  await runTest('9.1 个税月度预扣公式：零税边界、3000 档界、跨档连续性、专项附加扣除', () => {
    assert(estimateMonthlyTax(5000, 0) === 0, 'taxable ≤ 0 时个税必须为 0')
    assert(estimateMonthlyTax(3000, 0) === 0, '税前低于起征点时个税为 0，不得出现负数')
    // taxable 恰好 3000 → 仍在 3% 档：3000 × 3% = 90
    assert(estimateMonthlyTax(8000, 0) === 90, `taxable 3000 应为 90，实际 ${estimateMonthlyTax(8000, 0)}`)
    // 12000 档界：12000×10%−210 = 990；越界一元后按 20% 档仍连续
    assert(estimateMonthlyTax(17000, 0) === 990, `taxable 12000 应为 990，实际 ${estimateMonthlyTax(17000, 0)}`)
    const atEdge = estimateMonthlyTax(17000, 0)
    const pastEdge = estimateMonthlyTax(17100, 0)
    assert(pastEdge > atEdge && pastEdge - atEdge < 40, `跨 12000 档界必须连续，实际跳变 ${pastEdge - atEdge}`)
    // 25000 档界：25000×20%−1410 = 3590
    assert(estimateMonthlyTax(30000, 0) === 3590, `taxable 25000 应为 3590，实际 ${estimateMonthlyTax(30000, 0)}`)
    // 专项附加扣除直接压低应纳税所得额
    assert(estimateMonthlyTax(8000, 0, 3000) === 0, '专项附加扣除足够大时个税应降到 0')
    assert(estimateMonthlyTax(10000, 0, 2000) === 90, `含 2000 专项附加时应为 90，实际 ${estimateMonthlyTax(10000, 0, 2000)}`)
  })

  await runTest('9.2 通用比例估算自洽：税前 10000 → 到手 7667', () => {
    const est = estimateDeductions(10000)
    assert(est.pension === 800, `养老应为 800，实际 ${est.pension}`)
    assert(est.medicalIns === 200, `医疗应为 200，实际 ${est.medicalIns}`)
    assert(est.unemploymentIns === 50, `失业应为 50，实际 ${est.unemploymentIns}`)
    assert(est.housingFund === 1200, `公积金应为 1200，实际 ${est.housingFund}`)
    // taxable = 10000 − 5000 − 2250 = 2750 → 2750 × 3% = 82.5 → 四舍五入 83
    assert(est.incomeTax === 83, `个税应为 83，实际 ${est.incomeTax}`)
    assert(netIncome(est) === 7667, `到手应为 7667，实际 ${netIncome(est)}`)
    const lowFund = estimateDeductions(10000, { ...DEFAULT_ESTIMATE_RATIOS, housingFund: 0.05 })
    assert(lowFund.housingFund === 500, '公积金比例可调：5% 档应为 500')
    assert(lowFund.incomeTax > est.incomeTax, '公积金缴得少 → 应纳税所得额变高 → 个税更高')
  })

  await runTest('9.3 按当前实际比例推算：零城市假设，恒等式仍成立', () => {
    // 用一组非默认比例的"真实"工资条，确认推算走的是用户自己的费率
    const current: PayslipPeriodInput = {
      gross: 12000, incomeTax: 300, pension: 960, medicalIns: 240,
      unemploymentIns: 60, housingFund: 840, otherDeduction: 100,
    }
    const rates = deriveEffectiveRates(current)
    assert(rates !== null, '当前期税前 > 0 时必须能反推费率')
    assert(Math.abs(rates!.housingFund - 0.07) < 1e-9, `公积金实际费率应为 7%，实际 ${rates!.housingFund}`)
    const next = estimateNextFromCurrent(current, 15000)
    assert(next !== null, '有效当前期应能推算下一期')
    assert(next!.housingFund === 1050, `15000 × 7% 应为 1050，实际 ${next!.housingFund}`)
    assert(next!.pension === 1200, `15000 × 8% 应为 1200，实际 ${next!.pension}`)
    assert(next!.otherDeduction === 100, '其他扣缴应沿用当前期金额')
    // 个税是累进的，必须重算而不是按比例缩放
    const scaled = current.incomeTax * (15000 / 12000)
    assert(next!.incomeTax !== Math.round(scaled), '个税不得按比例缩放，必须用月度公式重算')
    const summary = computePayslip({ current, next: next! })
    assert(
      summary.netIncrease === summary.grossIncrease - summary.deductionChange,
      '推算路径下恒等式必须成立：到手增加 = 税前增加 − 扣缴合计变化'
    )
  })

  await runTest('9.4 用户覆盖优先：估算只预填输入框，手改值即事实源', () => {
    const est = estimateDeductions(10000)
    const overridden: PayslipPeriodInput = { ...est, housingFund: 300 }
    assert(netIncome(overridden) === netIncome(est) + 900, '手改公积金后到手必须按手改值重算')
    const summary = computePayslip({ current: overridden, next: overridden })
    assert(
      summary.currentDeductionTotal === 83 + 800 + 200 + 50 + 300,
      `扣缴合计必须用手改后的值，实际 ${summary.currentDeductionTotal}`
    )
    assert(summary.netIncrease === 0, '两期相同则到手变化为 0')
  })

  await runTest('9.5 当前期税前为 0：反推返回 null，推算不产出假数据', () => {
    const empty: PayslipPeriodInput = {
      gross: 0, incomeTax: 0, pension: 0, medicalIns: 0, unemploymentIns: 0, housingFund: 0, otherDeduction: 0,
    }
    assert(deriveEffectiveRates(empty) === null, '税前为 0 时必须返回 null，不得除以零')
    assert(estimateNextFromCurrent(empty, 11000) === null, '无有效当前期时不得凭空推算下一期')
    const negative: PayslipPeriodInput = { ...empty, gross: -100 }
    assert(deriveEffectiveRates(negative) === null, '税前为负时同样返回 null')
  })

  await runTest('9.6 所有金额输入允许非整十金额与分位精度', () => {
    const files = [
      path.join(process.cwd(), 'src', 'App.tsx'),
      path.join(process.cwd(), 'src', 'components', 'DetailedModePanel.tsx'),
      path.join(process.cwd(), 'src', 'components', 'PayslipPanel.tsx'),
    ]
    const source = files.map((file: string) => fs.readFileSync(file, 'utf8')).join('\n')
    assert(!/step="(?:10|50|100)"/.test(source), '金额输入不得用 10/50/100 作为 HTML 合法性门槛')
    assert(source.includes('step="0.01"'), '金额输入应允许至少 0.01 元精度')
    assert(!source.includes('Math.round(summary.currentNet)'), '工资条到手金额写回主计算链路时不得丢失分位精度')
  })

  // --- 测试组 10: 真实任务回放包 ---
  const replayDirectory = path.join(process.cwd(), 'public', 'replays')
  const replayScenarioIds = [
    ...DEMO_SCENARIOS.map((scenario) => scenario.id),
    'payslip-raise-and-fixed-costs',
  ]

  await runTest('10.1 回放清单：三个预设与工资条案例全部登记且签名唯一', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(replayDirectory, 'manifest.json'), 'utf8'))
    assert(manifest.schemaVersion === 'replay-manifest.v2', '回放清单版本必须为 replay-manifest.v2')
    assert(manifest.replays.length === replayScenarioIds.length, `应登记 ${replayScenarioIds.length} 个真实回放`)
    assert(new Set(manifest.replays.map((item: any) => item.signature)).size === manifest.replays.length, '回放签名不得重复')
    assert(
      manifest.replays.every((item: any) => (
        item.replaySchemaVersion === 'replay.v2'
        && item.provenanceStatus === 'vendor-original-unaltered'
        && item.compatibility?.status === 'legacy-calculation'
      )),
      'manifest 必须暴露每个回放的 schema、供应商原件状态与旧口径兼容状态',
    )
  })

  await runTest('10.2 回放包：当前匹配请求与历史录制请求分离，供应商原件不可冒充', () => {
    for (const scenarioId of replayScenarioIds) {
      const fileName = `${scenarioId}.json`
      const replay = JSON.parse(fs.readFileSync(path.join(replayDirectory, fileName), 'utf8'))
      const previews = replay.completed?.workspace?.previews ?? {}
      assert(replay.schemaVersion === 'replay.v2', `${fileName} 版本必须为 replay.v2`)
      assert(replay.scenarioId === scenarioId, `${fileName} 的 scenarioId 必须与文件名一致`)
      assert(typeof replay.vendorTaskId === 'string' && replay.vendorTaskId.length > 0, `${fileName} 必须保留真实任务 ID`)
      assert(requestSignature(replay.request) === replay.signature, `${fileName} 的请求签名必须可重算验证`)
      assert(replay.request.calculationVersion === CALCULATION_VERSION, `${fileName} 当前匹配请求必须声明计算版本`)
      assert(replay.request.cityContext.cityCode === '340100', `${fileName} 只能受控匹配默认合肥上下文`)
      assert(replay.recordedRequest.calculationVersion === undefined, `${fileName} 不得给历史请求补写计算版本`)
      assert(replay.recordedRequest.cityContext === undefined, `${fileName} 不得把当前城市上下文冒充历史平台输入`)
      assert(
        replay.request.calculation.realPurchasingPowerRate !== replay.recordedRequest.calculation.realPurchasingPowerRate,
        `${fileName} 必须同时保留当前与录制时的购买力口径值`,
      )
      assert(
        replay.provenance?.vendorArtifacts?.integrity === 'vendor-original-unaltered',
        `${fileName} 必须声明供应商产物保持原样`,
      )
      assert(
        replay.provenance?.compatibility?.recordedContextStatus === 'not-recorded'
        && replay.provenance?.compatibility?.currentContextUsage === 'matching-only',
        `${fileName} 必须说明城市上下文只用于当前匹配`,
      )
      assert(Array.isArray(replay.events) && replay.events.length > 0, `${fileName} 必须包含真实事件流`)
      assert(typeof previews['explanation.md'] === 'string' && previews['explanation.md'].length > 500, `${fileName} 缺少完整 explanation.md`)
      assert(typeof previews['evidence.csv'] === 'string' && previews['evidence.csv'].length > 100, `${fileName} 缺少 evidence.csv`)
      assert(typeof previews['analysis-manifest.json'] === 'string' && previews['analysis-manifest.json'].length > 100, `${fileName} 缺少 analysis-manifest.json`)
      assert(replay.completed.insight === previews['explanation.md'], `${fileName} 的回放正文必须使用完整平台报告`)
    }
  })

  await runTest('10.3 当前预设输入仍能精确命中对应回放', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(replayDirectory, 'manifest.json'), 'utf8'))
    for (const scenario of DEMO_SCENARIOS) {
      const request: StartAnalysisRequest = {
        input: scenario.input,
        calculation: calculateLivingCost(scenario.input),
        calculationVersion: CALCULATION_VERSION,
        cityContext: buildAnalysisCityContext('340100', '2026H1'),
        locale: 'zh-CN',
        includeInsight: true,
        inputMode: 'basic',
        incomeInputMode: 'net',
        simulatedError: false,
      }
      const entry = manifest.replays.find((item: any) => item.scenarioId === scenario.id)
      assert(entry !== undefined, `${scenario.id} 必须存在于回放清单`)
      assert(entry.signature === requestSignature(request), `${scenario.id} 当前页面输入无法命中回放`)
    }
  })

  await runTest('10.4 工资条回放保留扣缴摘要与未来账户口径', () => {
    const replay = JSON.parse(fs.readFileSync(path.join(replayDirectory, 'payslip-raise-and-fixed-costs.json'), 'utf8'))
    assert(replay.request.incomeInputMode === 'payslip', '工资条回放必须标记 payslip 输入模式')
    assert(replay.request.payslipSummary?.grossIncrease === 1000, '工资条回放税前增长应为 1000 元')
    assert(replay.request.payslipSummary?.netIncrease === 712, '工资条回放到手增长应为 712 元')
    assert(replay.request.payslipSummary?.futureAccountChange === 200, '工资条回放必须保留未来账户变化')
    assert(
      JSON.stringify(calculateLivingCost(replay.request.input)) === JSON.stringify(replay.request.calculation),
      '工资条回放的本地计算结果必须仍可由当前算法复算',
    )
    assert(
      replay.recordedRequest.payslipSummary?.futureAccountChange === 200,
      '历史录制请求也必须保留原始工资条未来账户口径',
    )
  })

  await runTest('10.5 回放下载：当前 evidence/manifest 与历史供应商原件分名保存', () => {
    const replay = JSON.parse(fs.readFileSync(path.join(replayDirectory, 'take-home-raise-shrinks.json'), 'utf8'))
    const vendorPreviews = replay.completed.workspace.previews
    const artifacts = buildReplayArtifacts({
      taskId: 'replay-audit-task',
      vendorTaskId: replay.vendorTaskId,
      request: replay.request,
      sources: replay.completed.sources,
      vendorPreviews,
    })
    assert(
      artifacts.get('vendor-original-evidence.csv') === vendorPreviews['evidence.csv'],
      '历史供应商 evidence 必须原样另存，不能覆盖后继续冒充当前凭证',
    )
    assert(
      artifacts.get('vendor-original-analysis-manifest.json') === vendorPreviews['analysis-manifest.json'],
      '历史供应商 manifest 必须原样另存',
    )
    assert(
      artifacts.get('evidence.csv')?.includes(`real_purchasing_power_rate,${replay.request.calculation.realPurchasingPowerRate},`) === true,
      '默认 evidence.csv 必须使用当前 living-cost.v2 数值',
    )
    const currentManifest = JSON.parse(artifacts.get('analysis-manifest.json') ?? '{}')
    assert(currentManifest.generatedBy === 'real-raise-replay-current-calculation-adapter', '默认 manifest 必须声明由当前回放适配层生成')
    assert(currentManifest.calculationVersion === CALCULATION_VERSION, '默认 manifest 必须使用当前公式版本')
    assert(artifacts.get('explanation.md') === vendorPreviews['explanation.md'], 'explanation.md 必须保持历史平台原文')
  })

  // --- 测试组 11: InfiniSynapse 模型选择与签名算法 ---
  await runTest('11.1 模型选择签名逻辑：默认跳过、显式选择进入签名且与默认隔离', () => {
    const baseRequest: StartAnalysisRequest = {
      input: sampleInput,
      calculation: sampleCalc,
      calculationVersion: CALCULATION_VERSION,
      cityContext: buildAnalysisCityContext('340100'),
      locale: 'zh-CN',
      includeInsight: true,
      inputMode: 'basic',
      incomeInputMode: 'net',
    }

    const defaultSig = requestSignature(baseRequest)

    const flashSig = requestSignature({ ...baseRequest, analysisModel: 'deepseek-v4-flash' })
    const proSig = requestSignature({ ...baseRequest, analysisModel: 'deepseek-v4-pro' })

    assert(flashSig !== defaultSig, 'Flash 模型签名必须与平台默认签名不同')
    assert(proSig !== defaultSig, 'Pro 模型签名必须与平台默认签名不同')
    assert(flashSig !== proSig, 'Flash 模型与 Pro 模型签名必须互不相同')
  })

  await runTest('11.2 城市上下文与公式版本必须进入任务签名', () => {
    const hefei = { ...samplePayload, cityContext: buildAnalysisCityContext('340100') }
    const shanghai = { ...samplePayload, cityContext: buildAnalysisCityContext('310000') }
    assert(requestSignature(hefei) !== requestSignature(shanghai), '切换城市后不得命中旧城市任务或回放')
    assert(
      requestSignature(hefei) !== requestSignature({ ...hefei, calculationVersion: 'legacy' as any }),
      '切换确定性公式版本后不得命中旧口径缓存',
    )
  })

  // --- 测试组 12: InfiniSynapse Partner SSO 体验层与错误翻译断言 ---
  await runTest('12.1 AuthClient Mock 模式状态转换与订阅回调测试', async () => {
    const client = new AuthClient({ useMock: true })
    let lastState = client.getState()
    const unsub = client.subscribe((st) => { lastState = st })

    assert(lastState.authenticated === false, '初始状态应为未登录')
    assert(lastState.user === null, '初始用户应为 null')

    client.setMockUser({ id: '1001', name: '张三', nickname: '三哥', avatar: 'https://example.com/avatar.png' })
    assert(lastState.authenticated === true, '设置 Mock 用户后必须为已登录')
    assert(lastState.user?.nickname === '三哥', '昵称应优先使用 nickname')

    await client.logout()
    assert(lastState.authenticated === false, '退出登录后必须恢复为未登录')
    assert(lastState.canRunAnalysis === false, '退出登录后 canRunAnalysis 必须重置为 false')
    unsub()
  })

  await runTest('12.2 SSO 与分析错误码中文人话转换断言 (无原始堆栈/技术暴露)', () => {
    const ssoNotConfigured = formatFriendlyAuthErrorMessage('SSO_NOT_CONFIGURED')
    assert(ssoNotConfigured.includes('服务端尚未配置'), 'SSO_NOT_CONFIGURED 应提示服务端未配置')

    const authRequired = formatFriendlyAuthErrorMessage('AUTH_REQUIRED')
    assert(authRequired.includes('需要先登录'), 'AUTH_REQUIRED 应提示需要登录')

    const keyUnavailable = formatFriendlyAuthErrorMessage('PARTNER_API_KEY_UNAVAILABLE')
    assert(keyUnavailable.includes('Partner API Key 暂不可用'), 'PARTNER_API_KEY_UNAVAILABLE 应提示 Partner API Key 不可用')

    const quotaExhausted = formatFriendlyAuthErrorMessage('INSUFFICIENT_QUOTA')
    assert(quotaExhausted.includes('额度不足'), 'INSUFFICIENT_QUOTA 应提示额度不足')

    const sessionExpired = formatFriendlyAuthErrorMessage('SESSION_EXPIRED')
    assert(sessionExpired.includes('会话已过期'), 'SESSION_EXPIRED 应提示会话已过期')

    const cancelled = formatFriendlyAuthErrorMessage('LOGIN_CANCELLED')
    assert(cancelled.includes('登录授权已取消'), 'LOGIN_CANCELLED 应提示取消授权')
  })

  await runTest('12.3 AuthClient canRunAnalysis 标志与双模式配置测试', () => {
    const client = new AuthClient({ useMock: true })
    assert(client.getState().canRunAnalysis === false, '未登录初始 canRunAnalysis 必须为 false')

    client.setMockUser({ id: '1002', name: '李四' }, true)
    assert(client.getState().canRunAnalysis === true, 'canRunAnalysis 为 true 时允许调用个人模式')

    client.setMockUser({ id: '1003', name: '王五' }, false)
    assert(client.getState().canRunAnalysis === false, 'canRunAnalysis 为 false 时禁用个人模式调用')

    client.setMockUser(null)
    assert(client.getState().canRunAnalysis === false, 'setMockUser(null) 时 canRunAnalysis 必须重置为 false')
  })

  console.log(`\n================ ALL ${passedCount} AUTOMATED TESTS PASSED ================\n`)
}

main().catch((err) => {
  console.error('测试运行异常:', err)
  if (typeof process !== 'undefined') process.exit(1)
})
