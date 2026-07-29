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
  settings: '/api/ai/settings',
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
 * Prompt construction intentionally lives in worker/core.mjs now. This
 * server-only contract module keeps the vendor route/types, but no longer
 * carries a second prompt implementation that could drift from production.
 */

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
