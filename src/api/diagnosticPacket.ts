import type { StartAnalysisRequest } from './realRaiseContract'

export function buildDiagnosticPacket(request: StartAnalysisRequest) {
  const { input, calculation } = request
  const dailySpendDelta = calculation.nextOtherSpend - input.otherSpend
  const drivers = [
    {
      id: 'net-income',
      label: '到手收入变化',
      monthlyImpact: calculation.raiseIncrease,
      authority: 'deterministic',
    },
    {
      id: 'housing',
      label: '住房支出变化',
      monthlyImpact: -calculation.rentIncrease,
      authority: 'deterministic',
    },
    {
      id: 'daily-spend',
      label: '日常支出变化',
      monthlyImpact: -dailySpendDelta,
      authority: 'deterministic',
    },
  ]
  const driverSum = drivers.reduce((sum, driver) => sum + driver.monthlyImpact, 0)

  return {
    schemaVersion: 'real-raise.diagnostic-packet.v1',
    calculationVersion: request.calculationVersion,
    cityContext: request.cityContext,
    reconciliation: {
      driverSum,
      monthlyRemainderChange: calculation.monthlyRemainderChange,
      difference: driverSum - calculation.monthlyRemainderChange,
    },
    drivers,
    payslipContext: request.incomeInputMode === 'payslip'
      ? request.payslipSummary ?? null
      : null,
    scenarios: [
      {
        id: 'baseline',
        label: '当前输入',
        annualRemainderDeltaVsBaseline: 0,
      },
      {
        id: 'rent-stable',
        label: '下一阶段住房支出保持当前水平',
        annualRemainderDeltaVsBaseline: calculation.rentIncrease * 12,
      },
      {
        id: 'daily-spend-stable',
        label: '下一阶段日常支出保持当前水平',
        annualRemainderDeltaVsBaseline: dailySpendDelta * 12,
      },
      {
        id: 'break-even-income',
        label: '维持当前月结余所需到手收入',
        requiredMonthlyIncome: calculation.breakEvenIncome,
      },
    ],
    constraints: [
      '不得重新计算或修改任何金额。',
      '驱动项必须按 monthlyImpact 绝对值排序后解释。',
      '城市基准必须保留 coverageTier 与 fallback caveat。',
      '工资条扣缴只作到手收入形成过程说明，不与到手收入驱动重复相加。',
    ],
  }
}
