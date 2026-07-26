import React, { useState } from 'react'
import { AlertTriangle, Calculator, Eraser, FileSpreadsheet, Wand2 } from 'lucide-react'
import {
  DEFAULT_ESTIMATE_RATIOS,
  EMPTY_PAYSLIP,
  EXAMPLE_PAYSLIP,
  HOUSING_FUND_RATIO_OPTIONS,
  estimateDeductions,
  estimateNextFromCurrent,
  type PayslipInput,
  type PayslipPeriodInput,
  type PayslipSummary,
} from '../domain/salarySlip'

const TAX_CAVEAT = '按月度预扣近似；实际为累计预扣，年中各月会有差异，以工资条为准。'

const FIELD_ROWS: Array<{ key: keyof PayslipPeriodInput; label: string; deduction: boolean; estimateNote?: string }> = [
  { key: 'gross', label: '税前工资', deduction: false },
  { key: 'incomeTax', label: '个人所得税', deduction: true, estimateNote: TAX_CAVEAT },
  { key: 'pension', label: '养老保险（个人）', deduction: true },
  { key: 'medicalIns', label: '医疗保险（个人）', deduction: true },
  { key: 'unemploymentIns', label: '失业保险（个人）', deduction: true },
  { key: 'housingFund', label: '住房公积金（个人）', deduction: true },
  { key: 'otherDeduction', label: '其他扣缴', deduction: true },
]

/** 估算按钮会填充的字段（税前与其他扣缴不在其列，其他扣缴仅推算时沿用）。 */
const ESTIMATE_FIELDS: Array<keyof PayslipPeriodInput> = [
  'incomeTax',
  'pension',
  'medicalIns',
  'unemploymentIns',
  'housingFund',
]

type EstimatedFlags = Record<'current' | 'next', Partial<Record<keyof PayslipPeriodInput, boolean>>>
type EstimateBasis = Record<'current' | 'next', number | null>

interface PayslipPanelProps {
  value: PayslipInput
  summary: PayslipSummary
  onChange: (next: PayslipInput) => void
}

function formatNet(value: number): string {
  return `${Math.round(value).toLocaleString('zh-CN')} 元`
}

/**
 * 工资条模式输入面板。
 * 有工资条：直接抄数；没有：估算引擎按钮预填（带"估"角标，可覆盖）。
 * computePayslip 始终以输入框金额为唯一事实源；两期"到手"由 App 写回主计算链路。
 */
export const PayslipPanel: React.FC<PayslipPanelProps> = ({ value, summary, onChange }) => {
  const [fundRatio, setFundRatio] = useState<number>(DEFAULT_ESTIMATE_RATIOS.housingFund)
  const [extraDeduction, setExtraDeduction] = useState<number>(0)
  const [estimated, setEstimated] = useState<EstimatedFlags>({ current: {}, next: {} })
  /** 各列估算时的税前基数，用于"税前已变，可重新估算"提示。 */
  const [basis, setBasis] = useState<EstimateBasis>({ current: null, next: null })

  const update = (period: 'current' | 'next', key: keyof PayslipPeriodInput, raw: string) => {
    const numeric = Number(raw.replace(/,/g, ''))
    onChange({
      ...value,
      [period]: { ...value[period], [key]: Number.isFinite(numeric) ? numeric : 0 },
    })
    // 用户手改过的框视为用户输入，"估"角标消失。
    if (estimated[period][key]) {
      setEstimated((prev) => ({ ...prev, [period]: { ...prev[period], [key]: false } }))
    }
  }

  const markEstimated = (period: 'current' | 'next', keys: Array<keyof PayslipPeriodInput>, basisGross: number) => {
    setEstimated((prev) => ({
      ...prev,
      [period]: { ...prev[period], ...Object.fromEntries(keys.map((key) => [key, true])) },
    }))
    setBasis((prev) => ({ ...prev, [period]: basisGross }))
  }

  const estimateCurrent = () => {
    if (value.current.gross <= 0) return
    const est = estimateDeductions(value.current.gross, { ...DEFAULT_ESTIMATE_RATIOS, housingFund: fundRatio }, extraDeduction)
    onChange({
      ...value,
      current: {
        ...value.current,
        incomeTax: est.incomeTax,
        pension: est.pension,
        medicalIns: est.medicalIns,
        unemploymentIns: est.unemploymentIns,
        housingFund: est.housingFund,
      },
    })
    markEstimated('current', ESTIMATE_FIELDS, value.current.gross)
  }

  const estimateNext = () => {
    const est = estimateNextFromCurrent(value.current, value.next.gross, extraDeduction)
    if (!est || value.next.gross <= 0) return
    // 其他扣缴沿用当前期金额，但用户在下一期已填的值优先。
    const carryOther = value.next.otherDeduction === 0 && est.otherDeduction !== 0
    onChange({
      ...value,
      next: {
        ...value.next,
        incomeTax: est.incomeTax,
        pension: est.pension,
        medicalIns: est.medicalIns,
        unemploymentIns: est.unemploymentIns,
        housingFund: est.housingFund,
        otherDeduction: carryOther ? est.otherDeduction : value.next.otherDeduction,
      },
    })
    markEstimated('next', carryOther ? [...ESTIMATE_FIELDS, 'otherDeduction'] : ESTIMATE_FIELDS, value.next.gross)
  }

  const fillExample = () => {
    onChange(EXAMPLE_PAYSLIP)
    // 示例本身就是估算引擎产物，两列都标"估"，口径一致。
    setEstimated({
      current: Object.fromEntries(ESTIMATE_FIELDS.map((key) => [key, true])),
      next: Object.fromEntries(ESTIMATE_FIELDS.map((key) => [key, true])),
    })
    setBasis({ current: EXAMPLE_PAYSLIP.current.gross, next: EXAMPLE_PAYSLIP.next.gross })
  }

  const clearAll = () => {
    onChange(EMPTY_PAYSLIP)
    setEstimated({ current: {}, next: {} })
    setBasis({ current: null, next: null })
  }

  const currentStale = basis.current !== null && value.current.gross !== basis.current
  const nextStale = basis.next !== null && value.next.gross !== basis.next
  const canEstimateCurrent = value.current.gross > 0
  const canEstimateNext = value.current.gross > 0 && value.next.gross > 0

  return (
    <div className="payslip-panel">
      <div className="payslip-toolbar">
        <p className="payslip-note">手边有工资条：直接抄数最准。没有的话 → 点列头的「按通用比例估算」，通用口径可修改。</p>
        <div className="payslip-toolbar-buttons">
          <button type="button" className="payslip-tool-btn" onClick={fillExample}>
            <FileSpreadsheet size={13} /> 填入示例（估算生成）
          </button>
          <button type="button" className="payslip-tool-btn" onClick={clearAll}>
            <Eraser size={13} /> 清空
          </button>
        </div>
      </div>

      <div className="estimate-options">
        <label className="estimate-option">
          公积金比例
          <select
            value={fundRatio}
            onChange={(event) => setFundRatio(Number(event.target.value))}
            aria-label="公积金个人缴纳比例"
          >
            {HOUSING_FUND_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>{Math.round(ratio * 100)}%</option>
            ))}
          </select>
        </label>
        <label className="estimate-option">
          专项附加扣除
          <span className="estimate-extra-wrap">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={extraDeduction || ''}
              placeholder="0"
              onChange={(event) => {
                const numeric = Number(event.target.value)
                setExtraDeduction(Number.isFinite(numeric) && numeric > 0 ? numeric : 0)
              }}
              aria-label="每月专项附加扣除金额"
            />
            元/月
          </span>
        </label>
        <span className="estimate-options-note">缴费基数按税前估算；各城市基数上下限与医疗零头差异以工资条为准。</span>
      </div>

      <div className="payslip-grid" role="table" aria-label="工资条各项金额">
        <span className="payslip-head" role="columnheader">项目</span>
        <span className="payslip-head payslip-head-col" role="columnheader">
          <span>现在 / 月</span>
          <button
            type="button"
            className="estimate-btn"
            onClick={estimateCurrent}
            disabled={!canEstimateCurrent}
            title={canEstimateCurrent ? '按通用比例预填个税与四险一金，可覆盖' : '先填当前期税前工资'}
          >
            <Calculator size={12} /> 按通用比例估算
          </button>
          {currentStale && <em className="estimate-stale">税前已变，可重新估算</em>}
        </span>
        <span className="payslip-head payslip-head-col" role="columnheader">
          <span>下一阶段 / 月</span>
          <button
            type="button"
            className="estimate-btn"
            onClick={estimateNext}
            disabled={!canEstimateNext}
            title={
              canEstimateNext
                ? '用你当前期的实际费率推算下一阶段，零城市假设'
                : value.current.gross <= 0
                ? '先填当前期税前工资'
                : '先填下一阶段税前工资'
            }
          >
            <Wand2 size={12} /> 按当前比例推算
          </button>
          {nextStale && <em className="estimate-stale">税前已变，可重新估算</em>}
        </span>

        {FIELD_ROWS.map((row) => (
          <React.Fragment key={row.key}>
            <span className={`payslip-row-label ${row.deduction ? 'is-deduction' : 'is-gross'}`}>
              {row.deduction ? '− ' : ''}{row.label}
            </span>
            {(['current', 'next'] as const).map((period) => {
              const isEstimated = Boolean(estimated[period][row.key])
              return (
                <span className={`money-input-wrap payslip-input ${isEstimated ? 'is-estimated' : ''}`} key={period}>
                  <input
                    id={`payslip-${period}-${row.key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={value[period][row.key] || ''}
                    placeholder="0"
                    onChange={(event) => update(period, row.key, event.target.value)}
                    aria-label={`${period === 'current' ? '现在' : '下一阶段'}${row.label}${isEstimated ? '（估算值，可修改）' : ''}`}
                  />
                  {isEstimated && (
                    <i
                      className="estimate-badge"
                      title={row.estimateNote ?? '估算值：可直接修改；改动后以你的输入为准。'}
                      aria-hidden="true"
                    >
                      估
                    </i>
                  )}
                  <span aria-hidden="true">元</span>
                </span>
              )
            })}
          </React.Fragment>
        ))}

        <span className="payslip-row-label payslip-total-label">扣缴合计</span>
        <span className="payslip-computed">{formatNet(summary.currentDeductionTotal)}</span>
        <span className="payslip-computed">{formatNet(summary.nextDeductionTotal)}</span>

        <span className="payslip-row-label payslip-net-label">= 到手收入</span>
        <strong className={`payslip-net ${summary.currentNet < 0 ? 'is-negative' : ''}`}>{formatNet(summary.currentNet)}</strong>
        <strong className={`payslip-net ${summary.nextNet < 0 ? 'is-negative' : ''}`}>{formatNet(summary.nextNet)}</strong>
      </div>

      {summary.hasNegativeNet && (
        <p className="payslip-warning" role="alert">
          <AlertTriangle size={13} /> 扣缴合计超过了税前工资，请核对输入。
        </p>
      )}

      {(estimated.current.incomeTax || estimated.next.incomeTax) && (
        <p className="field-hint estimate-caveat">个税估算口径：{TAX_CAVEAT}</p>
      )}

      <p className="field-hint">
        到手收入已自动写入下方计算；养老保险与住房公积金属于“未来保障与账户积累”，结果区会单独说明，不称为“消失”。
      </p>
    </div>
  )
}
