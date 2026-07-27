import type {
  AgentTaskEvent,
  AgentTaskStatus,
  StartAnalysisRequest,
} from './realRaiseContract'

declare const __REAL_RAISE_ANALYSIS_API_URL__: string | undefined

const configuredApiUrl = typeof __REAL_RAISE_ANALYSIS_API_URL__ === 'string'
  ? __REAL_RAISE_ANALYSIS_API_URL__
  : ''
const API_BASE_URL = configuredApiUrl.trim().replace(/\/+$/, '')
const MAX_TASKS = 5

type ServerTask = {
  id: string
  response: Response
  controller: AbortController
  listeners: Set<(event: AgentTaskEvent) => void>
  artifacts: Map<string, string>
  status: AgentTaskStatus
  started: boolean
}

const tasks = new Map<string, ServerTask>()

export class ServerAnalysisUnavailable extends Error {
  code: string
  status: number
  fallbackAllowed: boolean

  constructor(message: string, code: string, status: number, fallbackAllowed: boolean) {
    super(message)
    this.name = 'ServerAnalysisUnavailable'
    this.code = code
    this.status = status
    this.fallbackAllowed = fallbackAllowed
  }
}

function makeSessionId(): string {
  try {
    const storageKey = 'real_raise_server_session'
    const existing = sessionStorage.getItem(storageKey)
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(storageKey, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

function rememberTask(task: ServerTask): void {
  tasks.set(task.id, task)
  while (tasks.size > MAX_TASKS) {
    const oldest = tasks.keys().next().value
    if (!oldest) break
    const stale = tasks.get(oldest)
    stale?.controller.abort()
    tasks.delete(oldest)
  }
}

async function readServerError(response: Response): Promise<ServerAnalysisUnavailable> {
  let code = 'SERVER_UNAVAILABLE'
  let message = `服务端返回 HTTP ${response.status}。`
  let fallbackAllowed = response.status >= 429
  try {
    const body = await response.json()
    if (body?.error && typeof body.error === 'object') {
      if (typeof body.error.code === 'string') code = body.error.code
      if (typeof body.error.message === 'string') message = body.error.message
      if (typeof body.error.fallbackAllowed === 'boolean') fallbackAllowed = body.error.fallbackAllowed
    }
  } catch {
    // Keep the status-based fallback.
  }
  return new ServerAnalysisUnavailable(message, code, response.status, fallbackAllowed)
}

function emit(task: ServerTask, event: AgentTaskEvent): void {
  if (event.type === 'started' || event.type === 'progress' || event.type === 'insight') {
    task.status = 'running'
  } else if (event.type === 'completed') {
    task.status = 'completed'
    if (event.artifacts) {
      for (const [name, content] of Object.entries(event.artifacts)) {
        if (typeof content === 'string') task.artifacts.set(name, content)
      }
    }
  } else if (event.type === 'failed') {
    task.status = 'failed'
  }
  for (const listener of task.listeners) listener(event)
}

function parseEventFrame(frame: string): AgentTaskEvent | null {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  if (!dataLines.length) return null
  try {
    return JSON.parse(dataLines.join('\n')) as AgentTaskEvent
  } catch {
    return null
  }
}

async function consumeTask(task: ServerTask): Promise<void> {
  const reader = task.response.body?.getReader()
  if (!reader) {
    emit(task, {
      type: 'failed',
      taskId: task.id,
      code: 'SERVER_STREAM_MISSING',
      message: '服务端没有返回可读的进度流。',
      retryable: true,
    })
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!task.controller.signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const event = parseEventFrame(frame)
        if (event) emit(task, { ...event, taskId: task.id })
      }
    }
    if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled') {
      emit(task, {
        type: 'failed',
        taskId: task.id,
        code: 'SERVER_STREAM_ENDED',
        message: '服务端连接在分析完成前中断。',
        retryable: true,
      })
    }
  } catch {
    if (!task.controller.signal.aborted) {
      emit(task, {
        type: 'failed',
        taskId: task.id,
        code: 'SERVER_STREAM_ERROR',
        message: '读取服务端分析进度失败。',
        retryable: true,
      })
    }
  }
}

export function isServerAnalysisConfigured(): boolean {
  return API_BASE_URL.length > 0
}

export async function startServerAnalysis(request: StartAnalysisRequest): Promise<{
  taskId: string
  status: AgentTaskStatus
}> {
  if (!API_BASE_URL) {
    throw new ServerAnalysisUnavailable('未配置服务端分析地址。', 'SERVER_NOT_CONFIGURED', 503, true)
  }
  const controller = new AbortController()
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Real-Raise-Judge': 'true',
        'X-Real-Raise-Session': makeSessionId(),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch {
    throw new ServerAnalysisUnavailable('无法连接实时分析服务。', 'SERVER_UNREACHABLE', 503, true)
  }
  if (!response.ok) {
    const error = await readServerError(response)
    throw error
  }

  const id = response.headers.get('X-Real-Raise-Task-Id') || crypto.randomUUID()
  rememberTask({
    id,
    response,
    controller,
    listeners: new Set(),
    artifacts: new Map(),
    status: 'queued',
    started: false,
  })
  return { taskId: id, status: 'queued' }
}

export function subscribeServerTask(
  taskId: string,
  onEvent: (event: AgentTaskEvent) => void,
): () => void {
  const task = tasks.get(taskId)
  if (!task) {
    onEvent({
      type: 'failed',
      taskId,
      code: 'SERVER_TASK_NOT_FOUND',
      message: '服务端任务不存在或页面已刷新，请重新生成。',
      retryable: true,
    })
    return () => undefined
  }
  task.listeners.add(onEvent)
  if (!task.started) {
    task.started = true
    void consumeTask(task)
  }
  return () => task.listeners.delete(onEvent)
}

export async function cancelServerTask(taskId: string): Promise<boolean> {
  const task = tasks.get(taskId)
  if (!task) return false
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return true
  task.status = 'cancelled'
  task.controller.abort()
  task.listeners.clear()
  return true
}

export function getServerArtifact(taskId: string, fileName: string): string | null {
  return tasks.get(taskId)?.artifacts.get(fileName) ?? null
}

export function isServerTask(taskId: string): boolean {
  return tasks.has(taskId)
}
