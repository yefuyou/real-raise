import http from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function loadLocalEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const filePath = path.join(root, '.env.local')
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#') || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

loadLocalEnv()

const DEFAULT_VENDOR_BASE_URL = 'https://app.infinisynapse.cn'
const DEFAULT_PORT = 8787
const MAX_BODY_BYTES = 512 * 1024
const TERMINAL_EVENTS = new Set(['completed', 'failed'])

const DEFAULT_SOURCES = [
  {
    name: '国家统计局：2026 年上半年居民消费价格主要数据',
    year: 2026,
    scope: '全国居民消费价格八大类 1—6 月同比涨跌幅',
    url: 'https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260709_1964084.html',
  },
  {
    name: '国家统计局：2025 年居民收入和消费支出情况',
    year: 2025,
    scope: '全国及城镇居民收入、消费支出与消费结构',
    url: 'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962313.html',
  },
]

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.REAL_RAISE_CORS_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大。')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是有效 JSON。')
  }
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return payload
  const value = payload
  if ('code' in value && value.code !== 200) {
    throw new Error(value.message || `InfiniSynapse 返回错误码 ${value.code}`)
  }
  return 'data' in value ? value.data : value
}

function textFrom(value) {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  for (const key of ['text', 'content', 'message', 'delta']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  }
  for (const key of ['data', 'message', 'result', 'payload']) {
    const nested = textFrom(value[key])
    if (nested) return nested
  }
  return ''
}

function conciseProgressMessage(eventName, payload) {
  const raw = textFrom(payload)
  let parsed = null
  if (raw && raw.length < 20000) {
    try { parsed = JSON.parse(raw) } catch { /* vendor may send ordinary text */ }
  }

  if (parsed && typeof parsed === 'object') {
    const tool = String(parsed.tool || parsed.type || '').toLowerCase()
    const filePath = parsed.path || parsed.fileName || parsed.name
    if (tool.includes('newfilecreated') || filePath) return filePath ? `正在整理分析文件：${String(filePath).split(/[\\/]/).pop()}` : '正在整理分析文件。'
    if (tool.includes('web_fetch') || tool.includes('web_search')) return '正在核对官方数据来源。'
    if (tool.includes('sql') || tool.includes('data')) return '正在分析数据并整理证据。'
  }

  if (!raw || raw.length > 240 || /^\s*[{"[]/.test(raw)) {
    if (eventName === 'message.add' || eventName === 'message.update') return '正在整理分析报告和证据。'
    return '分析 Agent 正在处理数据。'
  }
  return raw.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsCompletion(value) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsCompletion)
  return Object.entries(value).some(([key, child]) => {
    if (['ask', 'say', 'type', 'event'].includes(key) && child === 'completion_result') return true
    return containsCompletion(child)
  })
}

function containsVendorError(value) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsVendorError)
  return Object.entries(value).some(([key, child]) => {
    if (key === 'type' && typeof child === 'string' && ['error', 'failed'].includes(child)) return true
    return containsVendorError(child)
  })
}

function makePrompt(request) {
  const calculation = request.calculation || {}
  const detailed = request.detailedBreakdown
    ? JSON.stringify(request.detailedBreakdown, null, 2)
    : '未开启详细分类模式。'
  const sources = (request.sourceRefs || DEFAULT_SOURCES)
    .map((source) => `- ${source.name}｜${source.year ?? '年份未标注'}｜${source.scope}｜${source.url}`)
    .join('\n')

  return [
    '你是“购买力真实算表”的解释 Agent。当前请求已授权，直接执行，不要进入 PLAN MODE，不要询问确认，不要调用 web_search/web_fetch。',
    '只使用下面给出的本地计算结果和官方来源索引；本地计算结果不可重算、改写或四舍五入。',
    '',
    `用户问题：${request.userQuestion || '请解释我下一阶段的购买力变化。'}`,
    `城市：${request.cityName || '全国'}（${request.cityCode || 'national'}），期间：${request.cityPeriod || '2026H1'}`,
    `本地计算结果：${JSON.stringify(calculation)}`,
    `详细分类：${detailed}`,
    `官方来源索引：${sources}`,
    '输出一段面向普通中国城市上班族的简短解释，区分用户输入、本地确定性计算、官方观察值和派生估算；城市数据缺失时明确说使用全国基准。',
    '尽力在工作区生成 explanation.md、evidence.csv、analysis-manifest.json；不要为了生成文件联网检索。',
  ].join('\n')
}

function artifactKind(name) {
  if (name.endsWith('.md')) return 'explanation'
  if (name.endsWith('.csv')) return 'evidence'
  if (name.endsWith('.json')) return 'analysis-manifest'
  if (/\.(png|jpg|jpeg|svg)$/i.test(name)) return 'chart'
  return 'other'
}

function normalizeFiles(workspace) {
  const files = Array.isArray(workspace?.files) ? workspace.files : []
  return files.map((file) => {
    const path = typeof file === 'string' ? file : file.path || file.name || ''
    const name = typeof file === 'string' ? file.split(/[\\/]/).pop() : file.name || path.split(/[\\/]/).pop()
    return {
      name,
      path,
      kind: artifactKind(name),
      mimeType: typeof file === 'object' ? file.mimeType || null : null,
      sizeBytes: typeof file === 'object' && Number.isFinite(file.size) ? file.size : null,
      previewable: /\.(md|csv|json|txt|png|jpg|jpeg|svg)$/i.test(name),
    }
  })
}

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function makeLocalEvidence(task) {
  const calculation = task.request.calculation || {}
  const rows = [
    ['item', 'value', 'source_type', 'source_detail'],
    ['city', task.request.cityName || '全国', 'user_input', `${task.request.cityCode || 'national'} / ${task.request.cityPeriod || '2026H1'}`],
    ['income_growth_rate', calculation.incomeGrowthRate, 'local_calculation', '本项目确定性计算'],
    ['total_spend_growth_rate', calculation.totalSpendGrowthRate, 'local_calculation', '本项目确定性计算'],
    ['real_purchasing_power_rate', calculation.realPurchasingPowerRate, 'local_calculation', '本项目确定性计算'],
    ['monthly_remainder_change', calculation.monthlyRemainderChange, 'local_calculation', '本项目确定性计算'],
    ['annual_remainder_change', calculation.annualRemainderChange, 'local_calculation', '本项目确定性计算'],
    ...(task.request.sourceRefs || DEFAULT_SOURCES).map((source) => [source.name, source.year ?? '', 'official_source', `${source.scope}｜${source.url}`]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function ensureLocalArtifacts(task, workspace) {
  const artifacts = workspace.artifacts || []
  const previews = workspace.previews || {}
  const add = (name, kind, content, mimeType) => {
    if (artifacts.some((artifact) => artifact.name === name)) return
    artifacts.push({
      name,
      path: `real-raise/${name}`,
      kind,
      mimeType,
      sizeBytes: Buffer.byteLength(content, 'utf8'),
      previewable: true,
      generatedBy: 'real-raise-backend-fallback',
    })
    previews[name] = content
  }

  add('evidence.csv', 'evidence', makeLocalEvidence(task), 'text/csv')
  add('analysis-manifest.json', 'analysis-manifest', JSON.stringify({
    schemaVersion: 'real-raise.v1',
    taskId: task.id,
    vendorTaskId: task.vendorTaskId,
    city: task.request.cityName || '全国',
    period: task.request.cityPeriod || '2026H1',
    calculationAuthority: 'local',
    sourceRefs: task.request.sourceRefs || DEFAULT_SOURCES,
    note: '若平台未返回对应工作区文件，本地适配层生成最小可追溯索引。',
  }, null, 2), 'application/json')
  workspace.artifacts = artifacts
  workspace.previews = previews
  return workspace
}

function makeServer(options = {}) {
  const vendorBaseUrl = (options.vendorBaseUrl || process.env.INFINISYNAPSE_BASE_URL || DEFAULT_VENDOR_BASE_URL).replace(/\/$/, '')
  const apiKey = options.apiKey ?? process.env.INFINISYNAPSE_API_KEY ?? ''
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const tasks = new Map()
  const log = options.log || (() => {})

  const emit = (task, event) => {
    if (TERMINAL_EVENTS.has(event.type) && task.status === event.type) return
    if (event.type === 'started' || event.type === 'progress') task.status = 'running'
    if (event.type === 'completed' || event.type === 'failed') {
      task.status = event.type
      task.completedAt = new Date().toISOString()
    }
    task.events.push(event)
    if (task.events.length > 100) task.events.shift()
    for (const client of task.clients) {
      client.write(`data: ${JSON.stringify(event)}\n\n`)
      if (TERMINAL_EVENTS.has(event.type)) client.end()
    }
    if (TERMINAL_EVENTS.has(event.type)) task.clients.clear()
  }

  const vendorRequest = async (path, init = {}) => {
    if (!apiKey) throw new Error('缺少 INFINISYNAPSE_API_KEY，尚未配置真实 API Key。')
    const response = await fetchImpl(`${vendorBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-lang': 'zh_CN',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
    if (!response.ok) throw new Error(`InfiniSynapse HTTP ${response.status}`)
    return response
  }

  const readWorkspace = async (task) => {
    const response = await vendorRequest(`/api/ai_task/getTaskWorkspace/${encodeURIComponent(task.vendorTaskId)}`)
    const workspace = unwrap(await response.json()) || {}
    const artifacts = normalizeFiles(workspace)
    const previews = {}
    for (const artifact of artifacts.filter((item) => ['explanation', 'evidence', 'analysis-manifest'].includes(item.kind))) {
      try {
        const previewResponse = await vendorRequest('/api/ai_task/previewFile', {
          method: 'POST',
          body: JSON.stringify({ taskId: task.vendorTaskId, fileName: artifact.path || artifact.name }),
        })
        previews[artifact.name] = unwrap(await previewResponse.json())
      } catch (error) {
        log(`预览产物失败 ${artifact.name}: ${error.message}`)
      }
    }
    return {
      vendorTaskId: task.vendorTaskId,
      artifacts,
      completedAt: task.completedAt,
      previews,
      cwd: workspace.cwd || null,
    }
  }

  const completeTask = async (task) => {
    if (task.status === 'completed' || task.status === 'failed') return
    let workspace = { vendorTaskId: task.vendorTaskId, artifacts: [], completedAt: null, previews: {} }
    try {
      workspace = await readWorkspace(task)
    } catch (error) {
      log(`读取 workspace 失败: ${error.message}`)
    }
    workspace = ensureLocalArtifacts(task, workspace)
    const explanation = workspace.previews?.['explanation.md']
    const insight = typeof explanation === 'string'
      ? explanation
      : typeof explanation?.content === 'string'
        ? explanation.content
        : task.finalText || '分析任务已完成，但没有找到可预览的 explanation.md。'
    emit(task, {
      type: 'completed',
      taskId: task.id,
      insight,
      sources: task.request.sourceRefs || DEFAULT_SOURCES,
      workspace,
    })
    task.workspace = workspace
  }

  const failTask = (task, error, retryable = true) => {
    if (task.status === 'completed' || task.status === 'failed') return
    emit(task, {
      type: 'failed',
      taskId: task.id,
      code: error.code || 'INFINISYNAPSE_ERROR',
      message: error.message || '真实分析任务失败。',
      retryable,
    })
  }

  const handleVendorEvent = async (task, eventName, payload) => {
    const text = textFrom(payload)
    if (text && text.length <= 4000) task.finalText = text
    const progressMessage = conciseProgressMessage(eventName, payload)
    if (containsVendorError(payload)) {
      const error = new Error(text || 'InfiniSynapse 返回任务错误。')
      error.code = 'VENDOR_TASK_ERROR'
      failTask(task, error)
      return true
    }
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

  const consumeSse = async (task, reader) => {
    const decoder = new TextDecoder()
    let buffer = ''
    while (task.status !== 'completed' && task.status !== 'failed') {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ''
      for (const frame of frames) {
        let eventName = 'message'
        const dataLines = []
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (!dataLines.length) continue
        let payload = dataLines.join('\n')
        try { payload = JSON.parse(payload) } catch { /* vendor may send plain text */ }
        if (await handleVendorEvent(task, eventName, payload)) {
          await reader.cancel()
          return
        }
      }
      // A busy vendor stream can resolve reader.read() repeatedly without
      // yielding to the HTTP server. Let health checks and frontend requests
      // get a turn between bursts of progress events.
      await new Promise((resolve) => setImmediate(resolve))
    }
    if (task.status !== 'completed' && task.status !== 'failed') {
      throw new Error('InfiniSynapse SSE 在完成信号前断开。')
    }
  }

  const runVendorTask = async (task) => {
    try {
      task.status = 'running'
      emit(task, { type: 'started', taskId: task.id })
      const eventsResponse = await vendorRequest(`/api/ai/events?connId=${encodeURIComponent(task.connId)}`, {
        headers: { Accept: 'text/event-stream' },
      })
      if (!eventsResponse.body) throw new Error('InfiniSynapse SSE 没有返回可读流。')
      const reader = eventsResponse.body.getReader()
      const consumePromise = consumeSse(task, reader)
      log(`发送 newTask ${task.vendorTaskId}`)
      const messageResponse = await vendorRequest('/api/ai/message', {
        method: 'POST',
        body: JSON.stringify({
          type: 'newTask',
          taskId: task.vendorTaskId,
          connId: task.connId,
          chatSettings: { mode: 'act' },
          text: makePrompt(task.request),
        }),
      })
      const messagePayload = unwrap(await messageResponse.json())
      log('newTask 已收到响应')
      if (messagePayload?.taskId) task.vendorTaskId = messagePayload.taskId
      await consumePromise
    } catch (error) {
      failTask(task, error)
    }
  }

  const continueVendorTask = async (task, text) => {
    if (!task.vendorTaskId) throw new Error('供应商任务 ID 尚未就绪。')
    await vendorRequest('/api/ai/message', {
      method: 'POST',
      body: JSON.stringify({
        type: 'askResponse',
        taskId: task.vendorTaskId,
        connId: task.connId,
        askResponse: 'messageResponse',
        text,
      }),
    })
  }

  const startTask = async (request) => {
    const id = randomUUID()
    const task = {
      id,
      vendorTaskId: randomUUID(),
      connId: randomUUID(),
      request,
      status: 'queued',
      events: [],
      clients: new Set(),
      finalText: '',
      completedAt: null,
    }
    tasks.set(id, task)
    void runVendorTask(task)
    return task
  }

  const taskSnapshot = (task) => ({
    taskId: task.id,
    status: task.status,
    calculation: task.request.calculation,
    events: task.events,
    insight: task.finalText || undefined,
  })

  const handle = async (req, res) => {
    setCors(res)
    if (req.method === 'OPTIONS') return json(res, 204, {})
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    if (req.method === 'POST' && pathname === '/api/real-raise/analysis') {
      try {
        if (!apiKey) return json(res, 503, { error: '服务端尚未配置 INFINISYNAPSE_API_KEY。' })
        const request = await readJson(req)
        if (!request.calculation || typeof request.calculation !== 'object') {
          return json(res, 422, { error: '缺少本地 calculation 结果。' })
        }
        const task = await startTask(request)
        return json(res, 202, { taskId: task.id, status: task.status, calculation: task.request.calculation })
      } catch (error) {
        return json(res, 400, { error: error.message })
      }
    }

    const artifactMatch = pathname.match(/^\/api\/real-raise\/analysis\/([^/]+)\/artifacts\/(.+)$/)
    if (req.method === 'GET' && artifactMatch) {
      const task = tasks.get(decodeURIComponent(artifactMatch[1]))
      if (!task) return json(res, 404, { error: '本项目任务不存在或服务已重启。' })
      const fileName = decodeURIComponent(artifactMatch[2])
      const raw = task.workspace?.previews?.[fileName]
      const content = typeof raw === 'string' ? raw : raw?.content
      if (typeof content !== 'string') return json(res, 404, { error: '该任务没有可下载的文本产物。' })
      const safeName = fileName.replace(/[^\w.-]+/g, '_') || 'real-raise-report.txt'
      res.writeHead(200, {
        'Content-Type': fileName.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'no-store',
      })
      return res.end(content)
    }

    const taskMatch = pathname.match(/^\/api\/real-raise\/analysis\/([^/]+)(?:\/(events|cancel|continue))?$/)
    if (taskMatch) {
      const task = tasks.get(decodeURIComponent(taskMatch[1]))
      if (!task) return json(res, 404, { error: '本项目任务不存在或服务已重启。' })
      const action = taskMatch[2]
      if (req.method === 'POST' && action === 'continue') {
        if (task.status === 'completed' || task.status === 'failed') {
          return json(res, 409, { error: '任务已经结束，不能继续执行。' })
        }
        const request = await readJson(req)
        if (!request.text || typeof request.text !== 'string') {
          return json(res, 422, { error: '缺少继续执行的文本指令。' })
        }
        await continueVendorTask(task, request.text)
        return json(res, 202, { taskId: task.id, status: task.status })
      }
      if (req.method === 'GET' && action === 'events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        })
        res.write(': connected\n\n')
        for (const event of task.events) res.write(`data: ${JSON.stringify(event)}\n\n`)
        if (task.status === 'completed' || task.status === 'failed') return res.end()
        task.clients.add(res)
        req.on('close', () => task.clients.delete(res))
        return
      }
      if (req.method === 'GET' && !action) return json(res, 200, taskSnapshot(task))
      if (req.method === 'POST' && action === 'cancel') {
        if (task.status !== 'completed' && task.status !== 'failed') {
          try {
            await vendorRequest('/api/ai/message', {
              method: 'POST',
              body: JSON.stringify({ type: 'cancelTask', taskId: task.vendorTaskId }),
            })
          } catch (error) {
            log(`取消供应商任务失败: ${error.message}`)
          }
          failTask(task, Object.assign(new Error('任务已取消。'), { code: 'CANCELLED' }), false)
        }
        return json(res, 200, { success: true })
      }
    }

    return json(res, 404, { error: 'Not found' })
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (!res.headersSent) json(res, 500, { error: error.message })
      else res.end()
    })
  })
  server.tasks = tasks
  return server
}

export { makeServer }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.REAL_RAISE_PORT || DEFAULT_PORT)
  const server = makeServer()
  server.listen(port, '127.0.0.1', () => {
    console.log(`Real Raise backend listening on http://127.0.0.1:${port}`)
  })
}
