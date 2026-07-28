import { InputError, validateAnalysisRequest } from './core.mjs'
import { UpstreamError, runInfiniSynapseAnalysis } from './infiniSynapse.mjs'

const MAX_BODY_BYTES = 20_000
const DEFAULT_TIMEOUT_MS = 180_000
const LEASE_TTL_MS = 4 * 60_000
const DEFAULT_JUDGE_SESSION_TTL_MINUTES = 6 * 60
const DEFAULT_SSO_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_SSO_FLOW_TTL_SECONDS = 10 * 60

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

/**
 * Server-side storage for the short-lived Partner SSO flow and the opaque
 * Real Raise session. Partner API keys are stored here and are never returned
 * by a public route.
 */
export class AuthSessionStore {
  constructor(state) {
    this.state = state
  }

  async fetch(request) {
    const url = new URL(request.url)
    const body = request.method === 'POST'
      ? await request.json().catch(() => ({}))
      : {}

    if (request.method === 'POST' && url.pathname === '/state') {
      const state = typeof body.state === 'string' ? body.state : ''
      const expiresAt = Number(body.expiresAt)
      if (!state || !Number.isFinite(expiresAt)) {
        return Response.json({ ok: false }, { status: 400 })
      }
      await this.state.storage.put(`oauth-state:${state}`, { expiresAt })
      return Response.json({ ok: true })
    }

    if (request.method === 'POST' && url.pathname === '/state/consume') {
      const state = typeof body.state === 'string' ? body.state : ''
      if (!state) return Response.json({ valid: false }, { status: 400 })
      const key = `oauth-state:${state}`
      const record = await this.state.storage.get(key)
      await this.state.storage.delete(key)
      return Response.json({ valid: Boolean(record && Number(record.expiresAt) > Date.now()) })
    }

    if (request.method === 'POST' && url.pathname === '/state/delete') {
      const state = typeof body.state === 'string' ? body.state : ''
      if (state) await this.state.storage.delete(`oauth-state:${state}`)
      return Response.json({ ok: true })
    }

    if (request.method === 'POST' && url.pathname === '/session') {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const expiresAt = Number(body.expiresAt)
      const user = body.user && typeof body.user === 'object' ? body.user : null
      if (!sessionId || !user || !Number.isFinite(expiresAt)) {
        return Response.json({ ok: false }, { status: 400 })
      }
      await this.state.storage.put(`session:${sessionId}`, {
        user,
        apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
        expiresAt,
      })
      return Response.json({ ok: true })
    }

    if (request.method === 'GET' && url.pathname === '/session') {
      const sessionId = url.searchParams.get('id') ?? ''
      if (!sessionId) return Response.json({ session: null })
      const key = `session:${sessionId}`
      const session = await this.state.storage.get(key)
      if (!session || Number(session.expiresAt) <= Date.now()) {
        await this.state.storage.delete(key)
        return Response.json({ session: null })
      }
      return Response.json({ session })
    }

    if (request.method === 'DELETE' && url.pathname === '/session') {
      const sessionId = url.searchParams.get('id') ?? ''
      if (sessionId) await this.state.storage.delete(`session:${sessionId}`)
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Real-Raise-Session, X-Real-Raise-Judge, X-Real-Raise-Mode',
    'Access-Control-Expose-Headers': 'X-Real-Raise-Task-Id',
    'Access-Control-Allow-Credentials': 'true',
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

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

function cookieValue(request, name) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=')
    if (key === name) return valueParts.join('=')
  }
  return ''
}

function ssoCookie(sessionId, maxAge, sameSite = 'Lax') {
  return [
    `__Host-rr_session=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    `SameSite=${sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].join('; ')
}

function clearSsoCookie() {
  return ssoCookie('', 0)
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

function ssoConfig(env) {
  const publicOrigin = String(env.SSO_PUBLIC_ORIGIN ?? '').replace(/\/$/, '')
  const authBaseUrl = String(
    env.INFINISYNAPSE_AUTH_BASE_URL ?? 'https://api.infinisynapse.cn/api',
  ).replace(/\/$/, '')
  return {
    publicOrigin,
    authBaseUrl,
    clientId: String(env.INFINI_PARTNER_CLIENT_ID ?? '').trim(),
    clientSecret: String(env.INFINI_PARTNER_CLIENT_SECRET ?? '').trim(),
    cookieSameSite: String(env.SSO_COOKIE_SAMESITE ?? 'Lax'),
  }
}

function ssoConfigured(env) {
  const config = ssoConfig(env)
  return Boolean(config.publicOrigin && config.clientId && config.clientSecret)
}

function authStoreStub(env) {
  if (!env.AUTH_SESSION_STORE) return null
  const id = env.AUTH_SESSION_STORE.idFromName('real-raise-auth')
  return env.AUTH_SESSION_STORE.get(id)
}

async function authStoreRequest(env, path, init = {}) {
  const stub = authStoreStub(env)
  if (!stub) return null
  return stub.fetch(new Request(`https://auth-store.internal${path}`, init))
}

async function saveOauthState(env, state, expiresAt) {
  const response = await authStoreRequest(env, '/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, expiresAt }),
  })
  return Boolean(response?.ok)
}

async function consumeOauthState(env, state) {
  const response = await authStoreRequest(env, '/state/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  if (!response?.ok) return false
  const body = await response.json().catch(() => ({}))
  return body.valid === true
}

async function deleteOauthState(env, state) {
  await authStoreRequest(env, '/state/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
}

async function saveSsoSession(env, session) {
  const response = await authStoreRequest(env, '/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  })
  return Boolean(response?.ok)
}

async function readSsoSession(request, env) {
  const sessionId = cookieValue(request, '__Host-rr_session')
  if (!sessionId) return null
  const response = await authStoreRequest(env, `/session?id=${encodeURIComponent(sessionId)}`)
  if (!response?.ok) return null
  const body = await response.json().catch(() => ({}))
  const session = body.session
  if (!session || typeof session !== 'object') return null
  return { id: sessionId, ...session }
}

async function deleteSsoSession(request, env) {
  const sessionId = cookieValue(request, '__Host-rr_session')
  if (!sessionId) return
  await authStoreRequest(env, `/session?id=${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

function safeAuthRedirect(config, reason = '', fallbackOrigin = 'https://localhost') {
  const target = new URL('/', config.publicOrigin || fallbackOrigin)
  if (reason === 'success') {
    target.searchParams.set('auth', 'success')
  } else if (reason) {
    target.searchParams.set('auth_error', reason)
  }
  return target.toString()
}

function authErrorResponse(origin, code, message, status = 503) {
  return errorResponse(origin, status, code, message, true)
}

async function infiniPartnerRequest(config, path, body) {
  const response = await fetch(`${config.authBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': config.clientId,
      'X-Client-Secret': config.clientSecret,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.code !== 200) {
    const error = new Error('InfiniSynapse Partner SSO request failed')
    error.upstreamStatus = response.status
    error.upstreamCode = payload.code
    throw error
  }
  return payload.data ?? {}
}

function ssoCookieSameSite(config) {
  return ['Lax', 'Strict', 'None'].includes(config.cookieSameSite)
    ? config.cookieSameSite
    : 'Lax'
}

async function handleSsoStart(request, env) {
  const origin = request.headers.get('origin') ?? ''
  if (origin && !allowedOrigins(env).has(origin)) {
    return errorResponse('', 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表。')
  }
  const config = ssoConfig(env)
  if (!ssoConfigured(env) || !authStoreStub(env)) {
    return authErrorResponse(origin, 'SSO_NOT_CONFIGURED', '登录服务尚未配置，请稍后再试。')
  }

  const state = randomToken(32)
  const expiresAt = Date.now() + positiveInteger(
    env.SSO_FLOW_TTL_SECONDS,
    DEFAULT_SSO_FLOW_TTL_SECONDS,
    30 * 60,
  ) * 1000
  if (!await saveOauthState(env, state, expiresAt)) {
    return authErrorResponse(origin, 'SSO_SESSION_STORE_UNAVAILABLE', '登录服务暂时不可用，请稍后再试。')
  }

  try {
    const data = await infiniPartnerRequest(config, '/auth/partner/sessions', {
      returnUrl: `${config.publicOrigin}/api/auth/infini/callback`,
      cancelUrl: safeAuthRedirect(config, 'cancelled'),
      state,
      metadata: { source: 'real-raise' },
    })
    if (typeof data.entryUrl !== 'string' || !data.entryUrl.startsWith('https://')) {
      throw new Error('Missing entryUrl')
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.entryUrl,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    await deleteOauthState(env, state)
    return authErrorResponse(origin, 'SSO_PROVIDER_UNAVAILABLE', 'InfiniSynapse 登录暂时不可用，请稍后再试。', 502)
  }
}

async function handleSsoCallback(request, env) {
  const config = ssoConfig(env)
  const requestOrigin = new URL(request.url).origin
  if (!ssoConfigured(env) || !authStoreStub(env)) {
    return new Response(null, { status: 302, headers: { Location: safeAuthRedirect(config, 'not-configured', requestOrigin) } })
  }
  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code || !state || !(await consumeOauthState(env, state))) {
    return new Response(null, { status: 302, headers: { Location: safeAuthRedirect(config, 'invalid-callback', requestOrigin) } })
  }

  try {
    const data = await infiniPartnerRequest(config, '/auth/partner/token', {
      code,
      grant_type: 'authorization_code',
      withApiKey: true,
    })
    const platformUser = data.user && typeof data.user === 'object' ? data.user : null
    const userId = typeof platformUser?.id === 'string' ? platformUser.id : ''
    if (!userId) throw new Error('Missing platform user id')
    const sessionId = randomToken(32)
    const ttlSeconds = positiveInteger(
      env.SSO_SESSION_TTL_SECONDS,
      DEFAULT_SSO_SESSION_TTL_SECONDS,
      30 * 24 * 60 * 60,
    )
    const stored = await saveSsoSession(env, {
      sessionId,
      user: {
        id: userId,
        nickname: typeof platformUser.nickname === 'string' ? platformUser.nickname : '',
        username: typeof platformUser.username === 'string' ? platformUser.username : '',
        avatar: typeof platformUser.avatar === 'string' ? platformUser.avatar : '',
      },
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    if (!stored) throw new Error('Session store unavailable')
    return new Response(null, {
      status: 302,
      headers: {
        Location: safeAuthRedirect(config, 'success', requestOrigin),
        'Set-Cookie': ssoCookie(sessionId, ttlSeconds, ssoCookieSameSite(config)),
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new Response(null, { status: 302, headers: { Location: safeAuthRedirect(config, 'failed', requestOrigin) } })
  }
}

async function handleSsoMe(request, env) {
  // Same-origin GET requests are allowed to omit the Origin header. Browsers
  // commonly do this for fetch('/api/auth/me'), while cross-origin requests
  // still carry Origin and remain restricted by ALLOWED_ORIGINS.
  const origin = request.headers.get('origin') || new URL(request.url).origin
  if (!origin || !allowedOrigins(env).has(origin)) {
    return errorResponse('', 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表。')
  }
  const session = await readSsoSession(request, env)
  if (!session) {
    return Response.json({ authenticated: false, user: null, canRunAnalysis: false }, {
      headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' },
    })
  }
  return Response.json({
    authenticated: true,
    user: {
      id: session.user?.id,
      nickname: session.user?.nickname || session.user?.username || 'InfiniSynapse 用户',
      avatar: session.user?.avatar || '',
    },
    canRunAnalysis: Boolean(session.apiKey),
  }, { headers: { ...corsHeaders(origin), 'Cache-Control': 'no-store' } })
}

async function handleSsoLogout(request, env) {
  const origin = request.headers.get('origin') ?? ''
  if (!origin || !allowedOrigins(env).has(origin)) {
    return errorResponse('', 403, 'ORIGIN_NOT_ALLOWED', '请求来源不在允许列表。')
  }
  await deleteSsoSession(request, env)
  return Response.json({ ok: true }, {
    headers: { ...corsHeaders(origin), 'Set-Cookie': clearSsoCookie(), 'Cache-Control': 'no-store' },
  })
}

/**
 * Resolve the explicitly requested analysis identity. Partner SSO and judge
 * mode must remain separate even when the same browser has both sessions.
 * Missing mode keeps the old compatibility behavior during rollout.
 */
export function resolveAnalysisMode({ requestedMode, judgeHeader, hasPartnerSession }) {
  if (requestedMode !== undefined && requestedMode !== '' && requestedMode !== 'partner' && requestedMode !== 'judge') {
    return { mode: null, code: 'INVALID_ANALYSIS_MODE' }
  }
  if (requestedMode === 'partner') return { mode: 'partner', code: null }
  if (requestedMode === 'judge') return { mode: 'judge', code: null }
  if (judgeHeader === 'true') return { mode: 'judge', code: null }
  if (hasPartnerSession) return { mode: 'partner', code: null }
  return { mode: 'judge', code: null }
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

async function guardStub(env, scope = 'project') {
  const scopeName = scope === 'project' ? 'real-raise-global' : `real-raise-${scope}`
  const id = env.USAGE_GUARD.idFromName(scopeName)
  return env.USAGE_GUARD.get(id)
}

async function reserveUsage(env, requestId, scope = 'project') {
  const stub = await guardStub(env, scope)
  const response = await stub.fetch('https://usage-guard.internal/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      dailyLimit: positiveInteger(
        scope === 'project' ? env.DAILY_LIVE_LIMIT : env.PARTNER_DAILY_LIVE_LIMIT,
        scope === 'project' ? 10 : 20,
        100,
      ),
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

async function releaseUsage(env, requestId, scope = 'project') {
  const stub = await guardStub(env, scope)
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
  const ssoSession = await readSsoSession(request, env)
  const modeDecision = resolveAnalysisMode({
    requestedMode: request.headers.get('X-Real-Raise-Mode') ?? '',
    judgeHeader: request.headers.get('X-Real-Raise-Judge') ?? '',
    hasPartnerSession: Boolean(ssoSession),
  })
  if (modeDecision.code) {
    return errorResponse(origin, 400, modeDecision.code, '分析模式无效，请重新选择用户模式或评委模式。')
  }
  const analysisMode = modeDecision.mode
  const usingPartnerKey = analysisMode === 'partner'
  if (usingPartnerKey && !ssoSession) {
    return errorResponse(origin, 401, 'AUTH_REQUIRED', '请先使用 InfiniSynapse 登录，再生成个人报告。', true)
  }
  if (usingPartnerKey && !ssoSession.apiKey) {
    return errorResponse(origin, 409, 'PARTNER_API_KEY_UNAVAILABLE', '登录成功，但当前账户暂时无法签发分析权限，请检查平台 API Key 上限。', true)
  }
  if (!usingPartnerKey && !env.INFINISYNAPSE_API_KEY) {
    return errorResponse(origin, 503, 'SERVER_NOT_CONFIGURED', '实时分析服务尚未配置。', true)
  }
  // Judge mode is explicitly independent from Partner SSO. A logged-in user
  // still uses the project judge key when the caller asks for judge mode.
  if (!usingPartnerKey && request.headers.get('X-Real-Raise-Judge') !== 'true') {
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

  const rateKey = usingPartnerKey
    ? `partner-${ssoSession.user?.id || 'user'}`
    : request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Real-Raise-Session')
      || 'anonymous'
  const rateResult = await env.ANALYSIS_RATE_LIMITER.limit({ key: rateKey })
  if (!rateResult.success) {
    return errorResponse(origin, 429, 'RATE_LIMITED', '每 60 秒只能发起一次实时分析。', true)
  }

  const requestId = crypto.randomUUID()
  const guardScope = usingPartnerKey
    ? `partner-${ssoSession.user.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'user'}`
    : 'project'
  try {
    await reserveUsage(env, requestId, guardScope)
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
            apiKey: usingPartnerKey ? ssoSession.apiKey : env.INFINISYNAPSE_API_KEY,
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
          await releaseUsage(env, requestId, guardScope).catch(() => undefined)
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
        partnerSsoConfigured: ssoConfigured(env) && Boolean(authStoreStub(env)),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (request.method === 'OPTIONS' && (
      url.pathname === '/api/analysis'
      || url.pathname === '/api/judge/session'
      || url.pathname === '/api/auth/infini/start'
      || url.pathname === '/api/auth/infini/callback'
      || url.pathname === '/api/auth/me'
      || url.pathname === '/api/auth/logout'
    )) {
      const origin = request.headers.get('origin') ?? ''
      if (!origin || !allowedOrigins(env).has(origin)) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/infini/start') {
      return handleSsoStart(request, env)
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/infini/callback') {
      return handleSsoCallback(request, env)
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      return handleSsoMe(request, env)
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      return handleSsoLogout(request, env)
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
