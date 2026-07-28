import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import worker, { AuthSessionStore, createJudgeToken, UsageGuard, verifyJudgeToken } from '../worker/index.mjs'
import { InputError, calculateLivingCost, validateAnalysisRequest } from '../worker/core.mjs'

globalThis.crypto ??= webcrypto

const validRequest = {
  input: {
    currentIncome: 10_000,
    nextIncome: 11_000,
    currentRent: 2_500,
    nextRent: 2_800,
    otherSpend: 4_000,
    otherInflationRate: 0.01,
  },
  calculation: { forged: true },
  locale: 'zh-CN',
  includeInsight: true,
  inputMode: 'basic',
  incomeInputMode: 'net',
  simulatedError: false,
}

const validated = validateAnalysisRequest(validRequest)
assert.deepEqual(validated.calculation, calculateLivingCost(validRequest.input))
assert.equal('forged' in validated.calculation, false)
console.log('PASS Worker ignores client calculation and recomputes deterministic result')

assert.throws(
  () => validateAnalysisRequest({ ...validRequest, prompt: 'free proxy please' }),
  InputError,
)
console.log('PASS Worker rejects arbitrary prompt and unknown fields')

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  async transaction(callback) {
    return callback({
      get: async (key) => this.values.get(key),
      put: async (key, value) => this.values.set(key, value),
    })
  }

  async get(key) {
    return this.values.get(key)
  }

  async put(key, value) {
    this.values.set(key, value)
  }

  async delete(key) {
    this.values.delete(key)
  }
}

const guard = new UsageGuard({ storage: new MemoryStorage() })
const guardRequest = (path, body) => new Request(`https://guard.internal${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const first = await guard.fetch(guardRequest('/reserve', {
  requestId: 'one',
  dailyLimit: 2,
  maxInflight: 1,
}))
assert.equal(first.status, 200)

const concurrent = await guard.fetch(guardRequest('/reserve', {
  requestId: 'two',
  dailyLimit: 2,
  maxInflight: 1,
}))
assert.equal(concurrent.status, 429)
assert.equal((await concurrent.json()).code, 'LIVE_BUSY')

await guard.fetch(guardRequest('/release', { requestId: 'one' }))
const second = await guard.fetch(guardRequest('/reserve', {
  requestId: 'two',
  dailyLimit: 2,
  maxInflight: 1,
}))
assert.equal(second.status, 200)
await guard.fetch(guardRequest('/release', { requestId: 'two' }))

const exhausted = await guard.fetch(guardRequest('/reserve', {
  requestId: 'three',
  dailyLimit: 2,
  maxInflight: 1,
}))
assert.equal(exhausted.status, 429)
assert.equal((await exhausted.json()).code, 'DAILY_QUOTA_REACHED')
console.log('PASS Durable Object guard enforces concurrency and exact daily ceiling')

const now = Date.now()
const judgeSession = await createJudgeToken('test-signing-secret', now, 10)
assert.equal(await verifyJudgeToken(judgeSession.token, 'test-signing-secret', now + 1), true)
assert.equal(await verifyJudgeToken(judgeSession.token, 'wrong-secret', now + 1), false)
assert.equal(await verifyJudgeToken(judgeSession.token, 'test-signing-secret', judgeSession.expiresAt), false)
assert.equal(await verifyJudgeToken(`${judgeSession.token}tampered`, 'test-signing-secret', now + 1), false)
console.log('PASS Judge sessions are signed, secret-bound, tamper-resistant, and expiring')

const authEnv = {
  ALLOWED_ORIGINS: 'https://real-raise.example',
  LIVE_ANALYSIS_ENABLED: 'true',
  INFINISYNAPSE_API_KEY: 'test-server-key',
  JUDGE_ACCESS_CODE: 'judge-access-2026',
  JUDGE_TOKEN_SECRET: 'test-signing-secret',
  JUDGE_SESSION_TTL_MINUTES: '10',
  JUDGE_AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
}
const judgeRequest = (body) => new Request('https://real-raise-api.example/api/judge/session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://real-raise.example',
  },
  body: JSON.stringify(body),
})

const invalidLogin = await worker.fetch(judgeRequest({ code: 'wrong-code' }), authEnv)
assert.equal(invalidLogin.status, 401)

const validLogin = await worker.fetch(judgeRequest({ code: authEnv.JUDGE_ACCESS_CODE }), authEnv)
assert.equal(validLogin.status, 200)
const validLoginBody = await validLogin.json()
assert.equal(await verifyJudgeToken(validLoginBody.token, authEnv.JUDGE_TOKEN_SECRET), true)

const unauthenticatedAnalysis = await worker.fetch(new Request('https://real-raise-api.example/api/analysis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: 'https://real-raise.example',
  },
  body: JSON.stringify(validRequest),
}), authEnv)
assert.equal(unauthenticatedAnalysis.status, 403)
assert.equal((await unauthenticatedAnalysis.json()).error.code, 'JUDGE_MODE_REQUIRED')

const preflight = await worker.fetch(new Request('https://real-raise-api.example/api/analysis', {
  method: 'OPTIONS',
  headers: { Origin: 'https://real-raise.example' },
}), authEnv)
assert.equal(preflight.status, 204)
assert.match(preflight.headers.get('Access-Control-Allow-Headers') ?? '', /X-Real-Raise-Judge/)
console.log('PASS Worker judge session compatibility, judge-mode gate, and CORS')

const authStorage = new MemoryStorage()
const authStore = new AuthSessionStore({ storage: authStorage })
const authBinding = {
  idFromName: () => 'real-raise-auth',
  get: () => authStore,
}
const ssoEnv = {
  ALLOWED_ORIGINS: 'https://real-raise.example,http://localhost:5173',
  LIVE_ANALYSIS_ENABLED: 'true',
  INFINISYNAPSE_API_KEY: 'server-only-vendor-key',
  INFINISYNAPSE_AUTH_BASE_URL: 'https://api.infinisynapse.cn/api',
  SSO_PUBLIC_ORIGIN: 'https://real-raise.example',
  INFINI_PARTNER_CLIENT_ID: 'partner-test-client',
  INFINI_PARTNER_CLIENT_SECRET: 'partner-test-secret',
  AUTH_SESSION_STORE: authBinding,
  JUDGE_AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) },
}
let capturedState = ''
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, init = {}) => {
  if (String(url).endsWith('/auth/partner/sessions')) {
    const requestBody = JSON.parse(init.body)
    capturedState = requestBody.state
    return Response.json({
      code: 200,
      data: { entryUrl: 'https://app.infinisynapse.cn/auth/entry?session=ps_test' },
    })
  }
  if (String(url).endsWith('/auth/partner/token')) {
    return Response.json({
      code: 200,
      data: {
        user: { id: 'infini-user-1', nickname: '测试用户', avatar: 'https://avatar.example/user.png' },
        apiKey: 'partner-test-fixture-key',
      },
    })
  }
  return originalFetch(url, init)
}

const startResponse = await worker.fetch(new Request('https://real-raise.example/api/auth/infini/start', {
  method: 'GET',
  headers: { Origin: 'https://real-raise.example' },
}), ssoEnv)
assert.equal(startResponse.status, 302)
assert.match(startResponse.headers.get('location') ?? '', /^https:\/\/app\.infinisynapse\.cn\/auth\/entry/)
assert.ok(capturedState)

const callbackResponse = await worker.fetch(new Request(
  `https://real-raise.example/api/auth/infini/callback?code=ac_test&state=${encodeURIComponent(capturedState)}`,
), ssoEnv)
assert.equal(callbackResponse.status, 302)
const sessionCookie = callbackResponse.headers.get('set-cookie') ?? ''
assert.match(sessionCookie, /HttpOnly/)
assert.match(sessionCookie, /SameSite=Lax/)
assert.doesNotMatch(sessionCookie, /partner-test-fixture-key/)

const meResponse = await worker.fetch(new Request('https://real-raise.example/api/auth/me', {
  headers: {
    Origin: 'https://real-raise.example',
    Cookie: sessionCookie.split(';')[0],
  },
}), ssoEnv)
assert.equal(meResponse.status, 200)
const meBody = await meResponse.json()
assert.deepEqual(meBody.user, {
  id: 'infini-user-1',
  nickname: '测试用户',
  avatar: 'https://avatar.example/user.png',
})
assert.equal(meBody.canRunAnalysis, true)
assert.doesNotMatch(JSON.stringify(meBody), /partner-test-fixture-key/)

const replayedCallback = await worker.fetch(new Request(
  `https://real-raise.example/api/auth/infini/callback?code=ac_test&state=${encodeURIComponent(capturedState)}`,
), ssoEnv)
assert.match(replayedCallback.headers.get('location') ?? '', /auth_error=invalid-callback/)

const logoutResponse = await worker.fetch(new Request('https://real-raise.example/api/auth/logout', {
  method: 'POST',
  headers: {
    Origin: 'https://real-raise.example',
    Cookie: sessionCookie.split(';')[0],
  },
}), ssoEnv)
assert.equal(logoutResponse.status, 200)
const afterLogout = await worker.fetch(new Request('https://real-raise.example/api/auth/me', {
  headers: {
    Origin: 'https://real-raise.example',
    Cookie: sessionCookie.split(';')[0],
  },
}), ssoEnv)
assert.equal((await afterLogout.json()).authenticated, false)
globalThis.fetch = originalFetch
console.log('PASS Partner SSO state, callback, opaque session, profile redaction, replay protection, and logout')

const assetResponse = await worker.fetch(new Request('https://real-raise-api.example/'), {
  ...authEnv,
  ASSETS: { fetch: async () => new Response('static asset') },
})
assert.equal(assetResponse.status, 200)
assert.equal(await assetResponse.text(), 'static asset')
console.log('PASS Worker serves static assets alongside API routes')
