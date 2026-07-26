import type {
  AgentTaskEvent,
  DetailedSpendBreakdown,
  RealRaiseInsight,
  SourceReference,
} from './realRaiseContract'

/**
 * InfiniSynapse vendor contract lives here, on the server-side adapter seam.
 * Browser code must only use REAL_RAISE_BACKEND_ROUTES and must never import
 * this file into a client bundle.
 */
// Server API host. The documented console/auth host is different; these
// task/SSE routes are rooted at app.infinisynapse.cn/api/...
export const INFINI_SYNAPSE_API_BASE_URL = 'https://app.infinisynapse.cn'

export const INFINI_SYNAPSE_ROUTES = {
  events: (connId: string) => `/api/ai/events?connId=${encodeURIComponent(connId)}`,
  message: '/api/ai/message',
  taskInfo: (taskId: string) => `/api/ai_task/getTaskInfo/${encodeURIComponent(taskId)}`,
  workspace: (taskId: string) => `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
  previewFile: '/api/ai_task/previewFile',
  downloadTaskFile: (taskId: string, fileName: string) =>
    `/api/tools/storage/downloadTaskFile/${encodeURIComponent(taskId)}?path=${encodeURIComponent(fileName)}`,
  databaseList: '/api/ai_database/list',
  databaseEnabled: '/api/ai_database/enabled',
} as const

export type InfiniSynapseTaskRequest = {
  userInput: string
  cityCode: string
  cityName: string
  cityPeriod: string
  calculationVersion: string
  calculationSummary: Record<string, number | string | null>
  detailedBreakdown?: DetailedSpendBreakdown
  sourceRefs: SourceReference[]
  inputHash: string
}

export type InfiniSynapseArtifactKind = 'analysis-manifest' | 'evidence' | 'explanation' | 'chart' | 'other'

export type InfiniSynapseWorkspaceArtifact = {
  name: string
  path: string
  kind: InfiniSynapseArtifactKind
  mimeType: string | null
  sizeBytes: number | null
  previewable: boolean
}

export type InfiniSynapseWorkspaceSnapshot = {
  vendorTaskId: string
  artifacts: InfiniSynapseWorkspaceArtifact[]
  completedAt: string | null
}

export type InfiniSynapseSseEventName =
  | 'message.partial'
  | 'message.add'
  | 'message.update'
  | 'state.ready'
  | 'notification'
  | 'heartbeat'
  | string

export type InfiniSynapseSseEnvelope = {
  event: InfiniSynapseSseEventName
  data: unknown
  id?: string
}

export type InfiniSynapseTaskResult = {
  taskId: string
  insight: string
  sources: SourceReference[]
  structuredInsight?: RealRaiseInsight
  workspace: InfiniSynapseWorkspaceSnapshot
}

/**
 * The prompt deliberately describes the boundary instead of asking the model
 * to act as the calculator. Local arithmetic is authoritative; the vendor
 * explains and cites it using enabled official data sources.
 */
export function buildInfiniSynapsePrompt(request: InfiniSynapseTaskRequest): string {
  const calculationJson = JSON.stringify(request.calculationSummary, null, 2)
  const breakdownJson = request.detailedBreakdown
    ? JSON.stringify(request.detailedBreakdown, null, 2)
    : '未开启详细分类模式。'
  const sources = request.sourceRefs
    .map((source) => `- ${source.name}｜${source.year ?? '年份未标注'}｜${source.scope}｜${source.url}`)
    .join('\n')

  return [
    '你是“你的涨薪，消失在到手之前了吗？”的解释型分析 Agent。',
    '请基于已启用的官方数据源，解释本地程序已经计算好的结果。',
    '',
    '【不可违反的边界】',
    '1. 不要重新计算、四舍五入、覆盖或纠正本地程序提供的任何数字。',
    '2. 用户输入的工资条扣缴、到手收入、住房和其他实际支出优先于任何宏观平均。',
    '3. 城市 CPI 只能解释价格背景；城市缺失时必须明确说“已回退全国基准”。',
    '4. 不要把城市历史值标成当前期，不要用省级值替代城市值，不要编造缺失数据。',
    '5. 不提供投资、借贷、辞职或其他个性化金融决策建议。',
    '6. 每个统计结论都标注来源年份、统计范围；不确定时写明不确定。',
    '',
    `【用户问题】\n${request.userInput}`,
    `【城市】\n${request.cityName}（${request.cityCode}），请求期间：${request.cityPeriod}`,
    `【本地计算版本】\n${request.calculationVersion}`,
    `【本地计算结果（权威，不得改写）】\n${calculationJson}`,
    `【详细分类输入】\n${breakdownJson}`,
    `【允许引用的来源】\n${sources || '仅使用任务中已启用且可追溯的官方来源。'}`,
    '',
    '【输出任务】',
    'A. 用 3—5 句话解释收入、扣缴、日常分类支出和可支配结余的贡献。',
    'B. 区分用户实际输入、确定性计算、官方观察值和派生估算。',
    'C. 输出城市覆盖状态：城市原值、历史样本、全国回退三者不得混称。',
    'D. 生成最多 3 个不改变本地数字的情景解释。',
    'E. 生成可追溯的 explanation.md、evidence.csv 和 analysis-manifest.json；不要把二进制文件当 JSON 返回。',
    'F. 最终文字简洁、面向普通中国城市上班族，不堆宏观术语。',
  ].join('\n')
}

function readText(data: unknown): string {
  if (typeof data === 'string') return data.trim()
  if (!data || typeof data !== 'object') return ''
  const candidate = data as Record<string, unknown>
  for (const key of ['text', 'content', 'message', 'delta']) {
    if (typeof candidate[key] === 'string') return candidate[key].trim()
  }
  return ''
}

/**
 * Convert vendor SSE messages into our own progress contract. Partial vendor
 * messages are never treated as the final insight; completion is emitted only
 * after the adapter has read the task workspace and validated artifacts.
 */
export function normalizeInfiniSynapseSseEvent(
  taskId: string,
  envelope: InfiniSynapseSseEnvelope,
): AgentTaskEvent | null {
  const text = readText(envelope.data)

  if (envelope.event === 'heartbeat') return null

  if (envelope.event === 'state.ready') {
    return {
      type: 'progress',
      taskId,
      stage: '分析任务已就绪',
      message: '数据源连接已建立，正在等待分析执行。',
      percent: 10,
    }
  }

  if (envelope.event === 'message.partial') {
    return {
      type: 'progress',
      taskId,
      stage: '分析进行中',
      message: text || '分析 Agent 正在处理数据。',
      percent: 55,
    }
  }

  if (envelope.event === 'message.add' || envelope.event === 'message.update') {
    return {
      type: 'progress',
      taskId,
      stage: '整理分析产物',
      message: text || '正在整理报告、证据和图表。',
      percent: 75,
    }
  }

  if (envelope.event === 'notification') {
    return {
      type: 'progress',
      taskId,
      stage: '平台状态更新',
      message: text || '分析任务状态已更新。',
    }
  }

  return {
    type: 'progress',
    taskId,
    stage: '分析任务执行中',
    message: text || `收到供应商事件：${envelope.event}`,
  }
}

export function isTerminalAgentEvent(event: AgentTaskEvent): boolean {
  return event.type === 'completed' || event.type === 'failed'
}

export const INFINI_SYNAPSE_ARTIFACT_CONTRACT = {
  manifest: 'analysis-manifest.json',
  evidence: 'evidence.csv',
  explanation: 'explanation.md',
  rule: '先读取 workspace，再向浏览器发送 completed；浏览器不直接读取供应商二进制下载接口。',
} as const
