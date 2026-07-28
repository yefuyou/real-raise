import {
  INFINI_SYNAPSE_API_BASE_URL,
  INFINI_SYNAPSE_ROUTES,
} from './infiniSynapseContract'
import type {
  AgentTaskEvent,
  AgentTaskStatus,
  SourceReference,
  StartAnalysisRequest,
} from './realRaiseContract'
import { buildAnalysisManifest, buildEvidenceCsv } from './analysisArtifacts'
import { buildDiagnosticPacket } from './diagnosticPacket'
import { requestMaterial, requestSignature } from './requestSignature'

/**
 * 浏览器直连 InfiniSynapse 的适配层（BYOK：用户自带 Key）。
 *
 * 本项目部署为纯静态站点，没有自己的服务端，因此这层直接在浏览器里完成
 * 原来服务端做的事：拼 Prompt、消费供应商 SSE、读取 workspace 产物、
 * 在平台未回传文件时生成本地证据。Key 由访问者自己提供并只存在其浏览器内。
 *
 * 注意：EventSource 无法携带 Authorization 头，所以订阅事件流用 fetch +
 * ReadableStream 手动解析 SSE 帧。
 */

const TERMINAL_STATUSES: AgentTaskStatus[] = ['completed', 'failed', 'cancelled']
/** 供应商事件流静默超过该时长即判定为卡死，避免演示时无限转圈。 */
const STREAM_IDLE_TIMEOUT_MS = 180_000

export type ByokTaskHandle = {
  taskId: string
  status: AgentTaskStatus
}

type VendorTask = {
  id: string
  vendorTaskId: string
  connId: string
  request: StartAnalysisRequest
  sources: SourceReference[]
  apiKey: string
  status: AgentTaskStatus
  finalText: string
  completedAt: string | null
  artifacts: Map<string, string>
  listeners: Set<(event: AgentTaskEvent) => void>
  controller: AbortController
  /** 并发点击取消/重新生成时复用同一个取消流程，避免取消请求尚未送达就启动下一单。 */
  cancelPromise: Promise<boolean> | null
  started: boolean
  /** 稳定序列化后的请求输入，缓存与去重的键。 */
  material: string
  /** 命中缓存的任务：订阅时直接回放 completed，不触发供应商调用。 */
  cachedResult: CacheEntry | null
  /** 事件录制（相对启动的毫秒偏移），供 dev 导出回放包。 */
  recordedEvents: Array<{ atMs: number; event: AgentTaskEvent }>
  startedAtMs: number
}

const tasks = new Map<string, VendorTask>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** crypto.randomUUID 只在安全上下文可用；纯 HTTP 隧道演示时退回自实现。 */
function makeId(): string {
  const webCrypto = globalThis.crypto
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function unwrap(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  if ('code' in payload && payload.code !== 200) {
    const message = typeof payload.message === 'string' ? payload.message : ''
    throw new Error(message || `InfiniSynapse 返回错误码 ${String(payload.code)}`)
  }
  return 'data' in payload ? payload.data : payload
}

function textFrom(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!isRecord(value)) return ''
  for (const key of ['text', 'content', 'message', 'delta']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  for (const key of ['data', 'message', 'result', 'payload']) {
    const nested = textFrom(value[key])
    if (nested) return nested
  }
  return ''
}

/**
 * 供应商会把工具调用的原始 JSON 推给前端，直接展示既难读又会泄漏内部细节，
 * 这里压成一句面向普通用户的中文状态。
 */
function conciseProgressMessage(eventName: string, payload: unknown): string {
  const raw = textFrom(payload)
  let parsed: unknown = null
  if (raw && raw.length < 20000) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      // 供应商也可能直接推普通文本。
    }
  }

  if (isRecord(parsed)) {
    const tool = String(parsed.tool ?? parsed.type ?? '').toLowerCase()
    const filePath = parsed.path ?? parsed.fileName ?? parsed.name
    if (tool.includes('newfilecreated') || filePath) {
      return filePath
        ? `正在整理分析文件：${String(filePath).split(/[\\/]/).pop() ?? ''}`
        : '正在整理分析文件。'
    }
    if (tool.includes('web_fetch') || tool.includes('web_search')) return '正在核对官方数据来源。'
    if (tool.includes('sql') || tool.includes('data')) return '正在分析数据并整理证据。'
  }

  if (!raw || raw.length > 240 || /^\s*[{"[]/.test(raw)) {
    if (eventName === 'message.add' || eventName === 'message.update') return '正在整理分析报告和证据。'
    return '分析 Agent 正在处理数据。'
  }
  return raw.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsCompletion(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (Array.isArray(value)) return value.some(containsCompletion)
  return Object.entries(value).some(([key, child]) => {
    if (['ask', 'say', 'type', 'event'].includes(key) && child === 'completion_result') return true
    return containsCompletion(child)
  })
}

function containsVendorError(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (Array.isArray(value)) return value.some(containsVendorError)
  return Object.entries(value).some(([key, child]) => {
    if (key === 'type' && typeof child === 'string' && ['error', 'failed'].includes(child)) return true
    return containsVendorError(child)
  })
}

function artifactKind(name: string): string {
  if (name.endsWith('.md')) return 'explanation'
  if (name.endsWith('.csv')) return 'evidence'
  if (name.endsWith('.json')) return 'analysis-manifest'
  if (/\.(png|jpg|jpeg|svg)$/i.test(name)) return 'chart'
  return 'other'
}

type VendorArtifact = { name: string; path: string; kind: string }

function normalizeFiles(workspace: unknown): VendorArtifact[] {
  const files = isRecord(workspace) && Array.isArray(workspace.files) ? workspace.files : []
  return files
    .map((file: unknown): VendorArtifact => {
      if (typeof file === 'string') {
        const name = file.split(/[\\/]/).pop() ?? file
        return { name, path: file, kind: artifactKind(name) }
      }
      if (!isRecord(file)) return { name: '', path: '', kind: 'other' }
      const path = String(file.path ?? file.name ?? '')
      const name = String(file.name ?? path.split(/[\\/]/).pop() ?? '')
      return { name, path, kind: artifactKind(name) }
    })
    .filter((artifact) => artifact.name.length > 0)
}

function makePrompt(request: StartAnalysisRequest, sources: SourceReference[]): string {
  const { input, calculation } = request
  const detailed = request.inputMode === 'detailed' && request.detailedBreakdown
    ? JSON.stringify(request.detailedBreakdown, null, 2)
    : '未开启详细分类模式。'
  const payslip = request.incomeInputMode === 'payslip' && request.payslipSummary
    ? JSON.stringify(request.payslipSummary, null, 2)
    : '用户直接填写到手收入，未拆解工资条扣缴。'
  const sourceIndex = sources
    .map((source) => `- ${source.name}｜${source.year ?? '年份未标注'}｜${source.scope}｜${source.url}`)
    .join('\n')
  const diagnosticPacket = buildDiagnosticPacket(request)

  return [
    '你是"你的涨薪，消失在到手之前了吗？"的解释 Agent。当前请求已授权，直接执行，不要进入 PLAN MODE，不要询问确认，不要调用 web_search/web_fetch。',
    '只使用下面给出的本地计算结果和官方来源索引；本地计算结果不可重算、改写或四舍五入。',
    // BYOK：评委用自己的账号跑时平台侧不一定配置过数据源，流程不得依赖其存在。
    '若当前账号已启用官方统计数据源（income_benchmarks / spending_8_categories / cpi_historical），可查询核对基准数并在引用中注明数据源名称；否则以下方内联官方来源索引为准。',
    '',
    '【不可违反的边界】',
    '1. 不要重新计算、覆盖或纠正本地程序提供的任何数字。',
    '2. 用户输入的到手收入、住房和日常支出优先于任何宏观平均。',
    '3. 城市数据缺失时明确说明"已回退全国基准"，不要编造城市值。',
    '4. 不提供投资、借贷、辞职等个性化金融决策建议。',
    '',
    `【用户输入】\n${JSON.stringify(input, null, 2)}`,
    `【城市上下文】\n${JSON.stringify(request.cityContext, null, 2)}`,
    `【本地计算版本】\n${request.calculationVersion}`,
    `【本地计算结果（权威，不得改写）】\n${JSON.stringify(calculation, null, 2)}`,
    `【确定性诊断包（只允许排序、比较和解释）】\n${JSON.stringify(diagnosticPacket, null, 2)}`,
    `【工资条拆解】\n${payslip}`,
    `【日常支出详细分类】\n${detailed}`,
    `【官方来源索引】\n${sourceIndex || '仅使用任务中已启用且可追溯的官方来源。'}`,
    '',
    '【输出任务】',
    'A. 先校验 diagnostic-packet.reconciliation.difference 是否为 0；不是 0 时标记证据冲突并停止金额结论。',
    'B. 按 monthlyImpact 绝对值排序，解释前三个驱动因素；工资条扣缴不得与到手收入重复相加。',
    'C. 结合 cityContext 的 coverageTier 与 caveat 做基准说明，全国回退不得冒充城市原值。',
    'D. 比较 packet 中的基准、住房稳定、日常支出稳定和保本收入情景，不得自行生成新金额。',
    'E. 区分用户输入、本地确定性计算、官方观察值和派生估算四类信息。',
    'F. 面向普通中国城市上班族，先结论后证据，简洁、不堆宏观术语。',
    '尽力在工作区生成 explanation.md、evidence.csv、analysis-manifest.json；不要为了生成文件联网检索。',
  ].join('\n')
}

type VendorFailure = { code: string; retryable: boolean; message: string }

/** 供应商 HTTP 状态 → 面向用户的降级信息（与 server/realRaiseServer.mjs 同口径）。 */
function vendorFailureInfo(status: number): VendorFailure {
  if (status === 401 || status === 403) {
    return { code: 'AUTH_ERROR', retryable: false, message: 'API Key 无效或未授权，请在下方重新填写你的 Key。' }
  }
  if (status === 402 || status === 429) {
    return { code: 'QUOTA_OR_RATE_LIMIT', retryable: true, message: '你的账号额度或请求频率受限，请稍后重试；相同输入会命中本地缓存，不再重复扣额度。' }
  }
  if (status >= 500) {
    return { code: 'VENDOR_UNAVAILABLE', retryable: true, message: '分析平台暂时繁忙，请稍后重试。' }
  }
  return { code: 'INFINISYNAPSE_ERROR', retryable: true, message: `请求分析平台失败（HTTP ${status}）。` }
}

class VendorError extends Error {
  code: string
  retryable: boolean
  constructor(failure: VendorFailure) {
    super(failure.message)
    this.code = failure.code
    this.retryable = failure.retryable
  }
}

type CacheEntry = {
  material: string
  insight: string
  artifacts: Array<[string, string]>
  vendorTaskId: string
}

/** 输入 → 已完成结果（LRU）。命中即不再调用平台，保护用户自己的额度。 */
const completedCache = new Map<string, CacheEntry>()
const COMPLETED_CACHE_LIMIT = 100
/** 输入 → 进行中的 taskId，双击/重复提交去重。 */
const pendingByMaterial = new Map<string, string>()

function readCache(material: string): CacheEntry | null {
  const hit = completedCache.get(material)
  if (!hit || hit.material !== material) return null
  // 重新插入实现 LRU。
  completedCache.delete(material)
  completedCache.set(material, hit)
  return hit
}

function writeCache(material: string, entry: CacheEntry): void {
  completedCache.delete(material)
  completedCache.set(material, entry)
  while (completedCache.size > COMPLETED_CACHE_LIMIT) {
    const oldest = completedCache.keys().next().value
    if (oldest === undefined) break
    completedCache.delete(oldest)
  }
}

async function vendorRequest(
  task: VendorTask,
  path: string,
  init: RequestInit = {},
  options: { signal?: AbortSignal | null } = {},
): Promise<Response> {
  const response = await fetch(`${INFINI_SYNAPSE_API_BASE_URL}${path}`, {
    ...init,
    signal: options.signal === undefined ? task.controller.signal : options.signal,
    headers: {
      Authorization: `Bearer ${task.apiKey}`,
      'x-lang': 'zh_CN',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) throw new VendorError(vendorFailureInfo(response.status))
  return response
}

function emit(task: VendorTask, event: AgentTaskEvent): void {
  if (TERMINAL_STATUSES.includes(task.status) && event.type !== 'completed' && event.type !== 'failed') {
    return
  }
  if (event.type === 'started' || event.type === 'progress') task.status = 'running'
  if (event.type === 'completed' || event.type === 'failed') {
    task.status = event.type
    task.completedAt = new Date().toISOString()
  }
  if (task.recordedEvents.length < 300) {
    task.recordedEvents.push({ atMs: Math.max(0, Date.now() - task.startedAtMs), event })
  }
  for (const listener of task.listeners) listener(event)
}

function ensureLocalArtifacts(task: VendorTask): void {
  const vendorEvidence = task.artifacts.get('evidence.csv')
  if (vendorEvidence) {
    task.artifacts.set('vendor-original-evidence.csv', vendorEvidence)
  }
  const vendorManifest = task.artifacts.get('analysis-manifest.json')
  if (vendorManifest) {
    task.artifacts.set('vendor-original-analysis-manifest.json', vendorManifest)
  }
  // Evidence and manifest are always regenerated by Real Raise. The model may
  // explain deterministic numbers, but it is never the authority for them.
  task.artifacts.set('evidence.csv', buildEvidenceCsv(task.request, task.sources))
  task.artifacts.set(
    'analysis-manifest.json',
    buildAnalysisManifest({
      taskId: task.id,
      vendorTaskId: task.vendorTaskId,
      request: task.request,
      sources: task.sources,
      mode: 'byok',
    }),
  )
}

async function readWorkspace(task: VendorTask): Promise<void> {
  const response = await vendorRequest(task, INFINI_SYNAPSE_ROUTES.workspace(task.vendorTaskId))
  const workspace = unwrap(await response.json())
  const artifacts = normalizeFiles(workspace).filter((artifact) =>
    ['explanation', 'evidence', 'analysis-manifest'].includes(artifact.kind),
  )

  for (const artifact of artifacts) {
    try {
      const previewResponse = await vendorRequest(task, INFINI_SYNAPSE_ROUTES.previewFile, {
        method: 'POST',
        body: JSON.stringify({ taskId: task.vendorTaskId, fileName: artifact.path || artifact.name }),
      })
      const preview = unwrap(await previewResponse.json())
      const content = typeof preview === 'string'
        ? preview
        : isRecord(preview) && typeof preview.content === 'string'
          ? preview.content
          : ''
      if (content) task.artifacts.set(artifact.name, content)
    } catch {
      // 单个产物预览失败不影响整体完成，后面会用本地兜底补齐。
    }
  }
}

async function completeTask(task: VendorTask): Promise<void> {
  if (TERMINAL_STATUSES.includes(task.status)) return
  try {
    await readWorkspace(task)
  } catch {
    // 读不到 workspace 就只用本地证据，不让整个任务失败。
  }
  ensureLocalArtifacts(task)

  const explanation = task.artifacts.get('explanation.md')
  const insight = explanation && explanation.trim()
    ? explanation
    : task.finalText || '分析任务已完成，但平台没有返回可预览的解读正文。'

  // 同输入下次直接回放，不再扣用户额度。
  writeCache(task.material, {
    material: task.material,
    insight,
    artifacts: [...task.artifacts.entries()],
    vendorTaskId: task.vendorTaskId,
  })
  if (pendingByMaterial.get(task.material) === task.id) pendingByMaterial.delete(task.material)

  emit(task, {
    type: 'completed',
    taskId: task.id,
    insight,
    sources: task.sources,
    provenance: {
      mode: 'byok-live',
      narrativeSource: 'infinisynapse-live',
      structuredInsightSource: 'real-raise-deterministic',
      calculationAuthority: 'local-deterministic',
      calculationVersion: task.request.calculationVersion,
      attribution: 'browser-user-key',
      vendorTaskId: task.vendorTaskId,
    },
  })
}

function failTask(task: VendorTask, error: unknown, retryable = true): void {
  if (TERMINAL_STATUSES.includes(task.status)) return
  if (pendingByMaterial.get(task.material) === task.id) pendingByMaterial.delete(task.material)
  const message = error instanceof Error ? error.message : '真实分析任务失败。'
  emit(task, {
    type: 'failed',
    taskId: task.id,
    code: error instanceof VendorError ? error.code : 'INFINISYNAPSE_ERROR',
    message,
    retryable: error instanceof VendorError ? error.retryable : retryable,
  })
}

/** 返回 true 表示任务已进入终态，调用方应停止消费事件流。 */
async function handleVendorEvent(task: VendorTask, eventName: string, payload: unknown): Promise<boolean> {
  const text = textFrom(payload)
  if (text && text.length <= 4000) task.finalText = text

  if (containsVendorError(payload)) {
    failTask(task, new Error(text || '分析平台返回任务错误。'))
    return true
  }

  const progressMessage = conciseProgressMessage(eventName, payload)
  if (eventName === 'state.ready') {
    emit(task, { type: 'progress', taskId: task.id, stage: '分析任务已就绪', message: '数据源连接已建立，正在等待分析执行。', percent: 10 })
  } else if (eventName === 'message.partial') {
    emit(task, { type: 'progress', taskId: task.id, stage: '分析进行中', message: progressMessage, percent: 55 })
  } else if (eventName === 'message.add' || eventName === 'message.update') {
    emit(task, { type: 'progress', taskId: task.id, stage: '整理分析产物', message: progressMessage, percent: 75 })
  } else if (eventName === 'notification') {
    emit(task, { type: 'progress', taskId: task.id, stage: '平台状态更新', message: progressMessage })
  }

  if (containsCompletion(payload)) {
    await completeTask(task)
    return true
  }
  return false
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('分析平台超过 3 分钟没有返回进度，请重试。')),
          STREAM_IDLE_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function consumeSse(task: VendorTask, reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (!TERMINAL_STATUSES.includes(task.status)) {
    const { value, done } = await readWithIdleTimeout(reader)
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) continue

      let payload: unknown = dataLines.join('\n')
      try {
        payload = JSON.parse(payload as string)
      } catch {
        // 供应商也可能直接推普通文本。
      }
      if (await handleVendorEvent(task, eventName, payload)) {
        await reader.cancel().catch(() => undefined)
        return
      }
    }
  }

  if (!TERMINAL_STATUSES.includes(task.status)) {
    throw new Error('与分析平台的实时连接在任务完成前中断，请重试。')
  }
}

async function runTask(task: VendorTask): Promise<void> {
  try {
    emit(task, { type: 'started', taskId: task.id })

    // 必须先建立事件流，再提交任务，否则会漏掉早期进度事件。
    const eventsResponse = await vendorRequest(task, INFINI_SYNAPSE_ROUTES.events(task.connId), {
      headers: { Accept: 'text/event-stream' },
    })
    if (!eventsResponse.body) throw new Error('分析平台没有返回可读的事件流。')

    const reader = eventsResponse.body.getReader()
    const consumePromise = consumeSse(task, reader)

    if (task.request.analysisModel) {
      const settingsResponse = await vendorRequest(task, INFINI_SYNAPSE_ROUTES.settings, {
        method: 'POST',
        body: JSON.stringify({
          taskId: task.vendorTaskId,
          apiConfiguration: {
            apiProvider: 'infinisynapse',
            infinisynapseModelId: task.request.analysisModel,
          },
        }),
      })
      // 平台的业务错误可能仍返回 HTTP 200；必须解析 code，不能静默继续 newTask。
      unwrap(await settingsResponse.json())
    }

    const messageResponse = await vendorRequest(task, INFINI_SYNAPSE_ROUTES.message, {
      method: 'POST',
      body: JSON.stringify({
        type: 'newTask',
        taskId: task.vendorTaskId,
        connId: task.connId,
        chatSettings: { mode: 'act' },
        text: makePrompt(task.request, task.sources),
      }),
    })
    const messagePayload = unwrap(await messageResponse.json())
    if (isRecord(messagePayload) && typeof messagePayload.taskId === 'string') {
      task.vendorTaskId = messagePayload.taskId
    }

    await consumePromise
  } catch (error) {
    if (task.status === 'cancelled' || task.controller.signal.aborted) return
    failTask(task, error)
  }
}

export function startByokAnalysis(request: StartAnalysisRequest, apiKey: string, sources: SourceReference[]): ByokTaskHandle {
  const material = requestMaterial(request)

  // 进行中去重：同一输入的任务还在跑（双击/快速重复提交），直接复用。
  const pendingId = pendingByMaterial.get(material)
  if (pendingId) {
    const pending = tasks.get(pendingId)
    if (pending && !TERMINAL_STATUSES.includes(pending.status)) {
      return { taskId: pending.id, status: pending.status }
    }
    pendingByMaterial.delete(material)
  }

  const id = makeId()
  const task: VendorTask = {
    id,
    vendorTaskId: makeId(),
    connId: makeId(),
    request,
    sources,
    apiKey,
    status: 'queued',
    finalText: '',
    completedAt: null,
    artifacts: new Map(),
    listeners: new Set(),
    controller: new AbortController(),
    cancelPromise: null,
    started: false,
    material,
    cachedResult: readCache(material),
    recordedEvents: [],
    startedAtMs: Date.now(),
  }
  tasks.set(id, task)
  if (!task.cachedResult) pendingByMaterial.set(material, id)
  return { taskId: id, status: task.status }
}

/**
 * 订阅任务进度。首个订阅者会真正触发供应商任务——事件流必须先于 newTask
 * 建立，所以启动动作放在这里而不是 startByokAnalysis。
 */
export function subscribeByokTask(taskId: string, onEvent: (event: AgentTaskEvent) => void): () => void {
  const task = tasks.get(taskId)
  if (!task) {
    onEvent({
      type: 'failed',
      taskId,
      code: 'TASK_NOT_FOUND',
      message: '分析任务不存在或页面已刷新，请重新生成。',
      retryable: true,
    })
    return () => undefined
  }

  task.listeners.add(onEvent)
  if (!task.started) {
    task.started = true
    if (task.cachedResult) {
      // 缓存命中：本地回放结果，零平台调用、零额度消耗。
      // setTimeout 保证订阅方先拿到取消函数再收到事件。
      const cached = task.cachedResult
      setTimeout(() => {
        task.artifacts = new Map(cached.artifacts)
        emit(task, { type: 'started', taskId: task.id })
        emit(task, {
          type: 'completed',
          taskId: task.id,
          insight: cached.insight,
          sources: task.sources,
          provenance: {
            mode: 'byok-live',
            narrativeSource: 'infinisynapse-live',
            structuredInsightSource: 'real-raise-deterministic',
            calculationAuthority: 'local-deterministic',
            calculationVersion: task.request.calculationVersion,
            attribution: 'browser-user-key',
            vendorTaskId: cached.vendorTaskId,
            cached: true,
          },
        })
      }, 0)
    } else {
      void runTask(task)
    }
  }
  return () => {
    task.listeners.delete(onEvent)
  }
}

export async function cancelByokTask(taskId: string): Promise<boolean> {
  const task = tasks.get(taskId)
  if (!task) return false
  if (TERMINAL_STATUSES.includes(task.status)) return true

  if (task.cancelPromise) return task.cancelPromise

  task.cancelPromise = (async () => {
    task.status = 'cancelled'
    if (pendingByMaterial.get(task.material) === task.id) pendingByMaterial.delete(task.material)
    try {
      // 取消请求本身不能挂在已中止的 signal 上，否则会立刻失败。
      await vendorRequest(
        task,
        INFINI_SYNAPSE_ROUTES.message,
        { method: 'POST', body: JSON.stringify({ type: 'cancelTask', taskId: task.vendorTaskId }) },
        { signal: null },
      )
    } catch {
      // 平台侧取消失败也要中断本地流，用户看到的是任务已停止。
    } finally {
      task.controller.abort()
      task.listeners.clear()
    }
    return true
  })()

  return task.cancelPromise
}

export function getByokArtifact(taskId: string, fileName: string): string | null {
  return tasks.get(taskId)?.artifacts.get(fileName) ?? null
}

export function isByokTask(taskId: string): boolean {
  return tasks.has(taskId)
}

/**
 * 导出真实任务的回放包（dev 工具）。录制一次真实任务后落盘到
 * public/replays/{scenarioId}.json，纯静态部署下评委无 Key 也能看真实存档。
 */
export function exportByokReplay(taskId: string, scenarioId: string): string | null {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'completed') return null
  const completedRecord = task.recordedEvents.find(({ event }) => event.type === 'completed')
  const explanation = task.artifacts.get('explanation.md')
  const insight = explanation && explanation.trim()
    ? explanation
    : completedRecord && completedRecord.event.type === 'completed'
      ? completedRecord.event.insight
      : task.finalText
  return JSON.stringify(
    {
      schemaVersion: 'replay.v1',
      scenarioId,
      vendorTaskId: task.vendorTaskId,
      recordedAt: task.completedAt ?? new Date().toISOString(),
      signature: requestSignature(task.request),
      request: task.request,
      events: task.recordedEvents.filter(({ event }) => event.type !== 'completed'),
      completed: {
        insight,
        sources: task.sources,
        workspace: {
          artifacts: [...task.artifacts.keys()],
          previews: Object.fromEntries(task.artifacts),
        },
      },
    },
    null,
    2,
  )
}
