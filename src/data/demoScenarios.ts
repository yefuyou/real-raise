import type { ScenarioInput } from '../domain/livingCost'
import { OFFICIAL_2026_H1_DERIVED_EVERYDAY_INFLATION_RATE } from './official2026'

export type DemoScenario = {
  id: string
  label: string
  note: string
  input: ScenarioInput
}

const officialOtherInflationRate = OFFICIAL_2026_H1_DERIVED_EVERYDAY_INFLATION_RATE

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'take-home-raise-shrinks',
    label: '涨薪到手缩水',
    note: '到手收入小幅增加，固定支出与日常支出同步变化',
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
    id: 'raise-and-fixed-costs',
    label: '涨薪被固定支出分走',
    note: '收入上涨，但固定支出与日常开支也明显增加',
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
