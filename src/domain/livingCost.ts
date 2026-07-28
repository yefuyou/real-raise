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
  /** 月度可支配结余变化占当前到手收入的比例；方向与实际结余一致。 */
  realPurchasingPowerRate: number
  rentIncrease: number
  raiseIncrease: number
  raiseConsumedByRentRate: number | null
  breakEvenIncome: number
}

const safeRate = (rate: number) => (Number.isFinite(rate) ? rate : 0)

export function calculateLivingCost(input: ScenarioInput, nextOtherSpendOverride?: number): LivingCostResult {
  const otherInflationRate = safeRate(input.otherInflationRate)
  const currentTotalSpend = input.currentRent + input.otherSpend
  const nextOtherSpend = Number.isFinite(nextOtherSpendOverride) && (nextOtherSpendOverride ?? 0) >= 0
    ? nextOtherSpendOverride as number
    : input.otherSpend * (1 + otherInflationRate)
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
  const monthlyRemainderChange = nextRemainder - currentRemainder
  // 购买力的主判断必须来自“最后还剩多少钱”。
  // 旧公式是收入增速 / 总支出增速，调整某一类当前支出时会改变
  // 加权分母，出现“支出增加但购买力百分比上升”的反直觉结果。
  // 这里仅把结余变化按当前到手收入归一化，绝对金额仍是权威结果。
  const realPurchasingPowerRate = input.currentIncome > 0
    ? monthlyRemainderChange / input.currentIncome
    : 0

  return {
    currentTotalSpend,
    nextOtherSpend,
    nextTotalSpend,
    currentRemainder,
    nextRemainder,
    monthlyRemainderChange,
    annualRemainderChange: monthlyRemainderChange * 12,
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
