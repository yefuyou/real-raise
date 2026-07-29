import { buildAnalysisManifest, buildEvidenceCsv } from './analysisArtifacts'
import type {
  AgentTaskEvent,
  ReplayMeta,
  SourceReference,
  StartAnalysisRequest,
} from './realRaiseContract'
import { requestSignature } from './requestSignature'

/**
 * 真实任务存档回放（三态模式中的 replay 态）。
 *
 * 演示账号提前真实跑过的任务被序列化进 public/replays/，无 Key 的访客
 * 在输入与录制时一致的场景下播放存档：看到的是真实平台产物（任务 ID
 * 可在平台后台核验），但零额度消耗。UI 必须显式标注"存档回放"，绝不冒充实时。
 */

const MANIFEST_URL = 'replays/manifest.json'
const REPLAY_BASE = 'replays/'
/** 回放按录制间隔 2 倍速播放，单段间隔封顶，避免演示干等。 */
const SPEED_DIVISOR = 2
const MAX_STEP_MS = 2500

type ManifestEntry = {
  scenarioId: string
  file: string
  replaySchemaVersion?: string
  signature: string
  vendorTaskId?: string
  recordedAt?: string
  provenanceStatus?: string
  compatibility?: ReplayMeta['compatibility']
}

type ReplayPack = {
  schemaVersion: string
  scenarioId: string
  vendorTaskId: string
  recordedAt: string
  signature: string
  request: StartAnalysisRequest
  recordedRequest: Omit<StartAnalysisRequest, 'calculationVersion' | 'cityContext'>
  provenance: {
    vendorArtifacts: {
      origin: 'infinisynapse-task-workspace'
      integrity: 'vendor-original-unaltered'
      vendorTaskId: string
    }
    compatibility: NonNullable<ReplayMeta['compatibility']> & {
      migrationId: string
      changedFields: string[]
    }
  }
  events: Array<{ atMs: number; event: AgentTaskEvent }>
  completed: {
    insight: string
    sources: SourceReference[]
    workspace?: { artifacts?: string[]; previews?: Record<string, string> }
  }
}

function hasAuditedProvenance(pack: ReplayPack, entry: ManifestEntry): boolean {
  return (
    pack.schemaVersion === 'replay.v2' &&
    entry.replaySchemaVersion === 'replay.v2' &&
    pack.signature === entry.signature &&
    pack.vendorTaskId === entry.vendorTaskId &&
    pack.provenance?.vendorArtifacts?.origin === 'infinisynapse-task-workspace' &&
    pack.provenance.vendorArtifacts.integrity === 'vendor-original-unaltered' &&
    pack.provenance.vendorArtifacts.vendorTaskId === pack.vendorTaskId &&
    pack.provenance?.compatibility?.status === 'legacy-calculation' &&
    pack.provenance.compatibility.recordedContextStatus === 'not-recorded' &&
    pack.provenance.compatibility.currentContextUsage === 'matching-only' &&
    entry.provenanceStatus === 'vendor-original-unaltered' &&
    entry.compatibility?.status === 'legacy-calculation'
  )
}

type ReplayTask = {
  id: string
  entry: ManifestEntry
  meta: ReplayMeta | null
  artifacts: Map<string, string>
  timers: Array<ReturnType<typeof setTimeout>>
  cancelled: boolean
}

const replayTasks = new Map<string, ReplayTask>()

let manifestPromise: Promise<ManifestEntry[]> | null = null

/**
 * 历史供应商证据与当前权威凭证必须使用不同文件名。
 * explanation.md 保持供应商原文；当前 evidence/manifest 由 v2 确定性请求生成。
 */
export function buildReplayArtifacts(options: {
  taskId: string
  vendorTaskId: string
  request: StartAnalysisRequest
  sources: SourceReference[]
  vendorPreviews: Record<string, string>
}): Map<string, string> {
  const artifacts = new Map<string, string>()
  for (const [name, content] of Object.entries(options.vendorPreviews)) {
    if (typeof content !== 'string') continue
    if (name === 'evidence.csv') {
      artifacts.set('vendor-original-evidence.csv', content)
    } else if (name === 'analysis-manifest.json') {
      artifacts.set('vendor-original-analysis-manifest.json', content)
    } else {
      artifacts.set(name, content)
    }
  }
  artifacts.set('evidence.csv', buildEvidenceCsv(options.request, options.sources))
  artifacts.set('analysis-manifest.json', buildAnalysisManifest({
    taskId: options.taskId,
    vendorTaskId: options.vendorTaskId,
    request: options.request,
    sources: options.sources,
    mode: 'replay',
  }))
  return artifacts
}

/** manifest 不存在（未放置任何回放包）时静默返回空表，回退演示模式。 */
function loadManifest(): Promise<ManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) return []
        const body = await response.json()
        return Array.isArray(body?.replays) ? (body.replays as ManifestEntry[]) : []
      })
      .catch(() => [])
  }
  return manifestPromise
}

/** 当前输入与某个录制存档一致时返回该存档，否则 null（回退演示模式）。 */
export async function findReplayForRequest(request: StartAnalysisRequest): Promise<string | null> {
  const manifest = await loadManifest()
  if (!manifest.length) return null
  const signature = requestSignature(request)
  const entry = manifest.find((item) => item.signature === signature)
  if (!entry) return null

  const id = `replay-task-${entry.scenarioId}-${Date.now()}`
  replayTasks.set(id, {
    id,
    entry,
    meta: null,
    artifacts: new Map(),
    timers: [],
    cancelled: false,
  })
  return id
}

export function isReplayTask(taskId: string): boolean {
  return taskId.startsWith('replay-task-')
}

export function subscribeReplayTask(taskId: string, onEvent: (event: AgentTaskEvent) => void): () => void {
  const task = replayTasks.get(taskId)
  if (!task) {
    onEvent({
      type: 'failed',
      taskId,
      code: 'REPLAY_NOT_FOUND',
      message: '回放任务不存在或页面已刷新，请重新生成。',
      retryable: true,
    })
    return () => undefined
  }

  void (async () => {
    let pack: ReplayPack
    try {
      const response = await fetch(`${REPLAY_BASE}${task.entry.file}`, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      pack = (await response.json()) as ReplayPack
    } catch {
      if (!task.cancelled) {
        onEvent({
          type: 'failed',
          taskId,
          code: 'REPLAY_LOAD_ERROR',
          message: '读取回放存档失败，请重试或直接使用演示模式。',
          retryable: true,
        })
      }
      return
    }
    if (task.cancelled) return
    if (!hasAuditedProvenance(pack, task.entry)) {
      onEvent({
        type: 'failed',
        taskId,
        code: 'REPLAY_INTEGRITY_ERROR',
        message: '回放存档缺少可审计的来源或口径声明，已停止播放，避免把历史产物误当作当前结果。',
        retryable: false,
      })
      return
    }

    task.meta = {
      scenarioId: pack.scenarioId,
      vendorTaskId: pack.vendorTaskId,
      recordedAt: pack.recordedAt,
      artifactIntegrity: pack.provenance.vendorArtifacts.integrity,
      compatibility: pack.provenance.compatibility,
    }
    task.artifacts = buildReplayArtifacts({
      taskId,
      vendorTaskId: pack.vendorTaskId,
      request: pack.request,
      sources: pack.completed.sources ?? [],
      vendorPreviews: pack.completed.workspace?.previews ?? {},
    })

    // 事件按录制偏移 2 倍速回放；taskId 统一改写成本次回放的 id。
    let clockMs = 0
    let previousAtMs = 0
    const schedule = (event: AgentTaskEvent, atMs: number) => {
      clockMs += Math.min(Math.max(0, atMs - previousAtMs) / SPEED_DIVISOR, MAX_STEP_MS)
      previousAtMs = atMs
      task.timers.push(setTimeout(() => {
        if (!task.cancelled) onEvent({ ...event, taskId })
      }, clockMs))
    }

    const progressEvents = (pack.events ?? []).filter(({ event }) => event.type !== 'completed' && event.type !== 'failed')
    for (const { atMs, event } of progressEvents) schedule(event, atMs)

    const lastAtMs = progressEvents.length ? progressEvents[progressEvents.length - 1].atMs : 0
    schedule(
      {
        type: 'completed',
        taskId,
        insight: pack.completed.insight,
        sources: pack.completed.sources ?? [],
        provenance: {
          mode: 'replay',
          narrativeSource: 'infinisynapse-replay',
          structuredInsightSource: 'real-raise-deterministic',
          calculationAuthority: 'local-deterministic',
          calculationVersion: 'living-cost.v2',
          attribution: 'none',
          vendorTaskId: pack.vendorTaskId,
          cached: false,
        },
        replayMeta: task.meta,
      },
      lastAtMs + 800,
    )
  })()

  return () => {
    task.timers.forEach((timer) => clearTimeout(timer))
    task.timers = []
  }
}

export function cancelReplayTask(taskId: string): boolean {
  const task = replayTasks.get(taskId)
  if (!task) return false
  task.cancelled = true
  task.timers.forEach((timer) => clearTimeout(timer))
  task.timers = []
  return true
}

export function getReplayArtifact(taskId: string, fileName: string): string | null {
  return replayTasks.get(taskId)?.artifacts.get(fileName) ?? null
}
