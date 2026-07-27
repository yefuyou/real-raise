import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import worker, { createJudgeToken, UsageGuard, verifyJudgeToken } from '../worker/index.mjs'
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
  INFINISYNAPSE_API_KEY: 'server-only-vendor-key',
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

const assetResponse = await worker.fetch(new Request('https://real-raise-api.example/'), {
  ...authEnv,
  ASSETS: { fetch: async () => new Response('static asset') },
})
assert.equal(assetResponse.status, 200)
assert.equal(await assetResponse.text(), 'static asset')
console.log('PASS Worker serves static assets alongside API routes')
