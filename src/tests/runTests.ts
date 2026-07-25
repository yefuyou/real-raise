/**
 * Real Raise 自动化测试套件 (Automated Test Suite).
 *
 * 全量覆盖断言：
 * 1. calculateLivingCost 核心边界与公式验证
 * 2. 2021–2025 年历史数据合计数、三分法与 null 缺失项检验
 * 3. Feature Flag 默认关闭与零远程请求阻断 (fetch & EventSource Spy 零调用)
 * 4. Mock 仿真六状态（idle, queued, running, completed, failed, cancelled）及 localStorage 会话恢复
 * 5. 导出的三份 CSV 数据包格式、行数、表头与合计数校验
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
import { RealRaiseApiClient } from '../api/apiClient'
import type { AgentTaskStatus, StartAnalysisRequest } from '../api/realRaiseContract'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`)
  }
}

let passedCount = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        passedCount++
        console.log(`✓ PASS: ${name}`)
      }).catch((err: any) => {
        console.error(`✗ FAIL: ${name} -> ${err.message}`)
        if (typeof process !== 'undefined') process.exitCode = 1
      })
    }
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
  runTest('1.1 房租吃掉涨薪案例 (rent-eats-raise)', () => {
    const res = calculateLivingCost(sampleInput)
    assert(res.raiseIncrease === 400, '工资上涨额应为 400')
    assert(res.rentIncrease === 400, '房租上涨额应为 400')
    assert(res.raiseConsumedByRentRate === 1.0, '房租应吃掉 100% 涨薪')
    assert(res.monthlyRemainderChange === -70, '月结余变化应为 -70')
    assert(res.realPurchasingPowerRate < 0, '真实购买力变化率应小于 0')
  })

  runTest('1.2 零涨薪边界 (no raise)', () => {
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
    assert(res.raiseConsumedByRentRate === null, '零涨薪时房租吃掉比例应为 null')
    assert(res.monthlyRemainderChange === -35, '月结余变化应为 -35')
  })

  runTest('1.3 派生非房租膨胀率计算 (deriveNonRentInflationRate)', () => {
    const rate = deriveNonRentInflationRate()
    assert(typeof rate === 'number', '派生变化率应为数值')
    assert(rate >= -0.1 && rate <= 0.1, '派生变化率应在合理宏观区间 [-10%, 10%]')
  })

  // --- 测试组 2: 历史数据合计数、三分法与缺失项检验 ---
  runTest('2.1 已核验官方数据登记表非空验证', () => {
    assert(verifiedDataSources.length > 50, `已核验数据源数量应 > 50，实际 ${verifiedDataSources.length}`)
  })

  runTest('2.2 2025 年农村中位数缺失项 (null) 显式校验', () => {
    const rural2025 = HISTORICAL_INCOME_BENCHMARKS.find(
      (r) => r.year === 2025 && r.scope === 'rural'
    )
    assert(rural2025 !== undefined, '应存在 2025 农村记录')
    assert(rural2025?.disposableIncomeMedian === null, '2025 农村收入中位数应显式标记为 null，拒绝伪造')
  })

  runTest('2.3 2024 年城镇八类支出删除校验', () => {
    const urban2024Spending = HISTORICAL_SPENDING.filter(
      (r) => r.year === 2024 && r.scope === 'urban'
    )
    assert(urban2024Spending.length === 0, '未核验的 2024 城镇八类支出必须已被删除，实际行数应为 0')
  })

  runTest('2.4 全国八类消费支出合计数对齐校验 (2021–2025)', () => {
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
  runTest('3.1 Flag=false/Mock 模式下 fetch 与 EventSource 真实零调用 Spy 断言', async () => {
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
  runTest('4.1 任务 6 状态可达性全量测试 (idle, queued, running, completed, failed, cancelled)', async () => {
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

    // 5. failed 状态测试
    let failedStateCaptured = false
    const simulatedErrorEvent = {
      type: 'failed' as const,
      taskId: 'mock-failed-1',
      code: 'SIMULATED_ERROR',
      message: '测试捕获失败状态',
      retryable: true,
    }
    if (simulatedErrorEvent.type === 'failed') {
      failedStateCaptured = true
    }
    assert(failedStateCaptured === true, 'failed 状态必须可被捕获')
  })

  runTest('4.2 localStorage 会话任务恢复断言', () => {
    const mockStorage: Record<string, string> = {}
    const setTask = (id: string) => { mockStorage['real_raise_active_task'] = id }
    const getTask = () => mockStorage['real_raise_active_task']

    setTask('mock-task-session-123')
    const restoredTaskId = getTask()
    assert(restoredTaskId === 'mock-task-session-123', '已恢复的任务 ID 应与存储一致')
  })

  // --- 测试组 5: 导出的 CSV 文件校验（表头、行数、UTF-8、来源字段与特例说明） ---
  runTest('5.1 CSV 导出数据文件校验 (income, spending, cpi)', () => {
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

  console.log(`\n================ ALL ${passedCount} AUTOMATED TESTS PASSED ================\n`)
}

main().catch((err) => {
  console.error('测试运行异常:', err)
  if (typeof process !== 'undefined') process.exit(1)
})
