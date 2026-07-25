export type ScenarioInput = {
  currentIncome: number
  nextIncome: number
  currentRent: number
  nextRent: number
  otherSpend: number
  otherInflationRate: number
}

export type LivingCostResult = {
  currentTotalSpend: number
  nextOtherSpend: number
  nextTotalSpend: number
  currentRemainder: number
  nextRemainder: number
  monthlyRemainderChange: number
  annualRemainderChange: number
  incomeGrowthRate: number
  totalSpendGrowthRate: number
  realPurchasingPowerRate: number
  rentIncrease: number
  raiseIncrease: number
  raiseConsumedByRentRate: number | null
  breakEvenIncome: number
}

const safeRate = (rate: number) => (Number.isFinite(rate) ? rate : 0)

export function calculateLivingCost(input: ScenarioInput): LivingCostResult {
  const otherInflationRate = safeRate(input.otherInflationRate)
  const currentTotalSpend = input.currentRent + input.otherSpend
  const nextOtherSpend = input.otherSpend * (1 + otherInflationRate)
  const nextTotalSpend = input.nextRent + nextOtherSpend
  const currentRemainder = input.currentIncome - currentTotalSpend
  const nextRemainder = input.nextIncome - nextTotalSpend
  const raiseIncrease = input.nextIncome - input.currentIncome
  const rentIncrease = input.nextRent - input.currentRent
  const incomeGrowthRate = input.currentIncome > 0
    ? input.nextIncome / input.currentIncome - 1
    : 0
  const totalSpendGrowthRate = currentTotalSpend > 0
    ? nextTotalSpend / currentTotalSpend - 1
    : 0
  const realPurchasingPowerRate = 1 + totalSpendGrowthRate > 0
    ? (1 + incomeGrowthRate) / (1 + totalSpendGrowthRate) - 1
    : 0

  return {
    currentTotalSpend,
    nextOtherSpend,
    nextTotalSpend,
    currentRemainder,
    nextRemainder,
    monthlyRemainderChange: nextRemainder - currentRemainder,
    annualRemainderChange: (nextRemainder - currentRemainder) * 12,
    incomeGrowthRate,
    totalSpendGrowthRate,
    realPurchasingPowerRate,
    rentIncrease,
    raiseIncrease,
    raiseConsumedByRentRate: raiseIncrease > 0 ? rentIncrease / raiseIncrease : null,
    breakEvenIncome: nextTotalSpend + currentRemainder,
  }
}

export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('zh-CN')} 元`
}

export function formatRate(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}
