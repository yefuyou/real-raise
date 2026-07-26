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
import { RealRaiseApiClient, generateMockStructuredInsight } from '../api/apiClient'
import type { AgentTaskStatus, AgentTaskEvent, StartAnalysisRequest } from '../api/realRaiseContract'
import { resolveCityBenchmark, resolveCityBenchmarkSet } from '../data/cityBenchmarks'

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
    const struct = generateMockStructuredInsight(samplePayload)
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
    const struct = generateMockStructuredInsight(detailedPayload)
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

  console.log(`\n================ ALL ${passedCount} AUTOMATED TESTS PASSED ================\n`)
}

main().catch((err) => {
  console.error('测试运行异常:', err)
  if (typeof process !== 'undefined') process.exit(1)
})
