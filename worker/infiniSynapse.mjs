import {
  OFFICIAL_SOURCES,
  buildEvidenceCsv,
  buildManifest,
  buildPrompt,
  isRecord,
} from './core.mjs'

const ROUTES = {
  events: (connId) => `/api/ai/events?connId=${encodeURIComponent(connId)}`,
  settings: '/api/ai/settings',
  message: '/api/ai/message',
  workspace: (taskId) => `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
  previewFile: '/api/ai_task/previewFile',
}

export class UpstreamError extends Error {
  constructor(code, message, status = 502, retryable = true) {
    super(message)
    this.name = 'UpstreamError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

function failureForStatus(status) {
  if (status === 401 || status === 403) {
    return new UpstreamError('UPSTREAM_AUTH_ERROR', '服务端分析凭据无效或未授权。', 502, false)
  }
  if (status === 402 || status === 429) {
    return new UpstreamError('UPSTREAM_QUOTA_OR_RATE_LIMIT', '分析平台额度或频率受限。', 503, true)
  }
  if (status >= 500) {
    return new UpstreamError('UPSTREAM_UNAVAILABLE', '分析平台暂时不可用。', 503, true)
  }
  return new UpstreamError('UPSTREAM_ERROR', `分析平台返回 HTTP ${status}。`, 502, true)
}

function unwrap(payload) {
  if (!isRecord(payload)) return payload
  if ('code' in payload && payload.code !== 200) {
    const message = typeof payload.message === 'string' ? payload.message : ''
    throw new UpstreamError('UPSTREAM_BUSINESS_ERROR', message || `分析平台错误码 ${String(payload.code)}`)
  }
  return 'data' in payload ? payload.data : payload
}

function textFrom(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    for (const child of value) {
      const text = textFrom(child)
      if (text) return text
    }
    return ''
  }
  if (!isRecord(value)) return ''
  for (const key of ['text', 'content', 'message', 'delta']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  }
  for (const key of ['data', 'result', 'payload']) {
    const text = textFrom(value[key])
    if (text) return text
  }
  return ''
}

function containsCompletion(value) {
  if (Array.isArray(value)) return value.some(containsCompletion)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => {
    if (['ask', 'say', 'type', 'event'].includes(key) && child === 'completion_result') return true
    return containsCompletion(child)
  })
}

function containsVendorError(value) {
  if (Array.isArray(value)) return value.some(containsVendorError)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => {
    if (key === 'type' && typeof child === 'string' && ['error', 'failed'].includes(child)) return true
    return containsVendorError(child)
  })
}

function conciseProgressMessage(eventName, payload) {
  const raw = textFrom(payload).replace(/\s+/g, ' ').trim()
  if (!raw || raw.length > 180 || /^[{[]/.test(raw)) {
    if (eventName === 'message.add' || eventName === 'message.update') {
      return '正在整理分析报告和证据。'
    }
    return '分析 Agent 正在处理数据。'
  }
  return raw
}

function artifactKind(name) {
  if (name.endsWith('.md')) return 'explanation'
  if (name.endsWith('.csv')) return 'evidence'
  if (name.endsWith('.json')) return 'manifest'
  return 'other'
}

function normalizeFiles(workspace) {
  const files = isRecord(workspace) && Array.isArray(workspace.files) ? workspace.files : []
  return files
    .map((file) => {
      if (typeof file === 'string') {
        const name = file.split(/[\\/]/).pop() ?? file
        return { name, path: file, kind: artifactKind(name) }
      }
      if (!isRecord(file)) return { name: '', path: '', kind: 'other' }
      const path = String(file.path ?? file.name ?? '')
      const name = String(file.name ?? path.split(/[\\/]/).pop() ?? '')
      return { name, path, kind: artifactKind(name) }
    })
    .filter((file) => file.name)
}

async function parseJsonResponse(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new UpstreamError('UPSTREAM_INVALID_RESPONSE', '分析平台返回了无法解析的响应。')
  }
  return unwrap(payload)
}

async function consumeVendorStream(reader, requestId, onEvent, signal) {
  const decoder = new TextDecoder()
  let buffer = ''
  let finalText = ''

  while (!signal.aborted) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      let eventName = 'message'
      const dataLines = []
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue

      let payload = dataLines.join('\n')
      try {
        payload = JSON.parse(payload)
      } catch {
        // Some vendor events are plain text.
      }

      const text = textFrom(payload)
      if (text && text.length <= 8_000) finalText = text
      if (containsVendorError(payload)) {
        throw new UpstreamError('UPSTREAM_TASK_FAILED', text || '分析平台任务失败。')
      }

      if (eventName === 'state.ready') {
        onEvent({
          type: 'progress',
          taskId: requestId,
          stage: '分析任务已就绪',
          message: '服务端已连接分析平台。',
          percent: 15,
        })
      } else if (eventName === 'message.partial') {
        onEvent({
          type: 'progress',
          taskId: requestId,
          stage: '分析进行中',
          message: conciseProgressMessage(eventName, payload),
          percent: 55,
        })
      } else if (eventName === 'message.add' || eventName === 'message.update') {
        onEvent({
          type: 'progress',
          taskId: requestId,
          stage: '整理分析产物',
          message: conciseProgressMessage(eventName, payload),
          percent: 75,
        })
      }

      if (containsCompletion(payload)) {
        await reader.cancel().catch(() => undefined)
        return finalText
      }
    }
  }

  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
  throw new UpstreamError('UPSTREAM_STREAM_ENDED', '分析平台连接在任务完成前中断。')
}

async function readArtifacts(vendorFetch, vendorTaskId) {
  const artifacts = {}
  try {
    const workspaceResponse = await vendorFetch(ROUTES.workspace(vendorTaskId))
    const workspace = await parseJsonResponse(workspaceResponse)
    const files = normalizeFiles(workspace)
      .filter((file) => ['explanation', 'evidence', 'manifest'].includes(file.kind))
      .slice(0, 6)

    for (const file of files) {
      try {
        const previewResponse = await vendorFetch(ROUTES.previewFile, {
          method: 'POST',
          body: JSON.stringify({ taskId: vendorTaskId, fileName: file.path || file.name }),
        })
        const preview = await parseJsonResponse(previewResponse)
        const content = typeof preview === 'string'
          ? preview
          : isRecord(preview) && typeof preview.content === 'string'
            ? preview.content
            : ''
        if (content && content.length <= 250_000) artifacts[file.name] = content
      } catch {
        // A single missing preview must not discard a completed analysis.
      }
    }
  } catch {
    // Local text artifacts below preserve the evidence boundary.
  }
  return artifacts
}

export async function runInfiniSynapseAnalysis({
  requestId,
  request,
  apiKey,
  baseUrl,
  timeoutMs,
  onEvent,
  clientSignal,
}) {
  const vendorTaskId = crypto.randomUUID()
  const connId = crypto.randomUUID()
  const controller = new AbortController()
  let timedOut = false
  let completed = false
  let consumePromise = null

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Analysis timed out', 'TimeoutError'))
  }, timeoutMs)
  const abortFromClient = () => controller.abort(new DOMException('Client disconnected', 'AbortError'))
  clientSignal?.addEventListener('abort', abortFromClient, { once: true })

  const vendorFetch = async (path, init = {}, signal = controller.signal) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-lang': 'zh_CN',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
    if (!response.ok) throw failureForStatus(response.status)
    return response
  }

  try {
    onEvent({ type: 'started', taskId: requestId })
    const eventsResponse = await vendorFetch(ROUTES.events(connId), {
      headers: { Accept: 'text/event-stream' },
    })
    if (!eventsResponse.body) {
      throw new UpstreamError('UPSTREAM_STREAM_MISSING', '分析平台没有返回事件流。')
    }

    const reader = eventsResponse.body.getReader()
    consumePromise = consumeVendorStream(reader, requestId, onEvent, controller.signal)
    void consumePromise.catch(() => undefined)

    if (request.analysisModel) {
      const settingsResponse = await vendorFetch(ROUTES.settings, {
        method: 'POST',
        body: JSON.stringify({
          taskId: vendorTaskId,
          apiConfiguration: {
            apiProvider: 'infinisynapse',
            infinisynapseModelId: request.analysisModel,
          },
        }),
      })
      await parseJsonResponse(settingsResponse)
    }

    const messageResponse = await vendorFetch(ROUTES.message, {
      method: 'POST',
      body: JSON.stringify({
        type: 'newTask',
        taskId: vendorTaskId,
        connId,
        chatSettings: { mode: 'act' },
        text: buildPrompt(request),
      }),
    })
    await parseJsonResponse(messageResponse)

    const finalText = await consumePromise
    const artifacts = await readArtifacts(vendorFetch, vendorTaskId)
    if (!artifacts['evidence.csv']) artifacts['evidence.csv'] = buildEvidenceCsv(request)
    if (!artifacts['analysis-manifest.json']) {
      artifacts['analysis-manifest.json'] = buildManifest({ requestId, vendorTaskId, request })
    }
    const platformExplanation = artifacts['explanation.md']?.trim()
    const insight = platformExplanation || finalText || '分析已完成，但平台没有返回可预览的正文。'
    if (!artifacts['explanation.md']) artifacts['explanation.md'] = insight
    completed = true

    return {
      insight,
      sources: OFFICIAL_SOURCES,
      artifacts,
      vendorTaskId,
    }
  } catch (error) {
    const abortedBeforeCatch = controller.signal.aborted
    if (!controller.signal.aborted) controller.abort(error)
    if (consumePromise) await consumePromise.catch(() => undefined)
    if (timedOut) {
      throw new UpstreamError('ANALYSIS_TIMEOUT', '实时分析超过 3 分钟，已安全停止。', 504, true)
    }
    if (abortedBeforeCatch) {
      throw new UpstreamError('ANALYSIS_CANCELLED', '实时分析已取消。', 499, true)
    }
    throw error
  } finally {
    clearTimeout(timeout)
    clientSignal?.removeEventListener('abort', abortFromClient)
    if (!completed && controller.signal.aborted) {
      void fetch(`${baseUrl}${ROUTES.message}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'x-lang': 'zh_CN',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'cancelTask', taskId: vendorTaskId }),
      }).catch(() => undefined)
    }
  }
}
