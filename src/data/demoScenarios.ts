import type { ScenarioInput } from '../domain/livingCost'
import { OFFICIAL_2025_DERIVED_NON_RENT_INFLATION_RATE } from './official2025'

export type DemoScenario = {
  id: string
  label: string
  note: string
  input: ScenarioInput
}

const officialOtherInflationRate = OFFICIAL_2025_DERIVED_NON_RENT_INFLATION_RATE

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'rent-eats-raise',
    label: '房租吃掉涨薪',
    note: '工资小涨，房租同步上调',
    input: {
      currentIncome: 8000,
      nextIncome: 8400,
      currentRent: 1800,
      nextRent: 2200,
      otherSpend: 3500,
      otherInflationRate: officialOtherInflationRate,
    },
  },
  {
    id: 'income-and-rent-switch',
    label: '收入房租一起换挡',
    note: '收入上涨，但固定支出也明显增加',
    input: {
      currentIncome: 9500,
      nextIncome: 12500,
      currentRent: 2600,
      nextRent: 4200,
      otherSpend: 3900,
      otherInflationRate: officialOtherInflationRate,
    },
  },
  {
    id: 'comfortable-raise',
    label: '涨薪真的变轻松',
    note: '收入涨幅超过支出涨幅',
    input: {
      currentIncome: 11000,
      nextIncome: 13000,
      currentRent: 2800,
      nextRent: 2900,
      otherSpend: 4200,
      otherInflationRate: officialOtherInflationRate,
    },
  },
]
