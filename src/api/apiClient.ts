import type {
  AgentTaskEvent,
  SourceReference,
  StartAnalysisRequest,
  StartAnalysisResponse,
} from './realRaiseContract'
import { REAL_RAISE_BACKEND_ROUTES } from './realRaiseContract'
import { OFFICIAL_2025_CPI, OFFICIAL_2025_INCOME_BENCHMARKS } from '../data/official2025'

export interface AnalysisClientOptions {
  useMock?: boolean
}

const OFFICIAL_SOURCES: SourceReference[] = [
  {
    name: '国家统计局：2025 年居民消费价格主要数据',
    year: 2025,
    scope: '全国居民消费价格八大类全年涨跌幅',
    url: OFFICIAL_2025_CPI[0].sourceUrl,
  },
  {
    name: '国家统计局：2025 年居民收入和消费支出情况',
    year: 2025,
    scope: '全国及城镇居民收入、消费支出与消费结构',
    url: OFFICIAL_2025_INCOME_BENCHMARKS[0].sourceUrl,
  },
]

export class RealRaiseApiClient {
  private useMock: boolean

  constructor(options: AnalysisClientOptions = {}) {
    // Remote insight is opt-in until our own backend is deployed.
    this.useMock = options.useMock ?? true
  }

  public setUseMock(useMock: boolean) {
    this.useMock = useMock
  }

  public async startAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    if (this.useMock) return this.mockStartAnalysis(request)

    const response = await fetch(REAL_RAISE_BACKEND_ROUTES.start, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`请求本项目服务端失败：HTTP ${response.status}`)
    }

    return (await response.json()) as StartAnalysisResponse
  }

  public async cancelAnalysis(taskId: string): Promise<boolean> {
    if (this.useMock || taskId.startsWith('mock-task-')) return true
    try {
      const response = await fetch(REAL_RAISE_BACKEND_ROUTES.cancel(taskId), { method: 'POST' })
      return response.ok
    } catch {
      return false
    }
  }

  public subscribeTaskEvents(
    taskId: string,
    request: StartAnalysisRequest,
    onEvent: (event: AgentTaskEvent) => void,
  ): () => void {
    if (this.useMock || taskId.startsWith('mock-task-')) {
      return this.simulateTaskEvents(taskId, request, onEvent)
    }

    const eventSource = new EventSource(REAL_RAISE_BACKEND_ROUTES.events(taskId))
    eventSource.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as AgentTaskEvent
        onEvent(event)
        if (event.type === 'completed' || event.type === 'failed') eventSource.close()
      } catch {
        onEvent({
          type: 'failed',
          taskId,
          code: 'INVALID_EVENT',
          message: '服务器返回了无法识别的进度消息。',
          retryable: true,
        })
        eventSource.close()
      }
    }
    eventSource.onerror = () => {
      onEvent({
        type: 'failed',
        taskId,
        code: 'SSE_CONNECTION_ERROR',
        message: '与本项目服务端的实时连接中断，您可以重试。',
        retryable: true,
      })
      eventSource.close()
    }

    return () => eventSource.close()
  }

  private async mockStartAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    return {
      taskId: `mock-task-${Date.now()}`,
      status: 'queued',
      calculation: request.calculation,
    }
  }

  private simulateTaskEvents(
    taskId: string,
    request: StartAnalysisRequest,
    onEvent: (event: AgentTaskEvent) => void,
  ): () => void {
    let cancelled = false
    const timers: number[] = []
    const push = (event: AgentTaskEvent, delayMs: number) => {
      const timer = globalThis.setTimeout(() => {
        if (!cancelled) onEvent(event)
      }, delayMs) as unknown as number
      timers.push(timer)
    }

    push({ type: 'started', taskId }, 200)
    push({
      type: 'progress',
      taskId,
      stage: '整理 2025 官方统计基准',
      message: '正在读取全国 CPI 与城镇居民消费结构。',
      percent: 30,
    }, 800)
    push({
      type: 'progress',
      taskId,
      stage: '核对个人支出变化',
      message: '真实房租使用你的输入，其他支出使用可追溯的派生基准。',
      percent: 65,
    }, 1800)
    push({
      type: 'progress',
      taskId,
      stage: '生成生活解读',
      message: '只解释本地计算结果，不修改数字。',
      percent: 90,
    }, 2800)
    push({
      type: 'completed',
      taskId,
      insight: generateMockInsightText(request),
      sources: OFFICIAL_SOURCES,
    }, 3600)

    return () => {
      cancelled = true
      timers.forEach((timer) => globalThis.clearTimeout(timer))
    }
  }
}

function generateMockInsightText(request: StartAnalysisRequest): string {
  const { input, calculation } = request
  const money = (value: number) => Math.round(value).toLocaleString('zh-CN')
  const rate = (value: number) => `${(value * 100).toFixed(2)}%`

  if (calculation.raiseIncrease <= 0) {
    return `你的月收入没有增加，房租和其他支出变化会直接压缩每月结余。要保持当前生活水平，明年税后月收入至少需要 ${money(calculation.breakEvenIncome)} 元。`
  }

  const rentMessage = calculation.rentIncrease > calculation.raiseIncrease
    ? `房租增加 ${money(calculation.rentIncrease)} 元，超过工资增加的 ${money(calculation.raiseIncrease)} 元。`
    : `工资增加 ${money(calculation.raiseIncrease)} 元，房租增加 ${money(calculation.rentIncrease)} 元。`

  return `${rentMessage} 按全国 2025 年 CPI 与城镇消费结构派生的其他支出基准（${rate(input.otherInflationRate)}）计算，你每月预计${calculation.monthlyRemainderChange >= 0 ? '多' : '少'}剩 ${money(Math.abs(calculation.monthlyRemainderChange))} 元。真实房租仍以你的输入为准。`
}

export const apiClient = new RealRaiseApiClient()
