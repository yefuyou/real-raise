import assert from 'node:assert/strict'
import http from 'node:http'
import { makeServer } from '../server/realRaiseServer.mjs'

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

function json(res, payload) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function readSse(response) {
  const reader = response.body.getReader()
  const timeout = setTimeout(() => reader.cancel(), 10000)
  const decoder = new TextDecoder()
  let buffer = ''
  const events = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() || ''
    for (const frame of frames) {
      const line = frame.split(/\r?\n/).find((item) => item.startsWith('data:'))
      if (!line) continue
      events.push(JSON.parse(line.slice(5).trim()))
      if (events.at(-1)?.type === 'completed' || events.at(-1)?.type === 'failed') {
        clearTimeout(timeout)
        await reader.cancel()
        return events
      }
    }
  }
  clearTimeout(timeout)
  return events
}

const vendorOrder = []
const vendor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://vendor.test')

  if (req.method === 'GET' && url.pathname === '/api/ai/events') {
    vendorOrder.push('events')
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
    res.write(': ready\n\n')
    const connId = url.searchParams.get('connId')
    if (connId) vendor.connections.set(connId, res)
    req.on('close', () => vendor.connections.delete(connId))
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/message') {
    vendorOrder.push('message')
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      json(res, { code: 200, data: { taskId: body.taskId } })
      const eventResponse = vendor.connections.get(body.connId)
      if (eventResponse) {
        eventResponse.write('event: state.ready\ndata: {}\n\n')
        eventResponse.write('event: message.partial\ndata: {"message":{"text":"正在读取官方数据"}}\n\n')
        eventResponse.write('event: message.add\ndata: {"message":{"ask":"completion_result","text":"已完成"}}\n\n')
      }
    })
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/ai_task/getTaskWorkspace/')) {
    return json(res, {
      code: 200,
      data: {
        cwd: '/workspace/mock-task',
        files: [
          { name: 'explanation.md', path: 'explanation.md', size: 128 },
          { name: 'evidence.csv', path: 'evidence.csv', size: 64 },
          { name: 'analysis-manifest.json', path: 'analysis-manifest.json', size: 96 },
        ],
      },
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai_task/previewFile') {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const content = body.fileName === 'explanation.md'
        ? '# 真实生活解读\n\n你的本地购买力计算已经完成。'
        : body.fileName === 'evidence.csv'
          ? 'metric,value\nmonthlyRemainderChange,120\n'
          : '{"version":"mock"}'
      json(res, { code: 200, data: { content, fileType: 'text' } })
    })
    return
  }

  json(res, 404, { code: 404, message: 'not found' })
})
vendor.connections = new Map()

const vendorPort = await listen(vendor)
const backend = makeServer({ vendorBaseUrl: `http://127.0.0.1:${vendorPort}`, apiKey: 'test-key' })
const backendPort = await listen(backend)

try {
  const startAbort = new AbortController()
  const startTimer = setTimeout(() => startAbort.abort(), 5000)
  const startResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis`, {
    signal: startAbort.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { currentIncome: 8000, nextIncome: 8400 },
      calculation: { monthlyRemainderChange: 120, realPurchasingPowerRate: 0.015 },
      locale: 'zh-CN',
      includeInsight: true,
    }),
  })
  clearTimeout(startTimer)
  assert.equal(startResponse.status, 202)
  const started = await startResponse.json()
  assert.ok(started.taskId)

  const eventsAbort = new AbortController()
  const eventsTimer = setTimeout(() => eventsAbort.abort(), 10000)
  const eventsResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis/${started.taskId}/events`, { signal: eventsAbort.signal })
  clearTimeout(eventsTimer)
  assert.equal(eventsResponse.status, 200)
  const events = await readSse(eventsResponse)
  assert.equal(events.at(0)?.type, 'started')
  assert.ok(events.some((event) => event.type === 'progress'))
  const completed = events.at(-1)
  assert.equal(completed?.type, 'completed')
  assert.match(completed.insight, /真实生活解读/)
  assert.equal(completed.workspace.artifacts.length, 3)
  assert.deepEqual(vendorOrder.slice(0, 2), ['events', 'message'])

  const statusResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis/${started.taskId}`)
  const status = await statusResponse.json()
  assert.equal(status.status, 'completed')
  console.log('PASS real-raise backend SSE/workspace integration')

  // --- 缓存断言：同输入第二次请求命中缓存，不再调用供应商 ---
  const vendorCallsBefore = vendorOrder.length
  const cachedResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { currentIncome: 8000, nextIncome: 8400 },
      calculation: { monthlyRemainderChange: 120, realPurchasingPowerRate: 0.015 },
      locale: 'zh-CN',
      includeInsight: true,
    }),
  })
  assert.equal(cachedResponse.status, 202)
  const cachedStarted = await cachedResponse.json()
  assert.notEqual(cachedStarted.taskId, started.taskId)
  const cachedEventsResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis/${cachedStarted.taskId}/events`)
  const cachedEvents = await readSse(cachedEventsResponse)
  const cachedCompleted = cachedEvents.at(-1)
  assert.equal(cachedCompleted?.type, 'completed')
  assert.equal(cachedCompleted?.cached, true)
  assert.match(cachedCompleted.insight, /真实生活解读/)
  assert.equal(vendorOrder.length, vendorCallsBefore, '缓存命中时不得产生新的供应商调用')
  console.log('PASS same-input cache hit without vendor calls')

  // --- 输入不同则不会命中缓存（哈希区分度） ---
  const freshResponse = await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { currentIncome: 9000, nextIncome: 9600 },
      calculation: { monthlyRemainderChange: 300, realPurchasingPowerRate: 0.02 },
      locale: 'zh-CN',
      includeInsight: true,
    }),
  })
  const freshStarted = await freshResponse.json()
  const freshEvents = await readSse(await fetch(`http://127.0.0.1:${backendPort}/api/real-raise/analysis/${freshStarted.taskId}/events`))
  assert.equal(freshEvents.at(-1)?.type, 'completed')
  assert.notEqual(freshEvents.at(-1)?.cached, true)
  assert.ok(vendorOrder.length > vendorCallsBefore, '不同输入必须触发真实供应商调用')
  console.log('PASS different input bypasses cache')

  // --- health 探针 ---
  const healthResponse = await fetch(`http://127.0.0.1:${backendPort}/api/health`)
  assert.equal(healthResponse.status, 200)
  assert.equal((await healthResponse.json()).ok, true)
  console.log('PASS /api/health')
} finally {
  for (const response of vendor.connections.values()) response.end()
  vendor.connections.clear()
  await close(backend)
  await close(vendor)
}

// --- 降级断言：供应商 429 → QUOTA_OR_RATE_LIMIT 可读失败事件 ---
{
  const quotaVendor = http.createServer((req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'rate limited' }))
  })
  const quotaVendorPort = await listen(quotaVendor)
  const quotaBackend = makeServer({ vendorBaseUrl: `http://127.0.0.1:${quotaVendorPort}`, apiKey: 'test-key' })
  const quotaBackendPort = await listen(quotaBackend)
  try {
    const startResponse = await fetch(`http://127.0.0.1:${quotaBackendPort}/api/real-raise/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { currentIncome: 7000, nextIncome: 7300 },
        calculation: { monthlyRemainderChange: 50 },
        locale: 'zh-CN',
        includeInsight: true,
      }),
    })
    const started = await startResponse.json()
    const events = await readSse(await fetch(`http://127.0.0.1:${quotaBackendPort}/api/real-raise/analysis/${started.taskId}/events`))
    const failed = events.at(-1)
    assert.equal(failed?.type, 'failed')
    assert.equal(failed?.code, 'QUOTA_OR_RATE_LIMIT')
    assert.equal(failed?.retryable, true)
    assert.match(failed.message, /额度|频率/)
    console.log('PASS vendor 429 maps to readable QUOTA_OR_RATE_LIMIT failure')
  } finally {
    await close(quotaBackend)
    await close(quotaVendor)
  }
}

// --- 静态托管断言：dist 存在时提供 SPA，同源部署可用 ---
{
  const fs = await import('node:fs')
  const os = await import('node:os')
  const pathMod = await import('node:path')
  const distDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'rr-dist-'))
  fs.mkdirSync(pathMod.join(distDir, 'assets'), { recursive: true })
  fs.writeFileSync(pathMod.join(distDir, 'index.html'), '<!doctype html><title>Real Raise</title>')
  fs.writeFileSync(pathMod.join(distDir, 'assets', 'app.js'), 'console.log("rr")')
  const staticBackend = makeServer({ apiKey: '', distRoot: distDir })
  const staticPort = await listen(staticBackend)
  try {
    const home = await fetch(`http://127.0.0.1:${staticPort}/`)
    assert.equal(home.status, 200)
    assert.match(home.headers.get('content-type') || '', /text\/html/)
    assert.match(await home.text(), /Real Raise/)

    const spa = await fetch(`http://127.0.0.1:${staticPort}/some/client/route`)
    assert.equal(spa.status, 200, 'SPA 路由必须回退到 index.html')

    const asset = await fetch(`http://127.0.0.1:${staticPort}/assets/app.js`)
    assert.equal(asset.status, 200)
    assert.match(asset.headers.get('cache-control') || '', /immutable/)

    const escape = await fetch(`http://127.0.0.1:${staticPort}/..%2f..%2fetc%2fpasswd`)
    assert.equal(escape.status, 404, '目录穿越必须被拒绝')

    const missingKey = await fetch(`http://127.0.0.1:${staticPort}/api/real-raise/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calculation: { x: 1 } }),
    })
    assert.equal(missingKey.status, 503, '缺少 API Key 必须返回可读的 503 降级')
    console.log('PASS static hosting, SPA fallback, traversal guard, missing-key degradation')
  } finally {
    await close(staticBackend)
    fs.rmSync(distDir, { recursive: true, force: true })
  }
}

console.log('\nALL SERVER TESTS PASSED')
