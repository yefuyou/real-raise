import {
  OFFICIAL_SOURCES,
  buildDriverRankingCsv,
  buildEvidenceCsv,
  buildManifest,
  buildPrompt,
  buildScenarioMatrixCsv,
  buildScenarioMatrixJson,
  buildShareSummaryMarkdown,
  isRecord,
} from './core.mjs'

const ROUTES = {
  events: (connId) => `/api/ai/events?connId=${encodeURIComponent(connId)}`,
  settings: '/api/ai/settings',
  message: '/api/ai/message',
  workspace: (taskId) => `/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`,
  previewFile: '/api/ai_task/previewFile',
}

export const INFINISYNAPSE_AGENT_MODE = 'act'

export const REAL_RAISE_AUTO_APPROVAL_SETTINGS = Object.freeze({
  maxRequests: 24,
  maxSubAgentRequests: 0,
  databaseReturnLimit: 100,
  delegateMaxConcurrency: 1,
  enableNotifications: false,
  debugMode: false,
  enableWebSearch: false,
  enableReadImage: false,
  enableBrowser: false,
  enableMap: false,
})

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

function findAgentMessage(value) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const message = findAgentMessage(child)
      if (message) return message
    }
    return null
  }
  if (!isRecord(value)) return null
  if (
    (value.type === 'ask' || value.type === 'say')
    && (typeof value.ask === 'string' || typeof value.say === 'string')
  ) {
    return value
  }
  for (const child of Object.values(value)) {
    const message = findAgentMessage(child)
    if (message) return message
  }
  return null
}

export function detectVendorInteraction(value) {
  const message = findAgentMessage(value)
  if (message?.type !== 'ask' || message.partial === true) return null
  return typeof message.ask === 'string' && message.ask !== 'completion_result'
    ? message.ask
    : null
}

export function buildAgentNewTaskPayload({ vendorTaskId, connId, text }) {
  return {
    type: 'newTask',
    taskId: vendorTaskId,
    connId,
    chatSettings: { mode: INFINISYNAPSE_AGENT_MODE },
    autoApprovalSettings: { ...REAL_RAISE_AUTO_APPROVAL_SETTINGS },
    text,
  }
}

export function buildPlanToAgentRecoveryPayloads({ vendorTaskId, connId }) {
  return [
    {
      type: 'autoApprovalSettings',
      taskId: vendorTaskId,
      connId,
      autoApprovalSettings: { ...REAL_RAISE_AUTO_APPROVAL_SETTINGS },
    },
    {
      type: 'togglePlanActMode',
      taskId: vendorTaskId,
      connId,
      chatSettings: { mode: INFINISYNAPSE_AGENT_MODE },
    },
    {
      type: 'askResponse',
      taskId: vendorTaskId,
      connId,
      askResponse: 'messageResponse',
      text: [
        '该任务已由 Real Raise 产品预先批准，并已切换到智能体（ACT）模式。',
        '不要再次调用 plan、switch_mode、plan_mode_response 或 update_plan。',
        '请立即执行原任务，实际写入 explanation.md，然后提交 completion_result。',
      ].join(''),
    },
  ]
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

async function consumeVendorStream(reader, requestId, onEvent, signal, onInteraction) {
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

      const interaction = detectVendorInteraction(payload)
      if (interaction) {
        finalText = ''
        const recovered = await onInteraction?.(interaction)
        if (!recovered) {
          const message = interaction === 'upload_file_to_sandbox'
            ? '分析平台意外请求上传文件，当前任务仅允许使用已注入的版本化上下文。'
            : `分析平台要求未支持的交互：${interaction}。`
          throw new UpstreamError('UPSTREAM_INTERACTION_REQUIRED', message, 502, true)
        }
        onEvent({
          type: 'progress',
          taskId: requestId,
          stage: '已切换智能体模式',
          message: '平台曾返回规划请求，现已明确切换到智能体模式并继续执行。',
          percent: 45,
        })
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
  const result = {
    artifacts: {},
    workspaceAvailable: false,
    explanationAvailable: false,
  }
  try {
    const workspaceResponse = await vendorFetch(ROUTES.workspace(vendorTaskId))
    const workspace = await parseJsonResponse(workspaceResponse)
    result.workspaceAvailable = true
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
        if (content && content.length <= 250_000) {
          result.artifacts[file.name] = content
          if (file.name === 'explanation.md') result.explanationAvailable = true
        }
      } catch {
        // A single missing preview must not discard a completed analysis.
      }
    }
  } catch {
    // Local text artifacts below preserve the evidence boundary.
  }
  return result
}

export function sealAuthoritativeArtifacts(
  artifacts,
  { requestId, vendorTaskId, request, execution, artifactStatus = 'verified' },
) {
  const sealed = { ...artifacts }
  const authoritativeNames = [
    'evidence.csv',
    'analysis-manifest.json',
    'driver-ranking.csv',
    'scenario-matrix.csv',
    'scenario-matrix.json',
    'share-summary.md',
  ]
  for (const name of authoritativeNames) {
    if (sealed[name]) sealed[`vendor-original-${name}`] = sealed[name]
  }
  sealed['evidence.csv'] = buildEvidenceCsv(request)
  sealed['driver-ranking.csv'] = buildDriverRankingCsv(request)
  sealed['scenario-matrix.csv'] = buildScenarioMatrixCsv(request)
  sealed['scenario-matrix.json'] = buildScenarioMatrixJson(request)
  sealed['share-summary.md'] = buildShareSummaryMarkdown(request)
  sealed['analysis-manifest.json'] = buildManifest({
    requestId,
    vendorTaskId,
    request,
    execution,
    artifactStatus,
  })
  return sealed
}

export async function runInfiniSynapseAnalysis({
  requestId,
  request,
  execution,
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
    let planRecoverySent = false
    const recoverInteraction = async (interaction) => {
      if (interaction !== 'plan_mode_response') return false
      if (planRecoverySent) return true
      planRecoverySent = true
      for (const payload of buildPlanToAgentRecoveryPayloads({ vendorTaskId, connId })) {
        const response = await vendorFetch(ROUTES.message, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        await parseJsonResponse(response)
      }
      return true
    }
    consumePromise = consumeVendorStream(
      reader,
      requestId,
      onEvent,
      controller.signal,
      recoverInteraction,
    )
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
      body: JSON.stringify(buildAgentNewTaskPayload({
        vendorTaskId,
        connId,
        text: buildPrompt(request),
      })),
    })
    await parseJsonResponse(messageResponse)

    const finalText = await consumePromise
    const workspaceResult = await readArtifacts(vendorFetch, vendorTaskId)
    const vendorArtifacts = workspaceResult.artifacts
    // The platform owns the narrative. Real Raise always owns the numeric
    // evidence and execution manifest, so stale model-generated percentages
    // can never become authoritative downloads.
    const platformExplanation = vendorArtifacts['explanation.md']?.trim()
    const insight = platformExplanation || finalText
    if (!insight) {
      throw new UpstreamError(
        'UPSTREAM_ARTIFACT_MISSING',
        '分析平台已结束任务，但没有返回可核验的报告正文。',
        502,
        true,
      )
    }
    const artifactStatus = workspaceResult.explanationAvailable
      ? 'verified'
      : 'stream-fallback'
    // The fallback is explicitly marked in the manifest; it must never be
    // presented as a verified workspace report.
    const sealedArtifacts = sealAuthoritativeArtifacts(vendorArtifacts, {
      requestId,
      vendorTaskId,
      request,
      execution,
      artifactStatus,
    })
    if (!sealedArtifacts['explanation.md']) sealedArtifacts['explanation.md'] = insight
    completed = true
    const sources = request.cityContext.overallSource
      && !OFFICIAL_SOURCES.some((source) => source.url === request.cityContext.overallSource.url)
      ? [...OFFICIAL_SOURCES, request.cityContext.overallSource]
      : OFFICIAL_SOURCES

    return {
      insight,
      sources,
      artifacts: sealedArtifacts,
      vendorTaskId,
      artifactStatus,
    }
  } catch (error) {
    const abortedBeforeCatch = controller.signal.aborted
    if (!controller.signal.aborted) controller.abort(error)
    if (consumePromise) await consumePromise.catch(() => undefined)
    if (timedOut) {
      throw new UpstreamError('ANALYSIS_TIMEOUT', '实时分析超过 10 分钟仍未完成，已安全停止。', 504, true)
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
