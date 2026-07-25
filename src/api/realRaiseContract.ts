import type { LivingCostResult, ScenarioInput } from '../domain/livingCost'

/**
 * Frontend ↔ Real Raise backend contract.
 *
 * This is deliberately not the InfiniSynapse API contract. The browser must
 * only talk to our own backend and must never receive the vendor API key.
 */
export type AgentTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AgentTaskEvent =
  | { type: 'started'; taskId: string }
  | { type: 'progress'; taskId: string; stage: string; message: string; percent?: number }
  | { type: 'insight'; taskId: string; text: string }
  | { type: 'artifact'; taskId: string; name: string; kind: 'markdown' | 'pdf' | 'image' | 'data'; url?: string }
  | { type: 'completed'; taskId: string; insight: string; sources: SourceReference[] }
  | { type: 'failed'; taskId: string; code: string; message: string; retryable: boolean }

export type SourceReference = {
  name: string
  year: number | null
  scope: string
  url: string
}

export type StartAnalysisRequest = {
  input: ScenarioInput
  calculation: LivingCostResult
  locale: 'zh-CN'
  includeInsight: boolean
}

export type StartAnalysisResponse = {
  taskId: string
  status: AgentTaskStatus
  calculation: LivingCostResult
}

export type GetAnalysisResponse = StartAnalysisResponse & {
  events: AgentTaskEvent[]
  insight?: string
  sources?: SourceReference[]
}

/** Own backend routes that Hajimi should integrate later. */
export const REAL_RAISE_BACKEND_ROUTES = {
  start: '/api/real-raise/analysis',
  get: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}`,
  events: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}/events`,
  cancel: (taskId: string) => `/api/real-raise/analysis/${encodeURIComponent(taskId)}/cancel`,
} as const
