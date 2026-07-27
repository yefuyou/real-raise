import assert from 'node:assert/strict'
import { UsageGuard } from '../worker/index.mjs'
import { InputError, calculateLivingCost, validateAnalysisRequest } from '../worker/core.mjs'

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
