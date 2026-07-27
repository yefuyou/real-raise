import { InputError, validateAnalysisRequest } from './core.mjs'
import { UpstreamError, runInfiniSynapseAnalysis } from './infiniSynapse.mjs'

const MAX_BODY_BYTES = 20_000
const DEFAULT_TIMEOUT_MS = 180_000
const LEASE_TTL_MS = 4 * 60_000
const DEFAULT_JUDGE_SESSION_TTL_MINUTES = 6 * 60

function shanghaiDate(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.min(parsed, maximum)
}

export class UsageGuard {
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    if (request.method !== 'POST') return Response.json({ error: 'method not allowed' }, { status: 405 })
    const url = new URL(request.url)
    const body = await request.json().catch(() => ({}))

    if (url.pathname === '/reserve') {
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      if (!requestId) return Response.json({ error: 'requestId required' }, { status: 400 })
      const dailyLimit = positiveInteger(body.dailyLimit, 10, 100)
      const maxInflight = positiveInteger(body.maxInflight, 1, 5)
      const now = Date.now()
      const date = shanghaiDate(now)

      return this.state.storage.transaction(async (txn) => {
        const stored = await txn.get('usage')
        const usage = stored && stored.date === date
          ? stored
          : { date, startedToday: 0, leases: {} }
        const leases = Object.fromEntries(
          Object.entries(usage.leases ?? {}).filter(([, startedAt]) => now - Number(startedAt) < LEASE_TTL_MS),
        )

        if (dailyLimit === 0 || usage.startedToday >= dailyLimit) {
          await txn.put('usage', { ...usage, leases })
          return Response.json({
            allowed: false,
            code: 'DAILY_QUOTA_REACHED',
            startedToday: usage.startedToday,
          }, { status: 429 })
        }
        if (Object.keys(leases).length >= maxInflight) {
          await txn.put('usage', { ...usage, leases })
          return Response.json({
            allowed: false,
            code: 'LIVE_BUSY',
            startedToday: usage.startedToday,
          }, { status: 429 })
        }

        leases[requestId] = now
        const next = {
          date,
          startedToday: usage.startedToday + 1,
          leases,
        }
        await txn.put('usage', next)
        return Response.json({
          allowed: true,
          startedToday: next.startedToday,
          inflight: Object.keys(leases).length,
        })
      })
    }

    if (url.pathname === '/release') {
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      if (!requestId) return Response.json({ ok: true })
      await this.state.storage.transaction(async (txn) => {
        const usage = await txn.get('usage')
        if (!usage) return
        const leases = { ...(usage.leases ?? {}) }
        delete leases[requestId]
        await txn.put('usage', { ...usage, leases })
      })
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'not found' }, { status: 404 })
  }
}

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Real-Raise-Session, X-Real-Raise-Judge',
    'Access-Control-Expose-Headers': 'X-Real-Raise-Task-Id',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

async function hmac(secret, value) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

async function secureStringEqual(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ])
  return constantTimeEqual(new Uint8Array(leftDigest), new Uint8Array(rightDigest))
}

export async function createJudgeToken(secret, now = Date.now(), ttlMinutes = DEFAULT_JUDGE_SESSION_TTL_MINUTES) {
  const expiresAt = now + positiveInteger(ttlMinutes, DEFAULT_JUDGE_SESSION_TTL_MINUTES, 24 * 60) * 60_000
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    v: 1,
    role: 'judge',
    exp: expiresAt,
  })))
  const signature = bytesToBase64Url(await hmac(secret, payload))
  return { token: `${payload}.${signature}`, expiresAt }
}

export async function verifyJudgeToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false
  try {
    const expectedSignature = await hmac(secret, parts[0])
    const suppliedSignature = base64UrlToBytes(parts[1])
    if (!constantTimeEqual(expectedSignature, suppliedSignature)) return false
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])))
    return payload?.v === 1
      && payload?.role === 'judge'
      && typeof payload?.exp === 'number'
      && payload.exp > now
  } catch {
    return false
  }
}

function errorResponse(origin, status, code, message, fallbackAllowed = false) {
  return Response.json(
    { error: { code, message, fallbackAllowed } },
    { status, headers: origin ? corsHeaders(origin) : undefined },
  )
}

async function readRequestJson(request, origin) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new InputError('Content-Type 必须是 application/json')
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_BODY_BYTES) {
    const error = new InputError('请求体超过 20 KB')
    error.status = 413
    error.code = 'REQUEST_TOO_LARGE'
    throw error
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    const error = new InputError('请求体超过 20 KB')
    error.status = 413
    error.code = 'REQUEST_TOO_LARGE'
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new InputError('请求体不是有效 JSON')
  }
}

function bearerToken(request) {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

async function handleJudgeSession(request, env) {
  const origin = request.headers.get('origin') ?? ''
  if (!origin || !allowedOrigins(env).has(origin)) {
    return errorResponse('', 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表。')
  }
  if (!env.JUDGE_ACCESS_CODE || !env.JUDGE_TOKEN_SECRET) {
    return errorResponse(origin, 503, 'JUDGE_AUTH_NOT_CONFIGURED', '评委验证服务尚未配置。')
  }

  const rateKey = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Real-Raise-Session')
    || 'anonymous'
  const rateResult = await env.JUDGE_AUTH_RATE_LIMITER.limit({ key: rateKey })
  if (!rateResult.success) {
    return errorResponse(origin, 429, 'JUDGE_AUTH_RATE_LIMITED', '评委口令尝试过多，请一分钟后重试。')
  }

  let body
  try {
    body = await readRequestJson(request, origin)
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(origin, error.status ?? 400, error.code ?? 'INVALID_INPUT', error.message)
    }
    return errorResponse(origin, 400, 'INVALID_REQUEST', '请求无法解析。')
  }
  const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
  if (
    keys.length !== 1
    || keys[0] !== 'code'
    || typeof body.code !== 'string'
    || body.code.length < 8
    || body.code.length > 128
  ) {
    return errorResponse(origin, 422, 'INVALID_JUDGE_CODE', '评委口令格式无效。')
  }
  if (!(await secureStringEqual(body.code, env.JUDGE_ACCESS_CODE))) {
    return errorResponse(origin, 401, 'INVALID_JUDGE_CODE', '评委口令不正确。')
  }

  const session = await createJudgeToken(
    env.JUDGE_TOKEN_SECRET,
    Date.now(),
    env.JUDGE_SESSION_TTL_MINUTES,
  )
  return Response.json(session, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'Cache-Control': 'no-store',
    },
  })
}

async function guardStub(env) {
  const id = env.USAGE_GUARD.idFromName('real-raise-global')
  return env.USAGE_GUARD.get(id)
}

async function reserveUsage(env, requestId) {
  const stub = await guardStub(env)
  const response = await stub.fetch('https://usage-guard.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      dailyLimit: positiveInteger(env.DAILY_LIVE_LIMIT, 10, 100),
      maxInflight: positiveInteger(env.MAX_INFLIGHT, 1, 5),
    }),
  })
  if (response.ok) return
  const body = await response.json().catch(() => ({}))
  const code = body.code === 'LIVE_BUSY' ? 'LIVE_BUSY' : 'DAILY_QUOTA_REACHED'
  throw new UpstreamError(
    code,
    code === 'LIVE_BUSY' ? '当前已有实时任务在运行，请稍后再试。' : '今日实时分析额度已用完。',
    429,
    true,
  )
}

async function releaseUsage(env, requestId) {
  const stub = await guardStub(env)
  await stub.fetch('https://usage-guard.internal/release', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })
}

function sseFrame(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

async function handleAnalysis(request, env) {
  const origin = request.headers.get('origin') ?? ''
  if (!origin || !allowedOrigins(env).has(origin)) {
    return errorResponse('', 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表。')
  }
  if (env.LIVE_ANALYSIS_ENABLED !== 'true') {
    return errorResponse(origin, 503, 'LIVE_DISABLED', '实时分析暂未开放。', true)
  }
  if (!env.INFINISYNAPSE_API_KEY) {
    return errorResponse(origin, 503, 'SERVER_NOT_CONFIGURED', '实时分析服务尚未配置。', true)
  }
  // 评委模式由前端显式开启；项目 Key 仍只存在 Worker Secret。
  // 真实调用还受到来源校验、每分钟限流和每日额度保险丝保护。
  if (request.headers.get('X-Real-Raise-Judge') !== 'true') {
    return errorResponse(origin, 403, 'JUDGE_MODE_REQUIRED', '请先进入评委模式。')
  }

  let analysisRequest
  try {
    analysisRequest = validateAnalysisRequest(await readRequestJson(request, origin))
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(origin, error.status ?? 422, error.code ?? 'INVALID_INPUT', error.message)
    }
    return errorResponse(origin, 400, 'INVALID_REQUEST', '请求无法解析。')
  }

  const rateKey = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-Raise-Session') || 'anonymous'
  const rateResult = await env.ANALYSIS_RATE_LIMITER.limit({ key: rateKey })
  if (!rateResult.success) {
    return errorResponse(origin, 429, 'RATE_LIMITED', '每 60 秒只能发起一次实时分析。', true)
  }

  const requestId = crypto.randomUUID()
  try {
    await reserveUsage(env, requestId)
  } catch (error) {
    if (error instanceof UpstreamError) {
      return errorResponse(origin, error.status, error.code, error.message, true)
    }
    return errorResponse(origin, 503, 'GUARD_UNAVAILABLE', '实时分析保护器暂不可用。', true)
  }

  const encoder = new TextEncoder()
  const abortController = new AbortController()
  let streamClosed = false
  const startedAt = Date.now()

  const stream = new ReadableStream({
    start(controller) {
      const send = (event) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(sseFrame(event)))
        } catch {
          streamClosed = true
          abortController.abort()
        }
      }

      void (async () => {
        let outcome = 'failed'
        try {
          const result = await runInfiniSynapseAnalysis({
            requestId,
            request: analysisRequest,
            apiKey: env.INFINISYNAPSE_API_KEY,
            baseUrl: env.INFINISYNAPSE_API_BASE_URL || 'https://app.infinisynapse.cn',
            timeoutMs: DEFAULT_TIMEOUT_MS,
            onEvent: send,
            clientSignal: abortController.signal,
          })
          outcome = 'completed'
          send({
            type: 'completed',
            taskId: requestId,
            insight: result.insight,
            sources: result.sources,
            artifacts: result.artifacts,
          })
        } catch (error) {
          const known = error instanceof UpstreamError
          send({
            type: 'failed',
            taskId: requestId,
            code: known ? error.code : 'SERVER_ANALYSIS_ERROR',
            message: known ? error.message : '服务端分析任务失败。',
            retryable: known ? error.retryable : true,
          })
        } finally {
          await releaseUsage(env, requestId).catch(() => undefined)
          console.log(JSON.stringify({
            requestId,
            outcome,
            durationMs: Date.now() - startedAt,
          }))
          if (!streamClosed) {
            streamClosed = true
            controller.close()
          }
        }
      })()
    },
    cancel() {
      streamClosed = true
      abortController.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Real-Raise-Task-Id': requestId,
    },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'real-raise-api',
        liveEnabled: env.LIVE_ANALYSIS_ENABLED === 'true',
        judgeAccessConfigured: Boolean(env.JUDGE_ACCESS_CODE && env.JUDGE_TOKEN_SECRET),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (request.method === 'OPTIONS' && (
      url.pathname === '/api/analysis'
      || url.pathname === '/api/judge/session'
    )) {
      const origin = request.headers.get('origin') ?? ''
      if (!origin || !allowedOrigins(env).has(origin)) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method === 'POST' && url.pathname === '/api/judge/session') {
      return handleJudgeSession(request, env)
    }
    if (request.method === 'POST' && url.pathname === '/api/analysis') {
      return handleAnalysis(request, env)
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }
    return Response.json({ error: 'not found' }, { status: 404 })
  },
}
