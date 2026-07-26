import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CircleHelp,
  Database,
  MapPin,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { DEMO_SCENARIOS } from './data/demoScenarios'
import {
  calculateLivingCost,
  formatMoney,
  formatRate,
  type ScenarioInput,
} from './domain/livingCost'
import { InsightSection } from './components/InsightSection'
import { HistoricalComparisonSection } from './components/HistoricalComparisonSection'
import { CityBenchmarkSection } from './components/CityBenchmarkSection'
import { SourceDrawer } from './components/SourceDrawer'
import { DetailedModePanel } from './components/DetailedModePanel'
import { PayslipPanel } from './components/PayslipPanel'
import { CityPicker } from './components/CityPicker'
import { ModalDialog } from './components/ModalDialog'
import {
  EMPTY_PAYSLIP,
  computePayslip,
  type PayslipInput,
} from './domain/salarySlip'
import {
  DEFAULT_CATEGORY_CPI_RATES,
  type CategoryKey,
  type DetailedSpendBreakdown,
  type SourceReference,
} from './api/realRaiseContract'

const initialInput = DEMO_SCENARIOS[0].input

function createDetailedBreakdown(totalSpend: number): DetailedSpendBreakdown {
  const weights: Record<CategoryKey, number> = {
    food: 0.30,
    utilities: 0.15,
    transport: 0.15,
    education: 0.15,
    medical: 0.10,
    other: 0.15,
  }
  const result = {} as DetailedSpendBreakdown
  ;(Object.keys(weights) as CategoryKey[]).forEach((key) => {
    const cur = Math.round(totalSpend * weights[key])
    const rate = DEFAULT_CATEGORY_CPI_RATES[key]
    result[key] = {
      currentAmount: cur,
      cpiRate: rate,
      nextAmount: Math.round(cur * (1 + rate)),
    }
  })
  return result
}

const initialBreakdown = createDetailedBreakdown(initialInput.otherSpend)

function App() {
  const [input, setInput] = useState<ScenarioInput>(initialInput)
  const [selectedCityCode, setSelectedCityCode] = useState<string>('340100')
  const [activeBenchmarkTab, setActiveBenchmarkTab] = useState<'current' | 'history'>('current')
  const [inputMode, setInputMode] = useState<'basic' | 'detailed'>('basic')
  /** 六类拆解面板较长，放弹窗里编辑；内嵌位置只留一行摘要。 */
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [incomeInputMode, setIncomeInputMode] = useState<'net' | 'payslip'>('net')
  const [payslip, setPayslip] = useState<PayslipInput>(EMPTY_PAYSLIP)
  const [detailedBreakdown, setDetailedBreakdown] = useState<DetailedSpendBreakdown>(initialBreakdown)
  const [isDirty, setIsDirty] = useState(false)
  const [remoteFeatureEnabled, setRemoteFeatureEnabled] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activeSources, setActiveSources] = useState<SourceReference[]>([])
  const resultRef = useRef<HTMLElement>(null)

  const detailedSumCurrent = useMemo(
    () => Object.values(detailedBreakdown).reduce((sum, item) => sum + item.currentAmount, 0),
    [detailedBreakdown],
  )
  const detailedSumNext = useMemo(
    () => Object.values(detailedBreakdown).reduce((sum, item) => sum + item.nextAmount, 0),
    [detailedBreakdown],
  )
  const result = useMemo(() => calculateLivingCost(input), [input])
  const payslipSummary = useMemo(() => computePayslip(payslip), [payslip])
  /** 切到工资条模式但两期税前都还是 0：此时所有派生数字都没有意义。 */
  const isPayslipUnfilled = incomeInputMode === 'payslip'
    && payslip.current.gross === 0
    && payslip.next.gross === 0
  const isImproving = result.realPurchasingPowerRate > 0
  const isFlat = result.realPurchasingPowerRate === 0
  const resultTone = isFlat ? 'neutral' : isImproving ? 'positive' : 'negative'

  /** 工资条模式：两期“到手”由确定性公式算出后写回主计算链路。 */
  const handlePayslipChange = (next: PayslipInput) => {
    setPayslip(next)
    const summary = computePayslip(next)
    setInput((current) => ({
      ...current,
      currentIncome: summary.currentNet,
      nextIncome: summary.nextNet,
    }))
    setIsDirty(true)
  }

  const updateField = (field: keyof ScenarioInput, value: string) => {
    const numericValue = Number(value.replace(/,/g, ''))
    const newOtherSpend = field === 'otherSpend' ? (Number.isFinite(numericValue) ? numericValue : 0) : input.otherSpend

    setInput((current) => ({
      ...current,
      [field]: Number.isFinite(numericValue) ? numericValue : 0,
    }))

    if (field === 'otherSpend' && newOtherSpend > 0) {
      setDetailedBreakdown(createDetailedBreakdown(newOtherSpend))
    }

    setIsDirty(true)
  }

  const handleSyncTotalToSum = (sumCurrent: number, weightedRate?: number) => {
    setInput((prev) => ({
      ...prev,
      otherSpend: sumCurrent,
      otherInflationRate: typeof weightedRate === 'number' && Number.isFinite(weightedRate) ? Number(weightedRate.toFixed(4)) : prev.otherInflationRate,
    }))
    setIsDirty(true)
  }

  const applyScenario = (scenario: ScenarioInput) => {
    setInput(scenario)
    setDetailedBreakdown(createDetailedBreakdown(scenario.otherSpend))
    // 预设案例以“到手收入”口径提供，切回到手模式避免与工资条面板数值脱节。
    setIncomeInputMode('net')
    setIsDirty(false)
  }

  const reset = () => {
    setInput(initialInput)
    setDetailedBreakdown(initialBreakdown)
    setInputMode('basic')
    setIncomeInputMode('net')
    setPayslip(EMPTY_PAYSLIP)
    setIsDirty(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsDirty(false)
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    resultRef.current?.focus({ preventScroll: true })
  }

  const handleOpenSources = (sources: SourceReference[]) => {
    setActiveSources(sources)
    setIsDrawerOpen(true)
  }

  return (
    <main className="app-shell">
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">01 / 购买力真实算表</p>
          <h1><span className="hero-title-part">你的涨薪，</span><em>消失在到手之前了吗？</em></h1>
          <p className="hero-description">
            先把税前工资、个税与社保公积金拆开，再看生活支出之后真正能留下多少钱。
          </p>
          <div className="hero-note">
            <span className="note-line" />
            <span>先算清楚，再决定要不要庆祝。</span>
          </div>
        </div>
        <div className="hero-stamp">
          <span>工资 × 扣缴</span>
          <strong>真正到手</strong>
          <span>个人化计算器</span>
        </div>
      </section>

      <section className="workspace-grid">
        <form className="input-panel panel" onSubmit={submit} aria-labelledby="input-heading">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">01 / 输入你的变化</p>
              <h2 id="input-heading">下一阶段会过得更松，还是更紧？</h2>
            </div>
            <button className="reset-button" type="button" onClick={reset} aria-label="重置所有输入">
              <RotateCcw size={14} /> 重置
            </button>
          </div>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>收入</span>
              {/* 收入输入方式是这个 fieldset 的局部开关，小号分段控件与顶层导航拉开层级。 */}
              <span className="legend-controls">
                <span className="field-unit">{incomeInputMode === 'net' ? '到手收入 / 月' : '工资条拆解 / 月'}</span>
                <MiniSegment
                  ariaLabel="收入输入方式"
                  value={incomeInputMode}
                  options={[
                    { value: 'net', label: '到手' },
                    { value: 'payslip', label: '工资条' },
                  ]}
                  onChange={setIncomeInputMode}
                />
              </span>
            </legend>
            {incomeInputMode === 'net' ? (
              <div className="field-row">
                <MoneyField id="current-income" name="currentIncome" label="现在" value={input.currentIncome} onChange={(value) => updateField('currentIncome', value)} />
                <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
                <MoneyField id="next-income" name="nextIncome" label="下一阶段预计" value={input.nextIncome} onChange={(value) => updateField('nextIncome', value)} />
              </div>
            ) : (
              <PayslipPanel value={payslip} summary={payslipSummary} onChange={handlePayslipChange} />
            )}
          </fieldset>

          <fieldset className="field-group">
            <legend className="field-group-title">
              <span>住房支出（可选维度）</span>
              <span className="field-unit">固定支出 / 月</span>
            </legend>
            <div className="field-row">
              <MoneyField id="current-rent" name="currentRent" label="现在" value={input.currentRent} onChange={(value) => updateField('currentRent', value)} />
              <ArrowRight className="field-arrow" size={18} aria-hidden="true" />
              <MoneyField id="next-rent" name="nextRent" label="下一阶段预计" value={input.nextRent} onChange={(value) => updateField('nextRent', value)} />
            </div>
          </fieldset>

          <fieldset className="field-group field-group-last">
            <legend className="field-group-title">
              <span>日常生活支出</span>
              {/* 基础/详细只管支出拆解，开关放在它管辖的 fieldset 头部而不是全表单顶部。 */}
              <span className="legend-controls">
                <span className="field-unit">不含住房 / 月</span>
                <MiniSegment
                  ariaLabel="日常支出拆解精细度"
                  value={inputMode}
                  options={[
                    { value: 'basic', label: '基础' },
                    { value: 'detailed', label: '详细拆解' },
                  ]}
                  onChange={(mode) => {
                    setInputMode(mode)
                    if (mode === 'detailed') setIsDetailDialogOpen(true)
                  }}
                />
              </span>
            </legend>
            <MoneyField id="other-spend" name="otherSpend" label="现在每月大约" value={input.otherSpend} onChange={(value) => updateField('otherSpend', value)} full />
            <label className="rate-field">
              <span id="other-inflation-label">日常支出预计变化</span>
              <span className="rate-input-wrap">
                <input
                  id="other-inflation"
                  name="otherInflationRate"
                  type="number"
                  min="-50"
                  max="100"
                  step="0.01"
                  value={(input.otherInflationRate * 100).toFixed(2)}
                  onChange={(event) => updateField('otherInflationRate', String(Number(event.target.value) / 100))}
                  aria-labelledby="other-inflation-label"
                  aria-describedby="other-inflation-hint"
                  inputMode="decimal"
                />
                <span aria-hidden="true">%</span>
              </span>
            </label>
            <p className="field-hint" id="other-inflation-hint">默认基于 2026 年上半年已公布 CPI 与消费结构派生，可手动调整；这不是全年或下一年度官方预测。</p>

            {inputMode === 'detailed' && (
              <div className="detail-summary-row">
                <span className="detail-summary-text">
                  六类合计 {formatMoney(detailedSumCurrent)} → {formatMoney(detailedSumNext)}
                </span>
                <button type="button" className="detail-edit-btn" onClick={() => setIsDetailDialogOpen(true)}>
                  <SlidersHorizontal size={12} /> 编辑六类拆解
                </button>
              </div>
            )}
          </fieldset>

          <fieldset className="field-group field-group-last">
            <legend className="field-group-title">
              <span>所在城市</span>
              <span className="field-unit">参考 CPI 价格基准</span>
            </legend>
            <div className="city-select-row">
              <span id="user-city-label" className="city-select-label">
                <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
                选择城市：
              </span>
              <CityPicker
                value={selectedCityCode}
                onChange={setSelectedCityCode}
                labelId="user-city-label"
              />
            </div>
          </fieldset>

          <button className="primary-button" type="submit">
            <Sparkles size={17} />
            {isDirty ? '查看最新结果' : '重新查看结果'}
          </button>
          <p className="form-status" aria-live="polite">
            {isDirty ? '输入已修改，结果会在点击按钮后定位到最新摘要。' : '结果已根据当前输入实时更新。'}
          </p>

          <div className="scenario-strip" aria-labelledby="scenario-heading">
            <span className="scenario-label" id="scenario-heading">试试预设案例</span>
            {DEMO_SCENARIOS.map((scenario) => (
              <button
                className="scenario-button"
                type="button"
                key={scenario.id}
                onClick={() => applyScenario(scenario.input)}
                aria-label={`${scenario.label}：${scenario.note}`}
              >
                {scenario.label}
              </button>
            ))}
          </div>
        </form>

        <section className={`result-panel panel ${resultTone}`} ref={resultRef} tabIndex={-1} aria-labelledby="result-heading">
          <div className="panel-heading result-heading">
            <div>
              <p className="section-kicker">02 / 先看结论</p>
              <h2 id="result-heading">你的下一阶段账本</h2>
            </div>
            <div className="result-icon" aria-hidden="true"><BarChart3 size={19} /></div>
          </div>

          <div className="headline-result" aria-live="polite" aria-atomic="true">
            <span>{isFlat ? '真实购买力预计持平' : isImproving ? '真实购买力预计上升' : '真实购买力预计下降'}</span>
            <strong>{formatRate(Math.abs(result.realPurchasingPowerRate))}</strong>
            <p>
              {isFlat
                ? '收入和生活支出的变化大致抵消，先把扣缴、固定支出与日常支出拆开看。'
                : isImproving
                ? '涨薪跑赢了你的生活支出变化，这部分才是可以放心花掉的钱。'
                : '名义工资虽然上涨，但生活支出涨得更快，先别急着把它当成真正的涨薪。'}
            </p>
          </div>

          {/* AI Insight Section (Moved to #2 right after main conclusion) */}
          <InsightSection
            requestPayload={{
              input,
              calculation: result,
              locale: 'zh-CN',
              includeInsight: true,
              inputMode,
              detailedBreakdown: inputMode === 'detailed' ? detailedBreakdown : undefined,
              incomeInputMode,
              payslipSummary: incomeInputMode === 'payslip' ? payslipSummary : undefined,
            }}
            onOpenSources={handleOpenSources}
            remoteFeatureEnabled={remoteFeatureEnabled}
            onToggleRemoteFeature={setRemoteFeatureEnabled}
          />

          {/* 4-Step Visual Explanation Chain ("到手收入诊断链") */}
          <div className="explanation-chain-container">
            <div className="chain-title-row">
              <h3>到手收入与购买力诊断链</h3>
              <span className="chain-badge">确定性链式追踪</span>
            </div>

            <div className="chain-steps-grid">
              <div className="chain-step-card step-1">
                <span className="step-num">01</span>
                <span className="step-name">名义加薪变化</span>
                <strong className="step-val">{formatSignedMoney(result.raiseIncrease)}</strong>
                <p className="step-desc">到手月收入变动额</p>
              </div>

              {incomeInputMode === 'payslip' ? (
                <div className="chain-step-card step-2">
                  <span className="step-num">02</span>
                  <span className="step-name">扣缴变化（个税+社保公积金）</span>
                  <strong className="step-val">{formatSignedMoney(-payslipSummary.deductionChange)}</strong>
                  <p className="step-desc">养老+公积金 {formatSignedMoney(payslipSummary.futureAccountChange)} 计入未来账户</p>
                </div>
              ) : (
                <div className="chain-step-card step-2">
                  <span className="step-num">02</span>
                  <span className="step-name">到手收入变化幅度</span>
                  <strong className="step-val">
                    {input.currentIncome > 0
                      ? `${result.incomeGrowthRate >= 0 ? '+' : ''}${(result.incomeGrowthRate * 100).toFixed(1)}%`
                      : '—'}
                  </strong>
                  <p className="step-desc">到手模式未拆扣缴；切换工资条模式可见扣缴去向</p>
                </div>
              )}

              <div className="chain-step-card step-3">
                <span className="step-num">03</span>
                <span className="step-name">日常六类 CPI 贡献</span>
                <strong className="step-val">
                  {formatSignedMoney(-(result.nextOtherSpend - input.otherSpend))}
                </strong>
                <p className="step-desc">日常六类消费价格涨跌变动</p>
              </div>

              <div className="chain-step-card step-4">
                <span className="step-num">04</span>
                <span className="step-name">可支配结余变化</span>
                <strong className={`step-val ${barTone(result.monthlyRemainderChange)}`}>
                  {formatSignedMoney(result.monthlyRemainderChange)}
                </strong>
                <p className="step-desc">每月实际自由支配净结余</p>
              </div>
            </div>
          </div>

          <div className="metric-grid">
            <Metric label="每月结余变化" value={formatSignedMoney(result.monthlyRemainderChange)} tone={moneyTone(result.monthlyRemainderChange)} />
            <Metric label="每年结余变化" value={formatSignedMoney(result.annualRemainderChange)} tone={moneyTone(result.annualRemainderChange)} />
            <Metric label="到手收入增加" value={formatSignedMoney(result.raiseIncrease)} tone={moneyTone(result.raiseIncrease)} />
            <Metric
              label="维持原生活需月入"
              /* 没有当前收入时该值退化成“支出增加额”，显示成月薪会误导。 */
              value={input.currentIncome > 0 ? formatMoney(result.breakEvenIncome) : '—'}
              tone="neutral"
            />
          </div>

          {incomeInputMode === 'payslip' && (
            <div className="waterfall-card payslip-waterfall">
              <div className="card-title-row">
                <h3>涨薪去哪儿了（税前 → 到手）</h3>
                <span className="mini-caption">每月 / 元</span>
              </div>
              {isPayslipUnfilled ? (
                <p className="field-hint">
                  还没有填写工资条。在左侧「工资条模式」里录入两期的税前工资与个税、社保、公积金等扣缴项，
                  这里会拆出每一项把涨薪吃掉了多少。
                </p>
              ) : (
                <>
                  <WaterfallRow
                    label={payslipSummary.grossIncrease >= 0 ? '税前工资增加' : '税前工资减少'}
                    value={payslipSummary.grossIncrease}
                    tone={barTone(payslipSummary.grossIncrease)}
                  />
                  <WaterfallRow
                    label={payslipSummary.taxChange >= 0 ? '个税增加' : '个税减少'}
                    value={-payslipSummary.taxChange}
                    tone={barTone(-payslipSummary.taxChange)}
                  />
                  <WaterfallRow
                    label={payslipSummary.socialAndFundChange >= 0 ? '社保公积金增加' : '社保公积金减少'}
                    value={-payslipSummary.socialAndFundChange}
                    tone={barTone(-payslipSummary.socialAndFundChange)}
                  />
                  {Math.round(payslipSummary.deductionChange - payslipSummary.taxChange - payslipSummary.socialAndFundChange) !== 0 && (
                    <WaterfallRow
                      label="其他扣缴变化"
                      value={-(payslipSummary.deductionChange - payslipSummary.taxChange - payslipSummary.socialAndFundChange)}
                      tone={barTone(-(payslipSummary.deductionChange - payslipSummary.taxChange - payslipSummary.socialAndFundChange))}
                    />
                  )}
                  <div className="waterfall-total">
                    <span>到手收入变化</span>
                    <strong className={`number-${barTone(payslipSummary.netIncrease) === 'good' ? 'good' : barTone(payslipSummary.netIncrease) === 'bad' ? 'bad' : 'neutral'}`}>
                      {formatSignedMoney(payslipSummary.netIncrease)}
                    </strong>
                  </div>
                  <p className="field-hint">
                    其中养老保险与住房公积金的变化（{formatSignedMoney(payslipSummary.futureAccountChange)}）进入你的未来保障与账户积累，不称为“消失”。
                    {payslipSummary.raiseKeptRate !== null
                      ? ` 税前每涨 1 元，真正到手 ${payslipSummary.raiseKeptRate.toFixed(2)} 元。`
                      : ''}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="waterfall-card">
            <div className="card-title-row">
              <h3>结余变化从哪里来</h3>
              <span className="mini-caption">每月 / 元</span>
            </div>
            <WaterfallRow
              label={result.raiseIncrease >= 0 ? '工资上涨' : '工资下降'}
              value={result.raiseIncrease}
              tone={barTone(result.raiseIncrease)}
            />
            <WaterfallRow
              label={result.rentIncrease >= 0 ? '住房支出增加' : '住房支出减少'}
              value={-result.rentIncrease}
              tone={barTone(-result.rentIncrease)}
            />
            <WaterfallRow
              label={result.nextOtherSpend >= input.otherSpend ? '其他支出增加' : '其他支出减少'}
              value={-(result.nextOtherSpend - input.otherSpend)}
              tone={barTone(-(result.nextOtherSpend - input.otherSpend))}
            />
            <div className="waterfall-total">
              <span>最终月结余变化</span>
              <strong className={`number-${barTone(result.monthlyRemainderChange) === 'good' ? 'good' : barTone(result.monthlyRemainderChange) === 'bad' ? 'bad' : 'neutral'}`}>
                {formatSignedMoney(result.monthlyRemainderChange)}
              </strong>
            </div>
          </div>

        </section>
      </section>

      {/* 价格基准是公共参考数据而不是"你的结果"：移出右栏后两栏等高，八类 CPI 也能铺开。
          这里不编号——01/02 是真实的输入→结论流程，参考资料不是它的第三步。
          两个 tab 面板各自带标题（subcard-header），所以这一带不再另加大标题。 */}
      <section className="benchmark-band" aria-label="官方价格基准参考">
        <div className="benchmark-tab-bar" role="tablist" aria-label="价格基准切换">
          <button
            type="button"
            role="tab"
            id="tab-current-city"
            aria-controls="panel-current-city"
            aria-selected={activeBenchmarkTab === 'current'}
            className={`benchmark-tab-btn ${activeBenchmarkTab === 'current' ? 'active' : ''}`}
            onClick={() => setActiveBenchmarkTab('current')}
          >
            <MapPin size={14} /> 当前城市
          </button>
          <button
            type="button"
            role="tab"
            id="tab-history-ref"
            aria-controls="panel-history-ref"
            aria-selected={activeBenchmarkTab === 'history'}
            className={`benchmark-tab-btn ${activeBenchmarkTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveBenchmarkTab('history')}
          >
            <Database size={14} /> 历史参考
          </button>
        </div>

        <div
          id="panel-current-city"
          role="tabpanel"
          aria-labelledby="tab-current-city"
          hidden={activeBenchmarkTab !== 'current'}
          className="tab-panel-content"
        >
          <CityBenchmarkSection selectedCityCode={selectedCityCode} onSelectCity={setSelectedCityCode} />
        </div>

        <div
          id="panel-history-ref"
          role="tabpanel"
          aria-labelledby="tab-history-ref"
          hidden={activeBenchmarkTab !== 'history'}
          className="tab-panel-content"
        >
          <HistoricalComparisonSection />
        </div>
      </section>

      <ModalDialog
        isOpen={isDetailDialogOpen}
        onClose={() => setIsDetailDialogOpen(false)}
        title="日常支出六类拆解"
        subtitle="按 2026 年上半年官方分类 CPI 预填，每一类都可单独调整"
      >
        <DetailedModePanel
          breakdown={detailedBreakdown}
          otherSpend={input.otherSpend}
          onChangeBreakdown={(newBd) => {
            setDetailedBreakdown(newBd)
            setIsDirty(true)
          }}
          onSyncTotalToSum={handleSyncTotalToSum}
        />
      </ModalDialog>

      <SourceDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        sources={activeSources}
      />

      <footer className="footer-note">
        <span><ShieldCheck size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} /> REAL RAISE · 确定性计算底座 + 公开统计 Mock 解读</span>
        <span>所有金额与计算结果基于个人输入，不构成专业财务建议。</span>
      </footer>
    </main>
  )
}


/** legend 行右侧的小号分段开关：管辖范围只在所属 fieldset 内，与顶层导航拉开层级。 */
function MiniSegment<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <span className="mini-segment" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`mini-segment-btn ${value === option.value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  )
}

function MoneyField({ id, name, label, value, onChange, full = false }: { id: string; name: string; label: string; value: number; onChange: (value: string) => void; full?: boolean }) {
  return (
    <label className={`money-field ${full ? 'full' : ''}`}>
      <span id={`${id}-label`}>{label}</span>
      <span className="money-input-wrap">
        <input
          id={id}
          name={name}
          type="number"
          min="0"
          step="0.01"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          aria-labelledby={`${id}-label`}
        />
        <span aria-hidden="true">元</span>
      </span>
    </label>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={`metric-value ${tone}`}>
        {tone === 'up' && <ArrowUpRight size={17} aria-hidden="true" />}
        {tone === 'down' && <ArrowDownRight size={17} aria-hidden="true" />}
        {value}
      </strong>
    </div>
  )
}

function WaterfallRow({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'neutral' }) {
  const max = 2000
  const rounded = Math.round(value) || 0
  const width = Math.min(Math.max(Math.abs(value) / max * 100, rounded === 0 ? 0 : 5), 100)
  const numberClass = tone === 'good' ? 'number-good' : tone === 'bad' ? 'number-bad' : 'number-neutral'
  return (
    <div className="waterfall-row" role="img" aria-label={`${label}：${formatSignedMoney(value)}`}>
      <span>{label}</span>
      <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${width}%` }} /></div>
      <strong className={numberClass}>{formatSignedMoney(value)}</strong>
    </div>
  )
}

function formatSignedMoney(value: number) {
  // `|| 0` 同时抹掉 Math.round 产生的 -0（否则会显示成“-0 元”）和 NaN。
  const rounded = Math.round(value) || 0
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-CN')} 元`
}

/** 金额为 0 时不应染成涨或跌，否则“0 元”会配一个绿色上升箭头。 */
function moneyTone(value: number): 'up' | 'down' | 'neutral' {
  const rounded = Math.round(value) || 0
  if (rounded > 0) return 'up'
  if (rounded < 0) return 'down'
  return 'neutral'
}

function barTone(value: number): 'good' | 'bad' | 'neutral' {
  const rounded = Math.round(value) || 0
  if (rounded > 0) return 'good'
  if (rounded < 0) return 'bad'
  return 'neutral'
}

export default App
