import { calculateLivingCost, formatMoney, formatRate } from './livingCost'
import type { ScenarioInput } from './livingCost'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Test Failed: ${message}`)
  }
}

function runTests() {
  console.log('Running livingCost domain tests...')

  // Test 1: Standard raise scenario
  const standardInput: ScenarioInput = {
    currentIncome: 10000,
    nextIncome: 12000,
    currentRent: 3000,
    nextRent: 3500,
    otherSpend: 4000,
    otherInflationRate: 0.05, // 5%
  }

  const res1 = calculateLivingCost(standardInput)
  assert(res1.raiseIncrease === 2000, 'raiseIncrease should be 2000')
  assert(res1.rentIncrease === 5000 - 4500 || res1.rentIncrease === 500, 'rentIncrease should be 500')
  assert(res1.nextOtherSpend === 4200, 'nextOtherSpend should be 4200 (4000 * 1.05)')
  assert(res1.nextTotalSpend === 7700, 'nextTotalSpend should be 7700 (3500 + 4200)')
  assert(res1.currentRemainder === 3000, 'currentRemainder should be 3000 (10000 - 7000)')
  assert(res1.nextRemainder === 4300, 'nextRemainder should be 4300 (12000 - 7700)')
  assert(res1.monthlyRemainderChange === 1300, 'monthlyRemainderChange should be 1300')
  assert(res1.annualRemainderChange === 15600, 'annualRemainderChange should be 15600')
  assert(res1.realPurchasingPowerRate === 0.13, 'realPurchasingPowerRate should normalize remainder change by current income')
  assert(res1.raiseConsumedByRentRate === 0.25, 'raiseConsumedByRentRate should be 25%')
  assert(res1.breakEvenIncome === 10700, 'breakEvenIncome should be 7700 + 3000 = 10700')

  // Test 2: Rent eats all raise scenario
  const rentHeavyInput: ScenarioInput = {
    currentIncome: 10000,
    nextIncome: 11000,
    currentRent: 3000,
    nextRent: 4500,
    otherSpend: 3000,
    otherInflationRate: 0,
  }
  const res2 = calculateLivingCost(rentHeavyInput)
  assert(res2.monthlyRemainderChange === -500, 'monthlyRemainderChange should be -500')
  assert(res2.raiseConsumedByRentRate === 1.5, 'raiseConsumedByRentRate should be 150%')
  assert(res2.realPurchasingPowerRate < 0, 'purchasing power rate should be negative')

  // Test 3: Increasing current spending must not make the absolute purchasing
  // power conclusion improve just because a weighted growth denominator moved.
  const lowerSpend = calculateLivingCost({
    currentIncome: 10000,
    nextIncome: 12000,
    currentRent: 2000,
    nextRent: 2000,
    otherSpend: 3000,
    otherInflationRate: 0.02,
  })
  const higherSpend = calculateLivingCost({
    currentIncome: 10000,
    nextIncome: 12000,
    currentRent: 2000,
    nextRent: 2000,
    otherSpend: 4000,
    otherInflationRate: 0.02,
  })
  assert(higherSpend.monthlyRemainderChange < lowerSpend.monthlyRemainderChange, '增加当前支出后每月结余变化必须变差')
  assert(higherSpend.realPurchasingPowerRate < lowerSpend.realPurchasingPowerRate, '增加当前支出后购买力方向指标必须变差')

  // Test 4: Formatting helpers
  assert(formatMoney(12345) === '12,345 元', 'formatMoney 12345')
  assert(formatRate(0.123) === '12.3%', 'formatRate 12.3%')

  console.log('✅ All livingCost domain tests passed successfully!')
}

runTests()
